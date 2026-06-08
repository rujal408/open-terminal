import { useState, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { v4 as uuidv4 } from "uuid";
import { ThemeProvider } from "./features/theme/ThemeProvider";
import { useThemeContext } from "./features/theme/ThemeProvider";
import { TabBar } from "./features/tabs/TabBar";
import { WelcomeScreen } from "./features/tabs/WelcomeScreen";
import { TerminalView } from "./features/terminal/TerminalView";
import type { Workspace } from "./types";
import { FileTree } from "./features/file-tree/FileTree";
import { EditorManager, openEditorPanel } from "./features/editor/EditorManager";
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

  const activeWorkspace = workspaces.find((ws) => ws.id === activeId)!;
  const { theme } = useThemeContext();
  const insertTextRef = useRef<((text: string) => void) | null>(null);

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

  return (
    <div className="app">
      <TabBar
        workspaces={workspaces}
        activeId={activeId}
        onSelect={setActiveId}
        onClose={handleClose}
        onNew={handleNew}
        onReorder={handleReorder}
      />
      <div className="workspace-area">
        {activeWorkspace.projectPath === null ? (
          <WelcomeScreen onOpenProject={handleOpenProject} />
        ) : (
          <div className="workspace-content">
            <FileTree
              projectPath={activeWorkspace.projectPath!}
              onFileClick={async (path) => {
                const updated = await openEditorPanel(
                  path,
                  activeWorkspace.openEditors
                );
                setWorkspaces((prev) =>
                  prev.map((ws) =>
                    ws.id === activeId ? { ...ws, openEditors: updated } : ws
                  )
                );
              }}
            />
            <div className="terminal-and-editors">
              <TerminalView
                key={activeWorkspace.ptyId}
                ptyId={activeWorkspace.ptyId}
                cwd={activeWorkspace.projectPath!}
                theme={theme}
                fontSize={14}
                scrollback={5000}
                shell={null}
                onInsertText={(fn) => {
                  insertTextRef.current = fn;
                }}
              />
              <EditorManager
                editors={activeWorkspace.openEditors}
                theme={theme}
                onEditorsChange={(editors) => {
                  setWorkspaces((prev) =>
                    prev.map((ws) =>
                      ws.id === activeId ? { ...ws, openEditors: editors } : ws
                    )
                  );
                }}
              />
            </div>
          </div>
        )}
      </div>
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
