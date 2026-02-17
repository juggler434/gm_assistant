// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Common type aliases and base types shared across the application.
 * Matches server/src/types/index.ts
 */

/** Represents a unique identifier (UUID string) */
export type Id = string;

/** Represents a timestamp in ISO 8601 format */
export type ISOTimestamp = string;

/** Base entity with common fields present on all database records */
export interface BaseEntity {
  id: Id;
  createdAt: ISOTimestamp;
  updatedAt: ISOTimestamp;
}
