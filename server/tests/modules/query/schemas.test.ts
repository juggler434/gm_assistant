import { describe, it, expect } from "vitest";
import { queryParamSchema, queryBodySchema } from "@/modules/query/schemas.js";

describe("queryParamSchema", () => {
  it("should accept a valid UUID campaignId", () => {
    const result = queryParamSchema.safeParse({
      campaignId: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(result.success).toBe(true);
  });

  it("should reject a non-UUID campaignId", () => {
    const result = queryParamSchema.safeParse({ campaignId: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("should reject missing campaignId", () => {
    const result = queryParamSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe("queryBodySchema", () => {
  it("should accept a valid query string", () => {
    const result = queryBodySchema.safeParse({
      query: "What is a high-end tavern?",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.query).toBe("What is a high-end tavern?");
      expect(result.data.filters).toBeUndefined();
    }
  });

  it("should reject an empty query", () => {
    const result = queryBodySchema.safeParse({ query: "" });
    expect(result.success).toBe(false);
  });

  it("should reject a query exceeding 2000 characters", () => {
    const result = queryBodySchema.safeParse({ query: "a".repeat(2001) });
    expect(result.success).toBe(false);
  });

  it("should accept a query at the 2000 character limit", () => {
    const result = queryBodySchema.safeParse({ query: "a".repeat(2000) });
    expect(result.success).toBe(true);
  });

  it("should reject missing query field", () => {
    const result = queryBodySchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it("should accept valid filters with documentTypes", () => {
    const result = queryBodySchema.safeParse({
      query: "Tell me about the tavern",
      filters: { documentTypes: ["setting", "notes"] },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters?.documentTypes).toEqual(["setting", "notes"]);
    }
  });

  it("should reject invalid documentType values", () => {
    const result = queryBodySchema.safeParse({
      query: "Tell me about the tavern",
      filters: { documentTypes: ["invalid_type"] },
    });
    expect(result.success).toBe(false);
  });

  it("should accept valid filters with tags", () => {
    const result = queryBodySchema.safeParse({
      query: "Tell me about the tavern",
      filters: { tags: ["locations", "npcs"] },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters?.tags).toEqual(["locations", "npcs"]);
    }
  });

  it("should accept valid filters with documentIds", () => {
    const docId = "123e4567-e89b-12d3-a456-426614174000";
    const result = queryBodySchema.safeParse({
      query: "Tell me about the tavern",
      filters: { documentIds: [docId] },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.filters?.documentIds).toEqual([docId]);
    }
  });

  it("should reject non-UUID documentIds", () => {
    const result = queryBodySchema.safeParse({
      query: "Tell me about the tavern",
      filters: { documentIds: ["not-a-uuid"] },
    });
    expect(result.success).toBe(false);
  });

  it("should accept all filter types combined", () => {
    const docId = "123e4567-e89b-12d3-a456-426614174000";
    const result = queryBodySchema.safeParse({
      query: "Tell me about the tavern",
      filters: {
        documentTypes: ["setting"],
        tags: ["locations"],
        documentIds: [docId],
      },
    });
    expect(result.success).toBe(true);
  });

  it("should accept empty filters object", () => {
    const result = queryBodySchema.safeParse({
      query: "Tell me about the tavern",
      filters: {},
    });
    expect(result.success).toBe(true);
  });
});
