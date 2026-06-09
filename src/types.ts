export interface TerminalPane {
  id: string;
  ptyId: string;
}

export interface Workspace {
  id: string;
  projectPath: string | null;
  label: string;
  terminalPanes: TerminalPane[];
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
