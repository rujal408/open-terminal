// Unit tests for MenuBar — dropdown open/close behaviour, menu item actions,
// the CustomEvent bridge to WorkspaceView, and global keyboard shortcuts.

import { render, screen, fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MenuBar } from "../MenuBar";

const handlers = {
  onOpenFolder: vi.fn(),
  onNewTab: vi.fn(),
  onCloseTab: vi.fn(),
  onOpenSettings: vi.fn(),
};

function renderMenu() {
  return render(<MenuBar {...handlers} />);
}

// Captures window CustomEvents of a given name for the duration of a test.
function listenFor(name: string) {
  const events: CustomEvent[] = [];
  const handler = (e: Event) => events.push(e as CustomEvent);
  window.addEventListener(name, handler);
  return {
    events,
    last: () => events[events.length - 1],
    dispose: () => window.removeEventListener(name, handler),
  };
}

beforeEach(() => {
  Object.values(handlers).forEach((fn) => fn.mockReset());
});

describe("MenuBar — dropdowns", () => {
  it("opens a dropdown when a top-level label is clicked", () => {
    renderMenu();
    expect(screen.queryByText("Open Folder...")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("File"));
    expect(screen.getByText("Open Folder...")).toBeInTheDocument();
  });

  it("fires the item action and closes the dropdown on click", () => {
    renderMenu();
    fireEvent.click(screen.getByText("File"));
    fireEvent.click(screen.getByText("New Tab"));
    expect(handlers.onNewTab).toHaveBeenCalled();
    expect(screen.queryByText("Open Folder...")).not.toBeInTheDocument();
  });

  it("switches dropdowns on hover once one is open", () => {
    renderMenu();
    fireEvent.click(screen.getByText("File"));
    fireEvent.mouseEnter(screen.getByText("Edit"));
    expect(screen.getByText("Paste")).toBeInTheDocument();
    expect(screen.queryByText("Open Folder...")).not.toBeInTheDocument();
  });

  it("closes the open dropdown on Escape", () => {
    renderMenu();
    fireEvent.click(screen.getByText("File"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByText("Open Folder...")).not.toBeInTheDocument();
  });
});

describe("MenuBar — CustomEvent bridge", () => {
  it("dispatches menu:sidebar (files) from View → Explorer", () => {
    const cap = listenFor("menu:sidebar");
    renderMenu();
    fireEvent.click(screen.getByText("View"));
    fireEvent.click(screen.getByText("Explorer"));
    expect(cap.last()?.detail).toBe("files");
    cap.dispose();
  });

  it("dispatches menu:split-terminal from Terminal → Split Terminal", () => {
    const cap = listenFor("menu:split-terminal");
    renderMenu();
    fireEvent.click(screen.getByText("Terminal"));
    fireEvent.click(screen.getByText("Split Terminal"));
    expect(cap.events).toHaveLength(1);
    cap.dispose();
  });
});

describe("MenuBar — global shortcuts", () => {
  afterEach(() => {
    // events dispatched on window; nothing persistent to clean beyond handlers
  });

  it("Ctrl+O triggers Open Folder", () => {
    renderMenu();
    fireEvent.keyDown(window, { key: "o", ctrlKey: true });
    expect(handlers.onOpenFolder).toHaveBeenCalled();
  });

  it("Ctrl+T triggers New Tab and Ctrl+W triggers Close Tab", () => {
    renderMenu();
    fireEvent.keyDown(window, { key: "t", ctrlKey: true });
    fireEvent.keyDown(window, { key: "w", ctrlKey: true });
    expect(handlers.onNewTab).toHaveBeenCalled();
    expect(handlers.onCloseTab).toHaveBeenCalled();
  });

  it("Ctrl+Shift+E dispatches the Explorer sidebar event", () => {
    const cap = listenFor("menu:sidebar");
    renderMenu();
    fireEvent.keyDown(window, { key: "E", ctrlKey: true, shiftKey: true });
    expect(cap.last()?.detail).toBe("files");
    cap.dispose();
  });

  it("ignores plain keys without a modifier", () => {
    renderMenu();
    fireEvent.keyDown(window, { key: "o" });
    expect(handlers.onOpenFolder).not.toHaveBeenCalled();
  });
});
