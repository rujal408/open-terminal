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
import { invoke } from "@tauri-apps/api/core";
import { FileIcon } from "../file-tree/FileIcon";
import { buildEditorTheme } from "./editorTheme";
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
      buildEditorTheme(theme),
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

// --- EditorTabBar: shows visible tabs + overflow dropdown ---

const TAB_WIDTH = 140; // approximate width per tab in px
const CONTROLS_WIDTH = 70; // maximize btn + overflow btn + padding
const OVERFLOW_BTN_WIDTH = 32;

interface EditorTabBarProps {
  editors: EditorPanel[];
  activeTabId: string | null;
  maximized: boolean;
  onTabChange: (id: string) => void;
  onCloseTab: (id: string) => void;
  onToggleMaximize: () => void;
  onTabBarMouseDown: ((e: React.MouseEvent) => void) | undefined;
}

function EditorTabBar({
  editors,
  activeTabId,
  maximized,
  onTabChange,
  onCloseTab,
  onToggleMaximize,
  onTabBarMouseDown,
}: EditorTabBarProps) {
  const tabBarRef = useRef<HTMLDivElement>(null);
  const [maxVisibleTabs, setMaxVisibleTabs] = useState(editors.length);
  const [showOverflow, setShowOverflow] = useState(false);
  const overflowRef = useRef<HTMLDivElement>(null);

  // Measure available width and compute how many tabs fit
  useEffect(() => {
    function measure() {
      if (!tabBarRef.current) return;
      const barWidth = tabBarRef.current.clientWidth;
      const available = barWidth - CONTROLS_WIDTH;
      // Reserve space for the overflow button if not all tabs fit
      const fittable = Math.floor(available / TAB_WIDTH);
      if (fittable >= editors.length) {
        setMaxVisibleTabs(editors.length);
      } else {
        // Account for the overflow button taking space
        const adjustedAvailable = available - OVERFLOW_BTN_WIDTH;
        setMaxVisibleTabs(Math.max(1, Math.floor(adjustedAvailable / TAB_WIDTH)));
      }
    }
    measure();
    const observer = new ResizeObserver(measure);
    if (tabBarRef.current) observer.observe(tabBarRef.current);
    return () => observer.disconnect();
  }, [editors.length]);

  // Close overflow dropdown when clicking outside
  useEffect(() => {
    if (!showOverflow) return;
    function handleClick(e: MouseEvent) {
      if (overflowRef.current && !overflowRef.current.contains(e.target as Node)) {
        setShowOverflow(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [showOverflow]);

  // Ensure active tab is always visible: if it would be in the overflow,
  // rearrange so it appears in the visible set.
  const activeIdx = editors.findIndex((e) => e.id === activeTabId);
  let visibleEditors: EditorPanel[];
  let overflowEditors: EditorPanel[];

  if (maxVisibleTabs >= editors.length) {
    visibleEditors = editors;
    overflowEditors = [];
  } else {
    // If active tab is beyond the visible range, swap it into the last visible slot
    const visible = editors.slice(0, maxVisibleTabs);
    const overflow = editors.slice(maxVisibleTabs);

    if (activeIdx >= maxVisibleTabs) {
      // Replace the last visible tab with the active one
      const activePanel = editors[activeIdx];
      const displaced = visible[maxVisibleTabs - 1];
      visible[maxVisibleTabs - 1] = activePanel;
      // Put displaced tab into overflow in its natural order
      const overflowWithDisplaced = [...overflow.filter((e) => e.id !== activePanel.id), displaced];
      visibleEditors = visible;
      overflowEditors = overflowWithDisplaced;
    } else {
      visibleEditors = visible;
      overflowEditors = overflow;
    }
  }

  const hasOverflow = overflowEditors.length > 0;

  return (
    <div
      ref={tabBarRef}
      className="flex items-center bg-tab-bar border-b border-border select-none cursor-grab active:cursor-grabbing"
      onMouseDown={onTabBarMouseDown}
    >
      {/* Visible tabs */}
      <div className="flex-1 flex overflow-hidden">
        {visibleEditors.map((panel) => {
          const fileName = panel.filePath.split("/").pop() || "";
          const isActive = panel.id === activeTabId;
          return (
            <div
              key={panel.id}
              data-tab-button
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[13px] cursor-pointer border-r border-border shrink-0 ${
                isActive
                  ? "bg-editor text-primary border-t-2 border-t-accent"
                  : "bg-tab-bar text-muted hover:bg-tab-active border-t-2 border-t-transparent"
              }`}
              style={{ width: TAB_WIDTH, maxWidth: TAB_WIDTH }}
              onClick={() => onTabChange(panel.id)}
            >
              {panel.isDirty && (
                <span className="text-accent text-[10px] shrink-0">●</span>
              )}
              <FileIcon name={fileName} isDir={false} />
              <span className="truncate flex-1">{fileName}</span>
              <button
                className="ml-auto bg-transparent border-none text-muted cursor-pointer text-sm px-0.5 leading-none hover:text-danger shrink-0"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(panel.id);
                }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      {/* Overflow dropdown + panel controls */}
      <div
        className="flex items-center gap-0.5 px-1.5 shrink-0"
        data-panel-control
      >
        {hasOverflow && (
          <div className="relative" ref={overflowRef}>
            <button
              data-tab-button
              className="bg-transparent border-none text-muted cursor-pointer text-sm px-1.5 py-1 leading-none hover:text-primary hover:bg-border rounded"
              onClick={() => setShowOverflow((prev) => !prev)}
              title={`${overflowEditors.length} more tab${overflowEditors.length > 1 ? "s" : ""}`}
            >
              ⋯
            </button>
            {showOverflow && (
              <div
                className="absolute right-0 top-full mt-1 min-w-[200px] max-w-[300px] max-h-[320px] overflow-y-auto bg-sidebar border border-border rounded-lg shadow-2xl py-1"
                style={{ zIndex: 10000 }}
              >
                {overflowEditors.map((panel) => {
                  const fileName = panel.filePath.split("/").pop() || "";
                  const isActive = panel.id === activeTabId;
                  return (
                    <div
                      key={panel.id}
                      className={`flex items-center gap-2 px-3 py-1.5 text-[13px] cursor-pointer hover:bg-border ${
                        isActive ? "text-primary bg-editor" : "text-muted"
                      }`}
                      onClick={() => {
                        onTabChange(panel.id);
                        setShowOverflow(false);
                      }}
                    >
                      {panel.isDirty && (
                        <span className="text-accent text-[10px] shrink-0">●</span>
                      )}
                      <FileIcon name={fileName} isDir={false} />
                      <span className="truncate flex-1">{fileName}</span>
                      <button
                        className="bg-transparent border-none text-muted cursor-pointer text-sm px-0.5 leading-none hover:text-danger shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          onCloseTab(panel.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <button
          className="bg-transparent border-none text-muted cursor-pointer text-sm px-1 leading-none hover:text-primary"
          onClick={onToggleMaximize}
          title={maximized ? "Restore" : "Maximize"}
        >
          {maximized ? "◱" : "◳"}
        </button>
      </div>
    </div>
  );
}

// --- Main TabbedEditorPanel ---

interface TabbedEditorPanelProps {
  editors: EditorPanel[];
  activeTabId: string | null;
  theme: Theme;
  sidebarWidth: number;
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
  sidebarWidth,
  onTabChange,
  onTabClose,
  onDirtyChange,
}: TabbedEditorPanelProps) {
  const viewsRef = useRef<Map<string, EditorView>>(new Map());
  const panelRef = useRef<HTMLDivElement>(null);

  // Panel geometry — fixed positioning relative to the viewport so the panel
  // escapes any ancestor overflow-hidden clipping (e.g. the content area).
  const [position, setPosition] = useState({ x: 200, y: 120 });
  const [size, setSize] = useState({ width: 650, height: 450 });
  const [maximized, setMaximized] = useState(false);

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
  // Toggles between normal (positioned) and maximized (fills content area).
  // Position/size state is untouched so restoring is instant.
  function handleToggleMaximize() {
    setMaximized((prev) => !prev);
  }

  // Content area insets: icon rail (40) + sidebar content (sidebarWidth-40) + resize handle (4)
  // Top: menu bar (32) + workspace tab bar (36) = 68
  const contentLeft = sidebarWidth + 4;
  const contentTop = 68;

  return (
    <div
      ref={panelRef}
      className={`fixed bg-editor border border-border flex flex-col overflow-hidden shadow-2xl ${
        maximized ? "rounded-none" : "rounded-lg"
      }`}
      style={
        maximized
          ? {
              left: contentLeft,
              top: contentTop,
              right: 0,
              bottom: 0,
              zIndex: 9999,
            }
          : {
              left: position.x,
              top: position.y,
              width: size.width,
              height: size.height,
              zIndex: 9999,
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
      <EditorTabBar
        editors={editors}
        activeTabId={activeTabId}
        maximized={maximized}
        onTabChange={onTabChange}
        onCloseTab={handleCloseTab}
        onToggleMaximize={handleToggleMaximize}
        onTabBarMouseDown={maximized ? undefined : handleTabBarMouseDown}
      />

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
