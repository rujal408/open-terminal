// Native HTML5 drag-and-drop helpers for the file tree.
//
// We use the browser's native DnD (not dnd-kit) so that a single drag gesture
// works across surfaces: dropping onto a folder moves the file in-tree, while
// dropping onto the terminal or an editor inserts/uses its path. dnd-kit is
// pointer-based and never populates `dataTransfer`, so it can't reach drop
// targets outside its own React context (the terminal lives in a separate
// subtree). Native DnD is also how VS Code's explorer behaves.

import type { DragEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { DirEntry } from "../../types";

// Custom MIME carrying the dragged entry so in-tree move drops can identify it.
// During `dragover` the browser hides data values for security but still
// exposes the list of `types`, so we can detect a tree drag without reading it.
export const TREE_ENTRY_MIME = "application/x-tree-entry";

export interface DraggedEntry {
  path: string;
  name: string;
  is_dir: boolean;
}

// Populate dataTransfer for a file-tree drag. We set several keys so every
// drop target can read what it needs:
//   - absolute-path / relative-path : read by the terminal drop handler
//     (TerminalView picks one based on the drag_drop_path_mode setting)
//   - text/plain                    : generic fallback
//   - application/x-tree-entry      : JSON payload for in-tree move drops
export function writeTreeDrag(
  e: DragEvent,
  entry: DirEntry,
  relativePath: string
) {
  e.dataTransfer.setData("absolute-path", entry.path);
  e.dataTransfer.setData("relative-path", relativePath);
  e.dataTransfer.setData("text/plain", entry.path);
  e.dataTransfer.setData(
    TREE_ENTRY_MIME,
    JSON.stringify({
      path: entry.path,
      name: entry.name,
      is_dir: entry.is_dir,
    } satisfies DraggedEntry)
  );
  // Allow both a "copy" (terminal/editor) and a "move" (folder) drop.
  e.dataTransfer.effectAllowed = "copyMove";
}

// True when the current drag originated from the file tree. Safe to call in
// `dragover` (only inspects `types`, not the hidden data values).
export function isTreeDrag(e: DragEvent): boolean {
  return e.dataTransfer.types.includes(TREE_ENTRY_MIME);
}

// Read the dragged entry on drop. Returns null if this isn't a tree drag.
export function readTreeDrag(e: DragEvent): DraggedEntry | null {
  const raw = e.dataTransfer.getData(TREE_ENTRY_MIME);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DraggedEntry;
  } catch {
    return null;
  }
}

// Move a dragged entry into `targetDir`. Guards against no-op moves and
// circular moves (dropping a folder into itself or a descendant). Returns
// true when a move was actually issued.
export function moveEntryInto(
  dragged: DraggedEntry,
  targetDir: string
): boolean {
  if (dragged.path === targetDir) return false;
  // Can't move a folder into one of its own descendants.
  if (targetDir.startsWith(dragged.path + "/")) return false;
  const newPath = `${targetDir}/${dragged.name}`;
  if (dragged.path === newPath) return false; // already in that folder

  invoke("rename_entry", { oldPath: dragged.path, newPath }).catch((err) =>
    alert(`Failed to move: ${err}`)
  );
  return true;
}
