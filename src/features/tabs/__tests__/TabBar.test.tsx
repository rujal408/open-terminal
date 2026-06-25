// Unit tests for TabBar — renders workspace tabs, handles select/close/new,
// and native HTML5 drag-to-reorder.

import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TabBar } from "../TabBar";
import type { Workspace } from "../../../types";

function ws(id: string, label: string): Workspace {
  return { id, label, projectPath: null, terminalPanes: [], openEditors: [] };
}

const handlers = {
  onSelect: vi.fn(),
  onClose: vi.fn(),
  onNew: vi.fn(),
  onReorder: vi.fn(),
};

function renderBar(activeId = "1") {
  return render(
    <TabBar
      workspaces={[ws("1", "Alpha"), ws("2", "Beta"), ws("3", "Gamma")]}
      activeId={activeId}
      {...handlers}
    />
  );
}

// dataTransfer stand-in shared between dragstart and drop.
function makeDT() {
  const store = new Map<string, string>();
  return {
    setData: (k: string, v: string) => store.set(k, v),
    getData: (k: string) => store.get(k) ?? "",
  } as unknown as DataTransfer;
}

beforeEach(() => {
  Object.values(handlers).forEach((fn) => fn.mockReset());
});

describe("TabBar — rendering & actions", () => {
  it("renders one tab per workspace with its label", () => {
    renderBar();
    expect(screen.getByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
  });

  it("styles the active tab differently from inactive ones", () => {
    renderBar("2");
    expect(screen.getByText("Beta").closest("div")).toHaveClass("bg-tab-active");
    expect(screen.getByText("Alpha").closest("div")).toHaveClass(
      "bg-tab-inactive"
    );
  });

  it("calls onSelect when a tab is clicked", () => {
    renderBar();
    fireEvent.click(screen.getByText("Beta"));
    expect(handlers.onSelect).toHaveBeenCalledWith("2");
  });

  it("closes a tab without selecting it (stopPropagation)", () => {
    renderBar();
    const betaTab = screen.getByText("Beta").closest("div")!;
    fireEvent.click(betaTab.querySelector("button")!);
    expect(handlers.onClose).toHaveBeenCalledWith("2");
    expect(handlers.onSelect).not.toHaveBeenCalled();
  });

  it("calls onNew when the + button is clicked", () => {
    renderBar();
    fireEvent.click(screen.getByText("+"));
    expect(handlers.onNew).toHaveBeenCalled();
  });
});

describe("TabBar — drag to reorder", () => {
  it("reorders from the dragged index to the drop index", () => {
    renderBar();
    const dt = makeDT();
    const alpha = screen.getByText("Alpha").closest("div")!;
    const gamma = screen.getByText("Gamma").closest("div")!;

    fireEvent.dragStart(alpha, { dataTransfer: dt }); // index 0
    fireEvent.drop(gamma, { dataTransfer: dt }); // index 2
    expect(handlers.onReorder).toHaveBeenCalledWith(0, 2);
  });

  it("does not reorder when dropped on the same tab", () => {
    renderBar();
    const dt = makeDT();
    const beta = screen.getByText("Beta").closest("div")!;
    fireEvent.dragStart(beta, { dataTransfer: dt }); // index 1
    fireEvent.drop(beta, { dataTransfer: dt }); // index 1
    expect(handlers.onReorder).not.toHaveBeenCalled();
  });
});
