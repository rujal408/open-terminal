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
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const spawnedRef = useRef(false);

  const attach = useCallback(
    (container: HTMLDivElement | null) => {
      containerRef.current = container;
      if (!container) return;

      if (!terminalRef.current) {
        const term = new Terminal({
          fontSize,
          fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
          theme: themeToXterm(theme),
          scrollback,
          cursorBlink: true,
          allowProposedApi: true,
        });
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        terminalRef.current = term;
        fitAddonRef.current = fitAddon;
      }

      const term = terminalRef.current;
      const fitAddon = fitAddonRef.current!;

      term.open(container);

      try {
        term.loadAddon(new WebglAddon());
      } catch {
        // WebGL not available — fall back to canvas renderer
      }

      fitAddon.fit();

      term.onData((data) => {
        invoke("write_pty", { ptyId, data: Array.from(new TextEncoder().encode(data)) });
      });

      const eventName = `pty-output:${ptyId}`;
      const unlisten = listen<number[]>(eventName, (event) => {
        const bytes = new Uint8Array(event.payload);
        term.write(bytes);
      });

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
      } else {
        invoke<number[]>("get_scrollback", { ptyId }).then((data) => {
          if (data.length > 0) {
            term.write(new Uint8Array(data));
          }
        });
      }

      const resizeObserver = new ResizeObserver(() => {
        fitAddon.fit();
        const { cols, rows } = term;
        invoke("resize_pty", { ptyId, rows, cols }).catch(() => {});
      });
      resizeObserver.observe(container);

      return () => {
        resizeObserver.disconnect();
        unlisten.then((fn) => fn());
      };
    },
    [ptyId, cwd, theme, fontSize, scrollback, shell]
  );

  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = themeToXterm(theme);
    }
  }, [theme]);

  useEffect(() => {
    function handleResize() {
      fitAddonRef.current?.fit();
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

  return { attach, insertText };
}
