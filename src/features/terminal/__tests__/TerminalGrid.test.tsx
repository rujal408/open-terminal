// Unit tests for TerminalGrid — the multi-pane layout orchestrator.
// Covers the square-grid math (how panes chunk into rows/cols and how many
// separators that yields), split/close actions and their IPC side effects,
// the "can't close the last terminal" rule, and prop propagation to each
// TerminalView. react-resizable-panels and TerminalView are mocked so we
// assert structure and wiring without real layout or xterm.

import { render, fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TerminalGrid } from "../TerminalGrid";
import { makeSettings, makeTheme, makePane } from "./testUtils";

vi.mock("uuid", () => ({ v4: () => "new-uuid" }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(() => Promise.resolve()),
}));

// Passthrough layout primitives that keep children and surface the className
// (so separator orientation is assertable).
vi.mock("react-resizable-panels", () => ({
  Group: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Panel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Separator: ({ className }: { className?: string }) => (
    <div data-testid="separator" data-class={className} />
  ),
}));

// Render each pane as a marker exposing the props we care about.
vi.mock("../TerminalView", () => ({
  TerminalView: (props: {
    ptyId: string;
    isActive: boolean;
    dragDropPathMode: string;
    fontSize: number;
    scrollback: number;
    shell: string | null;
  }) => (
    <div
      data-testid="terminal"
      data-pty={props.ptyId}
      data-active={String(props.isActive)}
      data-mode={props.dragDropPathMode}
      data-font={String(props.fontSize)}
      data-scrollback={String(props.scrollback)}
      data-shell={String(props.shell)}
    />
  ),
}));

import { invoke } from "@tauri-apps/api/core";

function renderGrid(
  paneIds: string[],
  overrides: Partial<React.ComponentProps<typeof TerminalGrid>> = {}
) {
  const onPanesChange = vi.fn();
  const utils = render(
    <TerminalGrid
      panes={paneIds.map(makePane)}
      cwd="/proj"
      theme={makeTheme()}
      settings={makeSettings()}
      isActive={true}
      onPanesChange={onPanesChange}
      {...overrides}
    />
  );
  return { ...utils, onPanesChange };
}

beforeEach(() => {
  vi.mocked(invoke).mockClear();
});

describe("TerminalGrid — rendering & grid math", () => {
  it("renders one TerminalView per pane with its ptyId", () => {
    renderGrid(["a", "b", "c"]);
    const terms = screen.getAllByTestId("terminal");
    expect(terms.map((t) => t.getAttribute("data-pty"))).toEqual([
      "a",
      "b",
      "c",
    ]);
  });

  // cols = ceil(sqrt(n)), rows = ceil(n/cols).
  // horizontal separators = rows - 1; vertical separators = sum over rows of
  // (panes_in_row - 1).
  it.each([
    { ids: ["a"], h: 0, v: 0 }, // 1x1
    { ids: ["a", "b"], h: 0, v: 1 }, // cols2 rows1 → 1 vertical
    { ids: ["a", "b", "c"], h: 1, v: 1 }, // cols2 rows2 → rows [2,1]: v = 1 + 0
    { ids: ["a", "b", "c", "d"], h: 1, v: 2 }, // 2x2 → v = 1 + 1
    { ids: ["a", "b", "c", "d", "e"], h: 1, v: 3 }, // cols3 rows2 → rows [3,2]: v = 2 + 1
  ])(
    "lays out $ids.length panes with $h horizontal and $v vertical separators",
    ({ ids, h, v }) => {
      renderGrid(ids);
      const seps = screen.queryAllByTestId("separator");
      const horizontal = seps.filter((s) =>
        s.getAttribute("data-class")?.includes("terminal-resize-handle-h")
      );
      const vertical = seps.filter((s) =>
        s.getAttribute("data-class")?.includes("terminal-resize-handle-v")
      );
      expect(horizontal).toHaveLength(h);
      expect(vertical).toHaveLength(v);
    }
  );

  it("shows the pane count only when there is more than one terminal", () => {
    const { rerender, onPanesChange } = renderGrid(["a"]);
    expect(screen.queryByText(/terminals/)).not.toBeInTheDocument();
    rerender(
      <TerminalGrid
        panes={["a", "b", "c"].map(makePane)}
        cwd="/proj"
        theme={makeTheme()}
        settings={makeSettings()}
        isActive={true}
        onPanesChange={onPanesChange}
      />
    );
    expect(screen.getByText("3 terminals")).toBeInTheDocument();
  });
});

describe("TerminalGrid — prop propagation", () => {
  it("forwards settings and isActive to every TerminalView", () => {
    renderGrid(["a", "b"], {
      settings: makeSettings({
        font_size: 18,
        terminal_scrollback: 5000,
        default_shell: "/bin/zsh",
        drag_drop_path_mode: "relative",
      }),
      isActive: false,
    });
    for (const term of screen.getAllByTestId("terminal")) {
      expect(term.getAttribute("data-font")).toBe("18");
      expect(term.getAttribute("data-scrollback")).toBe("5000");
      expect(term.getAttribute("data-shell")).toBe("/bin/zsh");
      expect(term.getAttribute("data-mode")).toBe("relative");
      expect(term.getAttribute("data-active")).toBe("false");
    }
  });
});

describe("TerminalGrid — split", () => {
  it("appends a new pane (with a fresh uuid) when Split is clicked", () => {
    const { onPanesChange } = renderGrid(["a"]);
    fireEvent.click(screen.getByTitle("Split terminal"));
    expect(onPanesChange).toHaveBeenCalledWith([
      { id: "a", ptyId: "a" },
      { id: "new-uuid", ptyId: "new-uuid" },
    ]);
  });
});

describe("TerminalGrid — close", () => {
  it("hides the close button when there is a single terminal", () => {
    renderGrid(["a"]);
    expect(screen.queryByTitle("Close terminal")).not.toBeInTheDocument();
  });

  it("kills the PTY and removes the pane when a terminal is closed", () => {
    const { onPanesChange } = renderGrid(["a", "b"]);
    const closeButtons = screen.getAllByTitle("Close terminal");
    expect(closeButtons).toHaveLength(2);

    fireEvent.click(closeButtons[0]); // close pane "a"
    expect(invoke).toHaveBeenCalledWith("kill_pty", { ptyId: "a" });
    expect(onPanesChange).toHaveBeenCalledWith([{ id: "b", ptyId: "b" }]);
  });
});
