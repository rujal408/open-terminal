// Unit tests for the native drag-and-drop helpers used by the file tree.
// Covers the dataTransfer round-trip (write/read/detect) and the move guards
// (no-op moves, circular-move prevention) including the IPC call shape.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DragEvent } from "react";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));

import {
  TREE_ENTRY_MIME,
  writeTreeDrag,
  readTreeDrag,
  isTreeDrag,
  moveEntryInto,
} from "../treeDnd";
import type { DirEntry } from "../../../types";

// A DataTransfer stand-in backed by a real Map so write→read round-trips work
// and `types` reflects what's been set (jsdom hides values during dragover,
// but exposes types — which is exactly what isTreeDrag relies on).
function makeDragEvent() {
  const store = new Map<string, string>();
  const dataTransfer = {
    setData: (k: string, v: string) => store.set(k, v),
    getData: (k: string) => store.get(k) ?? "",
    get types() {
      return Array.from(store.keys());
    },
    effectAllowed: "",
    dropEffect: "",
  };
  return { dataTransfer } as unknown as DragEvent;
}

const fileEntry: DirEntry = {
  name: "index.ts",
  path: "/proj/src/index.ts",
  is_dir: false,
  is_hidden: false,
};

beforeEach(() => {
  invoke.mockReset().mockResolvedValue(undefined);
});

describe("treeDnd — dataTransfer round-trip", () => {
  it("writes absolute/relative/text and the tree-entry MIME, and sets effectAllowed", () => {
    const e = makeDragEvent();
    writeTreeDrag(e, fileEntry, "src/index.ts");

    expect(e.dataTransfer.getData("absolute-path")).toBe("/proj/src/index.ts");
    expect(e.dataTransfer.getData("relative-path")).toBe("src/index.ts");
    expect(e.dataTransfer.getData("text/plain")).toBe("/proj/src/index.ts");
    expect(e.dataTransfer.effectAllowed).toBe("copyMove");

    const payload = JSON.parse(e.dataTransfer.getData(TREE_ENTRY_MIME));
    expect(payload).toEqual({
      path: "/proj/src/index.ts",
      name: "index.ts",
      is_dir: false,
    });
  });

  it("isTreeDrag detects a tree drag from the types list", () => {
    const e = makeDragEvent();
    expect(isTreeDrag(e)).toBe(false);
    writeTreeDrag(e, fileEntry, "src/index.ts");
    expect(isTreeDrag(e)).toBe(true);
  });

  it("readTreeDrag parses the payload back into an entry", () => {
    const e = makeDragEvent();
    writeTreeDrag(e, fileEntry, "src/index.ts");
    expect(readTreeDrag(e)).toEqual({
      path: "/proj/src/index.ts",
      name: "index.ts",
      is_dir: false,
    });
  });

  it("readTreeDrag returns null when there is no tree payload", () => {
    expect(readTreeDrag(makeDragEvent())).toBeNull();
  });

  it("readTreeDrag returns null on malformed JSON", () => {
    const e = makeDragEvent();
    e.dataTransfer.setData(TREE_ENTRY_MIME, "{not json");
    expect(readTreeDrag(e)).toBeNull();
  });
});

describe("treeDnd — moveEntryInto", () => {
  const dragged = { path: "/proj/src/index.ts", name: "index.ts", is_dir: false };

  it("issues rename_entry into the target directory", () => {
    const moved = moveEntryInto(dragged, "/proj/lib");
    expect(moved).toBe(true);
    expect(invoke).toHaveBeenCalledWith("rename_entry", {
      oldPath: "/proj/src/index.ts",
      newPath: "/proj/lib/index.ts",
    });
  });

  it("is a no-op when the target equals the entry's own path", () => {
    expect(moveEntryInto(dragged, "/proj/src/index.ts")).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("is a no-op when the entry already lives in the target directory", () => {
    expect(moveEntryInto(dragged, "/proj/src")).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });

  it("refuses to move a folder into its own descendant", () => {
    const folder = { path: "/proj/src", name: "src", is_dir: true };
    expect(moveEntryInto(folder, "/proj/src/nested")).toBe(false);
    expect(invoke).not.toHaveBeenCalled();
  });
});
