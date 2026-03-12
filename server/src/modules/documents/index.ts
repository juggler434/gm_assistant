// SPDX-License-Identifier: AGPL-3.0-or-later

// Routes
export { documentRoutes } from "./routes.js";

// Schemas
export {
  campaignIdParamSchema,
  documentParamsSchema,
  uploadMetadataSchema,
  documentListQuerySchema,
  updateDocumentSchema,
  isSupportedMimeType,
  inferDocumentType,
  SUPPORTED_MIME_TYPES,
  SUPPORTED_EXTENSIONS,
  IMAGE_MIME_TYPES,
  DOCUMENT_MIME_TYPES,
  type CampaignIdParam,
  type DocumentParams,
  type UploadMetadata,
  type DocumentListQuery,
  type UpdateDocumentInput,
  type SupportedMimeType,
} from "./schemas.js";

// Repository
export {
  createDocument,
  findDocumentById,
  findDocumentByIdAndCampaignId,
  findDocumentsByCampaignId,
  updateDocumentStatus,
  updateDocumentChunkCount,
  updateDocument,
  deleteDocument,
  type FindDocumentsOptions,
  type UpdateDocumentData,
} from "./repository.js";

// Processors
export {
  createTextProcessor,
  detectMarkdownSections,
  detectPlainTextSections,
  estimateTokenCount,
  type DocumentProcessor,
  type DocumentSection,
  type TextProcessorError,
  type TextProcessorErrorCode,
  type TextProcessorOptions,
  type TextProcessorResult,
} from "./processors/index.js";
