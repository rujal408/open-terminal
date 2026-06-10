import { useState, useEffect, useRef, memo } from "react";

/**
 * A single entry inside a dropdown menu.
 * - `label` + optional `shortcut` are displayed as text.
 * - `action` fires when the item is clicked.
 * - If `separator` is true the item renders as a horizontal divider instead.
 */
interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  separator?: boolean;
}

/** A top-level menu heading (e.g. "File") with its dropdown items. */
interface Menu {
  label: string;
  items: MenuItem[];
}

interface MenuBarProps {
  onOpenFolder: () => void;
  onNewTab: () => void;
  onCloseTab: () => void;
  onOpenSettings: () => void;
}

export const MenuBar = memo(function MenuBar({
  onOpenFolder,
  onNewTab,
  onCloseTab,
  onOpenSettings,
}: MenuBarProps) {
  // Tracks which top-level menu is currently open by its index.
  // `null` means all menus are closed.
  const [openMenu, setOpenMenu] = useState<number | null>(null);
  // Ref to the entire menu bar element, used to detect outside clicks.
  const barRef = useRef<HTMLDivElement>(null);

  const menus: Menu[] = [
    {
      label: "File",
      items: [
        { label: "Open Folder...", shortcut: "Ctrl+O", action: onOpenFolder },
        { label: "New Tab", shortcut: "Ctrl+T", action: onNewTab },
        { label: "Close Tab", shortcut: "Ctrl+W", action: onCloseTab },
        { label: "", separator: true },
        { label: "Settings", shortcut: "Ctrl+,", action: onOpenSettings },
      ],
    },
    {
      label: "Edit",
      items: [
        {
          label: "Copy",
          shortcut: "Ctrl+C",
          action: () => document.execCommand("copy"),
        },
        {
          label: "Paste",
          shortcut: "Ctrl+V",
          action: () => document.execCommand("paste"),
        },
      ],
    },
    // View and Terminal menus use CustomEvent to communicate with
    // WorkspaceView. This decouples MenuBar from workspace internals --
    // WorkspaceView listens for these events and handles them locally
    // (e.g. switching sidebar tab or splitting the terminal pane).
    {
      label: "View",
      items: [
        {
          label: "Explorer",
          shortcut: "Ctrl+Shift+E",
          action: () =>
            window.dispatchEvent(
              new CustomEvent("menu:sidebar", { detail: "files" })
            ),
        },
        {
          label: "Source Control",
          shortcut: "Ctrl+Shift+G",
          action: () =>
            window.dispatchEvent(
              new CustomEvent("menu:sidebar", { detail: "git" })
            ),
        },
      ],
    },
    {
      label: "Terminal",
      items: [
        { label: "New Tab", shortcut: "Ctrl+T", action: onNewTab },
        {
          label: "Split Terminal",
          action: () =>
            window.dispatchEvent(new CustomEvent("menu:split-terminal")),
        },
      ],
    },
    {
      label: "Help",
      items: [
        {
          label: "About Open Terminal",
          action: () =>
            window.dispatchEvent(new CustomEvent("menu:about")),
        },
      ],
    },
  ];

  // Close the dropdown when the user clicks anywhere outside the menu bar
  // or presses Escape. Listeners are only attached while a menu is open
  // (openMenu !== null) to avoid unnecessary global event handling.
  useEffect(() => {
    if (openMenu === null) return;

    function handleClick(e: MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
    }

    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenMenu(null);
    }

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [openMenu]);

  // Register global keyboard shortcuts so they work regardless of which
  // element has focus. These mirror the shortcuts shown in the menu items.
  // The effect re-subscribes whenever the action callbacks change identity
  // (which is fine because the parent memo's them).
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const ctrl = e.ctrlKey || e.metaKey;
      if (!ctrl) return;

      if (e.key === "o" && !e.shiftKey) {
        e.preventDefault();
        onOpenFolder();
      } else if (e.key === "t" && !e.shiftKey) {
        e.preventDefault();
        onNewTab();
      } else if (e.key === "w" && !e.shiftKey) {
        e.preventDefault();
        onCloseTab();
      } else if (e.key === "," && !e.shiftKey) {
        e.preventDefault();
        onOpenSettings();
      } else if (e.key === "E" && e.shiftKey) {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("menu:sidebar", { detail: "files" })
        );
      } else if (e.key === "G" && e.shiftKey) {
        e.preventDefault();
        window.dispatchEvent(
          new CustomEvent("menu:sidebar", { detail: "git" })
        );
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onOpenFolder, onNewTab, onCloseTab, onOpenSettings]);

  return (
    <div ref={barRef} className="menu-bar">
      {menus.map((menu, i) => (
        <div key={menu.label} className="menu-item-wrapper">
          <button
            className={`menu-trigger ${openMenu === i ? "active" : ""}`}
            onClick={() => setOpenMenu(openMenu === i ? null : i)}
            // VS-Code-style hover-to-switch: if any menu is already open,
            // hovering over a different top-level label instantly switches
            // the dropdown rather than requiring a separate click.
            onMouseEnter={() => {
              if (openMenu !== null) setOpenMenu(i);
            }}
          >
            {menu.label}
          </button>
          {openMenu === i && (
            <div className="menu-dropdown">
              {menu.items.map((item, j) =>
                item.separator ? (
                  <div key={j} className="menu-separator" />
                ) : (
                  <button
                    key={j}
                    className="menu-dropdown-item"
                    onClick={() => {
                      item.action?.();
                      setOpenMenu(null);
                    }}
                  >
                    <span>{item.label}</span>
                    {item.shortcut && (
                      <span className="menu-shortcut">{item.shortcut}</span>
                    )}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
});
