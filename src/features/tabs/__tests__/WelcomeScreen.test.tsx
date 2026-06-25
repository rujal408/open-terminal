// Unit tests for WelcomeScreen — loads recent projects, opens a folder via the
// native dialog, and lets the user open or remove a recent project.

import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecentProject } from "../../../types";

const { invoke, openDialog } = vi.hoisted(() => ({
  invoke: vi.fn(),
  openDialog: vi.fn(),
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: openDialog }));

import { WelcomeScreen } from "../WelcomeScreen";

const RECENTS: RecentProject[] = [
  { path: "/home/u/alpha", name: "alpha", last_opened: 200 },
  { path: "/home/u/beta", name: "beta", last_opened: 100 },
];

beforeEach(() => {
  invoke.mockReset().mockImplementation((cmd: string) => {
    if (cmd === "load_recent_projects") return Promise.resolve(RECENTS);
    return Promise.resolve(undefined);
  });
  openDialog.mockReset();
});

describe("WelcomeScreen", () => {
  it("loads and lists recent projects", async () => {
    render(<WelcomeScreen onOpenProject={vi.fn()} />);
    expect(await screen.findByText("alpha")).toBeInTheDocument();
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("opens a recent project when its row is clicked", async () => {
    const onOpenProject = vi.fn();
    render(<WelcomeScreen onOpenProject={onOpenProject} />);
    fireEvent.click(await screen.findByText("alpha"));
    expect(onOpenProject).toHaveBeenCalledWith("/home/u/alpha");
  });

  it("removes a recent project and drops it from the list", async () => {
    render(<WelcomeScreen onOpenProject={vi.fn()} />);
    await screen.findByText("alpha");
    // The × button sits next to each project's open button.
    const removeButtons = screen.getAllByText("×");
    fireEvent.click(removeButtons[0]); // remove alpha
    expect(invoke).toHaveBeenCalledWith("remove_recent_project", {
      projectPath: "/home/u/alpha",
    });
    await waitFor(() =>
      expect(screen.queryByText("alpha")).not.toBeInTheDocument()
    );
    expect(screen.getByText("beta")).toBeInTheDocument();
  });

  it("opens the folder picker and opens the chosen folder", async () => {
    openDialog.mockResolvedValue("/picked/dir");
    const onOpenProject = vi.fn();
    render(<WelcomeScreen onOpenProject={onOpenProject} />);
    fireEvent.click(screen.getByText("Open Folder"));
    expect(openDialog).toHaveBeenCalledWith({
      directory: true,
      multiple: false,
    });
    await waitFor(() =>
      expect(onOpenProject).toHaveBeenCalledWith("/picked/dir")
    );
  });

  it("does nothing when the folder picker is cancelled", async () => {
    openDialog.mockResolvedValue(null);
    const onOpenProject = vi.fn();
    render(<WelcomeScreen onOpenProject={onOpenProject} />);
    fireEvent.click(screen.getByText("Open Folder"));
    await waitFor(() => expect(openDialog).toHaveBeenCalled());
    expect(onOpenProject).not.toHaveBeenCalled();
  });
});
