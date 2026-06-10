// Arranges one or more terminal panes in a resizable grid layout.
// Uses react-resizable-panels to let users drag separators between terminals.
//
// Grid layout strategy: approximate a square grid.
//   cols = ceil(sqrt(count))   — e.g. 4 panes → 2 cols
//   rows = ceil(count / cols)  — e.g. 4 panes → 2 rows
// This gives: 1→1x1, 2→2x1, 3→2x2 (one cell empty), 4→2x2, 5→3x2, etc.
//
// When there is only a single terminal, it renders without any Panel/Group
// wrappers to avoid unnecessary DOM overhead and ResizeObserver registrations.

import { Fragment, useCallback, memo } from "react";
import { v4 as uuidv4 } from "uuid";
import { invoke } from "@tauri-apps/api/core";
import { Group, Panel, Separator } from "react-resizable-panels";
import { TerminalView } from "./TerminalView";
import type { TerminalPane, Theme, Settings } from "../../types";

interface TerminalGridProps {
  panes: TerminalPane[];
  cwd: string;
  theme: Theme;
  settings: Settings;
  isActive: boolean;
  onPanesChange: (panes: TerminalPane[]) => void;
}

export const TerminalGrid = memo(function TerminalGrid({
  panes,
  cwd,
  theme,
  settings,
  isActive,
  onPanesChange,
}: TerminalGridProps) {
  // Calculate grid dimensions — aim for a roughly square arrangement.
  // Examples: 1 pane → 1x1, 2 → 2x1, 3 → 2x2, 4 → 2x2, 6 → 3x2, 9 → 3x3
  const count = panes.length;
  const cols = Math.ceil(Math.sqrt(count));
  const rows = Math.ceil(count / cols);

  const handleSplit = useCallback(() => {
    const id = uuidv4();
    onPanesChange([...panes, { id, ptyId: id }]);
  }, [panes, onPanesChange]);

  const handleClose = useCallback(
    (paneId: string) => {
      if (panes.length <= 1) return;
      const pane = panes.find((p) => p.id === paneId);
      if (pane) {
        invoke("kill_pty", { ptyId: pane.ptyId }).catch(() => {});
      }
      onPanesChange(panes.filter((p) => p.id !== paneId));
    },
    [panes, onPanesChange]
  );

  // Chunk the flat pane array into rows of `cols` width for the nested
  // Group structure below (vertical outer group → horizontal inner groups).
  const rowPanes: TerminalPane[][] = [];
  for (let r = 0; r < rows; r++) {
    rowPanes.push(panes.slice(r * cols, Math.min((r + 1) * cols, count)));
  }

  // Renders a single terminal pane with an overlay close button.
  // The close button only appears when there are multiple panes (you can't
  // close the last terminal), and uses CSS group-hover to show on mouseover.
  function renderPane(pane: TerminalPane) {
    return (
      <div className="group relative overflow-hidden h-full w-full bg-app">
        {count > 1 && (
          <button
            onClick={() => handleClose(pane.id)}
            className="absolute top-1 right-1 z-10 border border-border rounded text-muted text-xs w-5 h-5 flex items-center justify-center cursor-pointer hover:text-primary opacity-0 group-hover:opacity-100 transition-opacity"
            style={{
              backdropFilter: "blur(4px)",
              background: "var(--sidebar)",
            }}
            title="Close terminal"
          >
            ×
          </button>
        )}
        <TerminalView
          ptyId={pane.ptyId}
          cwd={cwd}
          theme={theme}
          fontSize={settings.font_size}
          scrollback={settings.terminal_scrollback}
          shell={settings.default_shell}
          dragDropPathMode={settings.drag_drop_path_mode}
          isActive={isActive}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex items-center h-7 shrink-0 bg-sidebar border-b border-border px-2 gap-1">
        <button
          onClick={handleSplit}
          className="flex items-center gap-1 bg-transparent border border-border rounded text-muted text-xs px-1.5 py-0.5 cursor-pointer hover:text-primary hover:border-accent"
          title="Split terminal"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="currentColor"
          >
            <path
              d="M8 1v14M1 8h14"
              stroke="currentColor"
              strokeWidth="2"
              fill="none"
            />
          </svg>
          Split
        </button>
        <span className="text-muted text-xs ml-1">
          {count > 1 ? `${count} terminals` : ""}
        </span>
      </div>
      <div className="flex-1 overflow-hidden">
        {/* Single pane: render directly without Panel/Group wrappers to avoid
            unnecessary ResizeObserver overhead and DOM complexity. */}
        {count === 1 ? (
          renderPane(panes[0])
        ) : (
          /* Multi-pane layout uses nested resizable groups:
             - Outer Group (vertical): splits the grid into rows, separated by
               horizontal drag handles.
             - Inner Group (horizontal): splits each row into columns, separated
               by vertical drag handles.
             This nesting lets users resize both row heights and column widths
             independently by dragging the separators. */
          <Group orientation="vertical">
            {rowPanes.map((row, ri) => (
              <Fragment key={ri}>
                {ri > 0 && (
                  <Separator className="terminal-resize-handle terminal-resize-handle-h" />
                )}
                <Panel minSize={15} style={{ overflow: "hidden" }}>
                  {row.length === 1 ? (
                    renderPane(row[0])
                  ) : (
                    <Group orientation="horizontal">
                      {row.map((pane, ci) => (
                        <Fragment key={pane.id}>
                          {ci > 0 && (
                            <Separator className="terminal-resize-handle terminal-resize-handle-v" />
                          )}
                          <Panel
                            minSize={15}
                            style={{ overflow: "hidden" }}
                          >
                            {renderPane(pane)}
                          </Panel>
                        </Fragment>
                      ))}
                    </Group>
                  )}
                </Panel>
              </Fragment>
            ))}
          </Group>
        )}
      </div>
    </div>
  );
});
