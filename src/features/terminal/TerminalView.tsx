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
  onInsertText?: (fn: (text: string) => void) => void;
  dragDropPathMode: "absolute" | "relative";
}

export function TerminalView({
  ptyId,
  cwd,
  theme,
  fontSize,
  scrollback,
  shell,
  onInsertText,
  dragDropPathMode,
}: TerminalViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cleanupRef = useRef<(() => void) | null>(null);
  const { attach, insertText, focus } = useTerminal({
    ptyId,
    cwd,
    theme,
    fontSize,
    scrollback,
    shell,
  });

  const [dragOver, setDragOver] = useState(false);

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
}
