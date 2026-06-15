// A single terminal pane inside a workspace's terminal grid.
// `id` is the React key for the pane component.
// `ptyId` identifies the Rust-side pseudo-terminal process — it is used in
// all IPC calls (spawn_pty, write_pty, resize_pty, kill_pty) and to route
// the PTY output event back to the correct xterm instance.
export interface TerminalPane {
  id: string;
  ptyId: string;
}

// A workspace corresponds to one browser-like tab. Each tab can have its own
// project folder and set of terminal panes.
// `projectPath` is null when the tab is brand new and no folder has been opened
// yet — the UI shows a WelcomeScreen in this state. Once a folder is opened,
// projectPath holds the absolute path and drives the file tree and terminal cwd.
// `openEditors` tracks floating editor popover panels the user has opened from
// the file tree (e.g. for quick file viewing).
export interface Workspace {
  id: string;
  projectPath: string | null;
  label: string;
  terminalPanes: TerminalPane[];
  openEditors: EditorPanel[];
}

// A floating editor popover that hovers over the workspace.
// `position` is the top-left corner (in px) relative to the workspace area.
// `size` is the width/height in px — the user can drag and resize these panels.
// `isDirty` tracks whether the content has unsaved changes.
export interface EditorPanel {
  id: string;
  filePath: string;
  content: string;
  isDirty: boolean;
  position: { x: number; y: number };
  size: { width: number; height: number };
}

// Mirrors the Rust DirEntry struct returned by the list_dir IPC command.
// `is_hidden` is true for dotfiles/dotfolders (name starts with ".").
export interface DirEntry {
  name: string;
  path: string;
  is_dir: boolean;
  is_hidden: boolean;
}

// Persisted user preferences (stored in a JSON file via Rust).
// `theme` — name of the active color theme (e.g. "Dracula", "One Dark").
// `drag_drop_path_mode` — when dragging a file from the tree onto a terminal,
//   determines whether the inserted path is absolute or relative to the project root.
// `default_shell` — override shell binary (e.g. "/bin/zsh"); null means use the
//   system default from the $SHELL environment variable.
// `terminal_scrollback` — how many lines of output the terminal keeps in its buffer.
// `font_size` — terminal font size in pixels.
export interface Settings {
  theme: string;
  drag_drop_path_mode: "absolute" | "relative";
  default_shell: string | null;
  terminal_scrollback: number;
  font_size: number;
}

// Entry in the "recent projects" list shown on the WelcomeScreen.
// `last_opened` is a Unix timestamp (seconds) so projects can be sorted
// most-recent-first.
export interface RecentProject {
  path: string;
  name: string;
  last_opened: number;
}

// A single file's git status — returned as part of GitStatusInfo.
// `status` is a short code like "M" (modified), "A" (added), "D" (deleted),
// "R" (renamed), "??" (untracked), etc.
export interface GitFileEntry {
  path: string;
  status: string;
}

// Snapshot of the git repository state for the current workspace, fetched via
// the Rust `git_status` IPC command.
// `is_repo` — false when the project folder is not a git repository.
// `ahead`/`behind` — commit count relative to the upstream tracking branch.
// Files are bucketed into four categories so the UI can render them separately
// with different colors (green for staged, yellow for modified, grey for
// untracked, red for conflicted).
export interface GitStatusInfo {
  is_repo: boolean;
  branch: string;
  is_dirty: boolean;
  ahead: number;
  behind: number;
  staged: GitFileEntry[];
  modified: GitFileEntry[];
  untracked: GitFileEntry[];
  ignored: GitFileEntry[];
  conflicted: GitFileEntry[];
}

// A single git branch entry for the branch picker UI.
// `is_current` — true for the currently checked-out branch.
// `is_remote` — true for remote tracking branches (e.g. "origin/main").
export interface GitBranchEntry {
  name: string;
  is_current: boolean;
  is_remote: boolean;
}

// Full color theme definition. Applied at two levels:
// 1. UI chrome — background, sidebar, tabBar, border, text, accent colors are
//    mapped to CSS custom properties in ThemeProvider and consumed by Tailwind
//    utility classes (bg-app, text-primary, etc.).
// 2. Terminal — terminalBg/Fg/Cursor and the ansi array are passed directly to
//    xterm.js via themeToXterm().
//
// `ansi` is an array of exactly 16 hex color strings representing the standard
// ANSI terminal palette: [black, red, green, yellow, blue, magenta, cyan, white,
// brightBlack, brightRed, brightGreen, brightYellow, brightBlue, brightMagenta,
// brightCyan, brightWhite]. These control how programs like ls, git, and vim
// render colored output.
//
// The git* colors are used by the file tree to tint filenames based on their
// git status (added=green, modified=yellow, deleted=red, etc.).
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
    gitAdded: string;
    gitModified: string;
    gitDeleted: string;
    gitUntracked: string;
    gitIgnored: string;
    gitConflicted: string;
  };
}
