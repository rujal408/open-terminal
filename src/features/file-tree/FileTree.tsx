import { useState, useEffect, useCallback, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { FileTreeNode } from "./FileTreeNode";
import { ContextMenu } from "./ContextMenu";
import type { DirEntry } from "../../types";
import type { MenuItem } from "./ContextMenu";

interface FileTreeProps {
  projectPath: string;
  workspaceId: string;
  onFileClick: (path: string) => void;
  gitStatusMap?: Map<string, string>;
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
}: FileTreeProps) {
  const [entries, setEntries] = useState<DirEntry[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    items: MenuItem[];
  } | null>(null);

  useEffect(() => {
    invoke<DirEntry[]>("list_directory", { path: projectPath }).then(
      (result) => {
        setEntries(result.filter((e) => !e.is_hidden));
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

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, items: MenuItem[]) => {
      setContextMenu({ x: e.clientX, y: e.clientY, items });
    },
    []
  );

  function handleBackgroundContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    setContextMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
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
        },
      ],
    });
  }

  return (
    <div
      className="w-full h-full bg-sidebar flex flex-col overflow-hidden select-none"
      onContextMenu={handleBackgroundContextMenu}
    >
      <div className="px-3 py-2 text-xs font-semibold text-muted uppercase tracking-wide border-b border-border">
        {projectPath.split("/").pop()}
      </div>
      <div className="flex-1 overflow-y-auto py-1">
        {entries.map((entry) => (
          <FileTreeNode
            key={entry.path}
            entry={entry}
            depth={0}
            projectPath={projectPath}
            onFileClick={onFileClick}
            onContextMenu={handleContextMenu}
            gitStatusMap={gitStatusMap}
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
