// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Job Handler Registry
 *
 * Centralized registry for job handlers.
 */

import type { BaseJobData, HandlerDefinition, JobHandler } from "../types.js";

/** Stored handler with metadata */
interface RegisteredHandler {
  handler: JobHandler<BaseJobData, unknown>;
  description: string | undefined;
}

/** Registry of job handlers by queue name */
const handlerRegistry = new Map<string, RegisteredHandler>();

/**
 * Register a job handler for a queue.
 *
 * @param definition - Handler definition
 * @throws If a handler is already registered for the queue
 *
 * @example
 * ```typescript
 * registerHandler({
 *   queueName: "emails",
 *   handler: async (data, context) => {
 *     await sendEmail(data);
 *   },
 *   description: "Sends emails to users",
 * });
 * ```
 */
export function registerHandler<
  TData extends BaseJobData = BaseJobData,
  TResult = unknown,
>(definition: HandlerDefinition<TData, TResult>): void {
  if (handlerRegistry.has(definition.queueName)) {
    throw new Error(
      `Handler already registered for queue "${definition.queueName}"`
    );
  }

  handlerRegistry.set(definition.queueName, {
    handler: definition.handler as JobHandler<BaseJobData, unknown>,
    description: definition.description,
  });
}

/**
 * Get a handler by queue name.
 *
 * @param queueName - Name of the queue
 * @returns Handler function or undefined if not found
 */
export function getHandler(
  queueName: string
): JobHandler<BaseJobData, unknown> | undefined {
  return handlerRegistry.get(queueName)?.handler;
}

/**
 * Get all registered handlers.
 *
 * @returns Array of handler definitions
 */
export function getAllHandlers(): Array<{
  queueName: string;
  description: string | undefined;
}> {
  return Array.from(handlerRegistry.entries()).map(([queueName, entry]) => ({
    queueName,
    description: entry.description,
  }));
}

/**
 * Check if a handler is registered for a queue.
 *
 * @param queueName - Name of the queue
 * @returns True if handler exists
 */
export function hasHandler(queueName: string): boolean {
  return handlerRegistry.has(queueName);
}

/**
 * Remove a handler from the registry.
 *
 * @param queueName - Name of the queue
 * @returns True if handler was removed
 */
export function removeHandler(queueName: string): boolean {
  return handlerRegistry.delete(queueName);
}

/**
 * Clear all registered handlers.
 * Mainly useful for testing.
 */
export function clearHandlers(): void {
  handlerRegistry.clear();
}
