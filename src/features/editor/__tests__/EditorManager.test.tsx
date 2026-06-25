// Unit tests for EditorManager: the openEditorPanel helper (dedup + file read)
// and the manager's tab close/dirty handling. TabbedEditorPanel is mocked to a
// set of buttons that invoke the callbacks EditorManager wires up.

import { render, screen, fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { EditorPanel, Theme } from "../../../types";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("uuid", () => ({ v4: () => "fresh-id" }));

// Render each editor as a row of action buttons exercising the manager's props.
vi.mock("../TabbedEditorPanel", () => ({
  TabbedEditorPanel: (props: {
    editors: EditorPanel[];
    onTabChange: (id: string) => void;
    onTabClose: (id: string) => void;
    onDirtyChange: (id: string, dirty: boolean) => void;
  }) => (
    <div data-testid="panel">
      {props.editors.map((e) => (
        <div key={e.id}>
          <button data-testid={`close-${e.id}`} onClick={() => props.onTabClose(e.id)} />
          <button
            data-testid={`dirty-${e.id}`}
            onClick={() => props.onDirtyChange(e.id, true)}
          />
        </div>
      ))}
    </div>
  ),
}));

import { EditorManager, openEditorPanel } from "../EditorManager";

function panel(id: string, filePath: string): EditorPanel {
  return {
    id,
    filePath,
    content: "",
    isDirty: false,
    position: { x: 0, y: 0 },
    size: { width: 0, height: 0 },
  };
}

const theme = {} as Theme;

beforeEach(() => {
  invoke.mockReset().mockResolvedValue("file contents");
});

describe("openEditorPanel", () => {
  it("returns the existing tab without re-reading when the file is already open", async () => {
    const existing = [panel("1", "/a.ts")];
    const { editors, activeId } = await openEditorPanel("/a.ts", existing);
    expect(editors).toBe(existing);
    expect(activeId).toBe("1");
    expect(invoke).not.toHaveBeenCalled();
  });

  it("reads the file and appends a new tab when not yet open", async () => {
    const { editors, activeId } = await openEditorPanel("/b.ts", []);
    expect(invoke).toHaveBeenCalledWith("read_file", { path: "/b.ts" });
    expect(editors).toHaveLength(1);
    expect(activeId).toBe("fresh-id");
    expect(editors[0]).toMatchObject({
      id: "fresh-id",
      filePath: "/b.ts",
      content: "file contents",
      isDirty: false,
    });
  });
});

describe("EditorManager", () => {
  it("renders nothing when there are no editors", () => {
    const { container } = render(
      <EditorManager
        editors={[]}
        activeEditorId={null}
        theme={theme}
        sidebarWidth={250}
        projectPath="/p"
        onEditorsChange={vi.fn()}
        onActiveEditorChange={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it("closing the active tab removes it and activates an adjacent tab", () => {
    const onEditorsChange = vi.fn();
    const onActiveEditorChange = vi.fn();
    const editors = [panel("a", "/a"), panel("b", "/b"), panel("c", "/c")];
    render(
      <EditorManager
        editors={editors}
        activeEditorId="b"
        theme={theme}
        sidebarWidth={250}
        projectPath="/p"
        onEditorsChange={onEditorsChange}
        onActiveEditorChange={onActiveEditorChange}
      />
    );

    fireEvent.click(screen.getByTestId("close-b"));
    expect(onEditorsChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: "a" }),
      expect.objectContaining({ id: "c" }),
    ]);
    expect(onActiveEditorChange).toHaveBeenCalledWith("c");
  });

  it("closing a non-active tab leaves the active selection untouched", () => {
    const onActiveEditorChange = vi.fn();
    const editors = [panel("a", "/a"), panel("b", "/b")];
    render(
      <EditorManager
        editors={editors}
        activeEditorId="a"
        theme={theme}
        sidebarWidth={250}
        projectPath="/p"
        onEditorsChange={vi.fn()}
        onActiveEditorChange={onActiveEditorChange}
      />
    );
    fireEvent.click(screen.getByTestId("close-b"));
    expect(onActiveEditorChange).not.toHaveBeenCalled();
  });

  it("marks an editor dirty via onDirtyChange", () => {
    const onEditorsChange = vi.fn();
    const editors = [panel("a", "/a")];
    render(
      <EditorManager
        editors={editors}
        activeEditorId="a"
        theme={theme}
        sidebarWidth={250}
        projectPath="/p"
        onEditorsChange={onEditorsChange}
        onActiveEditorChange={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId("dirty-a"));
    expect(onEditorsChange).toHaveBeenCalledWith([
      expect.objectContaining({ id: "a", isDirty: true }),
    ]);
  });
});
