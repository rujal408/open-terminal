import { useState, useCallback, useEffect, useRef, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { FileIcon } from "./FileIcon";
import { clipboard, copyToClipboard, cutToClipboard, pasteEntry } from "./clipboard";
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

  // dnd-kit: make every node draggable. The `data` object is read in
  // FileTree's onDragEnd to know which file/folder is being moved.
  const {
    attributes: dragAttributes,
    listeners: dragListeners,
    setNodeRef: setDragRef,
    isDragging,
  } = useDraggable({
    id: `drag-${entry.path}`,
    data: { entry },
  });

  // dnd-kit: folders are drop targets. When something is dragged over a
  // folder, `isOver` becomes true and we highlight it visually.
  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: `drop-${entry.path}`,
    data: { entry },
    disabled: !entry.is_dir,
  });

  // Combine both refs so the same DOM element is both draggable and droppable.
  const combinedRef = useCallback(
    (node: HTMLDivElement | null) => {
      setDragRef(node);
      setDropRef(node);
    },
    [setDragRef, setDropRef]
  );

  // Auto-expand folder when hovering with a dragged item for 600ms
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isOver && entry.is_dir && !expanded) {
      hoverTimerRef.current = setTimeout(() => {
        toggleDir();
      }, 600);
    }
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, [isOver]); // eslint-disable-line react-hooks/exhaustive-deps

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
        ref={combinedRef}
        className={`flex items-center gap-1.5 py-[3px] pr-2 cursor-pointer text-[13px] text-primary hover:bg-border transition-colors ${
          isOver && entry.is_dir ? "bg-accent/20 outline outline-1 outline-accent" : ""
        } ${isSelected ? "bg-border" : ""}`}
        style={{
          paddingLeft: depth * 16 + 8,
          opacity: isDragging || isCut ? 0.4 : isIgnored ? 0.5 : 1,
        }}
        onClick={handleClick}
        onContextMenu={handleRightClick}
        {...dragAttributes}
        {...dragListeners}
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
