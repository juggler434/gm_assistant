// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ConversationRow, ConversationMessageRow } from "@/db/schema/index.js";

// Mock state that will be set up in beforeEach
let mockDbResult: unknown[] = [];

// Mock the db module with factory functions
vi.mock("@/db/index.js", () => {
  const mockReturning = vi.fn(() => Promise.resolve(mockDbResult));
  const mockLimit = vi.fn(() => Promise.resolve(mockDbResult));
  const mockOrderBy = vi.fn(() => Promise.resolve(mockDbResult));

  const mockWhere = vi.fn(() => ({
    limit: mockLimit,
    orderBy: mockOrderBy,
    returning: mockReturning,
  }));

  const mockSet = vi.fn(() => ({
    where: mockWhere,
  }));

  return {
    db: {
      insert: vi.fn(() => ({
        values: vi.fn(() => ({
          returning: mockReturning,
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: mockWhere,
          orderBy: mockOrderBy,
        })),
      })),
      update: vi.fn(() => ({
        set: mockSet,
      })),
      delete: vi.fn(() => ({
        where: mockWhere,
      })),
    },
  };
});

// Mock drizzle-orm operators
vi.mock("drizzle-orm", () => ({
  eq: vi.fn((col, val) => ({ type: "eq", col, val })),
  and: vi.fn((...conditions) => ({ type: "and", conditions })),
  desc: vi.fn((col) => ({ type: "desc", col })),
}));

// Import repository after mocks are set up
import {
  createConversation,
  findConversationsByCampaignAndUser,
  findConversationById,
  findMessagesByConversationId,
  addMessages,
  deleteConversation,
} from "@/modules/conversations/repository.js";

describe("Conversation Repository", () => {
  const mockConversation: ConversationRow = {
    id: "223e4567-e89b-12d3-a456-426614174000",
    campaignId: "123e4567-e89b-12d3-a456-426614174000",
    userId: "user-123",
    title: "What are Strahd's weaknesses?",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
  };

  const mockMessage: ConversationMessageRow = {
    id: "msg-123",
    conversationId: mockConversation.id,
    role: "user",
    content: "What are Strahd's weaknesses?",
    sources: null,
    confidence: null,
    createdAt: new Date("2024-01-01T00:00:00Z"),
  };

  const mockAssistantMessage: ConversationMessageRow = {
    id: "msg-456",
    conversationId: mockConversation.id,
    role: "assistant",
    content: "Strahd has several weaknesses...",
    sources: [
      {
        documentName: "module.pdf",
        documentId: "doc-1",
        documentType: "rulebook",
        pageNumber: 234,
        section: null,
        relevanceScore: 0.92,
      },
    ],
    confidence: "high",
    createdAt: new Date("2024-01-01T00:00:01Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbResult = [];
  });

  describe("createConversation", () => {
    it("should insert conversation and return the created record", async () => {
      mockDbResult = [mockConversation];

      const result = await createConversation({
        campaignId: mockConversation.campaignId,
        userId: mockConversation.userId,
        title: mockConversation.title,
      });

      expect(result).toEqual(mockConversation);
    });

    it("should return null when insert returns empty array", async () => {
      mockDbResult = [];

      const result = await createConversation({
        campaignId: "campaign-1",
        userId: "user-1",
        title: "Test",
      });

      expect(result).toBeNull();
    });
  });

  describe("findConversationsByCampaignAndUser", () => {
    it("should return all conversations for a campaign and user", async () => {
      const conversations = [
        mockConversation,
        {
          ...mockConversation,
          id: "conv-2",
          title: "Tell me about Ireena",
        },
      ];
      mockDbResult = conversations;

      const result = await findConversationsByCampaignAndUser(
        mockConversation.campaignId,
        mockConversation.userId
      );

      expect(result).toEqual(conversations);
      expect(result).toHaveLength(2);
    });

    it("should return empty array when no conversations exist", async () => {
      mockDbResult = [];

      const result = await findConversationsByCampaignAndUser("campaign-x", "user-x");

      expect(result).toEqual([]);
    });
  });

  describe("findConversationById", () => {
    it("should return conversation when found with matching ids", async () => {
      mockDbResult = [mockConversation];

      const result = await findConversationById(
        mockConversation.id,
        mockConversation.campaignId,
        mockConversation.userId
      );

      expect(result).toEqual(mockConversation);
    });

    it("should return null when conversation not found", async () => {
      mockDbResult = [];

      const result = await findConversationById(
        "non-existent",
        mockConversation.campaignId,
        mockConversation.userId
      );

      expect(result).toBeNull();
    });

    it("should return null when conversation belongs to different user", async () => {
      mockDbResult = [];

      const result = await findConversationById(
        mockConversation.id,
        mockConversation.campaignId,
        "different-user"
      );

      expect(result).toBeNull();
    });
  });

  describe("findMessagesByConversationId", () => {
    it("should return messages for a conversation", async () => {
      const messages = [mockMessage, mockAssistantMessage];
      mockDbResult = messages;

      const result = await findMessagesByConversationId(mockConversation.id);

      expect(result).toEqual(messages);
      expect(result).toHaveLength(2);
    });

    it("should return empty array when no messages exist", async () => {
      mockDbResult = [];

      const result = await findMessagesByConversationId("conv-no-msgs");

      expect(result).toEqual([]);
    });
  });

  describe("addMessages", () => {
    it("should insert messages and return created records", async () => {
      const messages = [mockMessage, mockAssistantMessage];
      mockDbResult = messages;

      const result = await addMessages([
        {
          conversationId: mockConversation.id,
          role: "user",
          content: "What are Strahd's weaknesses?",
          sources: null,
          confidence: null,
        },
        {
          conversationId: mockConversation.id,
          role: "assistant",
          content: "Strahd has several weaknesses...",
          sources: [
            {
              documentName: "module.pdf",
              documentId: "doc-1",
              documentType: "rulebook",
              pageNumber: 234,
              section: null,
              relevanceScore: 0.92,
            },
          ],
          confidence: "high",
        },
      ]);

      expect(result).toEqual(messages);
      expect(result).toHaveLength(2);
    });

    it("should return empty array when given empty input", async () => {
      const result = await addMessages([]);

      expect(result).toEqual([]);
    });
  });

  describe("deleteConversation", () => {
    it("should delete conversation and return deleted record", async () => {
      mockDbResult = [mockConversation];

      const result = await deleteConversation(
        mockConversation.id,
        mockConversation.campaignId,
        mockConversation.userId
      );

      expect(result).toEqual(mockConversation);
    });

    it("should return null when conversation not found", async () => {
      mockDbResult = [];

      const result = await deleteConversation(
        "non-existent",
        mockConversation.campaignId,
        mockConversation.userId
      );

      expect(result).toBeNull();
    });

    it("should return null when conversation belongs to different user", async () => {
      mockDbResult = [];

      const result = await deleteConversation(
        mockConversation.id,
        mockConversation.campaignId,
        "different-user"
      );

      expect(result).toBeNull();
    });
  });
});
