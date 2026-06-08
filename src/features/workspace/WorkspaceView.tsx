import { useState, useCallback, useRef, memo } from "react";
import { FileTree } from "../file-tree/FileTree";
import { TerminalView } from "../terminal/TerminalView";
import { EditorManager, openEditorPanel } from "../editor/EditorManager";
import type { Workspace, Theme, Settings } from "../../types";

interface WorkspaceViewProps {
  workspace: Workspace;
  theme: Theme;
  settings: Settings;
  isActive: boolean;
  onWorkspaceChange: (updated: Workspace) => void;
}

export const WorkspaceView = memo(function WorkspaceView({
  workspace,
  theme,
  settings,
  isActive,
  onWorkspaceChange,
}: WorkspaceViewProps) {
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const resizingRef = useRef(false);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const onChangeRef = useRef(onWorkspaceChange);
  onChangeRef.current = onWorkspaceChange;

  function handleResizeStart(e: React.MouseEvent) {
    e.preventDefault();
    resizingRef.current = true;

    function handleMouseMove(e: MouseEvent) {
      if (!resizingRef.current) return;
      setSidebarWidth(Math.max(150, Math.min(500, e.clientX)));
    }

    function handleMouseUp() {
      resizingRef.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  const handleFileClick = useCallback(async (path: string) => {
    const updated = await openEditorPanel(
      path,
      workspaceRef.current.openEditors
    );
    onChangeRef.current({ ...workspaceRef.current, openEditors: updated });
  }, []);

  const handleEditorsChange = useCallback(
    (editors: typeof workspace.openEditors) => {
      onChangeRef.current({ ...workspaceRef.current, openEditors: editors });
    },
    []
  );

  return (
    <div className="flex h-full">
      <div style={{ width: sidebarWidth, flexShrink: 0 }}>
        <FileTree
          projectPath={workspace.projectPath!}
          workspaceId={workspace.id}
          onFileClick={handleFileClick}
        />
      </div>
      <div
        className="w-1 shrink-0 cursor-col-resize bg-border transition-colors duration-150 hover:bg-accent"
        onMouseDown={handleResizeStart}
      />
      <div className="flex-1 relative overflow-hidden">
        <TerminalView
          ptyId={workspace.ptyId}
          cwd={workspace.projectPath!}
          theme={theme}
          fontSize={settings.font_size}
          scrollback={settings.terminal_scrollback}
          shell={settings.default_shell}
          dragDropPathMode={settings.drag_drop_path_mode}
          isActive={isActive}
        />
        <EditorManager
          editors={workspace.openEditors}
          theme={theme}
          onEditorsChange={handleEditorsChange}
        />
      </div>
    </div>
  );
});
