// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Test setup file - loaded before all tests
 *
 * This file configures the test environment and provides
 * global utilities for testing.
 */

import { beforeEach, afterEach, vi } from "vitest";

// Reset all mocks between tests
beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Set test environment variables
process.env.NODE_ENV = "test";
