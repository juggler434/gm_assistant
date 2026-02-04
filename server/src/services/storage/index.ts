/**
 * Storage Service Public API
 *
 * @example
 * ```typescript
 * import { createStorageService } from "@/services/storage/index.js";
 *
 * const storage = createStorageService();
 *
 * // Ensure bucket exists (call once at startup)
 * await storage.ensureBucket();
 *
 * // Upload a file
 * const uploadResult = await storage.upload(
 *   "campaign-123",
 *   "document-456",
 *   Buffer.from("file content"),
 *   { contentType: "text/plain" }
 * );
 *
 * if (uploadResult.ok) {
 *   console.log("Uploaded to:", uploadResult.value.key);
 * }
 *
 * // Download a file
 * const downloadResult = await storage.download("campaign-123", "document-456");
 * if (downloadResult.ok) {
 *   console.log("Content:", downloadResult.value.content.toString());
 * }
 *
 * // Get a signed URL for downloads
 * const urlResult = await storage.getSignedUrl("campaign-123", "document-456");
 * if (urlResult.ok) {
 *   console.log("Download URL:", urlResult.value.url);
 * }
 *
 * // Delete a file
 * const deleteResult = await storage.delete("campaign-123", "document-456");
 *
 * // List all documents for a campaign
 * const listResult = await storage.listCampaignDocuments("campaign-123");
 * if (listResult.ok) {
 *   for (const file of listResult.value.files) {
 *     console.log(file.key, file.size);
 *   }
 * }
 * ```
 */

// Factory functions
export { createStorageService, createStorageServiceWithConfig } from "./factory.js";

// Service class
export {
  StorageService,
  type StorageLogger,
  type StorageServiceOptions,
} from "./storage.service.js";

// Types
export type {
  StorageConfig,
  FileMetadata,
  UploadRequest,
  UploadResponse,
  DownloadRequest,
  DownloadResponse,
  DeleteRequest,
  SignedUrlRequest,
  SignedUrlResponse,
  ExistsRequest,
  ListRequest,
  ListResponse,
  FileInfo,
} from "./types.js";

// Errors
export { StorageError, type StorageErrorCode } from "./errors.js";

// Provider types (for advanced usage)
export type { StorageProvider } from "./providers/index.js";
export { S3Provider } from "./providers/index.js";
