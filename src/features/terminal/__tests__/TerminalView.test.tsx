// Unit tests for TerminalView — the component wrapper around useTerminal.
// The hook itself is mocked (covered separately) so these tests focus on
// TerminalView's own responsibilities: deferred attach, refit-on-activation,
// teardown, and the file-path drag-and-drop behaviour (absolute/relative mode,
// space-quoting, fallback, and the flicker-free depth-counted highlight).

import { render, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TerminalView } from "../TerminalView";
import { makeTheme } from "./testUtils";

// Stable spies returned by the mocked hook. They must keep identity across
// re-renders so TerminalView's effects (which depend on `attach`/`refit`)
// don't re-run spuriously — this also lets us assert that behaviour.
const hookApi = vi.hoisted(() => ({
  attach: vi.fn(),
  insertText: vi.fn(),
  focus: vi.fn(),
  refit: vi.fn(),
  cleanup: vi.fn(),
}));

vi.mock("../useTerminal", () => ({
  useTerminal: () => ({
    attach: hookApi.attach,
    insertText: hookApi.insertText,
    focus: hookApi.focus,
    refit: hookApi.refit,
  }),
}));

const baseProps = {
  ptyId: "pty-1",
  cwd: "/proj",
  theme: makeTheme(),
  fontSize: 14,
  scrollback: 1000,
  shell: "/bin/bash",
  dragDropPathMode: "absolute" as const,
  isActive: true,
};

// Builds a fake DataTransfer whose getData returns values from `data`, and
// records the assigned dropEffect.
function fakeDataTransfer(data: Record<string, string>) {
  return {
    getData: (key: string) => data[key] ?? "",
    setData: vi.fn(),
    dropEffect: "",
  } as unknown as DataTransfer;
}

beforeEach(() => {
  hookApi.attach.mockReset().mockReturnValue(hookApi.cleanup);
  hookApi.insertText.mockReset();
  hookApi.focus.mockReset();
  hookApi.refit.mockReset();
  hookApi.cleanup.mockReset();
});

describe("TerminalView — lifecycle", () => {
  it("renders a terminal-container div and attaches it on mount", () => {
    const { container } = render(<TerminalView {...baseProps} />);
    const el = container.querySelector(".terminal-container");
    expect(el).toBeInTheDocument();
    expect(hookApi.attach).toHaveBeenCalledTimes(1);
    expect(hookApi.attach).toHaveBeenCalledWith(el);
  });

  it("refits when mounted active and again when re-activated", () => {
    const { rerender } = render(<TerminalView {...baseProps} isActive={true} />);
    expect(hookApi.refit).toHaveBeenCalledTimes(1);

    rerender(<TerminalView {...baseProps} isActive={false} />);
    rerender(<TerminalView {...baseProps} isActive={true} />);
    expect(hookApi.refit).toHaveBeenCalledTimes(2);
  });

  it("does not re-attach when re-rendered with identical props", () => {
    const { rerender } = render(<TerminalView {...baseProps} />);
    rerender(<TerminalView {...baseProps} />);
    expect(hookApi.attach).toHaveBeenCalledTimes(1);
  });

  it("runs the attach cleanup on unmount", () => {
    const { unmount } = render(<TerminalView {...baseProps} />);
    unmount();
    expect(hookApi.cleanup).toHaveBeenCalled();
  });
});

describe("TerminalView — drag and drop", () => {
  function dropOn(el: Element, data: Record<string, string>) {
    fireEvent.drop(el, { dataTransfer: fakeDataTransfer(data) });
  }

  it("inserts the absolute path by default and focuses the terminal", () => {
    const { container } = render(<TerminalView {...baseProps} />);
    const el = container.querySelector(".terminal-container")!;
    dropOn(el, { "absolute-path": "/proj/src/index.ts" });
    expect(hookApi.insertText).toHaveBeenCalledWith("/proj/src/index.ts");
    expect(hookApi.focus).toHaveBeenCalled();
  });

  it("inserts the relative path when dragDropPathMode is 'relative'", () => {
    const { container } = render(
      <TerminalView {...baseProps} dragDropPathMode="relative" />
    );
    const el = container.querySelector(".terminal-container")!;
    dropOn(el, {
      "absolute-path": "/proj/src/index.ts",
      "relative-path": "src/index.ts",
    });
    expect(hookApi.insertText).toHaveBeenCalledWith("src/index.ts");
  });

  it("falls back to text/plain when the keyed path is empty", () => {
    const { container } = render(<TerminalView {...baseProps} />);
    const el = container.querySelector(".terminal-container")!;
    dropOn(el, { "text/plain": "/fallback/path" });
    expect(hookApi.insertText).toHaveBeenCalledWith("/fallback/path");
  });

  it("wraps paths containing spaces in double quotes", () => {
    const { container } = render(<TerminalView {...baseProps} />);
    const el = container.querySelector(".terminal-container")!;
    dropOn(el, { "absolute-path": "/my docs/a b.txt" });
    expect(hookApi.insertText).toHaveBeenCalledWith('"/my docs/a b.txt"');
  });

  it("does nothing when the drop carries no path", () => {
    const { container } = render(<TerminalView {...baseProps} />);
    const el = container.querySelector(".terminal-container")!;
    dropOn(el, {});
    expect(hookApi.insertText).not.toHaveBeenCalled();
    expect(hookApi.focus).not.toHaveBeenCalled();
  });
});

describe("TerminalView — drag highlight (depth counter, no re-render)", () => {
  it("adds the highlight on enter and only removes it once the pointer fully leaves", () => {
    const { container } = render(<TerminalView {...baseProps} />);
    const el = container.querySelector(".terminal-container")!;

    // Two enters (e.g. crossing into a child) then one leave: still highlighted.
    fireEvent.dragEnter(el, { dataTransfer: fakeDataTransfer({}) });
    fireEvent.dragEnter(el, { dataTransfer: fakeDataTransfer({}) });
    expect(el).toHaveClass("terminal-drag-over");

    fireEvent.dragLeave(el);
    expect(el).toHaveClass("terminal-drag-over");

    // Final leave brings depth to 0 → highlight cleared.
    fireEvent.dragLeave(el);
    expect(el).not.toHaveClass("terminal-drag-over");
  });

  it("sets dropEffect to 'copy' on drag over", () => {
    const { container } = render(<TerminalView {...baseProps} />);
    const el = container.querySelector(".terminal-container")!;
    const dt = fakeDataTransfer({});
    fireEvent.dragOver(el, { dataTransfer: dt });
    expect(dt.dropEffect).toBe("copy");
  });

  it("clears the highlight after a drop", () => {
    const { container } = render(<TerminalView {...baseProps} />);
    const el = container.querySelector(".terminal-container")!;
    fireEvent.dragEnter(el, { dataTransfer: fakeDataTransfer({}) });
    expect(el).toHaveClass("terminal-drag-over");
    fireEvent.drop(el, {
      dataTransfer: fakeDataTransfer({ "absolute-path": "/x" }),
    });
    expect(el).not.toHaveClass("terminal-drag-over");
  });
});
