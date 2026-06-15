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

// --- EditorTabContent: one per open file, manages its own CodeMirror view ---

interface EditorTabContentProps {
  panel: EditorPanel;
  theme: Theme;
  isActive: boolean;
  viewsRef: React.MutableRefObject<Map<string, EditorView>>;
  onDirtyChange: (id: string, dirty: boolean) => void;
}

function EditorTabContent({
  panel,
  theme,
  isActive,
  viewsRef,
  onDirtyChange,
}: EditorTabContentProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [hasBeenActive, setHasBeenActive] = useState(isActive);
  const onDirtyChangeRef = useRef(onDirtyChange);
  onDirtyChangeRef.current = onDirtyChange;

  useEffect(() => {
    if (isActive && !hasBeenActive) setHasBeenActive(true);
  }, [isActive, hasBeenActive]);

  useEffect(() => {
    if (!hasBeenActive || !containerRef.current) return;

    const extensions = [
      basicSetup,
      languageFromPath(panel.filePath),
      theme.type === "dark" ? oneDark : [],
      EditorView.updateListener.of((update: ViewUpdate) => {
        if (update.docChanged) {
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
      parent: containerRef.current,
    });

    viewRef.current = view;
    viewsRef.current.set(panel.id, view);

    return () => {
      view.destroy();
      viewsRef.current.delete(panel.id);
      viewRef.current = null;
    };
  }, [hasBeenActive, panel.id, panel.content, panel.filePath, theme.type, viewsRef]);

  // Re-measure when becoming visible after being hidden
  useEffect(() => {
    if (isActive && viewRef.current) {
      viewRef.current.requestMeasure();
    }
  }, [isActive]);

  if (!hasBeenActive) return null;

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 editor-body overflow-auto"
      style={{ display: isActive ? "block" : "none" }}
    />
  );
}

// --- Main TabbedEditorPanel ---

interface TabbedEditorPanelProps {
  editors: EditorPanel[];
  activeTabId: string | null;
  theme: Theme;
  onTabChange: (id: string) => void;
  onTabClose: (id: string) => void;
  onDirtyChange: (id: string, dirty: boolean) => void;
}

const MIN_WIDTH = 350;
const MIN_HEIGHT = 200;

export function TabbedEditorPanel({
  editors,
  activeTabId,
  theme,
  onTabChange,
  onTabClose,
  onDirtyChange,
}: TabbedEditorPanelProps) {
  const viewsRef = useRef<Map<string, EditorView>>(new Map());
  const panelRef = useRef<HTMLDivElement>(null);

  // Panel geometry
  const [position, setPosition] = useState({ x: 200, y: 50 });
  const [size, setSize] = useState({ width: 650, height: 450 });
  const [maximized, setMaximized] = useState(false);
  const preMaxRef = useRef<{
    position: typeof position;
    size: typeof size;
  } | null>(null);

  // Dragging
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  // Local dirty tracking for immediate close-confirmation checks
  const dirtySetRef = useRef<Set<string>>(new Set());

  const handleDirtyChange = useCallback(
    (id: string, dirty: boolean) => {
      if (dirty) dirtySetRef.current.add(id);
      else dirtySetRef.current.delete(id);
      onDirtyChange(id, dirty);
    },
    [onDirtyChange]
  );

  // Keep editors ref current for stable callbacks
  const editorsRef = useRef(editors);
  editorsRef.current = editors;

  // Save a tab's content to disk
  const saveTab = useCallback(
    async (tabId: string) => {
      const view = viewsRef.current.get(tabId);
      const panel = editorsRef.current.find((e) => e.id === tabId);
      if (!view || !panel) return;
      const content = view.state.doc.toString();
      await invoke("write_file", { path: panel.filePath, content });
      dirtySetRef.current.delete(tabId);
      onDirtyChange(tabId, false);
    },
    [onDirtyChange]
  );

  // Close a tab with dirty check
  const handleCloseTab = useCallback(
    (id: string) => {
      if (dirtySetRef.current.has(id)) {
        const panel = editorsRef.current.find((e) => e.id === id);
        const fileName = panel?.filePath.split("/").pop() || "";
        const choice = window.confirm(
          `Save changes to ${fileName}?\n\nOK = Save, Cancel = Discard`
        );
        if (choice) {
          saveTab(id).then(() => onTabClose(id));
          return;
        }
      }
      onTabClose(id);
    },
    [saveTab, onTabClose]
  );

  // Ctrl+S saves active tab
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!panelRef.current?.contains(e.target as Node)) return;
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (activeTabId) saveTab(activeTabId);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [activeTabId, saveTab]);

  // --- Drag ---
  function handleTabBarMouseDown(e: React.MouseEvent) {
    if (
      (e.target as HTMLElement).closest("[data-tab-button]") ||
      (e.target as HTMLElement).closest("[data-panel-control]")
    )
      return;
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

  // --- Resize ---
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

  // --- Maximize ---
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
      ref={panelRef}
      className={`absolute bg-editor border border-border flex flex-col overflow-hidden shadow-2xl ${
        maximized ? "rounded-none" : "rounded-lg"
      }`}
      style={
        maximized
          ? { left: 0, top: 0, width: "100%", height: "100%", zIndex: 500 }
          : {
              left: position.x,
              top: position.y,
              width: size.width,
              height: size.height,
              zIndex: 500,
            }
      }
    >
      {/* Resize edges */}
      {!maximized && (
        <>
          <div
            className="resize-edge resize-n"
            onMouseDown={(e) => handleResizeStart(e, "n")}
          />
          <div
            className="resize-edge resize-s"
            onMouseDown={(e) => handleResizeStart(e, "s")}
          />
          <div
            className="resize-edge resize-e"
            onMouseDown={(e) => handleResizeStart(e, "e")}
          />
          <div
            className="resize-edge resize-w"
            onMouseDown={(e) => handleResizeStart(e, "w")}
          />
          <div
            className="resize-corner resize-nw"
            onMouseDown={(e) => handleResizeStart(e, "nw")}
          />
          <div
            className="resize-corner resize-ne"
            onMouseDown={(e) => handleResizeStart(e, "ne")}
          />
          <div
            className="resize-corner resize-sw"
            onMouseDown={(e) => handleResizeStart(e, "sw")}
          />
          <div
            className="resize-corner resize-se"
            onMouseDown={(e) => handleResizeStart(e, "se")}
          />
        </>
      )}

      {/* Tab bar — draggable by empty space */}
      <div
        className="flex items-center bg-tab-bar border-b border-border select-none cursor-grab active:cursor-grabbing"
        onMouseDown={maximized ? undefined : handleTabBarMouseDown}
      >
        <div className="flex-1 flex overflow-x-auto tabs-scrollbar-hide">
          {editors.map((panel) => {
            const fileName = panel.filePath.split("/").pop() || "";
            const isActive = panel.id === activeTabId;
            return (
              <div
                key={panel.id}
                data-tab-button
                className={`flex items-center gap-1.5 px-3 py-1.5 text-[13px] cursor-pointer border-r border-border shrink-0 max-w-[160px] ${
                  isActive
                    ? "bg-editor text-primary border-t-2 border-t-accent"
                    : "bg-tab-bar text-muted hover:bg-tab-active border-t-2 border-t-transparent"
                }`}
                onClick={() => onTabChange(panel.id)}
              >
                {panel.isDirty && (
                  <span className="text-accent text-[10px] shrink-0">●</span>
                )}
                <FileIcon name={fileName} isDir={false} />
                <span className="truncate">{fileName}</span>
                <button
                  className="ml-auto bg-transparent border-none text-muted cursor-pointer text-sm px-0.5 leading-none hover:text-danger shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCloseTab(panel.id);
                  }}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>

        {/* Panel controls */}
        <div
          className="flex items-center gap-1 px-2 shrink-0"
          data-panel-control
        >
          <button
            className="bg-transparent border-none text-muted cursor-pointer text-sm px-1 leading-none hover:text-primary"
            onClick={handleToggleMaximize}
            title={maximized ? "Restore" : "Maximize"}
          >
            {maximized ? "◱" : "◳"}
          </button>
        </div>
      </div>

      {/* Editor area — one CodeMirror container per tab, only active visible */}
      <div className="flex-1 relative overflow-hidden">
        {editors.map((panel) => (
          <EditorTabContent
            key={panel.id}
            panel={panel}
            theme={theme}
            isActive={panel.id === activeTabId}
            viewsRef={viewsRef}
            onDirtyChange={handleDirtyChange}
          />
        ))}
      </div>
    </div>
  );
}
