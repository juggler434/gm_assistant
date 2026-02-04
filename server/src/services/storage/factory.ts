/**
 * Storage Service Factory
 *
 * Creates configured storage service instances.
 */

import { config } from "@/config/index.js";
import { S3Provider } from "./providers/s3.js";
import { StorageService, type StorageServiceOptions } from "./service.js";
import type { StorageConfig } from "./types.js";

/**
 * Create a storage service using the application configuration.
 */
export function createStorageService(
  options?: StorageServiceOptions
): StorageService {
  const storageConfig: StorageConfig = {
    endpoint: config.s3.endpoint,
    bucket: config.s3.bucket,
    accessKey: config.s3.accessKey,
    secretKey: config.s3.secretKey,
    forcePathStyle: true,
  };

  return createStorageServiceWithConfig(storageConfig, options);
}

/**
 * Create a storage service with custom configuration.
 * Useful for testing or connecting to different storage backends.
 */
export function createStorageServiceWithConfig(
  storageConfig: StorageConfig,
  options?: StorageServiceOptions
): StorageService {
  const provider = new S3Provider(storageConfig);
  return new StorageService(provider, options);
}
