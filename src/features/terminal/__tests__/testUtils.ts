// Fixture builders for terminal tests. All data is mocked — these produce
// minimal-but-valid Theme/Settings/TerminalPane objects with overridable fields.

import type { Theme, Settings, TerminalPane } from "../../../types";

// ANSI palette uses distinct, identifiable values (#a0..#a15) so tests can
// assert the exact themeToXterm mapping (e.g. red === ansi[1]).
const ANSI = Array.from({ length: 16 }, (_, i) => `#a${i}`);

export function makeTheme(overrides: Partial<Theme["colors"]> = {}): Theme {
  return {
    name: "Test Theme",
    type: "dark",
    colors: {
      background: "#101010",
      sidebar: "#181818",
      tabBar: "#202020",
      tabActive: "#222222",
      tabInactive: "#1a1a1a",
      border: "#303030",
      text: "#e0e0e0",
      textMuted: "#909090",
      accent: "#00bcd4",
      terminalBg: "#0a0a0a",
      terminalFg: "#f0f0f0",
      terminalCursor: "#ffcc00",
      ansi: [...ANSI],
      editorBg: "#0c0c0c",
      editorFg: "#eeeeee",
      editorLineNumber: "#555555",
      editorSelection: "#264f78",
      gitAdded: "#00ff00",
      gitModified: "#ffff00",
      gitDeleted: "#ff0000",
      gitUntracked: "#888888",
      gitIgnored: "#666666",
      gitConflicted: "#ff00ff",
      ...overrides,
    },
  };
}

export function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    theme: "Test Theme",
    drag_drop_path_mode: "absolute",
    default_shell: "/bin/bash",
    terminal_scrollback: 1000,
    font_size: 14,
    ...overrides,
  };
}

export function makePane(id: string): TerminalPane {
  return { id, ptyId: id };
}

export const ANSI_PALETTE = ANSI;
