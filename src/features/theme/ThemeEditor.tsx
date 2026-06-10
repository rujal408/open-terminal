import { useState, useCallback, useEffect, memo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { Theme } from "../../types";
import { darkTheme, lightTheme } from "./themes";

interface ThemeEditorProps {
  /** If editing an existing custom theme, pass it. Null = creating new. */
  editingTheme: Theme | null;
  onSave: (theme: Theme) => void;
  onCancel: () => void;
  onPreview: (theme: Theme) => void;
}

type Tab = "visual" | "json";

// Color field groups for the visual editor
const COLOR_GROUPS: { label: string; fields: { key: string; label: string }[] }[] = [
  {
    label: "App",
    fields: [
      { key: "background", label: "Background" },
      { key: "sidebar", label: "Sidebar" },
      { key: "tabBar", label: "Tab Bar" },
      { key: "tabActive", label: "Tab Active" },
      { key: "tabInactive", label: "Tab Inactive" },
      { key: "border", label: "Border" },
      { key: "accent", label: "Accent" },
    ],
  },
  {
    label: "Text",
    fields: [
      { key: "text", label: "Primary" },
      { key: "textMuted", label: "Muted" },
    ],
  },
  {
    label: "Terminal",
    fields: [
      { key: "terminalBg", label: "Background" },
      { key: "terminalFg", label: "Foreground" },
      { key: "terminalCursor", label: "Cursor" },
    ],
  },
  {
    label: "Editor",
    fields: [
      { key: "editorBg", label: "Background" },
      { key: "editorFg", label: "Foreground" },
      { key: "editorLineNumber", label: "Line Number" },
      { key: "editorSelection", label: "Selection" },
    ],
  },
  {
    label: "Git",
    fields: [
      { key: "gitAdded", label: "Added" },
      { key: "gitModified", label: "Modified" },
      { key: "gitDeleted", label: "Deleted" },
      { key: "gitUntracked", label: "Untracked" },
      { key: "gitConflicted", label: "Conflicted" },
    ],
  },
];

const ANSI_LABELS = [
  "Black", "Red", "Green", "Yellow", "Blue", "Magenta", "Cyan", "White",
  "Bright Black", "Bright Red", "Bright Green", "Bright Yellow",
  "Bright Blue", "Bright Magenta", "Bright Cyan", "Bright White",
];

function cloneTheme(t: Theme): Theme {
  return { ...t, colors: { ...t.colors, ansi: [...t.colors.ansi] } };
}

function validateTheme(obj: unknown): obj is Theme {
  if (!obj || typeof obj !== "object") return false;
  const t = obj as Record<string, unknown>;
  if (typeof t.name !== "string" || !t.name) return false;
  if (t.type !== "dark" && t.type !== "light") return false;
  if (!t.colors || typeof t.colors !== "object") return false;
  const c = t.colors as Record<string, unknown>;
  // Check required string fields
  for (const group of COLOR_GROUPS) {
    for (const field of group.fields) {
      if (typeof c[field.key] !== "string") return false;
    }
  }
  if (!Array.isArray(c.ansi) || c.ansi.length !== 16) return false;
  return true;
}

const inputCls =
  "w-full bg-app border border-border rounded text-primary text-[13px] px-2 py-1 outline-none focus:border-accent";

export const ThemeEditor = memo(function ThemeEditor({
  editingTheme,
  onSave,
  onCancel,
  onPreview,
}: ThemeEditorProps) {
  const base = editingTheme ?? cloneTheme(darkTheme);
  const [draft, setDraft] = useState<Theme>(() => cloneTheme(base));
  const [tab, setTab] = useState<Tab>("visual");
  const [jsonText, setJsonText] = useState("");
  const [jsonError, setJsonError] = useState<string | null>(null);

  // Sync json text when switching to JSON tab or when draft changes while on visual
  useEffect(() => {
    if (tab === "json") {
      setJsonText(JSON.stringify(draft, null, 2));
      setJsonError(null);
    }
  }, [tab]);

  // Live preview
  useEffect(() => {
    onPreview(draft);
  }, [draft, onPreview]);

  const updateColor = useCallback((key: string, value: string) => {
    setDraft((prev) => ({
      ...prev,
      colors: { ...prev.colors, [key]: value },
    }));
  }, []);

  const updateAnsi = useCallback((index: number, value: string) => {
    setDraft((prev) => {
      const ansi = [...prev.colors.ansi];
      ansi[index] = value;
      return { ...prev, colors: { ...prev.colors, ansi } };
    });
  }, []);

  const handleJsonChange = useCallback((text: string) => {
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      if (validateTheme(parsed)) {
        setDraft(cloneTheme(parsed as Theme));
        setJsonError(null);
      } else {
        setJsonError("Invalid theme structure — check required fields");
      }
    } catch (e) {
      setJsonError("Invalid JSON syntax");
    }
  }, []);

  const handleBaseChange = useCallback((baseName: string) => {
    const baseTheme = baseName === "light" ? lightTheme : darkTheme;
    setDraft((prev) => ({
      ...cloneTheme(baseTheme),
      name: prev.name,
    }));
  }, []);

  const handleImport = useCallback(async () => {
    const path = await open({
      filters: [{ name: "JSON", extensions: ["json"] }],
      multiple: false,
    });
    if (!path) return;
    try {
      const content = await invoke<string>("read_file", { path });
      const parsed = JSON.parse(content);
      if (validateTheme(parsed)) {
        setDraft(cloneTheme(parsed as Theme));
        setJsonText(JSON.stringify(parsed, null, 2));
        setJsonError(null);
      } else {
        setJsonError("Imported file has invalid theme structure");
      }
    } catch {
      setJsonError("Failed to read or parse file");
    }
  }, []);

  const handleExport = useCallback(async () => {
    const path = await save({
      defaultPath: `${draft.name || "theme"}.json`,
      filters: [{ name: "JSON", extensions: ["json"] }],
    });
    if (!path) return;
    try {
      await invoke("write_file", {
        path,
        content: JSON.stringify(draft, null, 2),
      });
    } catch {
      // silent
    }
  }, [draft]);

  const handleSave = useCallback(() => {
    if (!draft.name.trim()) return;
    onSave(draft);
  }, [draft, onSave]);

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div
        className="flex flex-col bg-sidebar border border-border rounded-lg shadow-lg overflow-hidden"
        style={{ width: 560, maxHeight: "85vh" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-sm font-semibold text-primary">
            {editingTheme ? "Edit Theme" : "New Theme"}
          </h2>
          <button
            onClick={onCancel}
            className="bg-transparent border-none text-muted cursor-pointer text-lg hover:text-primary"
          >
            x
          </button>
        </div>

        {/* Name + Base */}
        <div className="flex gap-2 px-4 py-2 border-b border-border">
          <div className="flex-1">
            <label className="text-[11px] text-muted uppercase tracking-wider block mb-0.5">
              Theme Name
            </label>
            <input
              value={draft.name}
              onChange={(e) =>
                setDraft((prev) => ({ ...prev, name: e.target.value }))
              }
              placeholder="My Theme"
              className={inputCls}
            />
          </div>
          <div className="w-28">
            <label className="text-[11px] text-muted uppercase tracking-wider block mb-0.5">
              Base
            </label>
            <select
              value={draft.type}
              onChange={(e) => handleBaseChange(e.target.value)}
              className={inputCls}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setTab("visual")}
            className={`flex-1 py-1.5 text-xs border-none cursor-pointer ${
              tab === "visual"
                ? "bg-app text-primary font-semibold"
                : "bg-transparent text-muted hover:text-primary"
            }`}
          >
            Visual
          </button>
          <button
            onClick={() => setTab("json")}
            className={`flex-1 py-1.5 text-xs border-none cursor-pointer ${
              tab === "json"
                ? "bg-app text-primary font-semibold"
                : "bg-transparent text-muted hover:text-primary"
            }`}
          >
            JSON
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {tab === "visual" && (
            <div className="px-4 py-2">
              {COLOR_GROUPS.map((group) => (
                <div key={group.label} className="mb-3">
                  <h3 className="text-[11px] text-muted uppercase tracking-wider font-semibold mb-1">
                    {group.label}
                  </h3>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                    {group.fields.map((field) => (
                      <label
                        key={field.key}
                        className="flex items-center gap-2 text-[12px] text-primary"
                      >
                        <input
                          type="color"
                          value={
                            (draft.colors as Record<string, unknown>)[
                              field.key
                            ] as string
                          }
                          onChange={(e) =>
                            updateColor(field.key, e.target.value)
                          }
                          className="w-6 h-6 border border-border rounded cursor-pointer p-0"
                        />
                        {field.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}

              {/* ANSI Colors */}
              <div className="mb-3">
                <h3 className="text-[11px] text-muted uppercase tracking-wider font-semibold mb-1">
                  Terminal ANSI (16 colors)
                </h3>
                <div className="grid grid-cols-4 gap-x-3 gap-y-1">
                  {ANSI_LABELS.map((label, i) => (
                    <label
                      key={i}
                      className="flex items-center gap-1 text-[11px] text-primary"
                    >
                      <input
                        type="color"
                        value={draft.colors.ansi[i]}
                        onChange={(e) => updateAnsi(i, e.target.value)}
                        className="w-5 h-5 border border-border rounded cursor-pointer p-0"
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {tab === "json" && (
            <div className="px-4 py-2 flex flex-col gap-2">
              <div className="flex gap-2">
                <button
                  onClick={handleImport}
                  className="text-xs bg-transparent border border-border rounded text-muted px-2 py-1 cursor-pointer hover:text-primary hover:border-accent"
                >
                  Import .json
                </button>
                <button
                  onClick={handleExport}
                  className="text-xs bg-transparent border border-border rounded text-muted px-2 py-1 cursor-pointer hover:text-primary hover:border-accent"
                >
                  Export .json
                </button>
              </div>
              <textarea
                value={jsonText}
                onChange={(e) => handleJsonChange(e.target.value)}
                spellCheck={false}
                className="w-full bg-app border border-border rounded text-primary text-[12px] font-mono px-3 py-2 resize-none outline-none focus:border-accent"
                style={{ minHeight: 320 }}
              />
              {jsonError && (
                <p className="text-danger text-[11px] m-0">{jsonError}</p>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-2 border-t border-border">
          <button
            onClick={onCancel}
            className="text-xs bg-transparent border border-border rounded text-muted px-3 py-1.5 cursor-pointer hover:text-primary"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!draft.name.trim()}
            className="text-xs bg-accent border-none rounded text-app px-3 py-1.5 cursor-pointer font-medium disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90"
          >
            Save Theme
          </button>
        </div>
      </div>
    </div>
  );
});
