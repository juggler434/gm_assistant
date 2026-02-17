// SPDX-License-Identifier: AGPL-3.0-or-later

import * as matchers from "@testing-library/jest-dom/matchers";
import { expect } from "vitest";

expect.extend(matchers);

// Polyfills for jsdom — Radix UI primitives rely on browser APIs
// that jsdom doesn't implement.

// Radix Select/Popover uses pointer capture
if (typeof HTMLElement.prototype.hasPointerCapture === "undefined") {
  HTMLElement.prototype.hasPointerCapture = () => false;
}
if (typeof HTMLElement.prototype.setPointerCapture === "undefined") {
  HTMLElement.prototype.setPointerCapture = () => {};
}
if (typeof HTMLElement.prototype.releasePointerCapture === "undefined") {
  HTMLElement.prototype.releasePointerCapture = () => {};
}

// Radix uses scrollIntoView
if (typeof HTMLElement.prototype.scrollIntoView === "undefined") {
  HTMLElement.prototype.scrollIntoView = () => {};
}

// Radix Dialog / Select use ResizeObserver
if (typeof globalThis.ResizeObserver === "undefined") {
  globalThis.ResizeObserver = class ResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
