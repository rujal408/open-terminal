import type { Settings } from "../../types";

interface SettingsPanelProps {
  settings: Settings;
  onUpdate: (partial: Partial<Settings>) => void;
  onClose: () => void;
}

const inputClass =
  "bg-sidebar border border-border text-primary px-2 py-1 rounded text-[13px] w-40";

export function SettingsPanel({
  settings,
  onUpdate,
  onClose,
}: SettingsPanelProps) {
  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-[500]"
      onClick={onClose}
    >
      <div
        className="bg-app border border-border rounded-lg w-[400px] max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h2 className="text-base font-semibold">Settings</h2>
          <button
            className="bg-transparent border-none text-muted cursor-pointer text-lg hover:text-primary"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <div className="p-4 flex flex-col gap-4">
          <label className="flex items-center justify-between text-sm">
            <span>Theme</span>
            <select
              className={inputClass}
              value={settings.theme}
              onChange={(e) => onUpdate({ theme: e.target.value })}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </label>

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
  );
}
