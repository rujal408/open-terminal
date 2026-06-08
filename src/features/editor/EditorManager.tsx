import { useCallback, useState, useRef, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { v4 as uuidv4 } from "uuid";
import { EditorPopover } from "./EditorPopover";
import type { EditorPanel, Theme } from "../../types";

interface EditorManagerProps {
  editors: EditorPanel[];
  theme: Theme;
  onEditorsChange: (editors: EditorPanel[]) => void;
}

export const EditorManager = memo(function EditorManager({
  editors,
  theme,
  onEditorsChange,
}: EditorManagerProps) {
  const [focusOrder, setFocusOrder] = useState<string[]>([]);

  // Keep refs to avoid stale closures in callbacks
  const editorsRef = useRef(editors);
  editorsRef.current = editors;
  const onEditorsChangeRef = useRef(onEditorsChange);
  onEditorsChangeRef.current = onEditorsChange;

  const handleFocus = useCallback((id: string) => {
    setFocusOrder((prev) => [...prev.filter((fid) => fid !== id), id]);
  }, []);

  const handleClose = useCallback((id: string) => {
    onEditorsChangeRef.current(
      editorsRef.current.filter((e) => e.id !== id)
    );
    setFocusOrder((prev) => prev.filter((fid) => fid !== id));
  }, []);

  const handleDirtyChange = useCallback((id: string, dirty: boolean) => {
    onEditorsChangeRef.current(
      editorsRef.current.map((e) =>
        e.id === id ? { ...e, isDirty: dirty } : e
      )
    );
  }, []);

  return (
    <>
      {editors.map((panel) => {
        const zBase = 100;
        const zOffset = focusOrder.indexOf(panel.id);
        const z = zBase + (zOffset === -1 ? 0 : zOffset);
        return (
          <EditorPopover
            key={panel.id}
            panel={panel}
            theme={theme}
            onDirtyChange={handleDirtyChange}
            onClose={handleClose}
            onFocus={handleFocus}
            zIndex={z}
          />
        );
      })}
    </>
  );
});

export async function openEditorPanel(
  filePath: string,
  currentEditors: EditorPanel[]
): Promise<EditorPanel[]> {
  const existing = currentEditors.find((e) => e.filePath === filePath);
  if (existing) return currentEditors;

  const content = await invoke<string>("read_file", { path: filePath });

  const offset = currentEditors.length * 30;
  const newPanel: EditorPanel = {
    id: uuidv4(),
    filePath,
    content,
    isDirty: false,
    position: { x: 300 + offset, y: 80 + offset },
    size: { width: 600, height: 400 },
  };

  return [...currentEditors, newPanel];
}
