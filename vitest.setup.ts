import "@testing-library/jest-dom/vitest";

// Polyfill ResizeObserver for Radix UI components in jsdom
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver;
}

// Polyfill pointer capture methods (only in jsdom/browser environments)
if (typeof globalThis.Element !== "undefined") {
  if (typeof Element.prototype.setPointerCapture === "undefined") {
    Element.prototype.setPointerCapture = function () {};
    Element.prototype.releasePointerCapture = function () {};
    Element.prototype.hasPointerCapture = function () {
      return false;
    };
  }
}
