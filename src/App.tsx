import { useState, useCallback, useTransition } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { v4 as uuidv4 } from "uuid";
import { ThemeProvider, useThemeContext } from "./features/theme/ThemeProvider";
import { MenuBar } from "./features/menu/MenuBar";
import { TabBar } from "./features/tabs/TabBar";
import { WelcomeScreen } from "./features/tabs/WelcomeScreen";
import { WorkspaceView } from "./features/workspace/WorkspaceView";
import { useSettings } from "./features/settings/useSettings";
import { SettingsPanel } from "./features/settings/SettingsPanel";
import type { Workspace } from "./types";
import "./App.css";

// Factory for a fresh workspace (tab). projectPath starts as null, meaning no
// folder is open yet — the UI will show a WelcomeScreen until the user picks
// a project. Each workspace is born with a single terminal pane whose id and
// ptyId share the same UUID (the PTY hasn't been spawned yet — that happens
// when the terminal component mounts and calls spawn_pty via IPC).
function createWorkspace(): Workspace {
  const id = uuidv4();
  return {
    id,
    projectPath: null,
    label: "New Tab",
    terminalPanes: [{ id, ptyId: id }],
    openEditors: [],
  };
}

function AppContent() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => [
    createWorkspace(),
  ]);
  const [activeId, setActiveId] = useState<string>(workspaces[0].id);
  const [showSettings, setShowSettings] = useState(false);

  const { theme, setTheme } = useThemeContext();
  const { settings, updateSettings } = useSettings();
  const [isPending, startTransition] = useTransition();

  const activeWorkspace = workspaces.find((ws) => ws.id === activeId) ?? workspaces[0];

  const handleNew = useCallback(() => {
    const ws = createWorkspace();
    setWorkspaces((prev) => [...prev, ws]);
    setActiveId(ws.id);
  }, []);

  // Close a workspace tab: kill all its PTY processes on the Rust side, then
  // remove it from state. If that was the last tab, create a fresh workspace
  // so the app never ends up with zero tabs (similar to how browsers behave).
  const handleClose = useCallback(
    (id: string) => {
      const closing = workspaces.find((ws) => ws.id === id);
      if (closing) {
        closing.terminalPanes.forEach((pane) =>
          invoke("kill_pty", { ptyId: pane.ptyId }).catch(() => {})
        );
      }

      const remaining = workspaces.filter((ws) => ws.id !== id);
      if (remaining.length === 0) {
        const ws = createWorkspace();
        setWorkspaces([ws]);
        setActiveId(ws.id);
      } else {
        setWorkspaces(remaining);
        if (id === activeId) {
          setActiveId(remaining[remaining.length - 1].id);
        }
      }
    },
    [workspaces, activeId]
  );

  const handleReorder = useCallback((from: number, to: number) => {
    setWorkspaces((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  // Open a project folder in the active tab: persist it to the recent projects
  // list (Rust-side storage), then update the workspace's projectPath so the UI
  // switches from WelcomeScreen to WorkspaceView. The state update is wrapped
  // in startTransition so the WelcomeScreen stays interactive while React
  // prepares the heavier WorkspaceView tree in the background.
  const handleOpenProject = useCallback(
    async (path: string) => {
      const name = path.split("/").pop() || path;
      await invoke("add_recent_project", { projectPath: path, name });
      startTransition(() => {
        setWorkspaces((prev) =>
          prev.map((ws) =>
            ws.id === activeId ? { ...ws, projectPath: path, label: name } : ws
          )
        );
      });
    },
    [activeId, startTransition]
  );

  const handleWorkspaceChange = useCallback((updated: Workspace) => {
    setWorkspaces((prev) =>
      prev.map((ws) => (ws.id === updated.id ? updated : ws))
    );
  }, []);

  const handleSettingsUpdate = useCallback(
    (partial: Partial<typeof settings>) => {
      updateSettings(partial);
      if (partial.theme) {
        setTheme(partial.theme);
      }
    },
    [updateSettings, setTheme]
  );

  const handleSettingsClose = useCallback(() => setShowSettings(false), []);
  const handleSettingsOpen = useCallback(() => setShowSettings(true), []);

  const handleOpenFolder = useCallback(async () => {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      handleOpenProject(selected as string);
    }
  }, [handleOpenProject]);

  const handleCloseActive = useCallback(() => {
    handleClose(activeId);
  }, [handleClose, activeId]);

  // Layout: vertical stack of [menu bar] → [tab bar] → [content area].
  // The content area renders either a WelcomeScreen (when no project is open
  // in the active tab) or WorkspaceView(s) for loaded projects.
  //
  // IMPORTANT: WorkspaceViews use `display: none/block` instead of conditional
  // rendering. This is intentional — each WorkspaceView contains live xterm.js
  // terminals with WebGL contexts and PTY connections. Unmounting and
  // remounting would destroy terminal state (scroll history, running processes).
  // By toggling visibility, inactive tabs stay alive in the DOM and resume
  // instantly when the user switches back.
  return (
    <div className="flex flex-col h-full bg-app text-primary">
      {/* Menu bar — fixed-height strip at the very top */}
      <div className="flex items-center bg-tab-bar border-b border-border h-8 shrink-0 px-1">
        <MenuBar
          onOpenFolder={handleOpenFolder}
          onNewTab={handleNew}
          onCloseTab={handleCloseActive}
          onOpenSettings={handleSettingsOpen}
        />
        <button
          className="bg-transparent border-none text-muted cursor-pointer text-base px-2.5 ml-auto h-full hover:text-primary"
          onClick={handleSettingsOpen}
        >
          ⚙
        </button>
      </div>
      {/* Tab bar — draggable tabs, one per workspace */}
      <div className="flex items-center bg-tab-bar border-b border-border h-9 shrink-0">
        <TabBar
          workspaces={workspaces}
          activeId={activeId}
          onSelect={setActiveId}
          onClose={handleClose}
          onNew={handleNew}
          onReorder={handleReorder}
        />
      </div>
      {/* Content area — fills remaining vertical space */}
      <div className="flex-1 overflow-hidden relative">
        {/* WelcomeScreen: shown only when the active tab has no project open */}
        {activeWorkspace.projectPath === null && (
          <>
            <WelcomeScreen onOpenProject={handleOpenProject} />
            {isPending && (
              <div className="absolute inset-0 z-50 flex items-center justify-center" style={{ background: "var(--bg)", opacity: 0.85 }}>
                <div className="flex flex-col items-center gap-2 text-muted">
                  <div className="w-6 h-6 border-2 border-muted border-t-accent rounded-full animate-spin" />
                  <span className="text-xs">Opening project...</span>
                </div>
              </div>
            )}
          </>
        )}
        {/* All workspace views with an open project — stacked absolutely,
            only the active one is visible (display:block vs display:none).
            See note above about why we avoid unmounting. */}
        {workspaces
          .filter((ws) => ws.projectPath !== null)
          .map((ws) => (
            <div
              key={ws.id}
              className="absolute inset-0"
              style={{ display: ws.id === activeId ? "block" : "none" }}
            >
              <WorkspaceView
                workspace={ws}
                theme={theme}
                settings={settings}
                isActive={ws.id === activeId}
                onWorkspaceChange={handleWorkspaceChange}
              />
            </div>
          ))}
      </div>
      {showSettings && (
        <SettingsPanel
          settings={settings}
          onUpdate={handleSettingsUpdate}
          onClose={handleSettingsClose}
        />
      )}
    </div>
  );
}

// ThemeProvider must wrap AppContent because AppContent calls useThemeContext().
// AppContent is a separate component (rather than inlining everything in App)
// so that the theme context is available via the hook.
export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
