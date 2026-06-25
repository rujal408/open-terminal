// Unit tests for the useTerminal hook — the heart of the terminal feature.
// Covers: terminal creation + theme mapping, attach lifecycle (open/webgl/fit),
// PTY spawn, bidirectional data flow (keystrokes -> PTY, PTY output -> xterm),
// clipboard key handling, theme/font reactivity, resize observation, the
// imperative API (insertText/focus/refit), and full teardown.
//
// Every native boundary is mocked: xterm + its addons, and the Tauri IPC
// (invoke) / event (listen) modules.

import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeTheme } from "./testUtils";

// Shared mock state, hoisted so the vi.mock factories below can reference it.
const h = vi.hoisted(() => ({
  terms: [] as MockTerm[],
  fitAddons: [] as { fit: ReturnType<typeof vi.fn> }[],
  webglShouldThrow: false,
  invoke: vi.fn(),
  listen: vi.fn(),
  unlisten: vi.fn(),
  listeners: {} as Record<string, (e: { payload: number[] }) => void>,
}));

interface MockTerm {
  options: Record<string, unknown>;
  cols: number;
  rows: number;
  open: ReturnType<typeof vi.fn>;
  loadAddon: ReturnType<typeof vi.fn>;
  onData: ReturnType<typeof vi.fn>;
  attachCustomKeyEventHandler: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  writeln: ReturnType<typeof vi.fn>;
  focus: ReturnType<typeof vi.fn>;
  getSelection: ReturnType<typeof vi.fn>;
  hasSelection: ReturnType<typeof vi.fn>;
  clearSelection: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  _dataCb?: (data: string) => void;
  _keyHandler?: (ev: KeyEventLike) => boolean;
}

interface KeyEventLike {
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  key: string;
  type: string;
  preventDefault: () => void;
}

vi.mock("xterm", () => {
  class Terminal {
    options: Record<string, unknown>;
    cols = 80;
    rows = 24;
    open = vi.fn();
    loadAddon = vi.fn();
    write = vi.fn();
    writeln = vi.fn();
    focus = vi.fn();
    getSelection = vi.fn(() => "");
    hasSelection = vi.fn(() => false);
    clearSelection = vi.fn();
    dispose = vi.fn();
    _dataCb?: (data: string) => void;
    _keyHandler?: (ev: KeyEventLike) => boolean;
    onData = vi.fn((cb: (data: string) => void) => {
      this._dataCb = cb;
      return { dispose: vi.fn() };
    });
    attachCustomKeyEventHandler = vi.fn((handler: (ev: KeyEventLike) => boolean) => {
      this._keyHandler = handler;
    });
    constructor(options: Record<string, unknown>) {
      this.options = options;
      h.terms.push(this as unknown as MockTerm);
    }
  }
  return { Terminal };
});

vi.mock("@xterm/addon-fit", () => {
  class FitAddon {
    fit = vi.fn();
    constructor() {
      h.fitAddons.push(this);
    }
  }
  return { FitAddon };
});

vi.mock("@xterm/addon-webgl", () => {
  class WebglAddon {
    constructor() {
      if (h.webglShouldThrow) throw new Error("WebGL unavailable");
    }
  }
  return { WebglAddon };
});

vi.mock("@tauri-apps/api/core", () => ({ invoke: h.invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen: h.listen }));

// Imported after the mocks are registered.
import { useTerminal } from "../useTerminal";

const BASE_OPTS = {
  ptyId: "pty-1",
  cwd: "/home/user/project",
  fontSize: 14,
  scrollback: 1000,
  shell: "/bin/bash",
};

function bytesOf(text: string): number[] {
  return Array.from(new TextEncoder().encode(text));
}

beforeEach(() => {
  h.terms.length = 0;
  h.fitAddons.length = 0;
  h.webglShouldThrow = false;
  h.listeners = {};
  h.invoke.mockReset().mockResolvedValue(undefined);
  h.unlisten.mockReset();
  h.listen.mockReset().mockImplementation(
    (name: string, cb: (e: { payload: number[] }) => void) => {
      h.listeners[name] = cb;
      return Promise.resolve(h.unlisten);
    }
  );
  (navigator.clipboard.writeText as ReturnType<typeof vi.fn>).mockClear();
  (navigator.clipboard.readText as ReturnType<typeof vi.fn>)
    .mockReset()
    .mockResolvedValue("");
});

function setup(optOverrides: Partial<typeof BASE_OPTS> & { theme?: ReturnType<typeof makeTheme> } = {}) {
  const theme = optOverrides.theme ?? makeTheme();
  const initialProps = { ...BASE_OPTS, ...optOverrides, theme };
  const view = renderHook((props: typeof initialProps) => useTerminal(props), {
    initialProps,
  });
  return view;
}

// Attaches a freshly-created container div and returns it plus the attach
// cleanup function. Flushes microtasks so the listen() promise resolves.
async function attach(result: { current: ReturnType<typeof useTerminal> }) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  let cleanup: (() => void) | undefined = undefined;
  await act(async () => {
    cleanup = result.current.attach(container) ?? undefined;
    await Promise.resolve();
  });
  // Cast needed because TS control-flow analysis can't see the assignment that
  // happens inside the async act() callback above.
  return { container, cleanup: cleanup as (() => void) | undefined };
}

describe("useTerminal — creation & theme mapping", () => {
  it("creates exactly one Terminal with font size, scrollback and cursor blink", () => {
    setup();
    expect(h.terms).toHaveLength(1);
    expect(h.terms[0].options.fontSize).toBe(14);
    expect(h.terms[0].options.scrollback).toBe(1000);
    expect(h.terms[0].options.cursorBlink).toBe(true);
  });

  it("maps the app Theme to xterm's ITheme (background, cursor, full ANSI palette)", () => {
    setup();
    const t = h.terms[0].options.theme as Record<string, string>;
    expect(t.background).toBe("#0a0a0a");
    expect(t.foreground).toBe("#f0f0f0");
    expect(t.cursor).toBe("#ffcc00");
    expect(t.black).toBe("#a0");
    expect(t.red).toBe("#a1");
    expect(t.green).toBe("#a2");
    expect(t.brightBlack).toBe("#a8");
    expect(t.brightWhite).toBe("#a15");
  });

  it("loads the FitAddon on creation", () => {
    setup();
    expect(h.fitAddons).toHaveLength(1);
    expect(h.terms[0].loadAddon).toHaveBeenCalledWith(h.fitAddons[0]);
  });
});

describe("useTerminal — attach lifecycle", () => {
  it("opens the terminal in the container, loads WebGL and fits", async () => {
    const { result } = setup();
    const { container } = await attach(result);
    expect(h.terms[0].open).toHaveBeenCalledWith(container);
    // loadAddon called for fit (on create) and webgl (on attach)
    expect(h.terms[0].loadAddon).toHaveBeenCalledTimes(2);
    expect(h.fitAddons[0].fit).toHaveBeenCalled();
  });

  it("falls back gracefully when the WebGL addon throws", async () => {
    h.webglShouldThrow = true;
    const { result } = setup();
    await attach(result);
    // The throw is swallowed; spawn still proceeds.
    expect(h.invoke).toHaveBeenCalledWith("spawn_pty", expect.anything());
  });

  it("spawns the PTY once with cwd, dimensions, scrollback and shell", async () => {
    const { result } = setup();
    await attach(result);
    const spawnCalls = h.invoke.mock.calls.filter((c) => c[0] === "spawn_pty");
    expect(spawnCalls).toHaveLength(1);
    expect(spawnCalls[0][1]).toEqual({
      ptyId: "pty-1",
      cwd: "/home/user/project",
      rows: 24,
      cols: 80,
      scrollbackLimit: 1000,
      shell: "/bin/bash",
    });
  });

  it("does not spawn a second PTY if attach runs again", async () => {
    const { result } = setup();
    const { cleanup } = await attach(result);
    cleanup?.();
    await attach(result);
    const spawnCalls = h.invoke.mock.calls.filter((c) => c[0] === "spawn_pty");
    expect(spawnCalls).toHaveLength(1);
  });

  it("writes an error line into the terminal if spawn_pty rejects", async () => {
    h.invoke.mockImplementation((cmd: string) =>
      cmd === "spawn_pty"
        ? Promise.reject(new Error("no shell"))
        : Promise.resolve(undefined)
    );
    const { result } = setup();
    await attach(result);
    await act(async () => {
      await Promise.resolve();
    });
    expect(h.terms[0].writeln).toHaveBeenCalledWith(
      expect.stringContaining("Failed to start shell")
    );
  });
});

describe("useTerminal — data flow", () => {
  it("forwards keystrokes (onData) to the PTY as encoded bytes", async () => {
    const { result } = setup();
    await attach(result);
    act(() => {
      h.terms[0]._dataCb?.("ls\r");
    });
    expect(h.invoke).toHaveBeenCalledWith("write_pty", {
      ptyId: "pty-1",
      data: bytesOf("ls\r"),
    });
  });

  it("subscribes to pty-output:<ptyId> and writes received bytes to xterm", async () => {
    const { result } = setup();
    await attach(result);
    expect(h.listen).toHaveBeenCalledWith("pty-output:pty-1", expect.any(Function));
    act(() => {
      h.listeners["pty-output:pty-1"]({ payload: [104, 105] }); // "hi"
    });
    expect(h.terms[0].write).toHaveBeenCalledWith(new Uint8Array([104, 105]));
  });
});

describe("useTerminal — clipboard key handling", () => {
  async function getKeyHandler() {
    const { result } = setup();
    await attach(result);
    return h.terms[0];
  }

  function keyEvent(over: Partial<KeyEventLike>): KeyEventLike {
    return {
      ctrlKey: false,
      metaKey: false,
      shiftKey: false,
      key: "",
      type: "keydown",
      preventDefault: vi.fn(),
      ...over,
    };
  }

  it("Ctrl+Shift+C copies the current selection and is consumed", async () => {
    const term = await getKeyHandler();
    term.getSelection.mockReturnValue("copied text");
    const ret = term._keyHandler!(
      keyEvent({ ctrlKey: true, shiftKey: true, key: "C" })
    );
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("copied text");
    expect(ret).toBe(false);
  });

  it("Ctrl+C with a selection copies, clears selection and is consumed", async () => {
    const term = await getKeyHandler();
    term.hasSelection.mockReturnValue(true);
    term.getSelection.mockReturnValue("sel");
    const ret = term._keyHandler!(keyEvent({ ctrlKey: true, key: "c" }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith("sel");
    expect(term.clearSelection).toHaveBeenCalled();
    expect(ret).toBe(false);
  });

  it("Ctrl+C without a selection passes through as SIGINT", async () => {
    const term = await getKeyHandler();
    term.hasSelection.mockReturnValue(false);
    const ret = term._keyHandler!(keyEvent({ ctrlKey: true, key: "c" }));
    expect(navigator.clipboard.writeText).not.toHaveBeenCalled();
    expect(ret).toBe(true);
  });

  it("Ctrl+V pastes clipboard text into the PTY and is consumed", async () => {
    (navigator.clipboard.readText as ReturnType<typeof vi.fn>).mockResolvedValue(
      "pasted"
    );
    const term = await getKeyHandler();
    const ret = term._keyHandler!(keyEvent({ ctrlKey: true, key: "v" }));
    expect(ret).toBe(false);
    await act(async () => {
      await Promise.resolve();
    });
    expect(h.invoke).toHaveBeenCalledWith("write_pty", {
      ptyId: "pty-1",
      data: bytesOf("pasted"),
    });
  });

  it("Ctrl+Shift+V also pastes from the clipboard", async () => {
    (navigator.clipboard.readText as ReturnType<typeof vi.fn>).mockResolvedValue(
      "x"
    );
    const term = await getKeyHandler();
    const ret = term._keyHandler!(
      keyEvent({ ctrlKey: true, shiftKey: true, key: "V" })
    );
    expect(ret).toBe(false);
    await act(async () => {
      await Promise.resolve();
    });
    expect(h.invoke).toHaveBeenCalledWith("write_pty", {
      ptyId: "pty-1",
      data: bytesOf("x"),
    });
  });

  it("lets unrelated keys pass through to xterm", async () => {
    const term = await getKeyHandler();
    expect(term._keyHandler!(keyEvent({ key: "a" }))).toBe(true);
  });
});

describe("useTerminal — reactivity to props", () => {
  it("updates xterm theme in place when the theme prop changes (no recreate)", () => {
    const { rerender } = setup();
    rerender({
      ...BASE_OPTS,
      theme: makeTheme({ terminalBg: "#ffffff" }),
    });
    expect(h.terms).toHaveLength(1); // not recreated
    expect((h.terms[0].options.theme as Record<string, string>).background).toBe(
      "#ffffff"
    );
  });

  it("updates font size and refits when the fontSize prop changes", () => {
    const { rerender } = setup();
    h.fitAddons[0].fit.mockClear();
    rerender({ ...BASE_OPTS, fontSize: 20, theme: makeTheme() });
    expect(h.terms[0].options.fontSize).toBe(20);
    expect(h.fitAddons[0].fit).toHaveBeenCalled();
  });
});

describe("useTerminal — resize observation", () => {
  it("refits and notifies the PTY when the container resizes", async () => {
    const { result } = setup();
    await attach(result);
    h.fitAddons[0].fit.mockClear();
    act(() => {
      (
        globalThis as unknown as { __lastResizeObserver: { trigger: () => void } }
      ).__lastResizeObserver.trigger();
    });
    expect(h.fitAddons[0].fit).toHaveBeenCalled();
    expect(h.invoke).toHaveBeenCalledWith("resize_pty", {
      ptyId: "pty-1",
      rows: 24,
      cols: 80,
    });
  });
});

describe("useTerminal — imperative API", () => {
  it("insertText writes encoded text to the PTY", () => {
    const { result } = setup();
    act(() => result.current.insertText("/some/path"));
    expect(h.invoke).toHaveBeenCalledWith("write_pty", {
      ptyId: "pty-1",
      data: bytesOf("/some/path"),
    });
  });

  it("focus focuses the underlying terminal", () => {
    const { result } = setup();
    act(() => result.current.focus());
    expect(h.terms[0].focus).toHaveBeenCalled();
  });

  it("refit fits the addon", () => {
    const { result } = setup();
    h.fitAddons[0].fit.mockClear();
    act(() => result.current.refit());
    expect(h.fitAddons[0].fit).toHaveBeenCalled();
  });

  it("a window resize event triggers a fit", () => {
    setup();
    h.fitAddons[0].fit.mockClear();
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(h.fitAddons[0].fit).toHaveBeenCalled();
  });
});

describe("useTerminal — teardown", () => {
  it("attach cleanup disconnects the observer, disposes onData and unlistens", async () => {
    const { result } = setup();
    const { cleanup } = await attach(result);
    const onDataDisposable = h.terms[0].onData.mock.results[0].value as {
      dispose: ReturnType<typeof vi.fn>;
    };
    const observer = (
      globalThis as unknown as {
        __lastResizeObserver: { disconnect: ReturnType<typeof vi.fn> };
      }
    ).__lastResizeObserver;

    act(() => cleanup?.());

    expect(observer.disconnect).toHaveBeenCalled();
    expect(onDataDisposable.dispose).toHaveBeenCalled();
    expect(h.unlisten).toHaveBeenCalled();
  });

  it("disposes the terminal when the hook unmounts", () => {
    const { unmount } = setup();
    const term = h.terms[0];
    unmount();
    expect(term.dispose).toHaveBeenCalled();
  });
});
