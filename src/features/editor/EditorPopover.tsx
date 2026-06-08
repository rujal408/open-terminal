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
import { FileIcon } from "../file-tree/FileIcon";
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

type ResizeEdge = "e" | "s" | "w" | "n" | "se" | "sw" | "ne" | "nw";

interface EditorPopoverProps {
  panel: EditorPanel;
  theme: Theme;
  onDirtyChange: (id: string, dirty: boolean) => void;
  onClose: (id: string) => void;
  onFocus: (id: string) => void;
  zIndex: number;
}

const MIN_WIDTH = 250;
const MIN_HEIGHT = 150;

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
  const [size, setSize] = useState(panel.size);
  const [maximized, setMaximized] = useState(false);
  const preMaxRef = useRef<{
    position: typeof panel.position;
    size: typeof panel.size;
  } | null>(null);
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;

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
          onDirtyChangeRef.current(panel.id, true);
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
    onDirtyChangeRef.current(panel.id, false);
  }, [panel.id, panel.filePath]);

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

  function handleTitleMouseDown(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("[data-close]")) return;
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

  function handleResizeStart(e: React.MouseEvent, edge: ResizeEdge) {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = size.width;
    const startH = size.height;
    const startLeft = position.x;
    const startTop = position.y;

    function handleMouseMove(e: MouseEvent) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;

      let newW = startW;
      let newH = startH;
      let newX = startLeft;
      let newY = startTop;

      if (edge.includes("e")) newW = Math.max(MIN_WIDTH, startW + dx);
      if (edge.includes("s")) newH = Math.max(MIN_HEIGHT, startH + dy);
      if (edge.includes("w")) {
        newW = Math.max(MIN_WIDTH, startW - dx);
        if (newW > MIN_WIDTH) newX = startLeft + dx;
      }
      if (edge.includes("n")) {
        newH = Math.max(MIN_HEIGHT, startH - dy);
        if (newH > MIN_HEIGHT) newY = startTop + dy;
      }

      setSize({ width: newW, height: newH });
      setPosition({ x: newX, y: newY });
    }

    function handleMouseUp() {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    }

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
  }

  function handleToggleMaximize() {
    if (maximized) {
      if (preMaxRef.current) {
        setPosition(preMaxRef.current.position);
        setSize(preMaxRef.current.size);
      }
      preMaxRef.current = null;
      setMaximized(false);
    } else {
      preMaxRef.current = { position, size };
      setPosition({ x: 0, y: 0 });
      setSize({ width: 99999, height: 99999 });
      setMaximized(true);
    }
  }

  return (
    <div
      className={`absolute bg-editor border border-border flex flex-col overflow-hidden shadow-2xl ${
        maximized ? "rounded-none" : "rounded-lg"
      }`}
      style={
        maximized
          ? { left: 0, top: 0, width: "100%", height: "100%", zIndex }
          : {
              left: position.x,
              top: position.y,
              width: size.width,
              height: size.height,
              zIndex,
            }
      }
      onMouseDown={() => onFocus(panel.id)}
    >
      {!maximized && (
        <>
          <div className="resize-edge resize-n" onMouseDown={(e) => handleResizeStart(e, "n")} />
          <div className="resize-edge resize-s" onMouseDown={(e) => handleResizeStart(e, "s")} />
          <div className="resize-edge resize-e" onMouseDown={(e) => handleResizeStart(e, "e")} />
          <div className="resize-edge resize-w" onMouseDown={(e) => handleResizeStart(e, "w")} />
          <div className="resize-corner resize-nw" onMouseDown={(e) => handleResizeStart(e, "nw")} />
          <div className="resize-corner resize-ne" onMouseDown={(e) => handleResizeStart(e, "ne")} />
          <div className="resize-corner resize-sw" onMouseDown={(e) => handleResizeStart(e, "sw")} />
          <div className="resize-corner resize-se" onMouseDown={(e) => handleResizeStart(e, "se")} />
        </>
      )}

      <div
        className="flex items-center justify-between px-2.5 py-1.5 bg-tab-bar border-b border-border cursor-grab active:cursor-grabbing select-none text-[13px]"
        onMouseDown={maximized ? undefined : handleTitleMouseDown}
      >
        <span className="flex items-center gap-1.5 text-primary">
          {isDirty && <span className="text-accent text-[10px]">●</span>}
          <FileIcon name={fileName} isDir={false} />
          {fileName}
        </span>
        <div className="flex items-center gap-1">
          <button
            className="bg-transparent border-none text-muted cursor-pointer text-sm px-1 leading-none hover:text-primary"
            onClick={handleToggleMaximize}
            title={maximized ? "Restore" : "Maximize"}
          >
            {maximized ? "◱" : "◳"}
          </button>
          <button
            data-close
            className="bg-transparent border-none text-muted cursor-pointer text-sm px-1 leading-none hover:text-danger"
            onClick={handleClose}
          >
            ×
          </button>
        </div>
      </div>
      <div ref={editorContainerRef} className="editor-body flex-1 overflow-auto" />
    </div>
  );
}
