import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { RecentProject } from "../../types";

interface WelcomeScreenProps {
  onOpenProject: (path: string) => void;
}

export function WelcomeScreen({ onOpenProject }: WelcomeScreenProps) {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);

  useState(() => {
    invoke<RecentProject[]>("load_recent_projects").then(setRecentProjects);
  });

  async function handleOpenFolder() {
    const selected = await open({ directory: true, multiple: false });
    if (selected) {
      onOpenProject(selected as string);
    }
  }

  async function handleRemoveRecent(path: string) {
    await invoke("remove_recent_project", { projectPath: path });
    setRecentProjects((prev) => prev.filter((p) => p.path !== path));
  }

  return (
    <div className="flex flex-col items-center justify-center h-full gap-4">
      <h1 className="text-2xl font-semibold text-primary">Open Terminal</h1>
      <p className="text-muted">Select a project to get started</p>

      <button
        className="px-6 py-2.5 bg-accent text-white border-none rounded-md cursor-pointer text-sm hover:opacity-90"
        onClick={handleOpenFolder}
      >
        Open Folder
      </button>

      {recentProjects.length > 0 && (
        <div className="mt-6 w-[400px]">
          <h3 className="mb-2 text-[13px] text-muted uppercase tracking-wide font-semibold">
            Recent Projects
          </h3>
          <ul className="list-none">
            {recentProjects.map((project) => (
              <li
                key={project.path}
                className="flex items-center border-b border-border"
              >
                <button
                  className="flex-1 flex flex-col py-2 bg-transparent border-none cursor-pointer text-left text-primary hover:text-accent"
                  onClick={() => onOpenProject(project.path)}
                >
                  <span className="text-sm">{project.name}</span>
                  <span className="text-[11px] text-muted">{project.path}</span>
                </button>
                <button
                  className="bg-transparent border-none text-muted cursor-pointer px-2 py-1 text-sm hover:text-primary"
                  onClick={() => handleRemoveRecent(project.path)}
                >
                  ×
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
