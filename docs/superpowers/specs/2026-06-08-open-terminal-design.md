# Open Terminal — Design Spec

A Tauri 2 desktop terminal for developers that handles multiple projects concurrently via tabbed workspaces. Each tab is an isolated environment with its own file tree, terminal session, and floating code editors.

## Tech Stack

- **Frontend:** React 19 + TypeScript, Vite, xterm.js (terminal), CodeMirror (editor)
- **Backend:** Rust (Tauri 2) — PTY management, filesystem operations, settings persistence
- **IPC:** Tauri `invoke()` for commands, Tauri events for PTY output streaming

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    Tauri Window                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │              Tab Bar (Project Tabs)              │ │
│  ├────────────┬────────────────────────────────────┤ │
│  │            │                                    │ │
│  │  File Tree │         xterm.js Terminal          │ │
│  │  (resize-  │                                    │ │
│  │   able)    │    ┌──────────────────────┐        │ │
│  │            │    │  Floating CodeMirror │        │ │
│  │  drag      │    │  Editor Popover(s)   │        │ │
│  │  source    │    │  (draggable,         │        │ │
│  │   ──────►  │    │   resizable)         │        │ │
│  │  drop into │    └──────────────────────┘        │ │
│  │  terminal  │                                    │ │
│  ├────────────┴────────────────────────────────────┤ │
│  │          Status Bar (not in v1 scope)            │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

Two layers:

- **Rust backend** — PTY lifecycle (spawn/resize/kill per tab), filesystem operations (list directory, read/write files), recent projects persistence, app settings storage.
- **React frontend** — Tab management, file tree rendering, xterm.js terminal per active tab, CodeMirror floating editors, drag-and-drop, theming.

All Rust ↔ React communication via Tauri's `invoke()` IPC for commands and Tauri events for streaming PTY output to xterm.js.

## Tab & Workspace Model

Each tab represents an isolated workspace:

```
Workspace {
  id: string (uuid)
  projectPath: string | null     // null = empty workspace (just opened)
  label: string                  // tab title — folder name or "New Tab"
  ptyId: string                  // maps to a PTY session in Rust
  openEditors: EditorPanel[]     // currently open floating editors
}
```

### Tab behavior

- **New tab** → opens empty workspace with a welcome screen showing recent projects list + "Open Folder" button.
- **Open folder** → sets `projectPath`, file tree populates, terminal `cd`s into that directory.
- **Close tab** → kills the PTY session in Rust, closes all open editors, removes workspace from state.
- **Tab ordering** → draggable to reorder.
- **Active tab** → only the active tab's xterm.js instance is mounted in the DOM. Background tabs keep their PTY alive in Rust but don't render a terminal. When you switch back, xterm.js remounts and replays the scrollback buffer from Rust.

## Terminal (xterm.js + PTY)

### Rust side — PTY manager

Each workspace gets its own PTY process:

- `spawn_pty(workspace_id, cwd)` → spawns a shell (detects user's default: bash/zsh/fish), returns a `pty_id`.
- `write_pty(pty_id, data)` → sends keystrokes to the PTY.
- `resize_pty(pty_id, cols, rows)` → resizes the PTY when terminal or window resizes.
- `kill_pty(pty_id)` → kills the process when tab closes.
- Rust keeps a scrollback buffer per PTY (configurable size, default ~5000 lines) so switching tabs can restore output.

### Data flow

```
Keystrokes:  xterm.js → invoke("write_pty") → Rust → PTY process
Output:      PTY process → Rust → tauri event "pty-output:{pty_id}" → xterm.js
Resize:      xterm.js fit addon → invoke("resize_pty") → Rust → PTY
```

### Frontend side

- Uses `xterm.js` with the `fit` addon (auto-resize to container) and `webgl` addon (GPU-accelerated rendering).
- Only the active tab mounts an xterm.js `Terminal` instance. On tab switch: detach from old, attach to new, write buffered scrollback.
- Theming: xterm.js accepts a theme object (background, foreground, cursor, ANSI colors) — driven by the app's theme system.

## File Tree

### Rust side — filesystem commands

- `list_directory(path)` → returns entries `{ name, path, is_dir, is_hidden }` for one level only (lazy loading).
- `read_file(path)` → returns file content as string.
- `write_file(path, content)` → saves file.
- `create_file(path)` / `create_directory(path)` → new file/folder.
- `rename_entry(old_path, new_path)` → rename.
- `delete_entry(path)` → move to trash (not permanent delete).
- `get_file_path(path, mode)` → returns absolute or relative path based on user setting.

### Frontend side

- Tree loads lazily — only expands one directory at a time on click, no recursive scan upfront.
- Single click on file → opens floating CodeMirror editor.
- Single click on folder → expand/collapse.
- Right-click context menu:
  - **File:** Open, Rename, Delete, Copy Path, Copy Relative Path.
  - **Folder:** New File, New Folder, Rename, Delete, Copy Path.
  - **Background (empty area):** New File, New Folder.
- Drag a file → drag starts with the file path as payload.
- Drop target is the xterm.js terminal → inserts the path string at cursor position.
- Left panel is resizable via a drag handle between file tree and terminal.

## Floating Code Editor Popovers

### Trigger

Single click on a file in the file tree.

### Editor panel model

```
EditorPanel {
  id: string
  filePath: string
  content: string           // loaded from Rust
  isDirty: boolean          // unsaved changes
  position: { x, y }       // screen coordinates
  size: { width, height }  // resizable
}
```

### Behavior

- Appears as a floating panel over the terminal area — draggable by title bar, resizable from edges/corners.
- Title bar shows: file name, dirty indicator (dot when unsaved), close button (X).
- If file is already open, clicking it again brings that popover to front instead of opening a duplicate.
- Multiple popovers can be open simultaneously — they stack/overlap freely, clicking one brings it to front (z-index management).
- **Save:** `Ctrl+S` / `Cmd+S` saves the active (focused) popover via `invoke("write_file")`.
- **Close:** click X or `Esc`. If dirty, shows a confirm prompt: "Save changes to {filename}?" with Save / Discard / Cancel.
- Clicking on the terminal behind the popovers focuses the terminal — popovers don't steal terminal focus unless explicitly clicked.

### CodeMirror setup

- Syntax highlighting auto-detected from file extension (JS/TS, Rust, JSON, CSS, HTML, Markdown, etc.).
- Line numbers enabled.
- Theme synced with the app's active theme (dark/light).
- Basic keybindings: undo/redo, indent/dedent, search (`Ctrl+F`).

## Drag and Drop

### Drag source

Any file in the file tree.

### Drag behavior

- On drag start, a ghost preview shows the file name.
- The drag payload contains the file's absolute path and relative path (relative to project root).
- Valid drop target: the xterm.js terminal area only — it highlights subtly (faint border glow) when a file is dragged over it.

### Drop behavior

- On drop, inserts the path as text at the current cursor position in the terminal.
- Path format determined by user setting: absolute (default) or relative.
- Paths containing spaces are automatically wrapped in quotes.
- After insertion, terminal regains focus.

### Not a drop target (v1)

- File tree (no drag-to-move files).
- Editor popovers.
- Tab bar.

## Theming

### Theme structure

```
Theme {
  name: string
  type: "dark" | "light"
  colors: {
    // App chrome
    background, sidebar, tabBar, tabActive, tabInactive,
    border, text, textMuted, accent

    // Terminal (xterm.js)
    terminalBg, terminalFg, terminalCursor, ansi[16]

    // Editor (CodeMirror)
    editorBg, editorFg, editorLineNumber, editorSelection
  }
}
```

### Behavior

- Ships with two built-in themes: **Dark** (default) and **Light**.
- User selects theme via settings panel (gear icon).
- Theme preference stored via Rust in `~/.open-terminal/settings.json`.
- On launch, loads saved theme. If none saved, checks OS preference (`prefers-color-scheme`) and picks accordingly.
- Theme change applies instantly — no restart. CSS custom properties drive the chrome, xterm.js and CodeMirror accept theme objects directly.

## Settings & Persistence

### Settings (`~/.open-terminal/settings.json`)

```
Settings {
  theme: "dark" | "light"                        // default: auto-detect from OS
  dragDropPathMode: "absolute" | "relative"       // default: "absolute"
  defaultShell: string | null                     // null = auto-detect
  terminalScrollback: number                      // default: 5000
  fontSize: number                                // terminal + editor, default: 14
}
```

### Recent projects (`~/.open-terminal/recent-projects.json`)

```
RecentProject {
  path: string
  name: string              // folder name
  lastOpened: timestamp
}
```

- Max 20 recent projects, sorted by `lastOpened` descending.
- Opening a project moves it to the top.
- If a project path no longer exists on disk, shown greyed out with a "Remove" option.

### Session restore

None in v1. App opens with a single new empty tab showing the welcome/recent projects screen.

## Out of Scope (v1)

- Git status indicators in file tree
- File search/filter in file tree
- Drag-to-move files within the file tree
- Session restore (reopen last tabs on launch)
- Split terminal panes within a single tab
- Custom theme creation / theme marketplace
- Plugin/extension system
