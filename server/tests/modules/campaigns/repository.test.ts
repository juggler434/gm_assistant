// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Campaign } from "@/db/schema/index.js";

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
  createCampaign,
  findCampaignsByUserId,
  findCampaignById,
  findCampaignByIdAndUserId,
  updateCampaign,
  deleteCampaign,
} from "@/modules/campaigns/repository.js";

describe("Campaign Repository", () => {
  const mockCampaign: Campaign = {
    id: "123e4567-e89b-12d3-a456-426614174000",
    userId: "user-123",
    name: "Test Campaign",
    description: "A test campaign description",
    createdAt: new Date("2024-01-01T00:00:00Z"),
    updatedAt: new Date("2024-01-01T00:00:00Z"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockDbResult = [];
  });

  describe("createCampaign", () => {
    it("should insert campaign and return the created record", async () => {
      mockDbResult = [mockCampaign];

      const result = await createCampaign({
        userId: "user-123",
        name: "Test Campaign",
        description: "A test campaign description",
      });

      expect(result).toEqual(mockCampaign);
    });

    it("should return null when insert returns empty array", async () => {
      mockDbResult = [];

      const result = await createCampaign({
        userId: "user-123",
        name: "Test Campaign",
        description: null,
      });

      expect(result).toBeNull();
    });

    it("should handle campaign without description", async () => {
      const campaignWithoutDesc = { ...mockCampaign, description: null };
      mockDbResult = [campaignWithoutDesc];

      const result = await createCampaign({
        userId: "user-123",
        name: "Test Campaign",
        description: undefined,
      });

      expect(result).toEqual(campaignWithoutDesc);
    });
  });

  describe("findCampaignsByUserId", () => {
    it("should return all campaigns for a user", async () => {
      const campaigns = [
        mockCampaign,
        { ...mockCampaign, id: "campaign-2", name: "Second Campaign" },
      ];
      mockDbResult = campaigns;

      const result = await findCampaignsByUserId("user-123");

      expect(result).toEqual(campaigns);
    });

    it("should return empty array when user has no campaigns", async () => {
      mockDbResult = [];

      const result = await findCampaignsByUserId("user-with-no-campaigns");

      expect(result).toEqual([]);
    });
  });

  describe("findCampaignById", () => {
    it("should return campaign when found", async () => {
      mockDbResult = [mockCampaign];

      const result = await findCampaignById(mockCampaign.id);

      expect(result).toEqual(mockCampaign);
    });

    it("should return null when campaign not found", async () => {
      mockDbResult = [];

      const result = await findCampaignById("non-existent-id");

      expect(result).toBeNull();
    });
  });

  describe("findCampaignByIdAndUserId", () => {
    it("should return campaign when found with matching id and userId", async () => {
      mockDbResult = [mockCampaign];

      const result = await findCampaignByIdAndUserId(
        mockCampaign.id,
        mockCampaign.userId
      );

      expect(result).toEqual(mockCampaign);
    });

    it("should return null when campaign not found", async () => {
      mockDbResult = [];

      const result = await findCampaignByIdAndUserId(
        "non-existent-id",
        "user-123"
      );

      expect(result).toBeNull();
    });

    it("should return null when campaign belongs to different user", async () => {
      mockDbResult = [];

      const result = await findCampaignByIdAndUserId(
        mockCampaign.id,
        "different-user"
      );

      expect(result).toBeNull();
    });
  });

  describe("updateCampaign", () => {
    it("should update campaign name and return updated record", async () => {
      const updatedCampaign = { ...mockCampaign, name: "Updated Name" };
      mockDbResult = [updatedCampaign];

      const result = await updateCampaign(mockCampaign.id, mockCampaign.userId, {
        name: "Updated Name",
      });

      expect(result).toEqual(updatedCampaign);
    });

    it("should update campaign description", async () => {
      const updatedCampaign = {
        ...mockCampaign,
        description: "New description",
      };
      mockDbResult = [updatedCampaign];

      const result = await updateCampaign(mockCampaign.id, mockCampaign.userId, {
        description: "New description",
      });

      expect(result).toEqual(updatedCampaign);
    });

    it("should allow setting description to null", async () => {
      const updatedCampaign = { ...mockCampaign, description: null };
      mockDbResult = [updatedCampaign];

      const result = await updateCampaign(mockCampaign.id, mockCampaign.userId, {
        description: null,
      });

      expect(result).toEqual(updatedCampaign);
    });

    it("should update both name and description", async () => {
      const updatedCampaign = {
        ...mockCampaign,
        name: "New Name",
        description: "New description",
      };
      mockDbResult = [updatedCampaign];

      const result = await updateCampaign(mockCampaign.id, mockCampaign.userId, {
        name: "New Name",
        description: "New description",
      });

      expect(result).toEqual(updatedCampaign);
    });

    it("should return null when campaign not found", async () => {
      mockDbResult = [];

      const result = await updateCampaign(
        "non-existent-id",
        mockCampaign.userId,
        { name: "New Name" }
      );

      expect(result).toBeNull();
    });

    it("should handle update with only undefined values gracefully", async () => {
      mockDbResult = [mockCampaign];

      const result = await updateCampaign(mockCampaign.id, mockCampaign.userId, {
        name: undefined,
        description: undefined,
      });

      expect(result).toEqual(mockCampaign);
    });
  });

  describe("deleteCampaign", () => {
    it("should delete campaign and return deleted record", async () => {
      mockDbResult = [mockCampaign];

      const result = await deleteCampaign(mockCampaign.id, mockCampaign.userId);

      expect(result).toEqual(mockCampaign);
    });

    it("should return null when campaign not found", async () => {
      mockDbResult = [];

      const result = await deleteCampaign("non-existent-id", "user-123");

      expect(result).toBeNull();
    });

    it("should return null when campaign belongs to different user", async () => {
      mockDbResult = [];

      const result = await deleteCampaign(mockCampaign.id, "different-user");

      expect(result).toBeNull();
    });
  });
});
