# Open Terminal - Architecture Guide

A comprehensive guide to the codebase for developers joining the project.

---

## Table of Contents

1. [What Is This App?](#what-is-this-app)
2. [Tech Stack](#tech-stack)
3. [How Tauri Works (The Big Picture)](#how-tauri-works-the-big-picture)
4. [Project Structure](#project-structure)
5. [Application Startup Flow](#application-startup-flow)
6. [Data Flow: Frontend to Backend](#data-flow-frontend-to-backend)
7. [Rust Backend Modules](#rust-backend-modules)
8. [React Frontend Architecture](#react-frontend-architecture)
9. [Feature Modules Deep Dive](#feature-modules-deep-dive)
10. [Key Patterns Used](#key-patterns-used)
11. [Naming Conventions](#naming-conventions)
12. [Configuration Files](#configuration-files)
13. [Common Tasks for Developers](#common-tasks-for-developers)

---

## What Is This App?

Open Terminal is a desktop terminal emulator (like iTerm2, Windows Terminal, or the VS Code integrated terminal). It lets you:

- Open project folders and work in them with a terminal shell (bash/zsh)
- Browse files in a sidebar (like VS Code's Explorer)
- View git status, stage/unstage files, switch branches, and commit
- Split terminals into resizable panes
- Edit files in floating popover editors
- Customize themes (dark, light, or create your own)

Think of it as a lightweight VS Code focused on the terminal experience.

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| **Frontend** | React 19 + TypeScript | UI components and state management |
| **Styling** | Tailwind CSS 4 | Utility-first CSS (classes like `flex`, `bg-app`) |
| **Terminal** | xterm.js | Terminal emulator that renders in the browser |
| **Bundler** | Vite | Fast dev server with hot module replacement (HMR) |
| **Desktop Shell** | Tauri 2 | Wraps the web app in a native desktop window |
| **Backend** | Rust | File I/O, git operations, terminal (PTY) management |
| **IPC** | Tauri Commands | Frontend calls Rust functions via `invoke()` |

### What is Tauri?

Tauri is a framework for building desktop apps using web technologies. Instead of bundling a full Chromium browser (like Electron does), Tauri uses the operating system's built-in web view (WebKitGTK on Linux, WebView2 on Windows, WKWebView on macOS). This makes the app much smaller and lighter.

The key idea: **the frontend is a normal web app** (React), but it can call **Rust functions** on the backend via Tauri's IPC (Inter-Process Communication) system.

---

## How Tauri Works (The Big Picture)

```
+--------------------------------------------------+
|                   Desktop Window                  |
|  +--------------------------------------------+  |
|  |              Web View (Frontend)            |  |
|  |                                              |  |
|  |   React App (TypeScript)                    |  |
|  |   - Renders UI with components              |  |
|  |   - Uses xterm.js for terminal rendering    |  |
|  |   - Calls Rust via invoke("command", args)  |  |
|  |                                              |  |
|  +--------------------+-------------------------+  |
|                       | IPC (invoke / events)      |
|  +--------------------v-------------------------+  |
|  |              Rust Backend                     |  |
|  |                                              |  |
|  |   - Spawns shell processes (PTY)            |  |
|  |   - Reads/writes files                      |  |
|  |   - Runs git commands (via libgit2)         |  |
|  |   - Watches filesystem for changes          |  |
|  |   - Stores settings to disk                 |  |
|  +--------------------------------------------+  |
+--------------------------------------------------+
```

### IPC: How Frontend Talks to Backend

**Frontend calling Rust (Commands):**
```typescript
// Frontend: call a Rust function
const entries = await invoke<DirEntry[]>("list_directory", { path: "/home/user" });
```

```rust
// Backend: the Rust function being called
#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<DirEntry>, String> {
    // ... read directory ...
}
```

**Backend sending data to Frontend (Events):**
```rust
// Backend: emit an event
app_handle.emit("pty-output:abc123", data);
```

```typescript
// Frontend: listen for events
listen<number[]>("pty-output:abc123", (event) => {
    terminal.write(new Uint8Array(event.payload));
});
```

---

## Project Structure

```
open-terminal/
├── src/                          # Frontend (React + TypeScript)
│   ├── main.tsx                  # React entry point — mounts <App /> to DOM
│   ├── App.tsx                   # Root component — workspace tabs, routing
│   ├── App.css                   # Global styles + Tailwind theme tokens
│   ├── types.ts                  # Shared TypeScript interfaces
│   └── features/                 # Feature-based folder structure
│       ├── menu/
│       │   └── MenuBar.tsx       # File/Edit/View/Terminal/Help menu bar
│       ├── tabs/
│       │   ├── TabBar.tsx        # Workspace tab strip (drag-to-reorder)
│       │   └── WelcomeScreen.tsx # "Open Folder" screen for new tabs
│       ├── workspace/
│       │   └── WorkspaceView.tsx # Main workspace layout (sidebar + terminals)
│       ├── file-tree/
│       │   ├── FileTree.tsx      # Recursive directory tree in sidebar
│       │   ├── FileTreeNode.tsx  # Single file/folder row with context menu
│       │   ├── FileIcon.tsx      # Maps file extensions to icons
│       │   └── ContextMenu.tsx   # Right-click menu component
│       ├── terminal/
│       │   ├── TerminalGrid.tsx  # Arranges terminal panes in resizable grid
│       │   ├── TerminalView.tsx  # Single terminal instance (xterm.js wrapper)
│       │   └── useTerminal.ts    # Hook: creates xterm + connects to PTY
│       ├── editor/
│       │   ├── EditorManager.tsx # Manages floating editor popovers
│       │   └── EditorPopover.tsx # Draggable/resizable code editor window
│       ├── git/
│       │   ├── GitPanel.tsx      # Source control sidebar panel
│       │   └── useGitStatus.ts   # Hook: polls git status every 2 seconds
│       ├── settings/
│       │   ├── SettingsPanel.tsx  # Settings modal overlay
│       │   └── useSettings.ts    # Hook: loads/saves app settings
│       └── theme/
│           ├── themes.ts         # Built-in dark and light theme definitions
│           ├── useTheme.ts       # Hook: theme resolution and custom theme loading
│           ├── ThemeProvider.tsx  # React Context that provides theme to all components
│           └── ThemeEditor.tsx   # UI for creating/editing custom themes
│
├── src-tauri/                    # Backend (Rust)
│   ├── src/
│   │   ├── main.rs              # Rust entry point — calls lib::run()
│   │   ├── lib.rs               # Tauri app setup — registers plugins, state, commands
│   │   ├── pty_manager.rs       # Terminal (PTY) session management
│   │   ├── filesystem.rs        # File/directory CRUD operations
│   │   ├── file_watcher.rs      # Filesystem change notifications
│   │   ├── git_commands.rs      # Git operations via libgit2
│   │   └── settings.rs          # App settings and recent projects persistence
│   ├── Cargo.toml               # Rust dependencies
│   └── tauri.conf.json          # Tauri app configuration (window size, app ID, etc.)
│
├── package.json                  # Node.js dependencies and scripts
├── vite.config.ts               # Vite bundler configuration
├── tsconfig.json                # TypeScript compiler configuration
└── CLAUDE.md                    # AI assistant instructions for this project
```

---

## Application Startup Flow

Here is exactly what happens when a user launches the app:

```
1. OS launches the binary
   └── main.rs: main() calls open_terminal_lib::run()

2. Rust initializes Tauri
   └── lib.rs: run()
       ├── Registers plugins (dialog for folder picker, opener for URLs)
       ├── Creates shared state (PtyState for terminals, WatcherState for file watching)
       ├── Registers all IPC command handlers (generate_handler![...])
       └── Opens a native window containing the web view

3. Web view loads index.html
   └── index.html has <div id="root"> and loads main.tsx

4. React boots up
   └── main.tsx: ReactDOM.createRoot(#root).render(<App />)

5. App component initializes
   └── App.tsx:
       ├── ThemeProvider loads theme from ~/.open-terminal/settings.json
       ├── Creates one empty Workspace (projectPath = null)
       └── Renders: MenuBar + TabBar + WelcomeScreen

6. User sees the Welcome Screen
   └── WelcomeScreen.tsx:
       ├── "Open Folder" button (opens native folder picker)
       └── Recent projects list (loaded from ~/.open-terminal/recent-projects.json)

7. User opens a folder
   └── App.tsx: handleOpenProject()
       ├── Records the path in recent projects (Rust: add_recent_project)
       ├── Sets workspace.projectPath to the selected path
       └── Workspace label becomes the folder name

8. WorkspaceView renders
   └── WorkspaceView.tsx:
       ├── Sidebar: FileTree (loads directory listing from Rust)
       ├── File watcher starts (Rust watches for changes, notifies frontend)
       ├── Git status polling starts (every 2 seconds)
       └── Terminal: TerminalGrid → TerminalView → useTerminal
           ├── Creates xterm.js instance
           ├── Calls Rust: spawn_pty(cwd, rows, cols)
           ├── Rust spawns bash/zsh at the project directory
           └── Terminal is ready for user input
```

---

## Data Flow: Frontend to Backend

### Terminal Input/Output

This is the most important data flow in the app. Understanding it is key.

```
User types "ls" in terminal
        │
        ▼
xterm.js captures keystroke
        │
        ▼
term.onData("l") fires → term.onData("s") fires → term.onData("\r") fires
        │
        ▼
Each keystroke → invoke("write_pty", { ptyId, data: [byte] })
        │                                                    
        ▼                                                    
Rust: write_pty() writes bytes to PTY master                 
        │                                                    
        ▼                                                    
Shell process (bash/zsh) receives input                      
        │                                                    
        ▼                                                    
Shell executes "ls", produces output                         
        │                                                    
        ▼                                                    
PTY reader thread reads output bytes                         
        │                                                    
        ▼                                                    
Rust: app_handle.emit("pty-output:{ptyId}", data)           
        │                                                    
        ▼                                                    
Frontend: listen("pty-output:{ptyId}") receives bytes       
        │                                                    
        ▼                                                    
term.write(bytes) → xterm.js renders the output             
```

### Copy/Paste in Terminal

The terminal intercepts Ctrl+C and Ctrl+V before xterm.js processes them:

| Shortcut | Has Selection? | Action |
|----------|---------------|--------|
| Ctrl+C | Yes | Copy selection to clipboard, clear selection |
| Ctrl+C | No | Send SIGINT to shell (interrupt running command) |
| Ctrl+V | - | Read from system clipboard, write directly to PTY |
| Ctrl+Shift+C | - | Always copy selection |
| Ctrl+Shift+V | - | Always paste from clipboard |

**Why write directly to PTY instead of `term.paste()`?** Using `term.paste()` fires xterm's `onData` event AND the browser's native paste event also fires through xterm's built-in listener, causing the text to be sent twice (double-paste bug).

### File Tree Loading

```
WorkspaceView mounts with projectPath="/home/user/project"
        │
        ▼
FileTree calls invoke("list_directory", { path })
        │
        ▼
Rust: reads directory, sorts (folders first, then alphabetical)
        │
        ▼
Returns DirEntry[] → FileTree renders nodes
        │
        ▼
User expands a folder → list_directory called for that subfolder
        │
        ▼
Meanwhile: Rust file watcher emits "fs-changed" events
        │
        ▼
FileTree listener re-fetches changed directories automatically
```

### Git Status Flow

```
WorkspaceView renders → useGitStatus(projectPath) hook starts
        │
        ▼
Every 2 seconds: invoke("git_status", { projectPath })
        │
        ▼
Rust: opens repo with libgit2, reads status
        │
        ▼
Returns GitStatusInfo { branch, staged[], modified[], untracked[], conflicted[] }
        │
        ▼
useGitStatus builds:
  - statusMap: Map<filePath, statusString>  (for FileTree to color files)
  - dirtyDirs: Set<dirPath>                 (for FileTree to show folder indicators)
        │
        ▼
GitPanel renders staged/unstaged/untracked sections
FileTree colors file names based on git status
```

---

## Rust Backend Modules

### pty_manager.rs — Terminal Sessions

**What is a PTY?** A PTY (pseudo-terminal) is a pair of virtual devices: a "master" and a "slave". The slave acts like a real terminal to the shell process (bash/zsh). The master is what our app reads from and writes to.

```
┌─────────────┐     ┌──────────────┐     ┌───────────────┐
│   Our App   │────▶│  PTY Master  │────▶│   PTY Slave   │
│  (Rust)     │◀────│              │◀────│   (= stdin/   │
│             │     │  read/write  │     │    stdout of  │
│             │     │              │     │    bash/zsh)   │
└─────────────┘     └──────────────┘     └───────────────┘
```

**Key types:**
- `PtySession`: One terminal session. Holds the master PTY, a writer for sending input, and a scrollback buffer.
- `PtyState`: Thread-safe map (`Mutex<HashMap>`) of all active sessions, keyed by `ptyId` (a UUID).

**Shell prompt customization:** When spawning a shell, the app configures the prompt to show the git branch:
- **Bash**: Uses `--rcfile` to source a custom init file that adds `__ot_git_branch()` to PS1
- **Zsh**: Sets `ZDOTDIR` to a custom directory with `.zshrc` that uses `vcs_info` for branch display

### filesystem.rs — File Operations

Simple CRUD operations on files and directories. All paths are absolute.

| Command | Does |
|---------|------|
| `list_directory` | Lists directory contents, sorted: folders first, then alphabetical |
| `read_file` | Returns file content as a string |
| `write_file` | Overwrites file with new content |
| `create_file` | Creates empty file (fails if exists) |
| `create_directory` | Creates directory (and parents) |
| `rename_entry` | Renames a file or directory |
| `delete_entry` | Moves to system trash (not permanent delete!) |

### file_watcher.rs — Filesystem Change Notifications

Uses the `notify` crate to watch the project directory recursively. Changes are debounced (300ms) to avoid flooding the frontend when many files change at once (e.g., `npm install`).

Events are deduplicated by parent directory — if 10 files change in the same folder, only one `fs-changed` event is emitted for that folder. The frontend then re-fetches just that directory.

Each workspace has its own watcher, keyed by `workspace_id`.

### git_commands.rs — Git Operations

Uses `libgit2` (via the `git2` crate) for all git operations — no shell commands, no `git` binary needed.

**Key functions:**
- `git_status`: Categorizes every changed file into staged/modified/untracked/conflicted. Computes ahead/behind counts relative to `origin/{branch}`.
- `git_branches`: Lists all local and remote branches.
- `git_checkout_branch`: Checks out a branch. If it's a remote branch (e.g., `origin/feature`), creates a local tracking branch first.
- `git_stage_file` / `git_unstage_file`: Adds/removes files from the git index.
- `git_discard_file`: Reverts a file to its HEAD version (discards working tree changes).
- `git_commit`: Creates a commit from staged changes.

### settings.rs — Persistence

All app data is stored in `~/.open-terminal/`:

| File | Contents |
|------|----------|
| `settings.json` | Theme, font size, scrollback, shell, path mode |
| `recent-projects.json` | Last 20 opened projects (most recent first) |
| `custom-themes.json` | User-created themes (stored as raw JSON) |
| `bash-init.sh` | Custom bash init with git branch prompt |
| `zsh/.zshrc` | Custom zsh init with git branch prompt |

---

## React Frontend Architecture

### Component Hierarchy

```
<App>
  <ThemeProvider>                    ← Provides theme to all children via React Context
    <AppContent>
      <MenuBar />                   ← File/Edit/View/Terminal/Help dropdowns
      <TabBar />                    ← Workspace tabs (drag-to-reorder)
      <WelcomeScreen />             ← Shown when workspace has no project
      <WorkspaceView>               ← Main workspace (one per open project)
        <FileTree>                  ← Sidebar: recursive directory listing
          <FileTreeNode />          ← Single file/folder row
        </FileTree>
        <GitPanel />                ← Sidebar: source control
        <TerminalGrid>              ← Terminal pane layout
          <TerminalView />          ← Single terminal (xterm.js)
        </TerminalGrid>
        <EditorManager>             ← Floating code editors
          <EditorPopover />         ← Draggable editor window
        </EditorManager>
      </WorkspaceView>
    </AppContent>
  </ThemeProvider>
</App>
```

### State Management

This app uses **local React state** (no Redux, no Zustand). State is lifted to the lowest common parent that needs it.

| State | Where It Lives | What It Controls |
|-------|---------------|-----------------|
| `workspaces[]` | `AppContent` | All open workspace tabs |
| `activeId` | `AppContent` | Which tab is selected |
| `showSettings` | `AppContent` | Settings panel visibility |
| `theme` | `ThemeProvider` (Context) | Current color theme |
| `settings` | `useSettings` hook | Font size, scrollback, shell, etc. |
| `sidebarTab` | `WorkspaceView` | "files" or "git" sidebar |
| `sidebarWidth` | `WorkspaceView` | Sidebar pixel width |
| `gitStatus` | `useGitStatus` hook | Current git state |
| Terminal instance | `useTerminal` hook (refs) | xterm.js instance, PTY connection |

### Custom Hooks

| Hook | File | Purpose |
|------|------|---------|
| `useTerminal` | `terminal/useTerminal.ts` | Creates xterm.js terminal, connects to Rust PTY, handles copy/paste |
| `useSettings` | `settings/useSettings.ts` | Loads settings from disk once, provides update function |
| `useGitStatus` | `git/useGitStatus.ts` | Polls git status every 2s, provides stage/commit actions |
| `useTheme` | `theme/useTheme.ts` | Resolves theme by name, loads custom themes |
| `useThemeContext` | `theme/ThemeProvider.tsx` | Accesses theme from React Context (must be inside ThemeProvider) |

---

## Feature Modules Deep Dive

### Terminal Feature

The terminal is the core feature. Here's how each file contributes:

**`useTerminal.ts`** — The brain. Creates an xterm.js `Terminal` instance, loads the WebGL addon for GPU-accelerated rendering (falls back to canvas), and connects it to a Rust PTY session via Tauri IPC.

**`TerminalView.tsx`** — The body. A React component that provides a DOM container for xterm.js to render into. Also handles drag-and-drop (file paths dropped onto the terminal are inserted as text).

**`TerminalGrid.tsx`** — The layout. Arranges multiple terminal panes in a grid using `react-resizable-panels`. For a single terminal, it renders without any panel wrapper (no resize overhead). For multiple terminals, it creates a nested layout: a vertical `Group` containing rows, where each row is a horizontal `Group` of terminals.

Grid calculation: `cols = ceil(sqrt(paneCount))`, `rows = ceil(paneCount / cols)`

Examples:
- 1 pane → 1x1 (no panels)
- 2 panes → 2 columns, 1 row
- 3 panes → 2 columns, 2 rows (last pane spans full bottom row)
- 4 panes → 2x2 grid
- 6 panes → 3x2 grid

### Theme System

The theme system bridges React state and CSS:

1. **Theme definitions** (`themes.ts`): Built-in dark/light themes as TypeScript objects with every color defined
2. **Theme hook** (`useTheme.ts`): Resolves theme name → Theme object, loads custom themes from Rust backend
3. **Theme provider** (`ThemeProvider.tsx`): React Context + CSS custom property sync

The sync works like this:
```typescript
// ThemeProvider sets CSS variables on document.documentElement
root.style.setProperty("--bg", theme.colors.background);
root.style.setProperty("--accent", theme.colors.accent);
// ... etc

// Tailwind's @theme config (App.css) maps these to utility classes
// --color-app: var(--bg)  →  class="bg-app"
// --color-accent: var(--accent)  →  class="bg-accent"
```

### Menu Bar

The menu bar (`MenuBar.tsx`) uses a VS Code-like pattern:
- Click a menu to open its dropdown
- While any menu is open, hovering over another menu switches to it
- Clicking outside or pressing Escape closes the dropdown

For actions that need to reach `WorkspaceView` (which is a sibling, not a child), it dispatches **CustomEvents** on the `window` object:
```typescript
// MenuBar dispatches:
window.dispatchEvent(new CustomEvent("menu:sidebar", { detail: "files" }));

// WorkspaceView listens:
window.addEventListener("menu:sidebar", (e) => setSidebarTab(e.detail));
```

### Workspace Tabs

Each workspace tab represents an independent project:

```typescript
interface Workspace {
  id: string;              // UUID — stable identifier
  projectPath: string | null;  // null = no project selected (shows WelcomeScreen)
  label: string;           // Tab title (folder name or "New Tab")
  terminalPanes: TerminalPane[];  // Terminal sessions in this workspace
  openEditors: EditorPanel[];     // Floating editor windows
}
```

**Why `projectPath` can be `null`:** When a new tab is created (or all tabs are closed), the workspace starts with no project. The app shows the WelcomeScreen where the user can pick a folder. Once selected, `projectPath` is set and WorkspaceView renders.

**Why WorkspaceViews use `display: none` instead of unmounting:** If we unmounted a WorkspaceView when switching tabs, the terminal (xterm.js) would be destroyed and the PTY would need to be re-spawned. Using `display: none` keeps the terminal alive but hidden.

---

## Key Patterns Used

### 1. The `useState` Initializer Trick

Several places use `useState()` with a callback to run one-time initialization:

```typescript
const [_] = useState(() => {
  invoke("load_settings").then(setSettings);
  return true;  // The return value doesn't matter
});
```

This runs once when the component mounts (like `useEffect(fn, [])` but synchronous during render). It's used instead of `useEffect` to avoid an extra render cycle.

### 2. Ref-Based Stable Callbacks

To avoid stale closures in callbacks without adding dependencies:

```typescript
const workspaceRef = useRef(workspace);
workspaceRef.current = workspace;  // Always up-to-date

const handlePanesChange = useCallback((panes) => {
  // Uses ref — always has latest workspace, callback never re-creates
  onChangeRef.current({ ...workspaceRef.current, terminalPanes: panes });
}, []);  // Empty deps = stable reference
```

### 3. Memoized Components with `memo()`

Components wrapped in `memo()` only re-render when their props change:

```typescript
export const TerminalView = memo(function TerminalView({ ... }) {
  // Won't re-render when parent re-renders unless its props actually changed
});
```

Used on: `TerminalView`, `TerminalGrid`, `WorkspaceView`, `TabBar`, `MenuBar`, `GitPanel`, `EditorManager`.

### 4. CustomEvent-Based Communication

For communication between sibling components (MenuBar ↔ WorkspaceView) without lifting state:

```typescript
// Sender (MenuBar)
window.dispatchEvent(new CustomEvent("menu:split-terminal"));

// Receiver (WorkspaceView)
window.addEventListener("menu:split-terminal", handleSplitTerminal);
```

### 5. Tauri Command Pattern

Every Rust function callable from the frontend follows this pattern:

```rust
#[tauri::command]                        // Macro that registers this as an IPC handler
pub fn command_name(
    app: AppHandle,                      // Access to app state and event emitter
    some_arg: String,                    // Arguments from frontend (deserialized from JSON)
) -> Result<ReturnType, String> {        // Returns Ok(data) or Err(message)
    // ... implementation ...
}
```

---

## Naming Conventions

### Files

| Pattern | Convention | Example |
|---------|-----------|---------|
| React components | PascalCase `.tsx` | `TerminalGrid.tsx` |
| React hooks | camelCase with `use` prefix `.ts` | `useTerminal.ts` |
| Rust modules | snake_case `.rs` | `pty_manager.rs` |
| Type definitions | PascalCase | `types.ts` |

### Variables and Functions

| Context | Convention | Example |
|---------|-----------|---------|
| React components | PascalCase | `WorkspaceView` |
| React hooks | `use` + PascalCase | `useGitStatus` |
| Event handlers | `handle` + Action | `handleClose`, `handleSplit` |
| Callback props | `on` + Action | `onPanesChange`, `onClose` |
| Refs | variable + `Ref` | `termRef`, `fitRef`, `mountedRef` |
| Rust commands | snake_case | `spawn_pty`, `list_directory` |
| Rust structs | PascalCase | `PtySession`, `GitStatusInfo` |
| IPC command names | snake_case strings | `"write_pty"`, `"git_status"` |
| Tauri events | kebab-case with colons | `"pty-output:{id}"`, `"fs-changed"` |
| CSS variables | kebab-case with `--` | `--bg`, `--accent`, `--text-muted` |

### Feature Folders

Each feature gets its own folder under `src/features/`. A feature folder typically contains:

- `FeatureName.tsx` — Main component
- `useFeatureName.ts` — Custom hook (if the feature has complex logic)
- Supporting components

---

## Configuration Files

### `src-tauri/tauri.conf.json`

Defines the Tauri app:
- `identifier`: `com.rujal.open-terminal` (unique app ID)
- `windows`: Default window size (800x600), title ("Open Terminal")
- `build.devUrl`: `http://localhost:1420` (Vite dev server)
- `bundle`: Packaging targets (deb, rpm, AppImage, dmg, etc.)

### `vite.config.ts`

Vite bundler configuration:
- Dev server on port 1420 (Tauri connects to this)
- HMR (Hot Module Replacement) on port 1421
- Ignores `src-tauri/` directory to avoid unnecessary rebuilds

### `tsconfig.json`

TypeScript compiler settings:
- `strict: true` — All strict type checks enabled
- `target: ES2020` — Modern JavaScript output
- `moduleResolution: bundler` — Let Vite handle module resolution

### `package.json` Scripts

```bash
pnpm dev          # Start Vite dev server only (for frontend-only development)
pnpm build        # TypeScript check + Vite production build
pnpm tauri dev    # Full app: Vite dev server + Rust compilation + native window
pnpm tauri build  # Production build: optimized Rust binary + bundled frontend
```

---

## Common Tasks for Developers

### Adding a new Rust command

1. Write the function in the appropriate module (e.g., `filesystem.rs`):
   ```rust
   #[tauri::command]
   pub fn my_new_command(arg: String) -> Result<String, String> {
       Ok(format!("Hello {}", arg))
   }
   ```

2. Register it in `lib.rs` inside `generate_handler![]`:
   ```rust
   .invoke_handler(tauri::generate_handler![
       // ... existing commands ...
       filesystem::my_new_command,
   ])
   ```

3. Call it from the frontend:
   ```typescript
   const result = await invoke<string>("my_new_command", { arg: "world" });
   ```

### Adding a new React feature

1. Create a folder: `src/features/my-feature/`
2. Create the component: `MyFeature.tsx`
3. If it has complex logic, extract a hook: `useMyFeature.ts`
4. Import and use it in the appropriate parent component

### Adding a new theme color

1. Add the color to the `Theme` interface in `types.ts`
2. Add default values in `themes.ts` (both dark and light)
3. Add the CSS variable sync in `ThemeProvider.tsx`
4. Add the Tailwind mapping in `App.css` under `@theme`
5. Use it in components: `className="bg-my-color"` or `style={{ color: "var(--my-color)" }}`

### Adding a new keyboard shortcut

1. Add the shortcut in `MenuBar.tsx` in the `useEffect` that registers global keyboard shortcuts
2. If the action needs to reach WorkspaceView, dispatch a CustomEvent
3. Add the listener in WorkspaceView's menu event handler

---

## Glossary

| Term | Meaning |
|------|---------|
| **PTY** | Pseudo-Terminal — a virtual terminal device that programs can read from and write to |
| **IPC** | Inter-Process Communication — how the frontend (web) talks to the backend (Rust) |
| **invoke** | Tauri's function to call a Rust command from TypeScript |
| **xterm.js** | A terminal emulator library that renders terminal output in a web browser |
| **WebGL addon** | GPU-accelerated rendering for xterm.js (faster than default canvas) |
| **FitAddon** | xterm.js addon that auto-sizes the terminal to fit its container |
| **Scrollback** | Terminal history — lines that have scrolled off the top of the visible area |
| **ANSI colors** | Standard 16-color palette used by terminals (8 normal + 8 bright versions) |
| **libgit2** | C library for git operations (used via Rust's `git2` crate, no `git` binary needed) |
| **Debouncing** | Waiting for activity to stop before acting (e.g., file watcher waits 300ms) |
| **memo()** | React function that prevents a component from re-rendering when props haven't changed |
| **useCallback** | React hook that memoizes a function reference to prevent unnecessary re-renders |
| **useMemo** | React hook that memoizes a computed value |
| **Context** | React's built-in way to share state across many components without prop drilling |
| **Tailwind** | Utility-first CSS framework — styles are applied via class names like `flex`, `bg-app` |
| **CSS Custom Properties** | Variables in CSS (e.g., `--bg: #1e1e2e`) that can be changed at runtime for theming |
