import { useRef, useEffect, useState, useCallback } from "react";
import { EditorView, basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import type { ViewUpdate } from "@codemirror/view";
import { javascript } from "@codemirror/lang-javascript";
import { rust } from "@codemirror/lang-rust";
import { json } from "@codemirror/lang-json";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import { markdown } from "@codemirror/lang-markdown";
import { oneDark } from "@codemirror/theme-one-dark";
import { invoke } from "@tauri-apps/api/core";
import type { EditorPanel, Theme } from "../../types";

function languageFromPath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  switch (ext) {
    case "js":
    case "jsx":
      return javascript({ jsx: true });
    case "ts":
    case "tsx":
      return javascript({ jsx: true, typescript: true });
    case "rs":
      return rust();
    case "json":
      return json();
    case "css":
      return css();
    case "html":
      return html();
    case "md":
      return markdown();
    default:
      return [];
  }
}

interface EditorPopoverProps {
  panel: EditorPanel;
  theme: Theme;
  onDirtyChange: (id: string, dirty: boolean) => void;
  onClose: (id: string) => void;
  onFocus: (id: string) => void;
  zIndex: number;
}

export function EditorPopover({
  panel,
  theme,
  onDirtyChange,
  onClose,
  onFocus,
  zIndex,
}: EditorPopoverProps) {
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [position, setPosition] = useState(panel.position);
  const [size] = useState(panel.size);
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const fileName = panel.filePath.split("/").pop() || "";

  useEffect(() => {
    if (!editorContainerRef.current) return;

    const extensions = [
      basicSetup,
      languageFromPath(panel.filePath),
      theme.type === "dark" ? oneDark : [],
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged) {
          setIsDirty(true);
          onDirtyChange(panel.id, true);
        }
      }),
    ].flat();

    const state = EditorState.create({
      doc: panel.content,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: editorContainerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
    };
  }, [panel.id, panel.content, panel.filePath, theme.type]);

  const save = useCallback(async () => {
    if (!viewRef.current) return;
    const content = viewRef.current.state.doc.toString();
    await invoke("write_file", { path: panel.filePath, content });
    setIsDirty(false);
    onDirtyChange(panel.id, false);
  }, [panel.id, panel.filePath, onDirtyChange]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
      if (e.key === "Escape") {
        handleClose();
      }
    }
    const container = editorContainerRef.current?.parentElement;
    container?.addEventListener("keydown", handleKeyDown);
    return () => container?.removeEventListener("keydown", handleKeyDown);
  }, [save]);

  function handleClose() {
    if (isDirty) {
      const choice = window.confirm(
        `Save changes to ${fileName}?\n\nOK = Save, Cancel = Discard`
      );
      if (choice) {
        save().then(() => onClose(panel.id));
        return;
      }
    }
    onClose(panel.id);
  }

  function handleMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest(".editor-close")) return;
    draggingRef.current = true;
    dragOffsetRef.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };

    function handleMouseMove(e: MouseEvent) {
      if (!draggingRef.current) return;
      setPosition({
        x: e.clientX - dragOffsetRef.current.x,
        y: e.clientY - dragOffsetRef.current.y,
      });
    }

    function handleMouseUp() {
      draggingRef.current = false;
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  return (
    <div
      className="editor-popover"
      style={{
        left: position.x,
        top: position.y,
        width: size.width,
        height: size.height,
        zIndex,
      }}
      onMouseDown={() => onFocus(panel.id)}
    >
      <div className="editor-title-bar" onMouseDown={handleMouseDown}>
        <span className="editor-filename">
          {isDirty && <span className="editor-dirty">●</span>}
          {fileName}
        </span>
        <button className="editor-close" onClick={handleClose}>
          ×
        </button>
      </div>
      <div ref={editorContainerRef} className="editor-body" />
    </div>
  );
}
