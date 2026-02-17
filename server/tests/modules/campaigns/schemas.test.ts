// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect } from "vitest";
import {
  createCampaignSchema,
  updateCampaignSchema,
  campaignIdParamSchema,
} from "@/modules/campaigns/schemas.js";

describe("Campaign Schemas", () => {
  describe("createCampaignSchema", () => {
    it("should accept valid name and description", () => {
      const result = createCampaignSchema.safeParse({
        name: "My Campaign",
        description: "A test campaign",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("My Campaign");
        expect(result.data.description).toBe("A test campaign");
      }
    });

    it("should accept name without description", () => {
      const result = createCampaignSchema.safeParse({
        name: "My Campaign",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("My Campaign");
        expect(result.data.description).toBeUndefined();
      }
    });

    it("should accept null description", () => {
      const result = createCampaignSchema.safeParse({
        name: "My Campaign",
        description: null,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.description).toBeNull();
      }
    });

    it("should reject empty name", () => {
      const result = createCampaignSchema.safeParse({
        name: "",
        description: "A test campaign",
      });

      expect(result.success).toBe(false);
    });

    it("should reject missing name", () => {
      const result = createCampaignSchema.safeParse({
        description: "A test campaign",
      });

      expect(result.success).toBe(false);
    });

    it("should reject name longer than 255 characters", () => {
      const result = createCampaignSchema.safeParse({
        name: "a".repeat(256),
      });

      expect(result.success).toBe(false);
    });

    it("should accept name with exactly 255 characters", () => {
      const result = createCampaignSchema.safeParse({
        name: "a".repeat(255),
      });

      expect(result.success).toBe(true);
    });

    it("should reject description longer than 5000 characters", () => {
      const result = createCampaignSchema.safeParse({
        name: "My Campaign",
        description: "a".repeat(5001),
      });

      expect(result.success).toBe(false);
    });

    it("should accept description with exactly 5000 characters", () => {
      const result = createCampaignSchema.safeParse({
        name: "My Campaign",
        description: "a".repeat(5000),
      });

      expect(result.success).toBe(true);
    });
  });

  describe("updateCampaignSchema", () => {
    it("should accept name only", () => {
      const result = updateCampaignSchema.safeParse({
        name: "Updated Name",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Updated Name");
        expect(result.data.description).toBeUndefined();
      }
    });

    it("should accept description only", () => {
      const result = updateCampaignSchema.safeParse({
        description: "Updated description",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.description).toBe("Updated description");
        expect(result.data.name).toBeUndefined();
      }
    });

    it("should accept both name and description", () => {
      const result = updateCampaignSchema.safeParse({
        name: "Updated Name",
        description: "Updated description",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe("Updated Name");
        expect(result.data.description).toBe("Updated description");
      }
    });

    it("should accept empty object", () => {
      const result = updateCampaignSchema.safeParse({});

      expect(result.success).toBe(true);
    });

    it("should accept null description to clear it", () => {
      const result = updateCampaignSchema.safeParse({
        description: null,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.description).toBeNull();
      }
    });

    it("should reject empty name", () => {
      const result = updateCampaignSchema.safeParse({
        name: "",
      });

      expect(result.success).toBe(false);
    });

    it("should reject name longer than 255 characters", () => {
      const result = updateCampaignSchema.safeParse({
        name: "a".repeat(256),
      });

      expect(result.success).toBe(false);
    });

    it("should reject description longer than 5000 characters", () => {
      const result = updateCampaignSchema.safeParse({
        description: "a".repeat(5001),
      });

      expect(result.success).toBe(false);
    });
  });

  describe("campaignIdParamSchema", () => {
    it("should accept valid UUID", () => {
      const result = campaignIdParamSchema.safeParse({
        id: "123e4567-e89b-12d3-a456-426614174000",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.id).toBe("123e4567-e89b-12d3-a456-426614174000");
      }
    });

    it("should reject invalid UUID format", () => {
      const result = campaignIdParamSchema.safeParse({
        id: "not-a-uuid",
      });

      expect(result.success).toBe(false);
    });

    it("should reject empty string", () => {
      const result = campaignIdParamSchema.safeParse({
        id: "",
      });

      expect(result.success).toBe(false);
    });

    it("should reject missing id", () => {
      const result = campaignIdParamSchema.safeParse({});

      expect(result.success).toBe(false);
    });
  });
});
