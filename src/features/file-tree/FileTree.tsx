import { useState, useEffect, useCallback, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FileTreeNode } from "./FileTreeNode";
import { ContextMenu } from "./ContextMenu";
import { isTreeDrag, readTreeDrag, moveEntryInto } from "./treeDnd";
import {
  clipboard,
  clearClipboard,
  copyToClipboard,
  cutToClipboard,
  pasteEntry,
  subscribeClipboard,
} from "./clipboard";
import type { FileClipboard } from "./clipboard";
import type { DirEntry } from "../../types";
import type { MenuItem } from "./ContextMenu";

interface FileTreeProps {
  projectPath: string;
  workspaceId: string;
  onFileClick: (path: string) => void;
  gitStatusMap?: Map<string, string>;
  gitDirtyDirs?: Map<string, string>;
}

interface FsChangeEvent {
  path: string;
  parent: string;
}

export const FileTree = memo(function FileTree({
  projectPath,
  workspaceId,
  onFileClick,
  gitStatusMap,
  gitDirtyDirs,
}: FileTreeProps) {
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
  } | null>(null);

  // Highlights the empty tree area when a dragged item hovers it (drop here
  // moves the item to the project root).
  const [isRootOver, setIsRootOver] = useState(false);

  // Currently selected (clicked) item in the file tree
  const [selectedPath, setSelectedPath] = useState<string | null>(null);

  // React-synced clipboard state for visual feedback (cut items show faded).
  // Starts as null — any stale clipboard from a previous session is ignored.
  const [clipboardState, setClipboardState] = useState<FileClipboard | null>(null);

  // Clear module-level clipboard on mount so stale cut markers don't persist
  // across project reopens, then subscribe to future changes.
  useEffect(() => {
    clearClipboard();
    return subscribeClipboard(setClipboardState);
  }, []);

  // The path that should appear faded (only for "cut" operations)
  const cutPath =
    clipboardState?.operation === "cut" ? clipboardState.path : null;

  useEffect(() => {
    invoke<DirEntry[]>("list_directory", { path: projectPath }).then(
      (result) => {
        setEntries(result);
      }
    );
  }, [projectPath, refreshKey]);

  useEffect(() => {
    invoke("watch_directory", { workspaceId, path: projectPath }).catch(
      (err) => console.warn("Failed to start file watcher:", err)
    );

    const unlisten = listen<FsChangeEvent>("fs-changed", (event) => {
      const { parent } = event.payload;
      if (parent === projectPath) {
        setRefreshKey((k) => k + 1);
      }
    });

    return () => {
      invoke("unwatch_directory", { workspaceId }).catch(() => {});
      unlisten.then((fn) => fn());
    };
  }, [projectPath, workspaceId]);

  // Keyboard shortcuts: Ctrl+C (copy), Ctrl+X (cut), Ctrl+V (paste), Delete
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Only handle when file tree has focus (not when terminal is focused)
      const container = document.querySelector(".file-tree-container");
      if (!container?.contains(document.activeElement) && document.activeElement !== container) {
        return;
      }

      if (!selectedPath) return;

      // Delete or Backspace — move selected item to trash
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        const name = selectedPath.split("/").pop() || "";
        if (window.confirm(`Move "${name}" to trash?`)) {
          invoke("delete_entry", { path: selectedPath }).catch((err) =>
            alert(`Delete failed: ${err}`)
          );
          setSelectedPath(null);
        }
        return;
      }

      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      if (e.key === "c" && !e.shiftKey) {
        e.preventDefault();
        copyToClipboard(selectedPath);
      } else if (e.key === "x" && !e.shiftKey) {
        e.preventDefault();
        cutToClipboard(selectedPath);
      } else if (e.key === "v" && !e.shiftKey) {
        e.preventDefault();
        // Paste into the selected folder, or the parent of the selected file
        const isDir = isPathDir(selectedPath);
        const pasteTarget = isDir
          ? selectedPath
          : selectedPath.substring(0, selectedPath.lastIndexOf("/"));
        pasteEntry(pasteTarget || projectPath);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedPath, projectPath]);

  // Helper: check if a path is a directory by looking through loaded entries
  function isPathDir(path: string): boolean {
    // Check root entries
    for (const e of entries) {
      if (e.path === path) return e.is_dir;
    }
    // Fallback: if we can't determine, treat as file (paste into parent)
    return false;
  }

  const handleSelect = useCallback((path: string) => {
    setSelectedPath(path);
  }, []);

  // Root drop zone (the empty tree area). Folder rows call stopPropagation on
  // their own drop handlers, so anything that reaches here is a drop onto
  // empty space — move it to the project root. Highlight only when hovering
  // the empty area directly (target === currentTarget) so we don't double up
  // with a folder's own highlight.
  const handleRootDragOver = useCallback(
    (e: React.DragEvent) => {
      if (!isTreeDrag(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setIsRootOver(e.target === e.currentTarget);
    },
    []
  );

  const handleRootDragLeave = useCallback(() => {
    setIsRootOver(false);
  }, []);

  const handleRootDrop = useCallback(
    (e: React.DragEvent) => {
      if (!isTreeDrag(e)) return;
      e.preventDefault();
      setIsRootOver(false);
      const dragged = readTreeDrag(e);
      if (dragged) moveEntryInto(dragged, projectPath);
    },
    [projectPath]
  );

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, items: MenuItem[]) => {
      setContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    []
  );

  function handleBackgroundContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setSelectedPath(null);
    const items: MenuItem[] = [];

    if (clipboard) {
      items.push({
        label: "Paste",
        action: () => pasteEntry(projectPath),
      });
    }

    items.push(
      {
        label: "New File",
        action: () => {
          const name = window.prompt("File name:");
          if (name) invoke("create_file", { path: `${projectPath}/${name}` });
        },
      },
      {
        label: "New Folder",
        action: () => {
          const name = window.prompt("Folder name:");
          if (name)
            invoke("create_directory", { path: `${projectPath}/${name}` });
        },
      }
    );

    setContextMenu({ x: e.clientX, y: e.clientY, items });
  }

  function handleBackgroundClick() {
    setSelectedPath(null);
  }

  return (
    <div
      tabIndex={0}
      className="file-tree-container w-full h-full bg-sidebar flex flex-col overflow-hidden select-none outline-none"
      onContextMenu={handleBackgroundContextMenu}
      onClick={handleBackgroundClick}
    >
      <div className="px-3 py-2 text-xs font-semibold text-muted uppercase tracking-wide border-b border-border">
        {projectPath.split("/").pop()}
      </div>
      <div
        className={`flex-1 overflow-y-auto py-1 ${
          isRootOver ? "outline outline-1 outline-accent outline-offset-[-1px]" : ""
        }`}
        onDragOver={handleRootDragOver}
        onDragLeave={handleRootDragLeave}
        onDrop={handleRootDrop}
      >
        {entries.map((entry) => (
          <FileTreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            projectPath={projectPath}
            onFileClick={onFileClick}
            onContextMenu={handleContextMenu}
            onSelect={handleSelect}
            selectedPath={selectedPath}
            cutPath={cutPath}
            gitStatusMap={gitStatusMap}
            gitDirtyDirs={gitDirtyDirs}
          />
        ))}
      </div>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
        />
      )}
    </div>
  );
});
