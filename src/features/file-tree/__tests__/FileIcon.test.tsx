// Unit tests for FileIcon — maps a filename (extension or special name) to a
// colored icon. We assert on the rendered <svg>'s class (which carries the
// brand color), since that's the user-visible distinction between icons.

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FileIcon } from "../FileIcon";

function iconClass(ui: React.ReactElement): string {
  const { container } = render(ui);
  return container.querySelector("svg")?.getAttribute("class") ?? "";
}

describe("FileIcon — directories", () => {
  it("renders a folder icon in the folder color", () => {
    expect(iconClass(<FileIcon name="src" isDir />)).toContain("#e8a87c");
  });

  it("uses the folder color whether expanded or collapsed", () => {
    expect(iconClass(<FileIcon name="src" isDir expanded />)).toContain(
      "#e8a87c"
    );
  });
});

describe("FileIcon — extension mapping", () => {
  it.each([
    ["app.ts", "#3178c6"], // TypeScript
    ["app.tsx", "#61dafb"], // React
    ["app.jsx", "#61dafb"], // React
    ["app.js", "#f7df1e"], // JavaScript
    ["index.html", "#e34f26"], // HTML
    ["styles.css", "#264de4"], // CSS
    ["main.rs", "#ce422b"], // Rust
    ["main.go", "#00add8"], // Go
    ["script.py", "#3776ab"], // Python
    ["data.json", "#f9e2af"], // JSON
    ["README.md", "#83bae8"], // Markdown
    ["photo.png", "#a6e3a1"], // image
    ["doc.pdf", "#f38ba8"], // pdf
  ])("colors %s with %s", (name, color) => {
    expect(iconClass(<FileIcon name={name} isDir={false} />)).toContain(color);
  });

  it("falls back to the muted generic file icon for unknown extensions", () => {
    expect(iconClass(<FileIcon name="mystery.xyz" isDir={false} />)).toContain(
      "text-muted"
    );
  });
});

describe("FileIcon — name-based detection", () => {
  it("detects Dockerfiles by name", () => {
    expect(iconClass(<FileIcon name="Dockerfile" isDir={false} />)).toContain(
      "#2496ed"
    );
    expect(
      iconClass(<FileIcon name="Dockerfile.dev" isDir={false} />)
    ).toContain("#2496ed");
  });

  it("gives extension matching precedence over name rules (.component.ts → TS, not Angular)", () => {
    expect(
      iconClass(<FileIcon name="app.component.ts" isDir={false} />)
    ).toContain("#3178c6");
  });
});
