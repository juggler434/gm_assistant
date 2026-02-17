// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, beforeEach } from "vitest";
import {
  createId,
  createTimestamp,
  createBaseEntity,
  createFactory,
  resetIdCounter,
} from "./factories/index.js";
import type { BaseEntity } from "@/types/index.js";

describe("Test Factories", () => {
  beforeEach(() => {
    resetIdCounter();
  });

  describe("createId", () => {
    it("generates unique IDs", () => {
      const id1 = createId();
      const id2 = createId();
      expect(id1).not.toBe(id2);
    });

    it("uses custom prefix", () => {
      const id = createId("user");
      expect(id).toMatch(/^user-/);
    });
  });

  describe("createTimestamp", () => {
    it("creates valid ISO timestamp", () => {
      const timestamp = createTimestamp();
      expect(() => new Date(timestamp)).not.toThrow();
    });

    it("uses provided date", () => {
      const date = new Date("2024-01-15T10:00:00Z");
      const timestamp = createTimestamp(date);
      expect(timestamp).toBe("2024-01-15T10:00:00.000Z");
    });
  });

  describe("createBaseEntity", () => {
    it("creates entity with default values", () => {
      const entity = createBaseEntity();
      expect(entity.id).toBeDefined();
      expect(entity.createdAt).toBeDefined();
      expect(entity.updatedAt).toBeDefined();
    });

    it("allows overriding values", () => {
      const entity = createBaseEntity({ id: "custom-id" });
      expect(entity.id).toBe("custom-id");
    });
  });

  describe("createFactory", () => {
    interface TestEntity extends BaseEntity {
      name: string;
      count: number;
    }

    const createTestEntity = createFactory<TestEntity>(() => ({
      ...createBaseEntity(),
      name: "Default Name",
      count: 0,
    }));

    it("creates entity with defaults", () => {
      const entity = createTestEntity();
      expect(entity.name).toBe("Default Name");
      expect(entity.count).toBe(0);
    });

    it("allows partial overrides", () => {
      const entity = createTestEntity({ name: "Custom Name" });
      expect(entity.name).toBe("Custom Name");
      expect(entity.count).toBe(0);
    });
  });
});
