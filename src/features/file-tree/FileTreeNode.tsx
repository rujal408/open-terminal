import { useState, useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FileIcon } from "./FileIcon";
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
  conflicted: "var(--git-conflicted)",
  renamed: "var(--git-modified)",
};

const GIT_STATUS_BADGE: Record<string, string> = {
  staged: "S",
  added: "A",
  modified: "M",
  deleted: "D",
  untracked: "U",
  conflicted: "C",
  renamed: "R",
};

interface FileTreeNodeProps {
  entry: DirEntry;
  depth: number;
  projectPath: string;
  onFileClick: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, items: MenuItem[]) => void;
  gitStatusMap?: Map<string, string>;
}

export function FileTreeNode({
  entry,
  depth,
  projectPath,
  onFileClick,
  onContextMenu,
  gitStatusMap,
}: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<DirEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const expandedRef = useRef(expanded);
  expandedRef.current = expanded;

  useEffect(() => {
    if (!entry.is_dir) return;

    const unlisten = listen<FsChangeEvent>("fs-changed", (event) => {
      if (event.payload.parent === entry.path && expandedRef.current) {
        invoke<DirEntry[]>("list_directory", { path: entry.path }).then(
          (result) => {
            setChildren(result.filter((e) => !e.is_hidden));
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
      setChildren(entries.filter((e) => !e.is_hidden));
      setLoaded(true);
    }
    setExpanded((prev) => !prev);
  }, [entry, loaded, expanded]);

  const handleClick = useCallback(() => {
    if (entry.is_dir) {
      toggleDir();
    } else {
      onFileClick(entry.path);
    }
  }, [entry, onFileClick, toggleDir]);

  function handleDragStart(e: React.DragEvent) {
    if (entry.is_dir) return;
    const relativePath = entry.path.replace(projectPath + "/", "");
    e.dataTransfer.setData("text/plain", entry.path);
    e.dataTransfer.setData("absolute-path", entry.path);
    e.dataTransfer.setData("relative-path", relativePath);
    e.dataTransfer.effectAllowed = "copy";
  }

  function handleRightClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const items: MenuItem[] = entry.is_dir
      ? [
          { label: "New File", action: () => promptCreate(entry.path, false) },
          { label: "New Folder", action: () => promptCreate(entry.path, true) },
          { label: "Rename", action: () => promptRename(entry.path) },
          { label: "Delete", action: () => handleDelete(entry.path) },
          {
            label: "Copy Path",
            action: () => navigator.clipboard.writeText(entry.path),
          },
        ]
      : [
          { label: "Open", action: () => onFileClick(entry.path) },
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
          },
        ];
    onContextMenu(e, items);
  }

  // Git status for this file
  const gitStatus = gitStatusMap?.get(entry.path);
  // For directories: check if any child path has a status
  const dirHasChanges =
    entry.is_dir && gitStatusMap
      ? Array.from(gitStatusMap.keys()).some((p) =>
          p.startsWith(entry.path + "/")
        )
      : false;
  const nameColor =
    gitStatus
      ? GIT_STATUS_COLOR[gitStatus]
      : dirHasChanges
        ? "var(--git-modified)"
        : undefined;

  return (
    <>
      <div
        className="flex items-center gap-1.5 py-[3px] pr-2 cursor-pointer text-[13px] text-primary hover:bg-border"
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={handleClick}
        onContextMenu={handleRightClick}
        draggable={!entry.is_dir}
        onDragStart={handleDragStart}
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
            gitStatusMap={gitStatusMap}
          />
        ))}
    </>
  );
}

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
