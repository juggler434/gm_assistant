/**
 * Frontend API types barrel file.
 *
 * Re-exports all shared types from @gm-assistant/shared so existing
 * imports from "@/types" continue to work unchanged.
 *
 *   import type { User, Campaign, QueryResponse } from "@/types";
 */

export type * from "@gm-assistant/shared";
export { SUPPORTED_MIME_TYPES } from "@gm-assistant/shared";
