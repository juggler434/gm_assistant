// Routes
export { documentRoutes } from "./routes.js";

// Schemas
export {
  campaignIdParamSchema,
  documentParamsSchema,
  uploadMetadataSchema,
  documentListQuerySchema,
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
  deleteDocument,
  type FindDocumentsOptions,
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
