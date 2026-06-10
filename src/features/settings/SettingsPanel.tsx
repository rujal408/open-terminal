import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useThemeContext } from "../theme/ThemeProvider";
import { ThemeEditor } from "../theme/ThemeEditor";
import type { Settings, Theme } from "../../types";

interface SettingsPanelProps {
  settings: Settings;
  onUpdate: (partial: Partial<Settings>) => void;
  onClose: () => void;
}

const inputClass =
  "border border-border text-primary px-2 py-1 rounded text-[13px] w-40";

export function SettingsPanel({
  settings,
  onUpdate,
  onClose,
}: SettingsPanelProps) {
  const {
    theme: currentTheme,
    setTheme,
    setThemeObject,
    customThemes,
    reloadCustomThemes,
  } = useThemeContext();

  const [editorOpen, setEditorOpen] = useState(false);
  const [editingTheme, setEditingTheme] = useState<Theme | null>(null);
  // Snapshot the theme before opening editor so we can restore on cancel
  const [preEditTheme, setPreEditTheme] = useState<Theme | null>(null);

  const handleNewTheme = useCallback(() => {
    setEditingTheme(null);
    setPreEditTheme(currentTheme);
    setEditorOpen(true);
  }, [currentTheme]);

  const handleEditTheme = useCallback(
    (t: Theme) => {
      setEditingTheme(t);
      setPreEditTheme(currentTheme);
      setEditorOpen(true);
    },
    [currentTheme]
  );

  const handleDeleteTheme = useCallback(
    async (name: string) => {
      if (!confirm(`Delete theme "${name}"?`)) return;
      await invoke("delete_custom_theme", { name });
      await reloadCustomThemes();
      // If deleted theme was selected, fall back to dark
      if (settings.theme === name) {
        onUpdate({ theme: "dark" });
        setTheme("dark");
      }
    },
    [settings.theme, onUpdate, setTheme, reloadCustomThemes]
  );

  const handleEditorSave = useCallback(
    async (theme: Theme) => {
      await invoke("save_custom_theme", { theme });
      await reloadCustomThemes();
      onUpdate({ theme: theme.name });
      setTheme(theme.name);
      setEditorOpen(false);
    },
    [onUpdate, setTheme, reloadCustomThemes]
  );

  const handleEditorCancel = useCallback(() => {
    // Restore the theme that was active before opening editor
    if (preEditTheme) setThemeObject(preEditTheme);
    setEditorOpen(false);
  }, [preEditTheme, setThemeObject]);

  const handleEditorPreview = useCallback(
    (t: Theme) => {
      setThemeObject(t);
    },
    [setThemeObject]
  );

  const isCustom = (name: string) =>
    name !== "dark" && name !== "Dark" && name !== "light" && name !== "Light";

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 flex items-center justify-center z-[500]"
        onClick={onClose}
      >
        <div
          className="bg-app border border-border rounded-lg w-[420px] max-h-[80vh] overflow-y-auto"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-base font-semibold">Settings</h2>
            <button
              className="bg-transparent border-none text-muted cursor-pointer text-lg hover:text-primary"
              onClick={onClose}
            >
              x
            </button>
          </div>

          <div className="p-4 flex flex-col gap-4">
            {/* Theme selector */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm">Theme</span>
                <button
                  onClick={handleNewTheme}
                  className="text-[11px] bg-transparent border border-border rounded text-accent px-2 py-0.5 cursor-pointer hover:border-accent"
                >
                  + New Theme
                </button>
              </div>
              <select
                className={inputClass + " w-full"}
                value={settings.theme}
                onChange={(e) => {
                  onUpdate({ theme: e.target.value });
                  setTheme(e.target.value);
                }}
              >
                <optgroup label="Built-in">
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </optgroup>
                {customThemes.length > 0 && (
                  <optgroup label="Custom">
                    {customThemes.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>

              {/* Custom theme actions */}
              {isCustom(settings.theme) && (
                <div className="flex gap-2 mt-1">
                  <button
                    onClick={() => {
                      const t = customThemes.find(
                        (ct) => ct.name === settings.theme
                      );
                      if (t) handleEditTheme(t);
                    }}
                    className="text-[11px] bg-transparent border-none text-accent cursor-pointer hover:underline p-0"
                  >
                    Edit
                  </button>
                  <button
                    onClick={() => handleDeleteTheme(settings.theme)}
                    className="text-[11px] bg-transparent border-none text-danger cursor-pointer hover:underline p-0"
                  >
                    Delete
                  </button>
                </div>
              )}
            </div>

            <label className="flex items-center justify-between text-sm">
              <span>Drag & Drop Path</span>
              <select
                className={inputClass}
                value={settings.drag_drop_path_mode}
                onChange={(e) =>
                  onUpdate({
                    drag_drop_path_mode: e.target.value as
                      | "absolute"
                      | "relative",
                  })
                }
              >
                <option value="absolute">Absolute</option>
                <option value="relative">Relative</option>
              </select>
            </label>

            <label className="flex items-center justify-between text-sm">
              <span>Font Size</span>
              <input
                className={inputClass}
                type="number"
                min={10}
                max={24}
                value={settings.font_size}
                onChange={(e) =>
                  onUpdate({ font_size: Number(e.target.value) })
                }
              />
            </label>

            <label className="flex items-center justify-between text-sm">
              <span>Scrollback Lines</span>
              <input
                className={inputClass}
                type="number"
                min={1000}
                max={50000}
                step={1000}
                value={settings.terminal_scrollback}
                onChange={(e) =>
                  onUpdate({ terminal_scrollback: Number(e.target.value) })
                }
              />
            </label>

            <label className="flex items-center justify-between text-sm">
              <span>Default Shell</span>
              <input
                className={inputClass}
                type="text"
                placeholder="Auto-detect"
                value={settings.default_shell || ""}
                onChange={(e) =>
                  onUpdate({
                    default_shell: e.target.value || null,
                  })
                }
              />
            </label>
          </div>
        </div>
      </div>

      {editorOpen && (
        <ThemeEditor
          editingTheme={editingTheme}
          onSave={handleEditorSave}
          onCancel={handleEditorCancel}
          onPreview={handleEditorPreview}
        />
      )}
    </>
  );
}
