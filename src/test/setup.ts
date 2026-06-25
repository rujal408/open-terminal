// Global test setup, loaded before every test file (see vitest.config.ts).
// Provides jest-dom matchers and polyfills the browser APIs jsdom lacks but
// the terminal code depends on: ResizeObserver, requestAnimationFrame, and
// navigator.clipboard.

import "@testing-library/jest-dom/vitest";
import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});

// jsdom has no ResizeObserver. This mock records the most recently created
// instance on globalThis so a test can synchronously fire its callback
// (simulating a container resize) via __lastResizeObserver.trigger().
class MockResizeObserver {
  callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    (globalThis as Record<string, unknown>).__lastResizeObserver = this;
  }
  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}
(globalThis as Record<string, unknown>).ResizeObserver = MockResizeObserver;

// Run requestAnimationFrame callbacks synchronously so deferred work (e.g.
// TerminalView's one-frame attach delay, the resize debounce) executes within
// the test tick instead of leaking past assertions.
(globalThis as Record<string, unknown>).requestAnimationFrame = (
  cb: FrameRequestCallback
) => {
  cb(0);
  return 0;
};
(globalThis as Record<string, unknown>).cancelAnimationFrame = () => {};

// Clipboard stub — overridable per test via mockResolvedValue.
Object.defineProperty(navigator, "clipboard", {
  configurable: true,
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue(""),
  },
});

// jsdom has no matchMedia; theme resolution falls back to it.
if (!window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// jsdom's window.alert throws "Not implemented"; several modules call it on
// error paths. Stub it so those paths can be exercised quietly.
window.alert = vi.fn();
