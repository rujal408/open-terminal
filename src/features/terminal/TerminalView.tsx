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
