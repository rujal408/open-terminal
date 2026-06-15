import { useCallback, useRef, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { v4 as uuidv4 } from "uuid";
import { TabbedEditorPanel } from "./TabbedEditorPanel";
import type { EditorPanel, Theme } from "../../types";

interface EditorManagerProps {
  editors: EditorPanel[];
  activeEditorId: string | null;
  theme: Theme;
  sidebarWidth: number;
  onEditorsChange: (editors: EditorPanel[]) => void;
  onActiveEditorChange: (id: string | null) => void;
}

export const EditorManager = memo(function EditorManager({
  editors,
  activeEditorId,
  theme,
  sidebarWidth,
  onEditorsChange,
  onActiveEditorChange,
}: EditorManagerProps) {
  const editorsRef = useRef(editors);
  editorsRef.current = editors;
  const onEditorsChangeRef = useRef(onEditorsChange);
  onEditorsChangeRef.current = onEditorsChange;
  const activeEditorIdRef = useRef(activeEditorId);
  activeEditorIdRef.current = activeEditorId;
  const onActiveEditorChangeRef = useRef(onActiveEditorChange);
  onActiveEditorChangeRef.current = onActiveEditorChange;

  const handleTabChange = useCallback((id: string) => {
    onActiveEditorChangeRef.current(id);
  }, []);

  const handleTabClose = useCallback((id: string) => {
    const current = editorsRef.current;
    const remaining = current.filter((e) => e.id !== id);
    onEditorsChangeRef.current(remaining);

    // If closing the active tab, switch to an adjacent one
    if (id === activeEditorIdRef.current) {
      if (remaining.length > 0) {
        const closedIdx = current.findIndex((e) => e.id === id);
        const newIdx = Math.min(closedIdx, remaining.length - 1);
        onActiveEditorChangeRef.current(remaining[newIdx].id);
      } else {
        onActiveEditorChangeRef.current(null);
      }
    }
  }, []);

  const handleDirtyChange = useCallback((id: string, dirty: boolean) => {
    onEditorsChangeRef.current(
      editorsRef.current.map((e) =>
        e.id === id ? { ...e, isDirty: dirty } : e
      )
    );
  }, []);

  if (editors.length === 0) return null;

  return (
    <TabbedEditorPanel
      editors={editors}
      activeTabId={activeEditorId}
      theme={theme}
      sidebarWidth={sidebarWidth}
      onTabChange={handleTabChange}
      onTabClose={handleTabClose}
      onDirtyChange={handleDirtyChange}
    />
  );
});

export async function openEditorPanel(
  filePath: string,
  currentEditors: EditorPanel[]
): Promise<{ editors: EditorPanel[]; activeId: string }> {
  const existing = currentEditors.find((e) => e.filePath === filePath);
  if (existing) return { editors: currentEditors, activeId: existing.id };

  const content = await invoke<string>("read_file", { path: filePath });

  const newPanel: EditorPanel = {
    id: uuidv4(),
    filePath,
    content,
    isDirty: false,
    position: { x: 0, y: 0 },
    size: { width: 0, height: 0 },
  };

  return {
    editors: [...currentEditors, newPanel],
    activeId: newPanel.id,
  };
}
