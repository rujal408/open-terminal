import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Separate from vite.config.ts so the Tauri dev-server tweaks don't leak into
// the test runner. jsdom gives us a DOM for React Testing Library; the native
// boundaries (Tauri IPC, xterm, WebGL, ResizeObserver) are mocked per-test.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // CSS imports (e.g. `import "xterm/css/xterm.css"`) resolve to no-ops so we
    // don't pull a real stylesheet pipeline into unit tests.
    css: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
  },
});
