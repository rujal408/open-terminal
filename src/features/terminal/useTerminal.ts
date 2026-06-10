// Hook that creates and manages an xterm.js terminal connected to a Rust-side
// pseudo-terminal (PTY). It handles the full lifecycle:
//   1. Create xterm Terminal instance and FitAddon
//   2. Attach to a DOM container (called by TerminalView after layout settles)
//   3. Load WebGL renderer for GPU-accelerated drawing
//   4. Spawn the PTY process via Tauri IPC
//   5. Wire up bidirectional data flow: keystrokes → PTY, PTY output → xterm
//   6. Observe container resize → refit terminal → notify PTY of new dimensions
//   7. Clean up everything on unmount (dispose terminal, kill listeners, disconnect observer)

import { useEffect, useRef, useCallback } from "react";
import { Terminal } from "xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Theme } from "../../types";

// Maps the app's Theme object to xterm's ITheme format. The app theme stores
// the 16 ANSI colors as an array, but xterm expects them as named properties
// (black, red, green, ... brightWhite).
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
      //
      // Why we write directly to the PTY via invoke("write_pty") instead of
      // using term.paste(): term.paste() goes through xterm's input processing
      // which adds bracket-paste escape sequences. Writing raw bytes to the PTY
      // gives us exact control and avoids issues with programs that don't
      // support bracketed paste mode.
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

      // Forward keystrokes from xterm to the PTY process. xterm's onData fires
      // for every key the user types (after xterm processes it into the correct
      // escape sequence). We encode it as a byte array because the Rust side
      // expects Vec<u8> for write_pty.
      onDataDisposableRef.current = term.onData((data) => {
        invoke("write_pty", {
          ptyId,
          data: Array.from(new TextEncoder().encode(data)),
        });
      });

      // Listen for PTY output coming from Rust. The Rust backend emits events
      // named "pty-output:<ptyId>" whenever the shell produces output. We
      // convert the payload (number[]) back to bytes and feed it to xterm for
      // rendering.
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

      // Watch the container element for size changes (e.g. window resize, grid
      // pane drag, sidebar toggle). When the container changes size:
      //   1. FitAddon recalculates how many cols/rows fit in the new dimensions
      //   2. We tell the PTY about the new size so programs like vim/less reflow
      // Debounced via requestAnimationFrame to coalesce rapid layout changes
      // (e.g. when the user is dragging a grid separator, dozens of resize
      // events fire — we only act on the last one per frame).
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

  // Write arbitrary text into the terminal as if the user typed it.
  // Used by drag-and-drop: when a file is dropped onto the terminal, its path
  // is inserted as text so it appears at the cursor in the running shell.
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
