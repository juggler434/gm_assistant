/**
 * Frontend API types barrel file.
 *
 * Re-exports all type definitions for convenient imports:
 *   import type { User, Campaign, QueryResponse } from "@/types";
 */

// Common types
export type { Id, ISOTimestamp, BaseEntity } from "./common.ts";

// Entity types
export type {
  User,
  AuthUser,
  Session,
  Campaign,
  DocumentType,
  DocumentStatus,
  DocumentMetadata,
  Document,
  Chunk,
  GameSessionStatus,
  GameSession,
  Transcript,
} from "./entities.ts";

// Query / RAG types
export type {
  QueryFilters,
  QueryRequest,
  ConfidenceLevel,
  QuerySource,
  QueryResponse,
  TokenUsage,
  RAGResult,
} from "./query.ts";

// Generation types
export type {
  HookTone,
  GenerateHooksRequest,
  AdventureHook,
  GenerateHooksResponse,
  GenerationStatusEvent,
  GenerationHookEvent,
  GenerationCompleteEvent,
  GenerationErrorEvent,
  GenerationSSEEvent,
} from "./generation.ts";

// API request/response types
export type {
  ApiErrorResponse,
  RegisterRequest,
  LoginRequest,
  AuthResponse,
  CreateCampaignRequest,
  UpdateCampaignRequest,
  CampaignResponse,
  CampaignListResponse,
  DocumentListQuery,
  DocumentResponse,
  DocumentListResponse,
  DocumentDownloadResponse,
  SupportedMimeType,
} from "./api.ts";

// Runtime values (not type-only)
export { SUPPORTED_MIME_TYPES } from "./api.ts";
