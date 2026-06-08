import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { v4 as uuidv4 } from "uuid";
import { ThemeProvider, useThemeContext } from "./features/theme/ThemeProvider";
import { TabBar } from "./features/tabs/TabBar";
import { WelcomeScreen } from "./features/tabs/WelcomeScreen";
import { WorkspaceView } from "./features/workspace/WorkspaceView";
import { useSettings } from "./features/settings/useSettings";
import { SettingsPanel } from "./features/settings/SettingsPanel";
import type { Workspace } from "./types";
import "./App.css";

function createWorkspace(): Workspace {
  const id = uuidv4();
  return {
    id,
    projectPath: null,
    label: "New Tab",
    ptyId: id,
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

  const activeWorkspace = workspaces.find((ws) => ws.id === activeId)!;

  const handleNew = useCallback(() => {
    const ws = createWorkspace();
    setWorkspaces((prev) => [...prev, ws]);
    setActiveId(ws.id);
  }, []);

  const handleClose = useCallback(
    (id: string) => {
      invoke("kill_pty", { ptyId: id }).catch(() => {});
      setWorkspaces((prev) => {
        const next = prev.filter((ws) => ws.id !== id);
        if (next.length === 0) {
          const ws = createWorkspace();
          setActiveId(ws.id);
          return [ws];
        }
        if (id === activeId) {
          setActiveId(next[next.length - 1].id);
        }
        return next;
      });
    },
    [activeId]
  );

  const handleReorder = useCallback((from: number, to: number) => {
    setWorkspaces((prev) => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  }, []);

  const handleOpenProject = useCallback(
    async (path: string) => {
      const name = path.split("/").pop() || path;
      await invoke("add_recent_project", { projectPath: path, name });
      setWorkspaces((prev) =>
        prev.map((ws) =>
          ws.id === activeId ? { ...ws, projectPath: path, label: name } : ws
        )
      );
    },
    [activeId]
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

  return (
    <div className="flex flex-col h-full bg-app text-primary">
      <div className="flex items-center bg-tab-bar border-b border-border h-9 shrink-0">
        <TabBar
          workspaces={workspaces}
          activeId={activeId}
          onSelect={setActiveId}
          onClose={handleClose}
          onNew={handleNew}
          onReorder={handleReorder}
        />
        <button
          className="bg-transparent border-none text-muted cursor-pointer text-base px-2.5 ml-auto h-full hover:text-primary"
          onClick={handleSettingsOpen}
        >
          ⚙
        </button>
      </div>
      <div className="flex-1 overflow-hidden relative">
        {activeWorkspace.projectPath === null && (
          <WelcomeScreen onOpenProject={handleOpenProject} />
        )}
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

export default function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}
