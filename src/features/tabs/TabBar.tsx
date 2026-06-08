import { memo } from "react";
import type { Workspace } from "../../types";

interface TabBarProps {
  workspaces: Workspace[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
  onNew: () => void;
  onReorder: (fromIndex: number, toIndex: number) => void;
}

export const TabBar = memo(function TabBar({
  workspaces,
  activeId,
  onSelect,
  onClose,
  onNew,
  onReorder,
}: TabBarProps) {
  function handleDragStart(e: React.DragEvent, index: number) {
    e.dataTransfer.setData("tab-index", String(index));
  }

  function handleDrop(e: React.DragEvent, toIndex: number) {
    e.preventDefault();
    const fromIndex = Number(e.dataTransfer.getData("tab-index"));
    if (fromIndex !== toIndex) {
      onReorder(fromIndex, toIndex);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
  }

  return (
    <div className="tab-bar">
      {workspaces.map((ws, i) => (
        <div
          key={ws.id}
          className={`tab ${ws.id === activeId ? "tab-active" : ""}`}
          onClick={() => onSelect(ws.id)}
          draggable
          onDragStart={(e) => handleDragStart(e, i)}
          onDrop={(e) => handleDrop(e, i)}
          onDragOver={handleDragOver}
        >
          <span className="tab-label">{ws.label}</span>
          <button
            className="tab-close"
            onClick={(e) => {
              e.stopPropagation();
              onClose(ws.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button className="tab-new" onClick={onNew}>
        +
      </button>
    </div>
  );
});
