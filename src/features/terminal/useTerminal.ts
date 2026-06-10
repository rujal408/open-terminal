import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Theme } from "../../types";

function themeToXterm(theme: Theme) {
  const c = theme.colors;
  return {
    background: c.terminalBg,
    foreground: c.terminalFg,
    cursor: c.terminalCursor,
    black: c.ansi[0],
    red: c.ansi[1],
    green: c.ansi[2],
    yellow: c.ansi[3],
    blue: c.ansi[4],
    magenta: c.ansi[5],
    cyan: c.ansi[6],
    white: c.ansi[7],
    brightBlack: c.ansi[8],
    brightRed: c.ansi[9],
    brightGreen: c.ansi[10],
    brightYellow: c.ansi[11],
    brightBlue: c.ansi[12],
    brightMagenta: c.ansi[13],
    brightCyan: c.ansi[14],
    brightWhite: c.ansi[15],
  };
}

interface UseTerminalOptions {
  ptyId: string;
  cwd: string;
  theme: Theme;
  fontSize: number;
  scrollback: number;
  shell: string | null;
}

export function useTerminal({
  ptyId,
  cwd,
  theme,
  fontSize,
  scrollback,
  shell,
}: UseTerminalOptions) {
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const spawnedRef = useRef(false);
  const unlistenRef = useRef<(() => void) | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const onDataDisposableRef = useRef<{ dispose: () => void } | null>(null);

  // Create terminal once on mount, destroy on unmount
  useEffect(() => {
    const term = new Terminal({
      fontSize,
      fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
      theme: themeToXterm(theme),
      scrollback,
      cursorBlink: true,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    termRef.current = term;
    fitRef.current = fitAddon;

    return () => {
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // Only run on mount/unmount — ptyId is stable per component instance (keyed)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ptyId]);

  // Update theme without recreating terminal
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.theme = themeToXterm(theme);
    }
  }, [theme]);

  // Update font size without recreating terminal
  useEffect(() => {
    if (termRef.current) {
      termRef.current.options.fontSize = fontSize;
      fitRef.current?.fit();
    }
  }, [fontSize]);

  // Attach terminal to a DOM container
  const attach = useCallback(
    (container: HTMLDivElement | null) => {
      const term = termRef.current;
      const fitAddon = fitRef.current;
      if (!container || !term || !fitAddon) return;

      term.open(container);

      try {
        term.loadAddon(new WebglAddon());
      } catch {
        // WebGL not available — canvas fallback
      }

      fitAddon.fit();

      // Clipboard copy/paste: intercept Ctrl+C, Ctrl+V, Ctrl+Shift+C/V
      // so they behave like VS Code's integrated terminal.
      term.attachCustomKeyEventHandler((ev) => {
        const isCtrl = ev.ctrlKey || ev.metaKey;

        // Ctrl+Shift+C — always copy selection
        if (isCtrl && ev.shiftKey && ev.key === "C" && ev.type === "keydown") {
          const sel = term.getSelection();
          if (sel) navigator.clipboard.writeText(sel);
          return false; // prevent xterm from processing
        }

        // Ctrl+Shift+V — always paste
        if (isCtrl && ev.shiftKey && ev.key === "V" && ev.type === "keydown") {
          ev.preventDefault();
          navigator.clipboard.readText().then((text) => {
            if (text) {
              invoke("write_pty", {
                ptyId,
                data: Array.from(new TextEncoder().encode(text)),
              });
            }
          });
          return false;
        }

        // Ctrl+C — copy if there's a selection, otherwise let xterm send SIGINT
        if (isCtrl && !ev.shiftKey && ev.key === "c" && ev.type === "keydown") {
          if (term.hasSelection()) {
            navigator.clipboard.writeText(term.getSelection());
            term.clearSelection();
            return false;
          }
          // No selection → let it pass through as SIGINT
          return true;
        }

        // Ctrl+V — paste from clipboard
        if (isCtrl && !ev.shiftKey && ev.key === "v" && ev.type === "keydown") {
          ev.preventDefault();
          navigator.clipboard.readText().then((text) => {
            if (text) {
              invoke("write_pty", {
                ptyId,
                data: Array.from(new TextEncoder().encode(text)),
              });
            }
          });
          return false;
        }

        return true; // all other keys pass through normally
      });

      // Register input handler (keystrokes → PTY)
      onDataDisposableRef.current = term.onData((data) => {
        invoke("write_pty", {
          ptyId,
          data: Array.from(new TextEncoder().encode(data)),
        });
      });

      // Listen for PTY output → terminal
      const eventName = `pty-output:${ptyId}`;
      const unlistenPromise = listen<number[]>(eventName, (event) => {
        const bytes = new Uint8Array(event.payload);
        term.write(bytes);
      });
      unlistenPromise.then((fn) => {
        unlistenRef.current = fn;
      });

      // Spawn PTY if first attach
      if (!spawnedRef.current) {
        spawnedRef.current = true;
        const { cols, rows } = term;
        invoke("spawn_pty", {
          ptyId,
          cwd,
          rows,
          cols,
          scrollbackLimit: scrollback,
          shell,
        }).catch((err) => {
          term.writeln(`\r\nFailed to start shell: ${err}`);
        });
      }

      // Resize observer — debounced via rAF to batch rapid layout changes
      // (e.g. when grid adds/removes a pane, all terminals resize at once)
      let resizeRaf = 0;
      const observer = new ResizeObserver(() => {
        cancelAnimationFrame(resizeRaf);
        resizeRaf = requestAnimationFrame(() => {
          fitAddon.fit();
          const { cols, rows } = term;
          invoke("resize_pty", { ptyId, rows, cols }).catch(() => {});
        });
      });
      observer.observe(container);
      resizeObserverRef.current = observer;

      // Cleanup function
      return () => {
        cancelAnimationFrame(resizeRaf);
        observer.disconnect();
        resizeObserverRef.current = null;
        onDataDisposableRef.current?.dispose();
        onDataDisposableRef.current = null;
        if (unlistenRef.current) {
          unlistenRef.current();
          unlistenRef.current = null;
        }
      };
    },
    // Only depends on stable values — ptyId, cwd, shell don't change within a tab
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ptyId]
  );

  // Window resize handler
  useEffect(() => {
    function handleResize() {
      fitRef.current?.fit();
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const insertText = useCallback(
    (text: string) => {
      invoke("write_pty", {
        ptyId,
        data: Array.from(new TextEncoder().encode(text)),
      });
    },
    [ptyId]
  );

  const focus = useCallback(() => {
    termRef.current?.focus();
  }, []);

  const refit = useCallback(() => {
    fitRef.current?.fit();
  }, []);

  return { attach, insertText, focus, refit };
}
