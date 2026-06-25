// Unit tests for FileTreeNode — git-status coloring/badges, expand/collapse,
// selection, context menu, and the native drag-and-drop (drag payload, the
// depth-counted folder highlight, and folder-drop moves).

import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DirEntry } from "../../../types";
import { TREE_ENTRY_MIME } from "../treeDnd";

const { invoke, listen } = vi.hoisted(() => ({
  invoke: vi.fn(),
  listen: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/api/event", () => ({ listen }));

import { FileTreeNode } from "../FileTreeNode";

function entry(over: Partial<DirEntry> = {}): DirEntry {
  return {
    name: "index.ts",
    path: "/p/src/index.ts",
    is_dir: false,
    is_hidden: false,
    ...over,
  };
}

const baseProps = {
  depth: 0,
  projectPath: "/p",
  onFileClick: vi.fn(),
  onContextMenu: vi.fn(),
  onSelect: vi.fn(),
  selectedPath: null as string | null,
  cutPath: null as string | null,
  gitStatusMap: undefined as Map<string, string> | undefined,
  gitDirtyDirs: undefined as Map<string, string> | undefined,
};

function renderNode(over: Partial<DirEntry> = {}, props: Partial<typeof baseProps> = {}) {
  return render(<FileTreeNode entry={entry(over)} {...baseProps} {...props} />);
}

// dataTransfer carrying a tree-entry payload, backed by a real Map so getData
// and the `types` list behave like a real drag.
function dragWith(payload?: DirEntry) {
  const store = new Map<string, string>();
  if (payload) {
    store.set(
      TREE_ENTRY_MIME,
      JSON.stringify({
        path: payload.path,
        name: payload.name,
        is_dir: payload.is_dir,
      })
    );
  }
  return {
    setData: (k: string, v: string) => store.set(k, v),
    getData: (k: string) => store.get(k) ?? "",
    get types() {
      return Array.from(store.keys());
    },
    effectAllowed: "",
    dropEffect: "",
  } as unknown as DataTransfer;
}

beforeEach(() => {
  Object.values(baseProps).forEach((v) => {
    if (typeof v === "function") (v as ReturnType<typeof vi.fn>).mockReset();
  });
  invoke.mockReset().mockResolvedValue([]);
  listen.mockReset().mockResolvedValue(vi.fn());
});

describe("FileTreeNode — git status", () => {
  it("shows the status badge for a tracked file", () => {
    renderNode(
      {},
      { gitStatusMap: new Map([["/p/src/index.ts", "modified"]]) }
    );
    expect(screen.getByText("M")).toBeInTheDocument();
  });

  it("colors a directory by its dominant child status", () => {
    renderNode(
      { name: "src", path: "/p/src", is_dir: true },
      { gitDirtyDirs: new Map([["/p/src", "modified"]]) }
    );
    const label = screen.getByText("src");
    expect(label.style.color).toBe("var(--git-modified)");
  });

  it("fades ignored entries", () => {
    const { container } = renderNode(
      { name: "node_modules", path: "/p/node_modules", is_dir: true },
      { gitStatusMap: new Map([["/p/node_modules", "ignored"]]) }
    );
    const row = container.querySelector("div")!;
    expect(row.style.opacity).toBe("0.5");
  });

  it("fades cut entries", () => {
    const { container } = renderNode({}, { cutPath: "/p/src/index.ts" });
    expect(container.querySelector("div")!.style.opacity).toBe("0.4");
  });
});

describe("FileTreeNode — interaction", () => {
  it("opens a file on click", () => {
    const onFileClick = vi.fn();
    const onSelect = vi.fn();
    renderNode({}, { onFileClick, onSelect });
    fireEvent.click(screen.getByText("index.ts"));
    expect(onSelect).toHaveBeenCalledWith("/p/src/index.ts");
    expect(onFileClick).toHaveBeenCalledWith("/p/src/index.ts");
  });

  it("expands a directory on click and lists its children", async () => {
    invoke.mockResolvedValue([
      { name: "child.ts", path: "/p/src/child.ts", is_dir: false, is_hidden: false },
    ]);
    renderNode({ name: "src", path: "/p/src", is_dir: true });
    fireEvent.click(screen.getByText("src"));
    expect(invoke).toHaveBeenCalledWith("list_directory", { path: "/p/src" });
    expect(await screen.findByText("child.ts")).toBeInTheDocument();
  });

  it("opens a context menu on right-click", () => {
    const onContextMenu = vi.fn();
    renderNode({}, { onContextMenu });
    fireEvent.contextMenu(screen.getByText("index.ts"));
    expect(onContextMenu).toHaveBeenCalled();
    // Second arg is the menu items array.
    expect(Array.isArray(onContextMenu.mock.calls[0][1])).toBe(true);
  });
});

describe("FileTreeNode — drag and drop", () => {
  it("writes the drag payload (absolute/relative/tree-entry) on drag start", () => {
    const { container } = renderNode();
    const row = container.querySelector("div")!;
    const dt = dragWith();
    fireEvent.dragStart(row, { dataTransfer: dt });
    expect(dt.getData("absolute-path")).toBe("/p/src/index.ts");
    expect(dt.getData("relative-path")).toBe("src/index.ts");
    expect(dt.types).toContain(TREE_ENTRY_MIME);
  });

  it("highlights a folder on drag enter and clears it on leave", () => {
    const { container } = renderNode({
      name: "src",
      path: "/p/src",
      is_dir: true,
    });
    const row = container.querySelector("div")!;
    const dt = dragWith(entry({ name: "a.ts", path: "/p/a.ts" }));

    fireEvent.dragEnter(row, { dataTransfer: dt });
    expect(row).toHaveClass("tree-drop-over");
    fireEvent.dragLeave(row, { dataTransfer: dt });
    expect(row).not.toHaveClass("tree-drop-over");
  });

  it("moves a dropped entry into the folder (rename_entry)", () => {
    const { container } = renderNode({
      name: "src",
      path: "/p/src",
      is_dir: true,
    });
    const row = container.querySelector("div")!;
    const dragged = entry({ name: "a.ts", path: "/p/a.ts" });
    fireEvent.drop(row, { dataTransfer: dragWith(dragged) });
    expect(invoke).toHaveBeenCalledWith("rename_entry", {
      oldPath: "/p/a.ts",
      newPath: "/p/src/a.ts",
    });
  });

  it("does not treat a non-folder as a drop target", () => {
    const { container } = renderNode(); // a file
    const row = container.querySelector("div")!;
    fireEvent.drop(row, {
      dataTransfer: dragWith(entry({ name: "a.ts", path: "/p/a.ts" })),
    });
    expect(invoke).not.toHaveBeenCalledWith("rename_entry", expect.anything());
  });
});
