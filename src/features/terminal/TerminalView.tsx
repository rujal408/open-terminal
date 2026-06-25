// Renders a single terminal instance inside its container div and handles:
// - Deferred attachment (waits one animation frame for CSS grid layout to settle)
// - Drag-and-drop of file paths from the file tree onto the terminal
// - Refitting when the tab becomes visible again after being hidden

import { useRef, useEffect, memo } from "react";
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
  isActive: boolean;
}

export const TerminalView = memo(function TerminalView({
  ptyId,
  cwd,
  theme,
  fontSize,
  scrollback,
  shell,
  dragDropPathMode,
  isActive,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const { attach, insertText, focus, refit } = useTerminal({
    ptyId,
    cwd,
    theme,
    fontSize,
    scrollback,
    shell,
  });

  // Drag-over highlight is toggled directly on the DOM (not via React state)
  // so hovering a dragged file never re-renders the terminal. xterm renders
  // many child nodes (canvas, rows, textarea); their `dragleave` events bubble
  // up to this container, so a naive boolean would flip on/off as the pointer
  // crosses each child — that was the flickering border. We count enter/leave
  // events instead: the outline shows while depth > 0 and only clears once the
  // pointer truly leaves the terminal.
  const dragDepthRef = useRef(0);

  function setDragHighlight(on: boolean) {
    containerRef.current?.classList.toggle("terminal-drag-over", on);
  }

  // Defer attach by one animation frame so the CSS grid/flexbox layout has
  // fully resolved the container's dimensions before we do expensive work
  // (creating a WebGL context, measuring cols/rows, spawning the PTY).
  // Without this delay, FitAddon.fit() would measure a 0x0 container and
  // spawn a terminal with 0 columns.
  useEffect(() => {
    let rafId: number;
    const container = containerRef.current;
    if (container) {
      rafId = requestAnimationFrame(() => {
        const cleanup = attach(container);
        cleanupRef.current = cleanup || null;
      });
    }
    return () => {
      cancelAnimationFrame(rafId);
      cleanupRef.current?.();
    };
  }, [attach]);

  // When a tab becomes active again, the container transitions from
  // display:none to display:block (see App.tsx). While hidden, the container
  // had 0x0 dimensions, so the terminal's internal grid is stale. We refit
  // after one frame to let the browser compute the new layout, then
  // recalculate cols/rows to match the actual container size.
  useEffect(() => {
    if (isActive) {
      const id = requestAnimationFrame(() => {
        refit();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [isActive, refit]);

  function handleDragEnter(e: React.DragEvent) {
    e.preventDefault();
    dragDepthRef.current += 1;
    if (dragDepthRef.current === 1) setDragHighlight(true);
  }

  function handleDragOver(e: React.DragEvent) {
    // Must preventDefault on every dragover or the drop is rejected.
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  }

  function handleDragLeave() {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) setDragHighlight(false);
  }

  // Handle file drops from the file tree sidebar. The file tree sets both
  // "absolute-path" and "relative-path" on the drag data. We pick whichever
  // the user configured in settings. Paths with spaces are quoted so the
  // shell treats them as a single argument. The text is injected into the
  // PTY as raw keystrokes, so it appears at the cursor as if the user typed it.
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepthRef.current = 0;
    setDragHighlight(false);

    const dataKey =
      dragDropPathMode === "relative" ? "relative-path" : "absolute-path";
    let path =
      e.dataTransfer.getData(dataKey) || e.dataTransfer.getData("text/plain");

    if (!path) return;

    if (path.includes(" ")) {
      path = `"${path}"`;
    }

    insertText(path);
    focus();
  }

  return (
    <div
      ref={containerRef}
      className="terminal-container"
      style={{ flex: 1, height: "100%", overflow: "hidden" }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    />
  );
});
