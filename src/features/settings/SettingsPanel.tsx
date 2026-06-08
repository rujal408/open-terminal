import type { Settings } from "../../types";

interface SettingsPanelProps {
  settings: Settings;
  onUpdate: (partial: Partial<Settings>) => void;
  onClose: () => void;
}

export function SettingsPanel({
  settings,
  onUpdate,
  onClose,
}: SettingsPanelProps) {
  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <h2>Settings</h2>
          <button className="settings-close" onClick={onClose}>
            ×
          </button>
        </div>

        <div className="settings-body">
          <label className="settings-row">
            <span>Theme</span>
            <select
              value={settings.theme}
              onChange={(e) => onUpdate({ theme: e.target.value })}
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </label>

          <label className="settings-row">
            <span>Drag &amp; Drop Path</span>
            <select
              value={settings.drag_drop_path_mode}
              onChange={(e) =>
                onUpdate({
                  drag_drop_path_mode: e.target.value as "absolute" | "relative",
                })
              }
            >
              <option value="absolute">Absolute</option>
              <option value="relative">Relative</option>
            </select>
          </label>

          <label className="settings-row">
            <span>Font Size</span>
            <input
              type="number"
              min={10}
              max={24}
              value={settings.font_size}
              onChange={(e) =>
                onUpdate({ font_size: Number(e.target.value) })
              }
            />
          </label>

          <label className="settings-row">
            <span>Scrollback Lines</span>
            <input
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

          <label className="settings-row">
            <span>Default Shell</span>
            <input
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
