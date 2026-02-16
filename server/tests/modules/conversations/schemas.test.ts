import { describe, it, expect } from "vitest";
import {
  conversationCampaignParamSchema,
  conversationDetailParamSchema,
  createConversationSchema,
  addMessageSchema,
  addMessagesSchema,
} from "@/modules/conversations/schemas.js";

describe("Conversation Schemas", () => {
  describe("conversationCampaignParamSchema", () => {
    it("should accept valid campaign UUID", () => {
      const result = conversationCampaignParamSchema.safeParse({
        campaignId: "123e4567-e89b-12d3-a456-426614174000",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.campaignId).toBe("123e4567-e89b-12d3-a456-426614174000");
      }
    });

    it("should reject invalid UUID", () => {
      const result = conversationCampaignParamSchema.safeParse({
        campaignId: "not-a-uuid",
      });

      expect(result.success).toBe(false);
    });

    it("should reject missing campaignId", () => {
      const result = conversationCampaignParamSchema.safeParse({});

      expect(result.success).toBe(false);
    });
  });

  describe("conversationDetailParamSchema", () => {
    it("should accept valid campaign and conversation UUIDs", () => {
      const result = conversationDetailParamSchema.safeParse({
        campaignId: "123e4567-e89b-12d3-a456-426614174000",
        conversationId: "223e4567-e89b-12d3-a456-426614174000",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.campaignId).toBe("123e4567-e89b-12d3-a456-426614174000");
        expect(result.data.conversationId).toBe("223e4567-e89b-12d3-a456-426614174000");
      }
    });

    it("should reject invalid campaignId", () => {
      const result = conversationDetailParamSchema.safeParse({
        campaignId: "not-a-uuid",
        conversationId: "223e4567-e89b-12d3-a456-426614174000",
      });

      expect(result.success).toBe(false);
    });

    it("should reject invalid conversationId", () => {
      const result = conversationDetailParamSchema.safeParse({
        campaignId: "123e4567-e89b-12d3-a456-426614174000",
        conversationId: "not-a-uuid",
      });

      expect(result.success).toBe(false);
    });

    it("should reject missing conversationId", () => {
      const result = conversationDetailParamSchema.safeParse({
        campaignId: "123e4567-e89b-12d3-a456-426614174000",
      });

      expect(result.success).toBe(false);
    });
  });

  describe("createConversationSchema", () => {
    it("should accept valid title", () => {
      const result = createConversationSchema.safeParse({
        title: "What are Strahd's weaknesses?",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.title).toBe("What are Strahd's weaknesses?");
      }
    });

    it("should reject empty title", () => {
      const result = createConversationSchema.safeParse({
        title: "",
      });

      expect(result.success).toBe(false);
    });

    it("should reject missing title", () => {
      const result = createConversationSchema.safeParse({});

      expect(result.success).toBe(false);
    });

    it("should reject title longer than 500 characters", () => {
      const result = createConversationSchema.safeParse({
        title: "a".repeat(501),
      });

      expect(result.success).toBe(false);
    });

    it("should accept title with exactly 500 characters", () => {
      const result = createConversationSchema.safeParse({
        title: "a".repeat(500),
      });

      expect(result.success).toBe(true);
    });
  });

  describe("addMessageSchema", () => {
    it("should accept valid user message", () => {
      const result = addMessageSchema.safeParse({
        role: "user",
        content: "What are Strahd's weaknesses?",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.role).toBe("user");
        expect(result.data.content).toBe("What are Strahd's weaknesses?");
      }
    });

    it("should accept valid assistant message with sources and confidence", () => {
      const result = addMessageSchema.safeParse({
        role: "assistant",
        content: "Strahd has several weaknesses...",
        sources: [
          {
            documentName: "curse-of-strahd.pdf",
            documentId: "doc-1",
            documentType: "rulebook",
            pageNumber: 234,
            section: null,
            relevanceScore: 0.92,
          },
        ],
        confidence: "high",
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sources).toHaveLength(1);
        expect(result.data.confidence).toBe("high");
      }
    });

    it("should accept message without sources and confidence", () => {
      const result = addMessageSchema.safeParse({
        role: "assistant",
        content: "Here is my answer",
      });

      expect(result.success).toBe(true);
    });

    it("should accept null sources", () => {
      const result = addMessageSchema.safeParse({
        role: "assistant",
        content: "Here is my answer",
        sources: null,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.sources).toBeNull();
      }
    });

    it("should accept null confidence", () => {
      const result = addMessageSchema.safeParse({
        role: "assistant",
        content: "Here is my answer",
        confidence: null,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.confidence).toBeNull();
      }
    });

    it("should reject invalid role", () => {
      const result = addMessageSchema.safeParse({
        role: "system",
        content: "Not allowed",
      });

      expect(result.success).toBe(false);
    });

    it("should reject empty content", () => {
      const result = addMessageSchema.safeParse({
        role: "user",
        content: "",
      });

      expect(result.success).toBe(false);
    });

    it("should reject missing content", () => {
      const result = addMessageSchema.safeParse({
        role: "user",
      });

      expect(result.success).toBe(false);
    });

    it("should accept all valid confidence levels", () => {
      for (const level of ["high", "medium", "low"]) {
        const result = addMessageSchema.safeParse({
          role: "assistant",
          content: "Answer",
          confidence: level,
        });
        expect(result.success).toBe(true);
      }
    });

    it("should reject invalid confidence level", () => {
      const result = addMessageSchema.safeParse({
        role: "assistant",
        content: "Answer",
        confidence: "very_high",
      });

      expect(result.success).toBe(false);
    });

    it("should validate source object structure", () => {
      const result = addMessageSchema.safeParse({
        role: "assistant",
        content: "Answer",
        sources: [
          {
            documentName: "test.pdf",
            // Missing required fields
          },
        ],
      });

      expect(result.success).toBe(false);
    });
  });

  describe("addMessagesSchema", () => {
    it("should accept array with one message", () => {
      const result = addMessagesSchema.safeParse({
        messages: [
          {
            role: "user",
            content: "Hello",
          },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.messages).toHaveLength(1);
      }
    });

    it("should accept array with two messages", () => {
      const result = addMessagesSchema.safeParse({
        messages: [
          { role: "user", content: "Question" },
          { role: "assistant", content: "Answer" },
        ],
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.messages).toHaveLength(2);
      }
    });

    it("should reject empty messages array", () => {
      const result = addMessagesSchema.safeParse({
        messages: [],
      });

      expect(result.success).toBe(false);
    });

    it("should reject more than 2 messages", () => {
      const result = addMessagesSchema.safeParse({
        messages: [
          { role: "user", content: "Q1" },
          { role: "assistant", content: "A1" },
          { role: "user", content: "Q2" },
        ],
      });

      expect(result.success).toBe(false);
    });

    it("should reject missing messages field", () => {
      const result = addMessagesSchema.safeParse({});

      expect(result.success).toBe(false);
    });
  });
});
