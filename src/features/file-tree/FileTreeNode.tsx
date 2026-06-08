import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { DirEntry } from "../../types";
import type { MenuItem } from "./ContextMenu";

interface FileTreeNodeProps {
  entry: DirEntry;
  depth: number;
  projectPath: string;
  onFileClick: (path: string) => void;
  onContextMenu: (e: React.MouseEvent, items: MenuItem[]) => void;
}

export function FileTreeNode({
  entry,
  depth,
  projectPath,
  onFileClick,
  onContextMenu,
}: FileTreeNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<DirEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  const toggle = useCallback(async () => {
    if (!entry.is_dir) {
      onFileClick(entry.path);
      return;
    }
    if (!loaded) {
      const entries = await invoke<DirEntry[]>("list_directory", {
        path: entry.path,
      });
      setChildren(entries.filter((e) => !e.is_hidden));
      setLoaded(true);
    }
    setExpanded((prev) => !prev);
  }, [entry, loaded, onFileClick]);

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
    const items: MenuItem[] = entry.is_dir
      ? [
          { label: "New File", action: () => promptCreate(entry.path, false) },
          { label: "New Folder", action: () => promptCreate(entry.path, true) },
          { label: "Rename", action: () => promptRename(entry.path) },
          { label: "Delete", action: () => handleDelete(entry.path) },
          { label: "Copy Path", action: () => navigator.clipboard.writeText(entry.path) },
        ]
      : [
          { label: "Open", action: () => onFileClick(entry.path) },
          { label: "Rename", action: () => promptRename(entry.path) },
          { label: "Delete", action: () => handleDelete(entry.path) },
          { label: "Copy Path", action: () => navigator.clipboard.writeText(entry.path) },
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

  return (
    <>
      <div
        className={`tree-node ${entry.is_dir ? "tree-dir" : "tree-file"}`}
        style={{ paddingLeft: depth * 16 + 8 }}
        onClick={toggle}
        onContextMenu={handleRightClick}
        draggable={!entry.is_dir}
        onDragStart={handleDragStart}
      >
        <span className="tree-icon">
          {entry.is_dir ? (expanded ? "▾" : "▸") : ""}
        </span>
        <span className="tree-name">{entry.name}</span>
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
  invoke("rename_entry", { oldPath, newPath: `${parentDir}/${newName}` }).catch(
    (e) => alert(e)
  );
}

function handleDelete(path: string) {
  const name = path.split("/").pop() || "";
  if (window.confirm(`Move "${name}" to trash?`)) {
    invoke("delete_entry", { path }).catch((e) => alert(e));
  }
}
