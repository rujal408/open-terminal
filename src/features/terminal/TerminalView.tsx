import { useRef, useEffect, useState, memo } from "react";
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

  const [dragOver, setDragOver] = useState(false);

  // Defer attach by one frame so the grid layout settles before
  // heavy work (WebGL context, PTY spawn) runs
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

  // When tab becomes visible again, refit terminal (it had display:none, dimensions were 0)
  useEffect(() => {
    if (isActive) {
      // Small delay to let the browser layout the now-visible container
      const id = requestAnimationFrame(() => {
        refit();
      });
      return () => cancelAnimationFrame(id);
    }
  }, [isActive, refit]);

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
      className={`terminal-container ${dragOver ? "terminal-drag-over" : ""}`}
      style={{ flex: 1, height: "100%", overflow: "hidden" }}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    />
  );
});
