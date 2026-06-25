import { useState, useCallback, useEffect, useRef, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FileIcon } from "./FileIcon";
import { clipboard, copyToClipboard, cutToClipboard, pasteEntry } from "./clipboard";
import { writeTreeDrag, readTreeDrag, isTreeDrag, moveEntryInto } from "./treeDnd";
import type { DirEntry } from "../../types";
import type { MenuItem } from "./ContextMenu";

interface FsChangeEvent {
  path: string;
  parent: string;
}

const GIT_STATUS_COLOR: Record<string, string> = {
  staged: "var(--git-added)",
  added: "var(--git-added)",
  modified: "var(--git-modified)",
  deleted: "var(--git-deleted)",
  untracked: "var(--git-untracked)",
  ignored: "var(--git-ignored)",
  conflicted: "var(--git-conflicted)",
  renamed: "var(--git-modified)",
};

const GIT_STATUS_BADGE: Record<string, string> = {
  staged: "S",
  added: "A",
  modified: "M",
  deleted: "D",
  untracked: "U",
  ignored: "I",
  conflicted: "C",
  renamed: "R",
};

interface FileTreeNodeProps {
  entry: DirEntry;
  depth: number;
  projectPath: string;
  onFileClick: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, items: MenuItem[]) => void;
  onSelect: (path: string) => void;
  selectedPath: string | null;
  cutPath: string | null;
  gitStatusMap?: Map<string, string>;
  gitDirtyDirs?: Map<string, string>;
}

export const FileTreeNode = memo(function FileTreeNode({
  entry,
  depth,
  projectPath,
  onFileClick,
  onContextMenu,
  onSelect,
  selectedPath,
  cutPath,
  gitStatusMap,
  gitDirtyDirs,
}: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<DirEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  // `isDragging` fades this row while it's being dragged. The drop highlight,
  // by contrast, is toggled directly on the DOM (rowRef) rather than via state
  // so hovering a dragged item never re-renders this row. A row has child
  // nodes (icon, label) whose dragleave events bubble up here, so we count
  // enter/leave depth and only clear the highlight once the pointer truly
  // leaves — otherwise the outline would flicker as the pointer crosses them.
  const [isDragging, setIsDragging] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const dragDepthRef = useRef(0);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function setDropHighlight(on: boolean) {
    rowRef.current?.classList.toggle("tree-drop-over", on);
  }

  // Path relative to the project root, set on the drag payload so the terminal
  // can insert it when the user prefers relative paths.
  const relativePath = entry.path.replace(projectPath + "/", "");

  const clearHoverTimer = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);

  // --- Drag source: every node can be dragged out to a folder, the terminal,
  // or an editor. writeTreeDrag puts the path(s) on the dataTransfer.
  function handleDragStart(e: React.DragEvent) {
    writeTreeDrag(e, entry, relativePath);
    setIsDragging(true);
  }

  function handleDragEnd() {
    setIsDragging(false);
    dragDepthRef.current = 0;
    setDropHighlight(false);
    clearHoverTimer();
  }

  // --- Drop target: only folders accept in-tree moves. We gate on isTreeDrag
  // so drags from elsewhere (e.g. an editor tab) don't highlight folders.
  function handleDragEnter(e: React.DragEvent) {
    if (!entry.is_dir || !isTreeDrag(e)) return;
    e.preventDefault();
    e.stopPropagation(); // don't let the root drop zone also react
    dragDepthRef.current += 1;
    if (dragDepthRef.current === 1) setDropHighlight(true);
  }

  function handleDragOver(e: React.DragEvent) {
    if (!entry.is_dir || !isTreeDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    // Auto-expand a collapsed folder after hovering for 600ms.
    if (!expanded && !hoverTimerRef.current) {
      hoverTimerRef.current = setTimeout(() => {
        hoverTimerRef.current = null;
        toggleDir();
      }, 600);
    }
  }

  function handleDragLeave() {
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
    if (dragDepthRef.current === 0) {
      setDropHighlight(false);
      clearHoverTimer();
    }
  }

  function handleDrop(e: React.DragEvent) {
    if (!entry.is_dir || !isTreeDrag(e)) return;
    e.preventDefault();
    e.stopPropagation();
    dragDepthRef.current = 0;
    setDropHighlight(false);
    clearHoverTimer();
    const dragged = readTreeDrag(e);
    if (dragged) moveEntryInto(dragged, entry.path);
  }

  useEffect(() => {
    if (!entry.is_dir) return;

    const unlisten = listen<FsChangeEvent>("fs-changed", (event) => {
      if (event.payload.parent === entry.path && expandedRef.current) {
        invoke<DirEntry[]>("list_directory", { path: entry.path }).then(
          (result) => {
            setChildren(result);
          }
        );
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [entry.path, entry.is_dir]);

  const toggleDir = useCallback(async () => {
    if (!entry.is_dir) return;
    if (!loaded || !expanded) {
      const entries = await invoke<DirEntry[]>("list_directory", {
        path: entry.path,
      });
      setChildren(entries);
      setLoaded(true);
    }
    setExpanded((prev) => !prev);
  }, [entry, loaded, expanded]);

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation(); // prevent background click from clearing selection
      onSelect(entry.path);
      if (entry.is_dir) {
        toggleDir();
      } else {
        onFileClick(entry.path);
      }
    },
    [entry, onFileClick, onSelect, toggleDir]
  );

  function handleRightClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const items: MenuItem[] = [];

    if (entry.is_dir) {
      items.push(
        { label: "New File", action: () => promptCreate(entry.path, false) },
        { label: "New Folder", action: () => promptCreate(entry.path, true) }
      );
      if (clipboard) {
        items.push({ label: "Paste", action: () => pasteEntry(entry.path) });
      }
      items.push(
        { label: "Copy", action: () => copyToClipboard(entry.path) },
        { label: "Cut", action: () => cutToClipboard(entry.path) },
        { label: "Rename", action: () => promptRename(entry.path) },
        { label: "Delete", action: () => handleDelete(entry.path) },
        {
          label: "Copy Path",
          action: () => navigator.clipboard.writeText(entry.path),
        }
      );
    } else {
      items.push(
        { label: "Open", action: () => onFileClick(entry.path) },
        { label: "Copy", action: () => copyToClipboard(entry.path) },
        { label: "Cut", action: () => cutToClipboard(entry.path) },
        { label: "Rename", action: () => promptRename(entry.path) },
        { label: "Delete", action: () => handleDelete(entry.path) },
        {
          label: "Copy Path",
          action: () => navigator.clipboard.writeText(entry.path),
        },
        {
          label: "Copy Relative Path",
          action: () =>
            navigator.clipboard.writeText(
              entry.path.replace(projectPath + "/", "")
            ),
        }
      );
    }

    onContextMenu(e, items);
  }

  // Git status for this file
  const gitStatus = gitStatusMap?.get(entry.path);
  // For directories: look up the dominant child status from the precomputed map
  const dirStatus = entry.is_dir ? gitDirtyDirs?.get(entry.path) : undefined;
  const nameColor =
    gitStatus
      ? GIT_STATUS_COLOR[gitStatus]
      : dirStatus
        ? GIT_STATUS_COLOR[dirStatus] ?? "var(--git-modified)"
        : undefined;

  const isSelected = selectedPath === entry.path;
  const isCut = cutPath === entry.path;
  const isIgnored = gitStatus === "ignored" || dirStatus === "ignored";

  return (
    <>
      <div
        ref={rowRef}
        draggable
        className={`flex items-center gap-1.5 py-[3px] pr-2 cursor-pointer text-[13px] text-primary hover:bg-border transition-colors ${
          isSelected ? "bg-border" : ""
        }`}
        style={{
          paddingLeft: depth * 16 + 8,
          opacity: isDragging || isCut ? 0.4 : isIgnored ? 0.5 : 1,
        }}
        onClick={handleClick}
        onContextMenu={handleRightClick}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <FileIcon name={entry.name} isDir={entry.is_dir} expanded={expanded} />
        <span
          className="overflow-hidden text-ellipsis whitespace-nowrap flex-1"
          style={nameColor ? { color: nameColor } : undefined}
        >
          {entry.name}
        </span>
        {gitStatus && (
          <span
            className="text-[10px] font-bold shrink-0 ml-auto"
            style={{ color: GIT_STATUS_COLOR[gitStatus] }}
          >
            {GIT_STATUS_BADGE[gitStatus]}
          </span>
        )}
      </div>
      {expanded &&
        children.map((child) => (
          <FileTreeNode
            key={child.path}
            entry={child}
            depth={depth + 1}
            projectPath={projectPath}
            onFileClick={onFileClick}
            onContextMenu={onContextMenu}
            onSelect={onSelect}
            selectedPath={selectedPath}
            cutPath={cutPath}
            gitStatusMap={gitStatusMap}
            gitDirtyDirs={gitDirtyDirs}
          />
        ))}
    </>
  );
});

function promptCreate(parentPath: string, isDir: boolean) {
  const name = window.prompt(isDir ? "Folder name:" : "File name:");
  if (!name) return;
  const fullPath = `${parentPath}/${name}`;
  const command = isDir ? "create_directory" : "create_file";
  invoke(command, { path: fullPath }).catch((e) => alert(e));
}

function promptRename(oldPath: string) {
  const oldName = oldPath.split("/").pop() || "";
  const newName = window.prompt("New name:", oldName);
  if (!newName || newName === oldName) return;
  const parentDir = oldPath.substring(0, oldPath.lastIndexOf("/"));
  invoke("rename_entry", {
    oldPath,
    newPath: `${parentDir}/${newName}`,
  }).catch((e) => alert(e));
}

function handleDelete(path: string) {
  const name = path.split("/").pop() || "";
  if (window.confirm(`Move "${name}" to trash?`)) {
    invoke("delete_entry", { path }).catch((e) => alert(e));
  }
}
