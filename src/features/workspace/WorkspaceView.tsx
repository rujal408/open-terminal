import { useState, useCallback, useRef, useEffect, memo } from "react";
import { VscFiles, VscSourceControl } from "react-icons/vsc";
import { FileTree } from "../file-tree/FileTree";
import { GitPanel } from "../git/GitPanel";
import { useGitStatus } from "../git/useGitStatus";
import { TerminalGrid } from "../terminal/TerminalGrid";
import { EditorManager, openEditorPanel } from "../editor/EditorManager";
import type { Workspace, Theme, Settings, TerminalPane } from "../../types";

interface WorkspaceViewProps {
  workspace: Workspace;
  theme: Theme;
  settings: Settings;
  isActive: boolean;
  onWorkspaceChange: (updated: Workspace) => void;
}

type SidebarTab = "files" | "git";

export const WorkspaceView = memo(function WorkspaceView({
  workspace,
  theme,
  settings,
  isActive,
  onWorkspaceChange,
}: WorkspaceViewProps) {
  // Defer heavy children until after the first paint so the shell renders instantly
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const [sidebarWidth, setSidebarWidth] = useState(250);
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("files");
  const resizingRef = useRef(false);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const onChangeRef = useRef(onWorkspaceChange);
  onChangeRef.current = onWorkspaceChange;

  const git = useGitStatus(ready ? workspace.projectPath : null);

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

  const handlePanesChange = useCallback(
    (panes: TerminalPane[]) => {
      onChangeRef.current({ ...workspaceRef.current, terminalPanes: panes });
    },
    []
  );

  // Listen for menu bar events
  useEffect(() => {
    if (!isActive) return;

    function handleSidebar(e: Event) {
      const tab = (e as CustomEvent).detail as "files" | "git";
      setSidebarTab(tab);
    }

    function handleSplitTerminal() {
      const id = crypto.randomUUID();
      onChangeRef.current({
        ...workspaceRef.current,
        terminalPanes: [
          ...workspaceRef.current.terminalPanes,
          { id, ptyId: id },
        ],
      });
    }

    window.addEventListener("menu:sidebar", handleSidebar);
    window.addEventListener("menu:split-terminal", handleSplitTerminal);
    return () => {
      window.removeEventListener("menu:sidebar", handleSidebar);
      window.removeEventListener("menu:split-terminal", handleSplitTerminal);
    };
  }, [isActive]);

  const changesCount =
    git.status.staged.length +
    git.status.modified.length +
    git.status.untracked.length +
    git.status.conflicted.length;

  if (!ready) {
    return (
      <div className="flex h-full">
        <div className="flex flex-col items-center w-10 shrink-0 bg-sidebar border-r border-border" />
        <div className="bg-sidebar" style={{ width: sidebarWidth - 40, flexShrink: 0 }} />
        <div className="w-1 shrink-0 bg-border" />
        <div className="flex-1 flex items-center justify-center bg-app">
          <div className="flex flex-col items-center gap-2 text-muted">
            <div className="w-6 h-6 border-2 border-muted border-t-accent rounded-full animate-spin" />
            <span className="text-xs">Loading workspace...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Icon rail */}
      <div className="flex flex-col items-center w-10 shrink-0 bg-sidebar border-r border-border py-1 gap-1">
        <button
          onClick={() => setSidebarTab("files")}
          className={`flex items-center justify-center w-8 h-8 rounded border-none cursor-pointer ${
            sidebarTab === "files"
              ? "bg-border text-primary"
              : "bg-transparent text-muted hover:text-primary"
          }`}
          title="Explorer"
        >
          <VscFiles size={18} />
        </button>
        <button
          onClick={() => setSidebarTab("git")}
          className={`relative flex items-center justify-center w-8 h-8 rounded border-none cursor-pointer ${
            sidebarTab === "git"
              ? "bg-border text-primary"
              : "bg-transparent text-muted hover:text-primary"
          }`}
          title="Source Control"
        >
          <VscSourceControl size={18} />
          {changesCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center bg-accent text-app text-[10px] font-bold rounded-full px-1">
              {changesCount}
            </span>
          )}
        </button>
      </div>

      {/* Sidebar content */}
      <div
        className="flex flex-col overflow-hidden bg-sidebar relative"
        style={{ width: sidebarWidth - 40, flexShrink: 0 }}
      >
        <div
          className="absolute inset-0 flex flex-col"
          style={{ display: sidebarTab === "files" ? "flex" : "none" }}
        >
          <FileTree
            projectPath={workspace.projectPath!}
            workspaceId={workspace.id}
            onFileClick={handleFileClick}
            gitStatusMap={git.statusMap}
            gitDirtyDirs={git.dirtyDirs}
          />
        </div>
        <div
          className="absolute inset-0 flex flex-col"
          style={{ display: sidebarTab === "git" ? "flex" : "none" }}
        >
          <GitPanel
            status={git.status}
            branches={git.branches}
            onStageFile={git.stageFile}
            onUnstageFile={git.unstageFile}
            onDiscardFile={git.discardFile}
            onStageAll={git.stageAll}
            onUnstageAll={git.unstageAll}
            onCommit={git.commit}
            onCheckoutBranch={git.checkoutBranch}
            onRefreshBranches={git.refreshBranches}
          />
        </div>
      </div>

      <div
        className="w-1 shrink-0 cursor-col-resize bg-border transition-colors duration-150 hover:bg-accent"
        onMouseDown={handleResizeStart}
      />
      <div className="flex-1 relative overflow-hidden">
        <TerminalGrid
          panes={workspace.terminalPanes}
          cwd={workspace.projectPath!}
          theme={theme}
          settings={settings}
          isActive={isActive}
          onPanesChange={handlePanesChange}
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
