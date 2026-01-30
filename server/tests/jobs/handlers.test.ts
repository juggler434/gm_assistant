import { describe, it, expect, beforeEach } from "vitest";
import {
  registerHandler,
  getHandler,
  getAllHandlers,
  hasHandler,
  removeHandler,
  clearHandlers,
} from "../../src/jobs/handlers/index.js";
import type { BaseJobData, JobContext } from "../../src/jobs/types.js";

interface TestJobData extends BaseJobData {
  message: string;
}

describe("Handler Registry", () => {
  beforeEach(() => {
    clearHandlers();
  });

  describe("registerHandler", () => {
    it("should register a handler", () => {
      const handler = async (data: TestJobData, _context: JobContext) => {
        return data.message;
      };

      registerHandler({
        queueName: "test-queue",
        handler,
        description: "Test handler",
      });

      expect(hasHandler("test-queue")).toBe(true);
    });

    it("should throw when registering duplicate handler", () => {
      const handler = async () => {};

      registerHandler({ queueName: "test-queue", handler });

      expect(() => {
        registerHandler({ queueName: "test-queue", handler });
      }).toThrow('Handler already registered for queue "test-queue"');
    });
  });

  describe("getHandler", () => {
    it("should return registered handler", () => {
      const handler = async () => "result";

      registerHandler({ queueName: "test-queue", handler });

      const retrieved = getHandler("test-queue");
      expect(retrieved).toBe(handler);
    });

    it("should return undefined for unregistered queue", () => {
      const handler = getHandler("nonexistent");
      expect(handler).toBeUndefined();
    });
  });

  describe("getAllHandlers", () => {
    it("should return all registered handlers", () => {
      registerHandler({
        queueName: "queue-1",
        handler: async () => {},
        description: "First handler",
      });
      registerHandler({
        queueName: "queue-2",
        handler: async () => {},
        description: "Second handler",
      });

      const handlers = getAllHandlers();

      expect(handlers).toHaveLength(2);
      expect(handlers).toContainEqual({
        queueName: "queue-1",
        description: "First handler",
      });
      expect(handlers).toContainEqual({
        queueName: "queue-2",
        description: "Second handler",
      });
    });

    it("should return empty array when no handlers registered", () => {
      const handlers = getAllHandlers();
      expect(handlers).toEqual([]);
    });
  });

  describe("hasHandler", () => {
    it("should return true for registered handler", () => {
      registerHandler({ queueName: "test-queue", handler: async () => {} });
      expect(hasHandler("test-queue")).toBe(true);
    });

    it("should return false for unregistered handler", () => {
      expect(hasHandler("nonexistent")).toBe(false);
    });
  });

  describe("removeHandler", () => {
    it("should remove registered handler", () => {
      registerHandler({ queueName: "test-queue", handler: async () => {} });
      expect(hasHandler("test-queue")).toBe(true);

      const removed = removeHandler("test-queue");

      expect(removed).toBe(true);
      expect(hasHandler("test-queue")).toBe(false);
    });

    it("should return false when removing nonexistent handler", () => {
      const removed = removeHandler("nonexistent");
      expect(removed).toBe(false);
    });
  });

  describe("clearHandlers", () => {
    it("should remove all handlers", () => {
      registerHandler({ queueName: "queue-1", handler: async () => {} });
      registerHandler({ queueName: "queue-2", handler: async () => {} });

      expect(getAllHandlers()).toHaveLength(2);

      clearHandlers();

      expect(getAllHandlers()).toHaveLength(0);
    });
  });
});
