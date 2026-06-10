use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::PathBuf;
use tauri::{AppHandle, Emitter, Manager};

struct PtySession {
    master: Box<dyn MasterPty + Send>,
    writer: Box<dyn Write + Send>,
    scrollback: Vec<u8>,
    scrollback_limit: usize,
}

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

const ZSH_ENV_INIT: &str = r#"# Open Terminal — forward to user's .zshenv
[ -f "$HOME/.zshenv" ] && . "$HOME/.zshenv"
"#;

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

fn setup_shell_prompt(cmd: &mut CommandBuilder, shell_path: &str) {
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
                cmd.arg("--rcfile");
                cmd.arg(init_path.to_str().unwrap());
            }
        }
        "zsh" => {
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
    let pty_system = native_pty_system();

    let size = PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    };

    let pair = pty_system
        .openpty(size)
        .map_err(|e| format!("Failed to open PTY: {}", e))?;

    let shell_path = shell.unwrap_or_else(|| {
        std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
    });

    let mut cmd = CommandBuilder::new(&shell_path);
    cmd.cwd(&cwd);
    setup_shell_prompt(&mut cmd, &shell_path);

    pair.slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    drop(pair.slave);

    let writer = pair
        .master
        .take_writer()
        .map_err(|e| format!("Failed to get PTY writer: {}", e))?;

    let mut reader = pair
        .master
        .try_clone_reader()
        .map_err(|e| format!("Failed to get PTY reader: {}", e))?;

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

    let event_id = pty_id.clone();
    let app_handle = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let data = buf[..n].to_vec();

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

                    let event_name = format!("pty-output:{}", event_id);
                    let _ = app_handle.emit(&event_name, data);
                }
                Err(_) => break,
            }
        }
    });

    Ok(())
}

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

#[tauri::command]
pub fn get_scrollback(app: AppHandle, pty_id: String) -> Result<Vec<u8>, String> {
    let state = app.state::<PtyState>();
    let sessions = state.sessions.lock();
    let session = sessions
        .get(&pty_id)
        .ok_or_else(|| format!("PTY not found: {}", pty_id))?;
    Ok(session.scrollback.clone())
}

#[tauri::command]
pub fn kill_pty(app: AppHandle, pty_id: String) -> Result<(), String> {
    let state = app.state::<PtyState>();
    let mut sessions = state.sessions.lock();
    sessions.remove(&pty_id);
    Ok(())
}
