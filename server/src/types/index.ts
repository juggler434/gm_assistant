/**
 * Common types used across the application
 */

/** Represents a unique identifier */
export type Id = string;

/** Represents a timestamp in ISO 8601 format */
export type ISOTimestamp = string;

/** Base entity with common fields */
export interface BaseEntity {
  id: Id;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}

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
