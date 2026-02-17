// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Common types used across the application
 */

// Re-export shared types so existing server imports from "@/types" keep working
export type { Id, ISOTimestamp, BaseEntity } from "@gm-assistant/shared";

/** Result type for operations that can fail */
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

/** Helper to create success result */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** Helper to create error result */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
