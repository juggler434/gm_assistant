// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Base factories for common types
 */

import type { BaseEntity, Id, ISOTimestamp } from "@/types/index.js";

let idCounter = 0;

/**
 * Generate a unique test ID
 */
export function createId(prefix = "test"): Id {
  idCounter++;
  return `${prefix}-${idCounter}-${Date.now()}`;
}

/**
 * Reset the ID counter (useful between test suites)
 */
export function resetIdCounter(): void {
  idCounter = 0;
}

/**
 * Create an ISO timestamp for testing
 */
export function createTimestamp(date?: Date): ISOTimestamp {
  return (date ?? new Date()).toISOString();
}

/**
 * Create a BaseEntity with default values
 */
export function createBaseEntity(
  overrides: Partial<BaseEntity> = {}
): BaseEntity {
  const now = createTimestamp();
  return {
    id: createId(),
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

/**
 * Factory builder for creating typed factories
 *
 * @example
 * ```ts
 * interface User extends BaseEntity {
 *   name: string;
 *   email: string;
 * }
 *
 * const createUser = createFactory<User>(() => ({
 *   ...createBaseEntity(),
 *   name: "Test User",
 *   email: "test@example.com",
 * }));
 *
 * const user = createUser({ name: "Custom Name" });
 * ```
 */
export function createFactory<T>(defaults: () => T): (overrides?: Partial<T>) => T {
  return (overrides = {}) => ({
    ...defaults(),
    ...overrides,
  });
}
