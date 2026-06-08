# Open Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Tauri 2 desktop terminal app that lets developers work on multiple projects concurrently via tabbed workspaces, each with its own file tree, terminal session, and floating code editors.

**Architecture:** Monolithic React frontend communicating with a Rust backend via Tauri IPC. Rust manages PTY sessions (one per tab) and filesystem operations. React renders tabs, file tree, xterm.js terminal, and floating CodeMirror editor popovers.

**Tech Stack:** Tauri 2, React 19, TypeScript, xterm.js, CodeMirror 6, Rust (portable-pty), Vite

---

## File Structure

### Rust backend (`src-tauri/src/`)

```
src-tauri/src/
  main.rs                  # unchanged — calls lib::run()
  lib.rs                   # Tauri builder — registers all commands and plugins
  pty_manager.rs           # PTY lifecycle: spawn, write, resize, kill, scrollback buffer
  filesystem.rs            # File/directory operations: list, read, write, create, rename, delete
  settings.rs              # Load/save settings.json and recent-projects.json
```

### React frontend (`src/`)

```
src/
  main.tsx                 # React entry point (unchanged)
  App.tsx                  # Root layout — renders ThemeProvider > TabBar + WorkspaceView
  App.css                  # Remove default Tauri styles, add CSS custom properties for theming
  types.ts                 # Shared TypeScript types: Workspace, EditorPanel, Theme, Settings, etc.

  features/
    tabs/
      TabBar.tsx           # Tab bar component — tab list, new tab button, tab drag-to-reorder
      WelcomeScreen.tsx    # Empty workspace view — recent projects list + open folder button

    file-tree/
      FileTree.tsx         # Left sidebar — recursive lazy-loaded directory tree
      FileTreeNode.tsx     # Single file/folder entry — click, drag, expand/collapse
      ContextMenu.tsx      # Right-click menu for file operations

    terminal/
      TerminalView.tsx     # xterm.js wrapper — mounts/detaches per active tab
      useTerminal.ts       # Hook: manages xterm.js instance, PTY events, resize

    editor/
      EditorPopover.tsx    # Floating CodeMirror panel — draggable, resizable, title bar
      EditorManager.tsx    # Renders all open EditorPopovers for the active workspace

    theme/
      ThemeProvider.tsx    # Context provider for theme — applies CSS custom properties
      themes.ts            # Dark and light theme definitions
      useTheme.ts          # Hook: read/switch theme

    settings/
      SettingsPanel.tsx    # Settings UI — theme selector, font size, path mode, shell
      useSettings.ts       # Hook: load/save settings from Rust
```

---

## Task 1: Install frontend dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install xterm.js, CodeMirror, and uuid**

```bash
cd /home/rujal/Projects-Amnil/open-terminal
pnpm add xterm @xterm/addon-fit @xterm/addon-webgl @codemirror/state @codemirror/view @codemirror/lang-javascript @codemirror/lang-rust @codemirror/lang-json @codemirror/lang-css @codemirror/lang-html @codemirror/lang-markdown @codemirror/theme-one-dark uuid
pnpm add -D @types/uuid
```

- [ ] **Step 2: Verify installation**

Run: `pnpm dev`
Expected: Vite dev server starts without errors on http://localhost:1420

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: install xterm.js, CodeMirror 6, and uuid dependencies"
```

---

## Task 2: Install Rust dependencies and configure Tauri permissions

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: Add Rust crate dependencies**

Add to `[dependencies]` in `src-tauri/Cargo.toml`:

```toml
portable-pty = "0.8"
uuid = { version = "1", features = ["v4"] }
parking_lot = "0.12"
trash = "5"
dirs = "6"
tauri-plugin-dialog = "2"
```

- `portable-pty`: cross-platform PTY spawning
- `uuid`: unique workspace/pty IDs
- `parking_lot`: fast Mutex for PTY state
- `trash`: move files to OS trash instead of permanent delete
- `dirs`: resolve `~/.open-terminal/` config directory cross-platform
- `tauri-plugin-dialog`: native OS folder picker

- [ ] **Step 2: Update tauri.conf.json window config**

Replace the `app.windows` section in `src-tauri/tauri.conf.json`:

```json
{
  "title": "Open Terminal",
  "width": 1200,
  "height": 800,
  "minWidth": 800,
  "minHeight": 500,
  "decorations": true
}
```

- [ ] **Step 3: Verify Rust compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles with no errors (warnings are OK).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/tauri.conf.json
git commit -m "chore: add Rust deps (portable-pty, trash, dirs) and update window config"
```

---

## Task 3: Rust — Settings persistence

**Files:**
- Create: `src-tauri/src/settings.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create settings.rs**

Create `src-tauri/src/settings.rs`:

```rust
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub theme: String,
    pub drag_drop_path_mode: String,
    pub default_shell: Option<String>,
    pub terminal_scrollback: u32,
    pub font_size: u32,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: "dark".to_string(),
            drag_drop_path_mode: "absolute".to_string(),
            default_shell: None,
            terminal_scrollback: 5000,
            font_size: 14,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecentProject {
    pub path: String,
    pub name: String,
    pub last_opened: u64,
}

fn config_dir() -> PathBuf {
    let base = dirs::home_dir().expect("could not resolve home directory");
    base.join(".open-terminal")
}

fn ensure_config_dir() -> PathBuf {
    let dir = config_dir();
    fs::create_dir_all(&dir).ok();
    dir
}

#[tauri::command]
pub fn load_settings() -> Settings {
    let path = config_dir().join("settings.json");
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => Settings::default(),
    }
}

#[tauri::command]
pub fn save_settings(settings: Settings) -> Result<(), String> {
    let dir = ensure_config_dir();
    let path = dir.join("settings.json");
    let json = serde_json::to_string_pretty(&settings).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_recent_projects() -> Vec<RecentProject> {
    let path = config_dir().join("recent-projects.json");
    match fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => Vec::new(),
    }
}

#[tauri::command]
pub fn add_recent_project(project_path: String, name: String) -> Result<(), String> {
    let dir = ensure_config_dir();
    let path = dir.join("recent-projects.json");
    let mut projects = load_recent_projects();

    // Remove existing entry for same path
    projects.retain(|p| p.path != project_path);

    // Add to front
    let timestamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();

    projects.insert(
        0,
        RecentProject {
            path: project_path,
            name,
            last_opened: timestamp,
        },
    );

    // Keep max 20
    projects.truncate(20);

    let json = serde_json::to_string_pretty(&projects).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn remove_recent_project(project_path: String) -> Result<(), String> {
    let dir = ensure_config_dir();
    let path = dir.join("recent-projects.json");
    let mut projects = load_recent_projects();
    projects.retain(|p| p.path != project_path);
    let json = serde_json::to_string_pretty(&projects).map_err(|e| e.to_string())?;
    fs::write(path, json).map_err(|e| e.to_string())
}
```

- [ ] **Step 2: Register settings commands in lib.rs**

Replace `src-tauri/src/lib.rs` with:

```rust
mod settings;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            settings::load_settings,
            settings::save_settings,
            settings::load_recent_projects,
            settings::add_recent_project,
            settings::remove_recent_project,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles with no errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/settings.rs src-tauri/src/lib.rs
git commit -m "feat: add settings and recent projects persistence (Rust)"
```

---

## Task 4: Rust — Filesystem operations

**Files:**
- Create: `src-tauri/src/filesystem.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create filesystem.rs**

Create `src-tauri/src/filesystem.rs`:

```rust
use serde::Serialize;
use std::fs;
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct DirEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub is_hidden: bool,
}

#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<DirEntry>, String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let mut entries: Vec<DirEntry> = fs::read_dir(dir)
        .map_err(|e| e.to_string())?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let name = entry.file_name().to_string_lossy().to_string();
            let is_hidden = name.starts_with('.');
            Some(DirEntry {
                name,
                path: entry.path().to_string_lossy().to_string(),
                is_dir: entry.file_type().ok()?.is_dir(),
                is_hidden,
            })
        })
        .collect();

    // Sort: directories first, then alphabetically case-insensitive
    entries.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(entries)
}

#[tauri::command]
pub fn read_file(path: String) -> Result<String, String> {
    fs::read_to_string(&path).map_err(|e| format!("Failed to read {}: {}", path, e))
}

#[tauri::command]
pub fn write_file(path: String, content: String) -> Result<(), String> {
    fs::write(&path, content).map_err(|e| format!("Failed to write {}: {}", path, e))
}

#[tauri::command]
pub fn create_file(path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        return Err(format!("Already exists: {}", path));
    }
    fs::write(&path, "").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_directory(path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        return Err(format!("Already exists: {}", path));
    }
    fs::create_dir_all(&path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn rename_entry(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_entry(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| format!("Failed to trash {}: {}", path, e))
}
```

- [ ] **Step 2: Register filesystem commands in lib.rs**

Add `mod filesystem;` at the top of `src-tauri/src/lib.rs` and add all filesystem commands to the `generate_handler![]` macro:

```rust
mod filesystem;
mod settings;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            settings::load_settings,
            settings::save_settings,
            settings::load_recent_projects,
            settings::add_recent_project,
            settings::remove_recent_project,
            filesystem::list_directory,
            filesystem::read_file,
            filesystem::write_file,
            filesystem::create_file,
            filesystem::create_directory,
            filesystem::rename_entry,
            filesystem::delete_entry,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles with no errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/filesystem.rs src-tauri/src/lib.rs
git commit -m "feat: add filesystem operations — list, read, write, create, rename, trash"
```

---

## Task 5: Rust — PTY manager

**Files:**
- Create: `src-tauri/src/pty_manager.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create pty_manager.rs**

Create `src-tauri/src/pty_manager.rs`:

```rust
use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Arc;
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

    pair.slave
        .spawn_command(cmd)
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    // Drop slave — we only need the master side
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

    // Spawn a thread to read PTY output and emit events
    let event_id = pty_id.clone();
    let app_handle = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break, // PTY closed
                Ok(n) => {
                    let data = buf[..n].to_vec();

                    // Append to scrollback
                    if let Some(state) = app_handle.try_state::<PtyState>() {
                        let mut sessions = state.sessions.lock();
                        if let Some(session) = sessions.get_mut(&event_id) {
                            session.scrollback.extend_from_slice(&data);
                            let limit = session.scrollback_limit * 80; // rough bytes estimate
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
```

- [ ] **Step 2: Register PTY commands and state in lib.rs**

Update `src-tauri/src/lib.rs`:

```rust
mod filesystem;
mod pty_manager;
mod settings;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(pty_manager::PtyState::new())
        .invoke_handler(tauri::generate_handler![
            settings::load_settings,
            settings::save_settings,
            settings::load_recent_projects,
            settings::add_recent_project,
            settings::remove_recent_project,
            filesystem::list_directory,
            filesystem::read_file,
            filesystem::write_file,
            filesystem::create_file,
            filesystem::create_directory,
            filesystem::rename_entry,
            filesystem::delete_entry,
            pty_manager::spawn_pty,
            pty_manager::write_pty,
            pty_manager::resize_pty,
            pty_manager::get_scrollback,
            pty_manager::kill_pty,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles with no errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/pty_manager.rs src-tauri/src/lib.rs
git commit -m "feat: add PTY manager — spawn, write, resize, scrollback, kill"
```

---

## Task 6: Frontend — Types and theme system

**Files:**
- Create: `src/types.ts`
- Create: `src/features/theme/themes.ts`
- Create: `src/features/theme/useTheme.ts`
- Create: `src/features/theme/ThemeProvider.tsx`

- [ ] **Step 1: Create shared types**

Create `src/types.ts`:

```typescript
export interface Workspace {
  id: string;
  projectPath: string | null;
  label: string;
  ptyId: string;
  openEditors: EditorPanel[];
}

export interface EditorPanel {
  id: string;
  filePath: string;
  content: string;
  isDirty: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_hidden: boolean;
}

export interface Settings {
  theme: string;
  drag_drop_path_mode: "absolute" | "relative";
  default_shell: string | null;
  terminal_scrollback: number;
  font_size: number;
}

export interface RecentProject {
  path: string;
  name: string;
  last_opened: number;
}

export interface Theme {
  name: string;
  type: "dark" | "light";
  colors: {
    background: string;
    sidebar: string;
    tabBar: string;
    tabActive: string;
    tabInactive: string;
    border: string;
    text: string;
    textMuted: string;
    accent: string;
    terminalBg: string;
    terminalFg: string;
    terminalCursor: string;
    ansi: string[];
    editorBg: string;
    editorFg: string;
    editorLineNumber: string;
    editorSelection: string;
  };
}
```

- [ ] **Step 2: Create theme definitions**

Create `src/features/theme/themes.ts`:

```typescript
import type { Theme } from "../../types";

export const darkTheme: Theme = {
  name: "Dark",
  type: "dark",
  colors: {
    background: "#1e1e2e",
    sidebar: "#181825",
    tabBar: "#11111b",
    tabActive: "#1e1e2e",
    tabInactive: "#181825",
    border: "#313244",
    text: "#cdd6f4",
    textMuted: "#6c7086",
    accent: "#89b4fa",
    terminalBg: "#1e1e2e",
    terminalFg: "#cdd6f4",
    terminalCursor: "#f5e0dc",
    ansi: [
      "#45475a", "#f38ba8", "#a6e3a1", "#f9e2af",
      "#89b4fa", "#cba6f7", "#94e2d5", "#bac2de",
      "#585b70", "#f38ba8", "#a6e3a1", "#f9e2af",
      "#89b4fa", "#cba6f7", "#94e2d5", "#a6adc8",
    ],
    editorBg: "#1e1e2e",
    editorFg: "#cdd6f4",
    editorLineNumber: "#6c7086",
    editorSelection: "#313244",
  },
};

export const lightTheme: Theme = {
  name: "Light",
  type: "light",
  colors: {
    background: "#eff1f5",
    sidebar: "#e6e9ef",
    tabBar: "#dce0e8",
    tabActive: "#eff1f5",
    tabInactive: "#e6e9ef",
    border: "#ccd0da",
    text: "#4c4f69",
    textMuted: "#8c8fa1",
    accent: "#1e66f5",
    terminalBg: "#eff1f5",
    terminalFg: "#4c4f69",
    terminalCursor: "#dc8a78",
    ansi: [
      "#bcc0cc", "#d20f39", "#40a02b", "#df8e1d",
      "#1e66f5", "#8839ef", "#179299", "#5c5f77",
      "#acb0be", "#d20f39", "#40a02b", "#df8e1d",
      "#1e66f5", "#8839ef", "#179299", "#6c6f85",
    ],
    editorBg: "#eff1f5",
    editorFg: "#4c4f69",
    editorLineNumber: "#8c8fa1",
    editorSelection: "#ccd0da",
  },
};
```

- [ ] **Step 3: Create useTheme hook**

Create `src/features/theme/useTheme.ts`:

```typescript
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Settings, Theme } from "../../types";
import { darkTheme, lightTheme } from "./themes";

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(darkTheme);

  useEffect(() => {
    invoke<Settings>("load_settings").then((settings) => {
      if (settings.theme === "light") {
        setThemeState(lightTheme);
      } else if (settings.theme === "dark") {
        setThemeState(darkTheme);
      } else {
        // Auto-detect from OS
        const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        setThemeState(prefersDark ? darkTheme : lightTheme);
      }
    });
  }, []);

  const setTheme = (name: string) => {
    const next = name === "light" ? lightTheme : darkTheme;
    setThemeState(next);
    invoke("save_settings", {
      settings: {
        theme: name,
        drag_drop_path_mode: "absolute",
        default_shell: null,
        terminal_scrollback: 5000,
        font_size: 14,
      },
    });
  };

  return { theme, setTheme };
}
```

- [ ] **Step 4: Create ThemeProvider**

Create `src/features/theme/ThemeProvider.tsx`:

```tsx
import { createContext, useContext, useEffect } from "react";
import type { Theme } from "../../types";
import { useTheme } from "./useTheme";

interface ThemeContextValue {
  theme: Theme;
  setTheme: (name: string) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const { theme, setTheme } = useTheme();

  useEffect(() => {
    const root = document.documentElement;
    const c = theme.colors;
    root.style.setProperty("--bg", c.background);
    root.style.setProperty("--sidebar", c.sidebar);
    root.style.setProperty("--tab-bar", c.tabBar);
    root.style.setProperty("--tab-active", c.tabActive);
    root.style.setProperty("--tab-inactive", c.tabInactive);
    root.style.setProperty("--border", c.border);
    root.style.setProperty("--text", c.text);
    root.style.setProperty("--text-muted", c.textMuted);
    root.style.setProperty("--accent", c.accent);
    root.style.setProperty("--editor-bg", c.editorBg);
    root.style.setProperty("--editor-fg", c.editorFg);
  }, [theme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useThemeContext() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useThemeContext must be used within ThemeProvider");
  return ctx;
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/features/theme/
git commit -m "feat: add shared types, dark/light themes, and ThemeProvider"
```

---

## Task 7: Frontend — Tab bar and workspace management

**Files:**
- Create: `src/features/tabs/TabBar.tsx`
- Create: `src/features/tabs/WelcomeScreen.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Create TabBar component**

Create `src/features/tabs/TabBar.tsx`:

```tsx
import type { Workspace } from "../../types";

interface TabBarProps {
  workspaces: Workspace[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

export function TabBar({
  workspaces,
  activeId,
  onSelect,
  onClose,
  onNew,
  onReorder,
}: TabBarProps) {
  function handleDragStart(e: React.DragEvent, index: number) {
    e.dataTransfer.setData("tab-index", String(index));
  }

  function handleDrop(e: React.DragEvent, toIndex: number) {
    e.preventDefault();
    const fromIndex = Number(e.dataTransfer.getData("tab-index"));
    if (fromIndex !== toIndex) {
      onReorder(fromIndex, toIndex);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  return (
    <div className="tab-bar">
      {workspaces.map((ws, i) => (
        <div
          key={ws.id}
          className={`tab ${ws.id === activeId ? "tab-active" : ""}`}
          onClick={() => onSelect(ws.id)}
          draggable
          onDragStart={(e) => handleDragStart(e, i)}
          onDrop={(e) => handleDrop(e, i)}
          onDragOver={handleDragOver}
        >
          <span className="tab-label">{ws.label}</span>
          <button
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation();
              onClose(ws.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button className="tab-new" onClick={onNew}>
        +
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Create WelcomeScreen component**

Create `src/features/tabs/WelcomeScreen.tsx`:

```tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { RecentProject } from "../../types";

interface WelcomeScreenProps {
  onOpenProject: (path: string) => void;
}

export function WelcomeScreen({ onOpenProject }: WelcomeScreenProps) {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);

  useEffect(() => {
    invoke<RecentProject[]>("load_recent_projects").then(setRecentProjects);
  }, []);

  async function handleOpenFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      onOpenProject(selected as string);
    }
  }

  async function handleRemoveRecent(path: string) {
    await invoke("remove_recent_project", { projectPath: path });
    setRecentProjects((prev) => prev.filter((p) => p.path !== path));
  }

  return (
    <div className="welcome-screen">
      <h1>Open Terminal</h1>
      <p className="welcome-subtitle">Select a project to get started</p>

      <button className="welcome-open-btn" onClick={handleOpenFolder}>
        Open Folder
      </button>

      {recentProjects.length > 0 && (
        <div className="recent-projects">
          <h3>Recent Projects</h3>
          <ul>
            {recentProjects.map((project) => (
              <li key={project.path}>
                <button
                  className="recent-project-btn"
                  onClick={() => onOpenProject(project.path)}
                >
                  <span className="recent-name">{project.name}</span>
                  <span className="recent-path">{project.path}</span>
                </button>
                <button
                  className="recent-remove"
                  onClick={() => handleRemoveRecent(project.path)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Rewrite App.tsx as the root layout**

Replace `src/App.tsx` with:

```tsx
import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { v4 as uuidv4 } from "uuid";
import { ThemeProvider } from "./features/theme/ThemeProvider";
import { TabBar } from "./features/tabs/TabBar";
import { WelcomeScreen } from "./features/tabs/WelcomeScreen";
import type { Workspace } from "./types";
import "./App.css";

function createWorkspace(): Workspace {
  const id = uuidv4();
  return {
    id,
    projectPath: null,
    label: "New Tab",
    ptyId: id, // PTY ID matches workspace ID
    openEditors: [],
  };
}

function AppContent() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => [
    createWorkspace(),
  ]);
  const [activeId, setActiveId] = useState<string>(workspaces[0].id);

  const activeWorkspace = workspaces.find((ws) => ws.id === activeId)!;

  const handleNew = useCallback(() => {
    const ws = createWorkspace();
    setWorkspaces((prev) => [...prev, ws]);
    setActiveId(ws.id);
  }, []);

  const handleClose = useCallback(
    (id: string) => {
      invoke("kill_pty", { ptyId: id }).catch(() => {});
      setWorkspaces((prev) => {
        const next = prev.filter((ws) => ws.id !== id);
        if (next.length === 0) {
          const ws = createWorkspace();
          setActiveId(ws.id);
          return [ws];
        }
        if (id === activeId) {
          setActiveId(next[next.length - 1].id);
        }
        return next;
      });
    },
    [activeId]
  );

  const handleReorder = useCallback((from: number, to: number) => {
    setWorkspaces((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const handleOpenProject = useCallback(
    async (path: string) => {
      const name = path.split("/").pop() || path;
      await invoke("add_recent_project", { projectPath: path, name });
      setWorkspaces((prev) =>
        prev.map((ws) =>
          ws.id === activeId ? { ...ws, projectPath: path, label: name } : ws
        )
      );
    },
    [activeId]
  );

  return (
    <div className="app">
      <TabBar
        workspaces={workspaces}
        activeId={activeId}
        onSelect={setActiveId}
        onClose={handleClose}
        onNew={handleNew}
        onReorder={handleReorder}
      />
      <div className="workspace-area">
        {activeWorkspace.projectPath === null ? (
          <WelcomeScreen onOpenProject={handleOpenProject} />
        ) : (
          <div className="workspace-content">
            {/* FileTree and TerminalView will be added in later tasks */}
            <div className="sidebar-placeholder">
              File Tree: {activeWorkspace.projectPath}
            </div>
            <div className="terminal-placeholder">
              Terminal: {activeWorkspace.ptyId}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
```

- [ ] **Step 4: Replace App.css with layout styles**

Replace `src/App.css` with:

```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html, body, #root {
  height: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, monospace;
  background: var(--bg);
  color: var(--text);
}

.app {
  display: flex;
  flex-direction: column;
  height: 100%;
}

/* Tab Bar */
.tab-bar {
  display: flex;
  align-items: center;
  background: var(--tab-bar);
  border-bottom: 1px solid var(--border);
  height: 36px;
  flex-shrink: 0;
  overflow-x: auto;
  user-select: none;
}

.tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 0 12px;
  height: 100%;
  background: var(--tab-inactive);
  border-right: 1px solid var(--border);
  cursor: pointer;
  font-size: 13px;
  color: var(--text-muted);
  white-space: nowrap;
}

.tab-active {
  background: var(--tab-active);
  color: var(--text);
}

.tab-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 14px;
  padding: 0 2px;
  line-height: 1;
}

.tab-close:hover {
  color: var(--text);
}

.tab-new {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 18px;
  padding: 0 12px;
  height: 100%;
}

.tab-new:hover {
  color: var(--text);
}

.tab-label {
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Workspace Area */
.workspace-area {
  flex: 1;
  overflow: hidden;
}

.workspace-content {
  display: flex;
  height: 100%;
}

/* Welcome Screen */
.welcome-screen {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
}

.welcome-subtitle {
  color: var(--text-muted);
}

.welcome-open-btn {
  padding: 10px 24px;
  background: var(--accent);
  color: #fff;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}

.recent-projects {
  margin-top: 24px;
  width: 400px;
}

.recent-projects h3 {
  margin-bottom: 8px;
  font-size: 13px;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.recent-projects ul {
  list-style: none;
}

.recent-projects li {
  display: flex;
  align-items: center;
  border-bottom: 1px solid var(--border);
}

.recent-project-btn {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 8px 0;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  color: var(--text);
}

.recent-project-btn:hover {
  color: var(--accent);
}

.recent-name {
  font-size: 14px;
}

.recent-path {
  font-size: 11px;
  color: var(--text-muted);
}

.recent-remove {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 4px 8px;
  font-size: 14px;
}

/* Placeholders for upcoming tasks */
.sidebar-placeholder,
.terminal-placeholder {
  padding: 20px;
  color: var(--text-muted);
}

.sidebar-placeholder {
  width: 250px;
  background: var(--sidebar);
  border-right: 1px solid var(--border);
}

.terminal-placeholder {
  flex: 1;
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.css src/features/tabs/
git commit -m "feat: add tab bar, workspace management, and welcome screen"
```

---

## Task 8: Frontend — Terminal view with xterm.js

**Files:**
- Create: `src/features/terminal/useTerminal.ts`
- Create: `src/features/terminal/TerminalView.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create useTerminal hook**

Create `src/features/terminal/useTerminal.ts`:

```typescript
import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Theme } from "../../types";

function themeToXterm(theme: Theme) {
  const c = theme.colors;
  return {
    background: c.terminalBg,
    foreground: c.terminalFg,
    cursor: c.terminalCursor,
    black: c.ansi[0],
    red: c.ansi[1],
    green: c.ansi[2],
    yellow: c.ansi[3],
    blue: c.ansi[4],
    magenta: c.ansi[5],
    cyan: c.ansi[6],
    white: c.ansi[7],
    brightBlack: c.ansi[8],
    brightRed: c.ansi[9],
    brightGreen: c.ansi[10],
    brightYellow: c.ansi[11],
    brightBlue: c.ansi[12],
    brightMagenta: c.ansi[13],
    brightCyan: c.ansi[14],
    brightWhite: c.ansi[15],
  };
}

interface UseTerminalOptions {
  ptyId: string;
  cwd: string;
  theme: Theme;
  fontSize: number;
  scrollback: number;
  shell: string | null;
}

export function useTerminal({
  ptyId,
  cwd,
  theme,
  fontSize,
  scrollback,
  shell,
}: UseTerminalOptions) {
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const spawnedRef = useRef(false);

  const attach = useCallback(
    (container: HTMLDivElement | null) => {
      containerRef.current = container;
      if (!container) return;

      if (!terminalRef.current) {
        const term = new Terminal({
          fontSize,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
          theme: themeToXterm(theme),
          scrollback,
          cursorBlink: true,
          allowProposedApi: true,
        });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        terminalRef.current = term;
        fitAddonRef.current = fitAddon;
      }

      const term = terminalRef.current;
      const fitAddon = fitAddonRef.current!;

      term.open(container);

      try {
        term.loadAddon(new WebglAddon());
      } catch {
        // WebGL not available — fall back to canvas renderer (default)
      }

      fitAddon.fit();

      // Send keystrokes to PTY
      term.onData((data) => {
        invoke("write_pty", { ptyId, data: Array.from(new TextEncoder().encode(data)) });
      });

      // Listen for PTY output
      const eventName = `pty-output:${ptyId}`;
      const unlisten = listen<number[]>(eventName, (event) => {
        const bytes = new Uint8Array(event.payload);
        term.write(bytes);
      });

      // Spawn PTY if not yet done
      if (!spawnedRef.current) {
        spawnedRef.current = true;
        const { cols, rows } = term;
        invoke("spawn_pty", {
          ptyId,
          cwd,
          rows,
          cols,
          scrollbackLimit: scrollback,
          shell,
        }).catch((err) => {
          term.writeln(`\r\nFailed to start shell: ${err}`);
        });
      } else {
        // Reconnecting — replay scrollback
        invoke<number[]>("get_scrollback", { ptyId }).then((data) => {
          if (data.length > 0) {
            term.write(new Uint8Array(data));
          }
        });
      }

      // Handle resize
      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
        const { cols, rows } = term;
        invoke("resize_pty", { ptyId, rows, cols }).catch(() => {});
      });
      resizeObserver.observe(container);

      return () => {
        resizeObserver.disconnect();
        unlisten.then((fn) => fn());
      };
    },
    [ptyId, cwd, theme, fontSize, scrollback, shell]
  );

  // Update theme when it changes
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = themeToXterm(theme);
    }
  }, [theme]);

  // Fit on window resize
  useEffect(() => {
    function handleResize() {
      fitAddonRef.current?.fit();
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const insertText = useCallback(
    (text: string) => {
      invoke("write_pty", {
        ptyId,
        data: Array.from(new TextEncoder().encode(text)),
      });
    },
    [ptyId]
  );

  return { attach, insertText };
}
```

- [ ] **Step 2: Create TerminalView component**

Create `src/features/terminal/TerminalView.tsx`:

```tsx
import { useRef, useEffect } from "react";
import { useTerminal } from "./useTerminal";
import type { Theme } from "../../types";
import "xterm/css/xterm.css";

interface TerminalViewProps {
  ptyId: string;
  cwd: string;
  theme: Theme;
  fontSize: number;
  scrollback: number;
  shell: string | null;
  onInsertText?: (fn: (text: string) => void) => void;
}

export function TerminalView({
  ptyId,
  cwd,
  theme,
  fontSize,
  scrollback,
  shell,
  onInsertText,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const { attach, insertText } = useTerminal({
    ptyId,
    cwd,
    theme,
    fontSize,
    scrollback,
    shell,
  });

  useEffect(() => {
    if (containerRef.current) {
      const cleanup = attach(containerRef.current);
      cleanupRef.current = cleanup || null;
    }
    return () => {
      cleanupRef.current?.();
    };
  }, [attach]);

  useEffect(() => {
    onInsertText?.(insertText);
  }, [onInsertText, insertText]);

  return (
    <div
      ref={containerRef}
      className="terminal-container"
      style={{ flex: 1, height: "100%", overflow: "hidden" }}
    />
  );
}
```

- [ ] **Step 3: Wire TerminalView into App.tsx**

In `src/App.tsx`, replace the terminal placeholder. Add imports at the top:

```tsx
import { TerminalView } from "./features/terminal/TerminalView";
import { useThemeContext } from "./features/theme/ThemeProvider";
```

Replace the `AppContent` component to use `useThemeContext` and render `TerminalView` instead of the placeholder:

```tsx
function AppContent() {
  const { theme } = useThemeContext();
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => [
    createWorkspace(),
  ]);
  const [activeId, setActiveId] = useState<string>(workspaces[0].id);
  const insertTextRef = useRef<((text: string) => void) | null>(null);

  const activeWorkspace = workspaces.find((ws) => ws.id === activeId)!;

  // ... keep handleNew, handleClose, handleReorder, handleOpenProject unchanged ...

  return (
    <div className="app">
      <TabBar
        workspaces={workspaces}
        activeId={activeId}
        onSelect={setActiveId}
        onClose={handleClose}
        onNew={handleNew}
        onReorder={handleReorder}
      />
      <div className="workspace-area">
        {activeWorkspace.projectPath === null ? (
          <WelcomeScreen onOpenProject={handleOpenProject} />
        ) : (
          <div className="workspace-content">
            <div className="sidebar-placeholder">
              File Tree: {activeWorkspace.projectPath}
            </div>
            <TerminalView
              key={activeWorkspace.ptyId}
              ptyId={activeWorkspace.ptyId}
              cwd={activeWorkspace.projectPath}
              theme={theme}
              fontSize={14}
              scrollback={5000}
              shell={null}
              onInsertText={(fn) => {
                insertTextRef.current = fn;
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

Add `useRef` to the React import at the top.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 5: Verify the app runs**

Run: `pnpm tauri dev`
Expected: App opens, new tab shows welcome screen, opening a folder shows sidebar placeholder + working terminal.

- [ ] **Step 6: Commit**

```bash
git add src/features/terminal/ src/App.tsx
git commit -m "feat: add xterm.js terminal view with PTY integration"
```

---

## Task 9: Frontend — File tree

**Files:**
- Create: `src/features/file-tree/FileTreeNode.tsx`
- Create: `src/features/file-tree/ContextMenu.tsx`
- Create: `src/features/file-tree/FileTree.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Create ContextMenu component**

Create `src/features/file-tree/ContextMenu.tsx`:

```tsx
import { useEffect, useRef } from "react";

export interface MenuItem {
  label: string;
  action: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      style={{ position: "fixed", left: x, top: y }}
    >
      {items.map((item) => (
        <button
          key={item.label}
          className="context-menu-item"
          onClick={() => {
            item.action();
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Create FileTreeNode component**

Create `src/features/file-tree/FileTreeNode.tsx`:

```tsx
import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { DirEntry } from "../../types";
import type { MenuItem } from "./ContextMenu";

interface FileTreeNodeProps {
  entry: DirEntry;
  depth: number;
  projectPath: string;
  onFileClick: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, items: MenuItem[]) => void;
}

export function FileTreeNode({
  entry,
  depth,
  projectPath,
  onFileClick,
  onContextMenu,
}: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<DirEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const toggle = useCallback(async () => {
    if (!entry.is_dir) {
      onFileClick(entry.path);
      return;
    }
    if (!loaded) {
      const entries = await invoke<DirEntry[]>("list_directory", {
        path: entry.path,
      });
      setChildren(entries.filter((e) => !e.is_hidden));
      setLoaded(true);
    }
    setExpanded((prev) => !prev);
  }, [entry, loaded, onFileClick]);

  function handleDragStart(e: React.DragEvent) {
    if (entry.is_dir) return;
    const relativePath = entry.path.replace(projectPath + "/", "");
    e.dataTransfer.setData("text/plain", entry.path);
    e.dataTransfer.setData("absolute-path", entry.path);
    e.dataTransfer.setData("relative-path", relativePath);
    e.dataTransfer.effectAllowed = "copy";
  }

  function handleRightClick(e: React.MouseEvent) {
    e.preventDefault();
    const items: MenuItem[] = entry.is_dir
      ? [
          { label: "New File", action: () => promptCreate(entry.path, false) },
          { label: "New Folder", action: () => promptCreate(entry.path, true) },
          { label: "Rename", action: () => promptRename(entry.path) },
          { label: "Delete", action: () => handleDelete(entry.path) },
          { label: "Copy Path", action: () => navigator.clipboard.writeText(entry.path) },
        ]
      : [
          { label: "Open", action: () => onFileClick(entry.path) },
          { label: "Rename", action: () => promptRename(entry.path) },
          { label: "Delete", action: () => handleDelete(entry.path) },
          { label: "Copy Path", action: () => navigator.clipboard.writeText(entry.path) },
          {
            label: "Copy Relative Path",
            action: () =>
              navigator.clipboard.writeText(
                entry.path.replace(projectPath + "/", "")
              ),
          },
        ];
    onContextMenu(e, items);
  }

  return (
    <>
      <div
        className={`tree-node ${entry.is_dir ? "tree-dir" : "tree-file"}`}
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={toggle}
        onContextMenu={handleRightClick}
        draggable={!entry.is_dir}
        onDragStart={handleDragStart}
      >
        <span className="tree-icon">
          {entry.is_dir ? (expanded ? "▾" : "▸") : ""}
        </span>
        <span className="tree-name">{entry.name}</span>
      </div>
      {expanded &&
        children.map((child) => (
          <FileTreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            projectPath={projectPath}
            onFileClick={onFileClick}
            onContextMenu={onContextMenu}
          />
        ))}
    </>
  );
}

function promptCreate(parentPath: string, isDir: boolean) {
  const name = window.prompt(isDir ? "Folder name:" : "File name:");
  if (!name) return;
  const fullPath = `${parentPath}/${name}`;
  const command = isDir ? "create_directory" : "create_file";
  invoke(command, { path: fullPath }).catch((e) => alert(e));
}

function promptRename(oldPath: string) {
  const oldName = oldPath.split("/").pop() || "";
  const newName = window.prompt("New name:", oldName);
  if (!newName || newName === oldName) return;
  const parentDir = oldPath.substring(0, oldPath.lastIndexOf("/"));
  invoke("rename_entry", { oldPath, newPath: `${parentDir}/${newName}` }).catch(
    (e) => alert(e)
  );
}

function handleDelete(path: string) {
  const name = path.split("/").pop() || "";
  if (window.confirm(`Move "${name}" to trash?`)) {
    invoke("delete_entry", { path }).catch((e) => alert(e));
  }
}
```

- [ ] **Step 3: Create FileTree component**

Create `src/features/file-tree/FileTree.tsx`:

```tsx
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FileTreeNode } from "./FileTreeNode";
import { ContextMenu } from "./ContextMenu";
import type { DirEntry } from "../../types";
import type { MenuItem } from "./ContextMenu";

interface FileTreeProps {
  projectPath: string;
  onFileClick: (path: string) => void;
}

export function FileTree({ projectPath, onFileClick }: FileTreeProps) {
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
  } | null>(null);

  useEffect(() => {
    invoke<DirEntry[]>("list_directory", { path: projectPath }).then(
      (result) => {
        setEntries(result.filter((e) => !e.is_hidden));
      }
    );
  }, [projectPath]);

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, items: MenuItem[]) => {
      setContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    []
  );

  function handleBackgroundContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        {
          label: "New File",
          action: () => {
            const name = window.prompt("File name:");
            if (name) invoke("create_file", { path: `${projectPath}/${name}` });
          },
        },
        {
          label: "New Folder",
          action: () => {
            const name = window.prompt("Folder name:");
            if (name)
              invoke("create_directory", { path: `${projectPath}/${name}` });
          },
        },
      ],
    });
  }

  return (
    <div
      className="file-tree"
      onContextMenu={handleBackgroundContextMenu}
    >
      <div className="file-tree-header">
        <span>{projectPath.split("/").pop()}</span>
      </div>
      <div className="file-tree-list">
        {entries.map((entry) => (
          <FileTreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            projectPath={projectPath}
            onFileClick={onFileClick}
            onContextMenu={handleContextMenu}
          />
        ))}
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Wire FileTree into App.tsx**

Add import in `src/App.tsx`:

```tsx
import { FileTree } from "./features/file-tree/FileTree";
```

Replace the sidebar placeholder with:

```tsx
<FileTree
  projectPath={activeWorkspace.projectPath}
  onFileClick={(path) => {
    // Editor popover will be added in next task
    console.log("Open file:", path);
  }}
/>
```

- [ ] **Step 5: Add file tree styles to App.css**

Append to `src/App.css`:

```css
/* File Tree */
.file-tree {
  width: 250px;
  min-width: 150px;
  background: var(--sidebar);
  border-right: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  user-select: none;
}

.file-tree-header {
  padding: 8px 12px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--border);
}

.file-tree-list {
  flex: 1;
  overflow-y: auto;
  padding: 4px 0;
}

.tree-node {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  cursor: pointer;
  font-size: 13px;
  color: var(--text);
}

.tree-node:hover {
  background: var(--border);
}

.tree-icon {
  width: 12px;
  font-size: 10px;
  text-align: center;
  flex-shrink: 0;
}

.tree-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Context Menu */
.context-menu {
  background: var(--sidebar);
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 4px 0;
  min-width: 160px;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.context-menu-item {
  display: block;
  width: 100%;
  padding: 6px 12px;
  background: none;
  border: none;
  color: var(--text);
  font-size: 13px;
  text-align: left;
  cursor: pointer;
}

.context-menu-item:hover {
  background: var(--accent);
  color: #fff;
}
```

- [ ] **Step 6: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 7: Commit**

```bash
git add src/features/file-tree/ src/App.tsx src/App.css
git commit -m "feat: add file tree with lazy loading, context menu, and drag source"
```

---

## Task 10: Frontend — Floating editor popovers

**Files:**
- Create: `src/features/editor/EditorPopover.tsx`
- Create: `src/features/editor/EditorManager.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Create EditorPopover component**

Create `src/features/editor/EditorPopover.tsx`:

```tsx
import { useRef, useEffect, useState, useCallback } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { javascript } from "@codemirror/lang-javascript";
import { rust } from "@codemirror/lang-rust";
import { json } from "@codemirror/lang-json";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { invoke } from "@tauri-apps/api/core";
import type { EditorPanel, Theme } from "../../types";

function languageFromPath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
    case "jsx":
      return javascript({ jsx: true });
    case "ts":
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "rs":
      return rust();
    case "json":
      return json();
    case "css":
      return css();
    case "html":
      return html();
    case "md":
      return markdown();
    default:
      return [];
  }
}

interface EditorPopoverProps {
  panel: EditorPanel;
  theme: Theme;
  onDirtyChange: (id: string, dirty: boolean) => void;
  onClose: (id: string) => void;
  onFocus: (id: string) => void;
  zIndex: number;
}

export function EditorPopover({
  panel,
  theme,
  onDirtyChange,
  onClose,
  onFocus,
  zIndex,
}: EditorPopoverProps) {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [position, setPosition] = useState(panel.position);
  const [size, setSize] = useState(panel.size);
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const fileName = panel.filePath.split("/").pop() || "";

  // Initialize CodeMirror
  useEffect(() => {
    if (!editorContainerRef.current) return;

    const extensions = [
      basicSetup,
      languageFromPath(panel.filePath),
      theme.type === "dark" ? oneDark : [],
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          setIsDirty(true);
          onDirtyChange(panel.id, true);
        }
      }),
    ].flat();

    const state = EditorState.create({
      doc: panel.content,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: editorContainerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, [panel.id, panel.content, panel.filePath, theme.type]);

  // Save handler
  const save = useCallback(async () => {
    if (!viewRef.current) return;
    const content = viewRef.current.state.doc.toString();
    await invoke("write_file", { path: panel.filePath, content });
    setIsDirty(false);
    onDirtyChange(panel.id, false);
  }, [panel.id, panel.filePath, onDirtyChange]);

  // Keyboard shortcuts
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
      if (e.key === "Escape") {
        handleClose();
      }
    }
    const container = editorContainerRef.current?.parentElement;
    container?.addEventListener("keydown", handleKeyDown);
    return () => container?.removeEventListener("keydown", handleKeyDown);
  }, [save]);

  function handleClose() {
    if (isDirty) {
      const choice = window.confirm(
        `Save changes to ${fileName}?\n\nOK = Save, Cancel = Discard`
      );
      if (choice) {
        save().then(() => onClose(panel.id));
        return;
      }
    }
    onClose(panel.id);
  }

  // Drag title bar
  function handleMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest(".editor-close")) return;
    draggingRef.current = true;
    dragOffsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };

    function handleMouseMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      setPosition({
        x: e.clientX - dragOffsetRef.current.x,
        y: e.clientY - dragOffsetRef.current.y,
      });
    }

    function handleMouseUp() {
      draggingRef.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  return (
    <div
      className="editor-popover"
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        zIndex,
      }}
      onMouseDown={() => onFocus(panel.id)}
    >
      <div className="editor-title-bar" onMouseDown={handleMouseDown}>
        <span className="editor-filename">
          {isDirty && <span className="editor-dirty">●</span>}
          {fileName}
        </span>
        <button className="editor-close" onClick={handleClose}>
          ×
        </button>
      </div>
      <div ref={editorContainerRef} className="editor-body" />
    </div>
  );
}
```

- [ ] **Step 2: Create EditorManager component**

Create `src/features/editor/EditorManager.tsx`:

```tsx
import { useCallback, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { v4 as uuidv4 } from "uuid";
import { EditorPopover } from "./EditorPopover";
import type { EditorPanel, Theme } from "../../types";

interface EditorManagerProps {
  editors: EditorPanel[];
  theme: Theme;
  onEditorsChange: (editors: EditorPanel[]) => void;
}

export function EditorManager({
  editors,
  theme,
  onEditorsChange,
}: EditorManagerProps) {
  const [focusOrder, setFocusOrder] = useState<string[]>([]);

  const handleFocus = useCallback(
    (id: string) => {
      setFocusOrder((prev) => [...prev.filter((fid) => fid !== id), id]);
    },
    []
  );

  const handleClose = useCallback(
    (id: string) => {
      onEditorsChange(editors.filter((e) => e.id !== id));
      setFocusOrder((prev) => prev.filter((fid) => fid !== id));
    },
    [editors, onEditorsChange]
  );

  const handleDirtyChange = useCallback(
    (id: string, dirty: boolean) => {
      onEditorsChange(
        editors.map((e) => (e.id === id ? { ...e, isDirty: dirty } : e))
      );
    },
    [editors, onEditorsChange]
  );

  return (
    <>
      {editors.map((panel) => {
        const zBase = 100;
        const zOffset = focusOrder.indexOf(panel.id);
        const z = zBase + (zOffset === -1 ? 0 : zOffset);
        return (
          <EditorPopover
            key={panel.id}
            panel={panel}
            theme={theme}
            onDirtyChange={handleDirtyChange}
            onClose={handleClose}
            onFocus={handleFocus}
            zIndex={z}
          />
        );
      })}
    </>
  );
}

export async function openEditorPanel(
  filePath: string,
  currentEditors: EditorPanel[]
): Promise<EditorPanel[]> {
  // If already open, don't duplicate
  const existing = currentEditors.find((e) => e.filePath === filePath);
  if (existing) return currentEditors;

  const content = await invoke<string>("read_file", { path: filePath });

  const offset = currentEditors.length * 30;
  const newPanel: EditorPanel = {
    id: uuidv4(),
    filePath,
    content,
    isDirty: false,
    position: { x: 300 + offset, y: 80 + offset },
    size: { width: 600, height: 400 },
  };

  return [...currentEditors, newPanel];
}
```

- [ ] **Step 3: Wire editors into App.tsx**

Add import in `src/App.tsx`:

```tsx
import { EditorManager, openEditorPanel } from "./features/editor/EditorManager";
```

In the `workspace-content` div, add `EditorManager` and update `FileTree`'s `onFileClick`:

```tsx
<div className="workspace-content">
  <FileTree
    projectPath={activeWorkspace.projectPath}
    onFileClick={async (path) => {
      const updated = await openEditorPanel(
        path,
        activeWorkspace.openEditors
      );
      setWorkspaces((prev) =>
        prev.map((ws) =>
          ws.id === activeId ? { ...ws, openEditors: updated } : ws
        )
      );
    }}
  />
  <div className="terminal-and-editors">
    <TerminalView
      key={activeWorkspace.ptyId}
      ptyId={activeWorkspace.ptyId}
      cwd={activeWorkspace.projectPath}
      theme={theme}
      fontSize={14}
      scrollback={5000}
      shell={null}
      onInsertText={(fn) => {
        insertTextRef.current = fn;
      }}
    />
    <EditorManager
      editors={activeWorkspace.openEditors}
      theme={theme}
      onEditorsChange={(editors) => {
        setWorkspaces((prev) =>
          prev.map((ws) =>
            ws.id === activeId ? { ...ws, openEditors: editors } : ws
          )
        );
      }}
    />
  </div>
</div>
```

- [ ] **Step 4: Add editor styles to App.css**

Append to `src/App.css`:

```css
/* Terminal + Editors container */
.terminal-and-editors {
  flex: 1;
  position: relative;
  overflow: hidden;
}

/* Editor Popover */
.editor-popover {
  position: absolute;
  background: var(--editor-bg, var(--bg));
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  resize: both;
  min-width: 300px;
  min-height: 200px;
}

.editor-title-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--tab-bar);
  border-bottom: 1px solid var(--border);
  cursor: grab;
  user-select: none;
  font-size: 13px;
}

.editor-title-bar:active {
  cursor: grabbing;
}

.editor-filename {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text);
}

.editor-dirty {
  color: var(--accent);
  font-size: 10px;
}

.editor-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 16px;
  padding: 0 4px;
  line-height: 1;
}

.editor-close:hover {
  color: var(--text);
}

.editor-body {
  flex: 1;
  overflow: auto;
}

.editor-body .cm-editor {
  height: 100%;
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/editor/ src/App.tsx src/App.css
git commit -m "feat: add floating CodeMirror editor popovers with save, close, dirty tracking"
```

---

## Task 11: Frontend — Drag and drop (file to terminal)

**Files:**
- Modify: `src/features/terminal/TerminalView.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Add drop zone to TerminalView**

In `src/features/terminal/TerminalView.tsx`, add drag-and-drop handling. Update the component:

```tsx
import { useRef, useEffect, useState } from "react";
import { useTerminal } from "./useTerminal";
import type { Theme } from "../../types";
import "xterm/css/xterm.css";

interface TerminalViewProps {
  ptyId: string;
  cwd: string;
  theme: Theme;
  fontSize: number;
  scrollback: number;
  shell: string | null;
  dragDropPathMode: "absolute" | "relative";
  onInsertText?: (fn: (text: string) => void) => void;
}

export function TerminalView({
  ptyId,
  cwd,
  theme,
  fontSize,
  scrollback,
  shell,
  dragDropPathMode,
  onInsertText,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const { attach, insertText } = useTerminal({
    ptyId,
    cwd,
    theme,
    fontSize,
    scrollback,
    shell,
  });

  useEffect(() => {
    if (containerRef.current) {
      const cleanup = attach(containerRef.current);
      cleanupRef.current = cleanup || null;
    }
    return () => {
      cleanupRef.current?.();
    };
  }, [attach]);

  useEffect(() => {
    onInsertText?.(insertText);
  }, [onInsertText, insertText]);

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }

  function handleDragLeave() {
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);

    const dataKey =
      dragDropPathMode === "relative" ? "relative-path" : "absolute-path";
    let path = e.dataTransfer.getData(dataKey) || e.dataTransfer.getData("text/plain");

    if (!path) return;

    // Wrap paths with spaces in quotes
    if (path.includes(" ")) {
      path = `"${path}"`;
    }

    insertText(path);
  }

  return (
    <div
      ref={containerRef}
      className={`terminal-container ${dragOver ? "terminal-drag-over" : ""}`}
      style={{ flex: 1, height: "100%", overflow: "hidden" }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    />
  );
}
```

- [ ] **Step 2: Add drag-over style to App.css**

Append to `src/App.css`:

```css
.terminal-drag-over {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
```

- [ ] **Step 3: Pass dragDropPathMode from App.tsx**

In `src/App.tsx`, update the `TerminalView` usage to pass `dragDropPathMode="absolute"` (reading from settings will be wired in the settings task — hardcode for now):

```tsx
<TerminalView
  key={activeWorkspace.ptyId}
  ptyId={activeWorkspace.ptyId}
  cwd={activeWorkspace.projectPath}
  theme={theme}
  fontSize={14}
  scrollback={5000}
  shell={null}
  dragDropPathMode="absolute"
  onInsertText={(fn) => {
    insertTextRef.current = fn;
  }}
/>
```

- [ ] **Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add src/features/terminal/TerminalView.tsx src/App.tsx src/App.css
git commit -m "feat: add drag-and-drop file path insertion into terminal"
```

---

## Task 12: Frontend — Settings panel

**Files:**
- Create: `src/features/settings/useSettings.ts`
- Create: `src/features/settings/SettingsPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Create useSettings hook**

Create `src/features/settings/useSettings.ts`:

```typescript
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { Settings } from "../../types";

const defaultSettings: Settings = {
  theme: "dark",
  drag_drop_path_mode: "absolute",
  default_shell: null,
  terminal_scrollback: 5000,
  font_size: 14,
};

export function useSettings() {
  const [settings, setSettingsState] = useState<Settings>(defaultSettings);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    invoke<Settings>("load_settings").then((s) => {
      setSettingsState(s);
      setLoaded(true);
    });
  }, []);

  const updateSettings = useCallback(
    async (partial: Partial<Settings>) => {
      const next = { ...settings, ...partial };
      setSettingsState(next);
      await invoke("save_settings", { settings: next });
    },
    [settings]
  );

  return { settings, updateSettings, loaded };
}
```

- [ ] **Step 2: Create SettingsPanel component**

Create `src/features/settings/SettingsPanel.tsx`:

```tsx
import type { Settings } from "../../types";

interface SettingsPanelProps {
  settings: Settings;
  onUpdate: (partial: Partial<Settings>) => void;
  onClose: () => void;
}

export function SettingsPanel({
  settings,
  onUpdate,
  onClose,
}: SettingsPanelProps) {
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="settings-body">
          <label className="settings-row">
            <span>Theme</span>
            <select
              value={settings.theme}
              onChange={(e) => onUpdate({ theme: e.target.value })}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </label>

          <label className="settings-row">
            <span>Drag & Drop Path</span>
            <select
              value={settings.drag_drop_path_mode}
              onChange={(e) =>
                onUpdate({
                  drag_drop_path_mode: e.target.value as "absolute" | "relative",
                })
              }
            >
              <option value="absolute">Absolute</option>
              <option value="relative">Relative</option>
            </select>
          </label>

          <label className="settings-row">
            <span>Font Size</span>
            <input
              type="number"
              min={10}
              max={24}
              value={settings.font_size}
              onChange={(e) =>
                onUpdate({ font_size: Number(e.target.value) })
              }
            />
          </label>

          <label className="settings-row">
            <span>Scrollback Lines</span>
            <input
              type="number"
              min={1000}
              max={50000}
              step={1000}
              value={settings.terminal_scrollback}
              onChange={(e) =>
                onUpdate({ terminal_scrollback: Number(e.target.value) })
              }
            />
          </label>

          <label className="settings-row">
            <span>Default Shell</span>
            <input
              type="text"
              placeholder="Auto-detect"
              value={settings.default_shell || ""}
              onChange={(e) =>
                onUpdate({
                  default_shell: e.target.value || null,
                })
              }
            />
          </label>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Wire settings into App.tsx**

Add imports:

```tsx
import { useSettings } from "./features/settings/useSettings";
import { SettingsPanel } from "./features/settings/SettingsPanel";
```

In `AppContent`, add settings state and a gear button in the tab bar area. Update `TerminalView` props to use `settings.font_size`, `settings.terminal_scrollback`, `settings.default_shell`, and `settings.drag_drop_path_mode`. Update `useThemeContext` to call `setTheme` when settings theme changes.

Add a settings toggle button after the `TabBar`:

```tsx
const { settings, updateSettings, loaded } = useSettings();
const [showSettings, setShowSettings] = useState(false);
```

Add after `<TabBar ... />`:

```tsx
<button className="settings-btn" onClick={() => setShowSettings(true)}>
  ⚙
</button>
```

Add before closing `</div>` of `.app`:

```tsx
{showSettings && (
  <SettingsPanel
    settings={settings}
    onUpdate={(partial) => {
      updateSettings(partial);
      if (partial.theme) {
        setTheme(partial.theme);
      }
    }}
    onClose={() => setShowSettings(false)}
  />
)}
```

Update `TerminalView` to use settings values:

```tsx
<TerminalView
  key={activeWorkspace.ptyId}
  ptyId={activeWorkspace.ptyId}
  cwd={activeWorkspace.projectPath}
  theme={theme}
  fontSize={settings.font_size}
  scrollback={settings.terminal_scrollback}
  shell={settings.default_shell}
  dragDropPathMode={settings.drag_drop_path_mode}
  onInsertText={(fn) => { insertTextRef.current = fn; }}
/>
```

- [ ] **Step 4: Add settings styles to App.css**

Append to `src/App.css`:

```css
/* Settings Button */
.settings-btn {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 16px;
  padding: 0 10px;
  margin-left: auto;
  height: 100%;
}

.settings-btn:hover {
  color: var(--text);
}

/* Settings Panel */
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 500;
}

.settings-panel {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  width: 400px;
  max-height: 80vh;
  overflow-y: auto;
}

.settings-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 16px;
  border-bottom: 1px solid var(--border);
}

.settings-header h2 {
  font-size: 16px;
  font-weight: 600;
}

.settings-close {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 18px;
}

.settings-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 14px;
}

.settings-row select,
.settings-row input {
  background: var(--sidebar);
  border: 1px solid var(--border);
  color: var(--text);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 13px;
  width: 160px;
}
```

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add src/features/settings/ src/App.tsx src/App.css
git commit -m "feat: add settings panel with theme, font size, path mode, shell config"
```

---

## Task 13: Frontend — Resizable sidebar

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css`

- [ ] **Step 1: Add resize handle between file tree and terminal**

In `src/App.tsx`, wrap the `workspace-content` area with a resize handler. Add state and a drag handle:

```tsx
const [sidebarWidth, setSidebarWidth] = useState(250);
const resizingRef = useRef(false);
```

Add mouse handlers:

```tsx
function handleResizeStart(e: React.MouseEvent) {
  e.preventDefault();
  resizingRef.current = true;

  function handleMouseMove(e: MouseEvent) {
    if (!resizingRef.current) return;
    const newWidth = Math.max(150, Math.min(500, e.clientX));
    setSidebarWidth(newWidth);
  }

  function handleMouseUp() {
    resizingRef.current = false;
    document.removeEventListener("mousemove", handleMouseMove);
    document.removeEventListener("mouseup", handleMouseUp);
  }

  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
}
```

Update the workspace-content JSX:

```tsx
<div className="workspace-content">
  <div style={{ width: sidebarWidth, flexShrink: 0 }}>
    <FileTree
      projectPath={activeWorkspace.projectPath}
      onFileClick={async (path) => { /* ... */ }}
    />
  </div>
  <div className="resize-handle" onMouseDown={handleResizeStart} />
  <div className="terminal-and-editors">
    {/* TerminalView + EditorManager unchanged */}
  </div>
</div>
```

- [ ] **Step 2: Add resize handle styles**

Append to `src/App.css`:

```css
.resize-handle {
  width: 4px;
  cursor: col-resize;
  background: var(--border);
  flex-shrink: 0;
  transition: background 0.15s;
}

.resize-handle:hover {
  background: var(--accent);
}
```

Also update `.file-tree` to remove the fixed `width: 250px` — the width is now controlled by the parent:

```css
.file-tree {
  width: 100%;
  height: 100%;
  /* remove: width: 250px; min-width: 150px; */
  background: var(--sidebar);
  border-right: none; /* border is now on resize-handle */
  display: flex;
  flex-direction: column;
  overflow: hidden;
  user-select: none;
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add src/App.tsx src/App.css
git commit -m "feat: add resizable sidebar with drag handle"
```

---

## Task 14: Integration — Full app verification

**Files:** None new — this is a manual verification pass.

- [ ] **Step 1: Run the full app**

Run: `pnpm tauri dev`
Expected: App launches with a single "New Tab" showing the welcome screen.

- [ ] **Step 2: Test tab management**

1. Click "Open Folder" → select a project directory → file tree populates, terminal starts in that directory
2. Click "+" → new empty tab appears
3. Switch between tabs → terminal and file tree change
4. Close a tab → workspace is removed
5. Close last tab → new empty tab auto-created
6. Drag tabs to reorder

- [ ] **Step 3: Test terminal**

1. Type commands in terminal (ls, cd, echo) → output appears
2. Run interactive programs (e.g. `top` or `htop`) → renders correctly
3. Resize window → terminal adjusts

- [ ] **Step 4: Test file tree**

1. Click folders to expand/collapse → lazy loads children
2. Right-click file → context menu with Open, Rename, Delete, Copy Path, Copy Relative Path
3. Right-click folder → context menu with New File, New Folder, Rename, Delete, Copy Path
4. Right-click empty area → New File, New Folder

- [ ] **Step 5: Test editor popovers**

1. Click a file → floating editor opens with syntax highlighting
2. Edit content → dirty indicator (●) appears
3. Ctrl+S → saves, dirty clears
4. Click another file → second editor opens
5. Click an editor → brings to front
6. Drag title bar → moves editor
7. Esc or X → closes (with save prompt if dirty)

- [ ] **Step 6: Test drag and drop**

1. Drag a file from tree to terminal → path appears at cursor
2. Drag a file with spaces in name → path is quoted

- [ ] **Step 7: Test settings**

1. Click gear icon → settings panel opens
2. Switch theme → immediate change
3. Change font size → terminal updates
4. Change path mode → next drag uses new mode
5. Close settings → overlay dismissed

- [ ] **Step 8: Test recent projects**

1. Open a project → appears in recent projects
2. Open new tab → welcome screen shows recent project
3. Click recent project → opens that directory
4. Remove button → removes from list

- [ ] **Step 9: Commit if any fixes were needed**

```bash
git add -A
git commit -m "fix: integration fixes from full app verification"
```
