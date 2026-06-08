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
    <div className="flex items-center h-full overflow-x-auto select-none flex-1">
      {workspaces.map((ws, i) => (
        <div
          key={ws.id}
          className={`flex items-center gap-1.5 px-3 h-full border-r border-[var(--border)] cursor-pointer text-[13px] whitespace-nowrap ${
            ws.id === activeId
              ? "bg-[var(--tab-active)] text-[var(--text)]"
              : "bg-[var(--tab-inactive)] text-[var(--text-muted)]"
          }`}
          onClick={() => onSelect(ws.id)}
          draggable
          onDragStart={(e) => handleDragStart(e, i)}
          onDrop={(e) => handleDrop(e, i)}
          onDragOver={handleDragOver}
        >
          <span className="max-w-[150px] overflow-hidden text-ellipsis">
            {ws.label}
          </span>
          <button
            className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer text-sm px-0.5 leading-none hover:text-[var(--text)]"
            onClick={(e) => {
              e.stopPropagation();
              onClose(ws.id);
            }}
          >
            ×
          </button>
        </div>
      ))}
      <button
        className="bg-transparent border-none text-[var(--text-muted)] cursor-pointer text-lg px-3 h-full hover:text-[var(--text)]"
        onClick={onNew}
      >
        +
      </button>
    </div>
  );
});
