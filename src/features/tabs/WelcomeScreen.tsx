import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { RecentProject } from "../../types";

interface WelcomeScreenProps {
  onOpenProject: (path: string) => void;
}

export function WelcomeScreen({ onOpenProject }: WelcomeScreenProps) {
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>([]);

  useEffect(() => {
    invoke<RecentProject[]>("load_recent_projects").then(setRecentProjects);
  }, []);

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
    <div className="welcome-screen">
      <h1>Open Terminal</h1>
      <p className="welcome-subtitle">Select a project to get started</p>

      <button className="welcome-open-btn" onClick={handleOpenFolder}>
        Open Folder
      </button>

      {recentProjects.length > 0 && (
        <div className="recent-projects">
          <h3>Recent Projects</h3>
          <ul>
            {recentProjects.map((project) => (
              <li key={project.path}>
                <button
                  className="recent-project-btn"
                  onClick={() => onOpenProject(project.path)}
                >
                  <span className="recent-name">{project.name}</span>
                  <span className="recent-path">{project.path}</span>
                </button>
                <button
                  className="recent-remove"
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
