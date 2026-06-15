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

/**
 * The main workspace layout:  icon rail | sidebar panel | resize handle | content area
 *
 * - The icon rail on the far left lets the user switch sidebar tabs (files, git).
 * - The sidebar panel shows either the file tree or git panel.
 * - A draggable resize handle sits between the sidebar and content area.
 * - The content area holds the terminal grid and any open editor panels.
 */
export const WorkspaceView = memo(function WorkspaceView({
  workspace,
  theme,
  settings,
  isActive,
  onWorkspaceChange,
}: WorkspaceViewProps) {
  // Performance optimization: defer rendering heavy children (terminal, file
  // tree, git panel) until after the first paint. This lets the skeleton
  // shell (the sidebar + loading spinner) appear instantly while xterm.js
  // and file tree initialization happen in the next frame.
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const [sidebarWidth, setSidebarWidth] = useState(250);
  // Which sidebar panel is visible: the file explorer or the git panel.
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>("files");
  // Which editor tab is active in the tabbed editor panel.
  const [activeEditorId, setActiveEditorId] = useState<string | null>(null);
  const resizingRef = useRef(false);

  // Refs that always point to the latest `workspace` and `onWorkspaceChange`.
  // Callbacks like handleFileClick and handleSplitTerminal are wrapped in
  // useCallback with an empty dependency array (so they never change identity
  // and don't trigger child re-renders). To access up-to-date values inside
  // those stable callbacks, we read from refs instead of closing over stale
  // props directly.
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  const onChangeRef = useRef(onWorkspaceChange);
  onChangeRef.current = onWorkspaceChange;

  // Pass null until ready so git polling doesn't start before the UI is painted.
  const git = useGitStatus(ready ? workspace.projectPath : null);

  // Sidebar resize: on mouseDown we attach document-level mousemove/mouseup
  // handlers (document-level so dragging outside the handle still works).
  // Width is clamped between 150px and 500px.
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
    const { editors, activeId } = await openEditorPanel(
      path,
      workspaceRef.current.openEditors
    );
    onChangeRef.current({ ...workspaceRef.current, openEditors: editors });
    setActiveEditorId(activeId);
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

  // Listen for CustomEvents dispatched by MenuBar (see menu/MenuBar.tsx).
  // Only the *active* workspace tab subscribes -- inactive tabs ignore
  // menu actions so that, e.g., "Split Terminal" only affects the visible
  // workspace rather than all of them.
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
    <div className="flex h-full relative">
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

      {/* Sidebar content — both panels are always mounted and positioned
          with absolute inset-0. We toggle visibility via display:none
          instead of conditional rendering so that each panel preserves
          its scroll position and internal state when switched away. */}
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

      {/* Resize handle -- a 4px strip the user can drag to adjust sidebar width */}
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
      </div>
      {/* Editor panel renders outside the overflow-hidden content area so it
          can float above the sidebar and tab bar (z-index 500). */}
      <EditorManager
        editors={workspace.openEditors}
        activeEditorId={activeEditorId}
        theme={theme}
        onEditorsChange={handleEditorsChange}
        onActiveEditorChange={setActiveEditorId}
      />
    </div>
  );
});
