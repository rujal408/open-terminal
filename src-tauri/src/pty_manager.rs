//! PTY (pseudo-terminal) manager.
//!
//! A PTY is a virtual terminal — a pair of endpoints (master + slave) that let
//! a program pretend it's running inside a real terminal. The shell process
//! reads/writes the slave side; we read/write the master side. This is how
//! terminal emulators work: xterm, iTerm, and this app all use PTYs under the
//! hood.

use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

/// Represents one active terminal tab. Each tab has its own shell process.
struct PtySession {
    /// The master end of the PTY pair. Used to resize the terminal and kept
    /// alive — dropping it would close the PTY and kill the shell.
    master: Box<dyn MasterPty + Send>,
    /// Write handle to send input (keystrokes) into the shell process.
    writer: Box<dyn Write + Send>,
    /// Rolling buffer of recent terminal output. When a tab is re-focused the
    /// frontend requests this to restore the visible terminal content.
    scrollback: Vec<u8>,
    /// Max number of lines to keep. The byte limit is `scrollback_limit * 80`
    /// (rough estimate of chars per line).
    scrollback_limit: usize,
}

/// Thread-safe map of all active terminal sessions, keyed by a unique `pty_id`.
/// Registered as Tauri managed state so every command can look up sessions.
pub struct PtyState {
    sessions: Mutex<HashMap<String, PtySession>>,
}

impl PtyState {
    pub fn new() -> Self {
        Self {
            sessions: Mutex::new(HashMap::new()),
        }
    }
}

// ── Shell init scripts ─────────────────────────────────────────────────
// These scripts customize the shell prompt to show the current directory
// and git branch. They are written to ~/.open-terminal/ at spawn time and
// loaded instead of (or in addition to) the user's normal dotfiles.
// This gives us a consistent prompt without permanently modifying the
// user's shell configuration.

/// Bash init: sources the user's .bashrc first (so aliases/completions work),
/// then overrides PS1 with a prompt that includes the git branch.
const BASH_INIT: &str = r#"# Open Terminal — bash init
[ -f "$HOME/.bashrc" ] && . "$HOME/.bashrc"

# Git branch in prompt
__ot_git_branch() {
  local b
  b=$(git symbolic-ref --short HEAD 2>/dev/null) || return
  printf ' (%s)' "$b"
}
PS1='\[\e[1;32m\]\w\[\e[1;33m\]$(__ot_git_branch)\[\e[0m\] \$ '
"#;

/// Zsh loads .zshenv before .zshrc. We forward to the user's real .zshenv
/// so environment variables (PATH, etc.) are still available.
const ZSH_ENV_INIT: &str = r#"# Open Terminal — forward to user's .zshenv
[ -f "$HOME/.zshenv" ] && . "$HOME/.zshenv"
"#;

/// Zsh init: uses a guard variable `_OT_INIT_DONE` to prevent double-sourcing
/// the user's .zshrc (zsh can source it multiple times in nested shells).
/// Then sets up vcs_info for git branch display in the prompt.
const ZSH_RC_INIT: &str = r#"# Open Terminal — zsh init
if [ -z "$_OT_INIT_DONE" ]; then
  export _OT_INIT_DONE=1
  [ -f "$HOME/.zshrc" ] && . "$HOME/.zshrc"
fi

# Git branch in prompt
autoload -Uz vcs_info
precmd() { vcs_info }
zstyle ':vcs_info:git:*' formats ' (%b)'
PROMPT='%F{green}%~%f%F{yellow}${vcs_info_msg_0_}%f %# '
"#;

/// Writes shell init scripts to disk and configures the command to use them.
///
/// The approach differs by shell:
///   - **bash**: pass `--rcfile <path>` to load our init script instead of .bashrc
///   - **zsh**: set `ZDOTDIR` to a custom directory containing our .zshenv/.zshrc,
///     which zsh reads automatically on startup
///   - **other shells**: no customization — they run with their defaults
fn setup_shell_prompt(cmd: &mut CommandBuilder, shell_path: &str) {
    // Extract just the binary name (e.g. "/usr/bin/zsh" -> "zsh")
    let shell_name = std::path::Path::new(shell_path)
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("");

    let home = match std::env::var("HOME") {
        Ok(h) => h,
        Err(_) => return,
    };
    let init_dir = PathBuf::from(&home).join(".open-terminal");
    if std::fs::create_dir_all(&init_dir).is_err() {
        return;
    }

    match shell_name {
        "bash" => {
            let init_path = init_dir.join("bash-init.sh");
            if std::fs::write(&init_path, BASH_INIT).is_ok() {
                // --rcfile tells bash to source our file instead of ~/.bashrc
                cmd.arg("--rcfile");
                cmd.arg(init_path.to_str().unwrap());
            }
        }
        "zsh" => {
            // Zsh reads dotfiles from $ZDOTDIR. By pointing it to our directory,
            // zsh loads our .zshenv and .zshrc which in turn source the user's real ones.
            let zsh_dir = init_dir.join("zsh");
            if std::fs::create_dir_all(&zsh_dir).is_ok() {
                let _ = std::fs::write(zsh_dir.join(".zshenv"), ZSH_ENV_INIT);
                let _ = std::fs::write(zsh_dir.join(".zshrc"), ZSH_RC_INIT);
                cmd.env("ZDOTDIR", zsh_dir.to_str().unwrap());
            }
        }
        _ => {}
    }
}

/// Spawn a new shell process inside a PTY.
///
/// Full flow:
/// 1. Open a PTY pair (master + slave) with the requested terminal dimensions
/// 2. Determine which shell to use (explicit arg > $SHELL env > /bin/bash)
/// 3. Build the shell command with a working directory and custom prompt
/// 4. Spawn the shell on the slave side of the PTY
/// 5. Drop the slave — we only need the master side from here on
/// 6. Get a reader (to receive shell output) and writer (to send input)
/// 7. Store the session in managed state so other commands can find it
/// 8. Start a background reader thread that continuously reads shell output,
///    appends it to the scrollback buffer, and emits events to the frontend
#[tauri::command]
pub fn spawn_pty(
    app: AppHandle,
    pty_id: String,
    cwd: String,
    rows: u16,
    cols: u16,
    scrollback_limit: u32,
    shell: Option<String>,
) -> Result<(), String> {
    // Step 1: Open the PTY pair. This gives us a master (our side) and a slave
    // (the shell's side). They are connected: what we write to master appears
    // as input on slave, and what the shell writes to slave we can read from master.
    let pty_system = native_pty_system();

    let size = PtySize {
        rows,
        cols,
        pixel_width: 0,  // Not used by most terminal emulators
        pixel_height: 0,
    };

    let pair = pty_system
        .openpty(size)
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    // Step 2: Determine which shell to launch.
    // Priority: explicit `shell` arg > user's $SHELL env var > fallback to bash
    let shell_path = shell.unwrap_or_else(|| {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    });

    // Step 3: Build the command with working directory and custom prompt
    let mut cmd = CommandBuilder::new(&shell_path);
    cmd.cwd(&cwd);
    setup_shell_prompt(&mut cmd, &shell_path);

    // Step 4: Spawn the shell process attached to the slave end of the PTY
    pair.slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    // Step 5: We no longer need the slave — the shell owns it now. Dropping it
    // avoids holding an extra file descriptor that would prevent EOF detection.
    drop(pair.slave);

    // Step 6: Get read/write handles to the master side
    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to get PTY reader: {}", e))?;

    // Step 7: Store the session so write_pty, resize_pty, etc. can find it
    let state = app.state::<PtyState>();
    state.sessions.lock().insert(
        pty_id.clone(),
        PtySession {
            master: pair.master,
            writer,
            scrollback: Vec::new(),
            scrollback_limit: scrollback_limit as usize,
        },
    );

    // Step 8: Background reader thread — bridges PTY output to the frontend.
    // Runs in a loop reading chunks of bytes from the shell, appending them to
    // the scrollback buffer, and emitting a Tauri event so the frontend's
    // terminal component can render the output in real time.
    let event_id = pty_id.clone();
    let app_handle = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break, // EOF — shell process exited
                Ok(n) => {
                    let data = buf[..n].to_vec();

                    // Append to scrollback and trim if it exceeds the limit.
                    // The limit is lines * 80 chars as a rough byte estimate.
                    if let Some(state) = app_handle.try_state::<PtyState>() {
                        let mut sessions = state.sessions.lock();
                        if let Some(session) = sessions.get_mut(&event_id) {
                            session.scrollback.extend_from_slice(&data);
                            let limit = session.scrollback_limit * 80;
                            if session.scrollback.len() > limit {
                                let drain = session.scrollback.len() - limit;
                                session.scrollback.drain(..drain);
                            }
                        }
                    }

                    // Emit the raw bytes to the frontend. The event name includes
                    // the pty_id so each terminal tab only receives its own output.
                    let event_name = format!("pty-output:{}", event_id);
                    let _ = app_handle.emit(&event_name, data);
                }
                Err(_) => break, // Read error — PTY was likely closed
            }
        }
    });

    Ok(())
}

/// Receives keyboard input from the frontend and writes it into the shell.
/// The raw bytes flow through the master side of the PTY to the shell process.
#[tauri::command]
pub fn write_pty(app: AppHandle, pty_id: String, data: Vec<u8>) -> Result<(), String> {
    let state = app.state::<PtyState>();
    let mut sessions = state.sessions.lock();
    let session = sessions
        .get_mut(&pty_id)
        .ok_or_else(|| format!("PTY not found: {}", pty_id))?;
    session
        .writer
        .write_all(&data)
        .map_err(|e| format!("Failed to write to PTY: {}", e))?;
    session.writer.flush().map_err(|e| e.to_string())?;
    Ok(())
}

/// Notifies the PTY of new terminal dimensions when the user resizes the
/// terminal panel. Without this, the shell wouldn't know how wide/tall the
/// terminal is, causing line-wrapping and cursor positioning to break.
#[tauri::command]
pub fn resize_pty(app: AppHandle, pty_id: String, rows: u16, cols: u16) -> Result<(), String> {
    let state = app.state::<PtyState>();
    let sessions = state.sessions.lock();
    let session = sessions
        .get(&pty_id)
        .ok_or_else(|| format!("PTY not found: {}", pty_id))?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| format!("Failed to resize PTY: {}", e))
}

/// Returns the scrollback buffer for a terminal session. Called by the frontend
/// when a tab is re-focused so it can restore previously-rendered output
/// without re-running commands.
#[tauri::command]
pub fn get_scrollback(app: AppHandle, pty_id: String) -> Result<Vec<u8>, String> {
    let state = app.state::<PtyState>();
    let sessions = state.sessions.lock();
    let session = sessions
        .get(&pty_id)
        .ok_or_else(|| format!("PTY not found: {}", pty_id))?;
    Ok(session.scrollback.clone())
}

/// Destroys a terminal session. Removing it from the map drops the master PTY
/// handle, which closes the PTY and sends SIGHUP to the shell process,
/// causing it to exit.
#[tauri::command]
pub fn kill_pty(app: AppHandle, pty_id: String) -> Result<(), String> {
    let state = app.state::<PtyState>();
    let mut sessions = state.sessions.lock();
    sessions.remove(&pty_id);
    Ok(())
}
