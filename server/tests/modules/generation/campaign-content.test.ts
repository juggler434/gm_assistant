// SPDX-License-Identifier: AGPL-3.0-or-later

import { describe, it, expect, vi, beforeEach } from "vitest";

// Hoist mock functions
const { mockFindNpcs, mockFindHooks, mockFindLocations } = vi.hoisted(() => ({
  mockFindNpcs: vi.fn(),
  mockFindHooks: vi.fn(),
  mockFindLocations: vi.fn(),
}));

vi.mock("@/modules/npcs/repository.js", () => ({
  findNpcsByCampaignId: mockFindNpcs,
}));

vi.mock("@/modules/adventure-hooks/repository.js", () => ({
  findAdventureHooksByCampaignId: mockFindHooks,
}));

vi.mock("@/modules/locations/repository.js", () => ({
  findLocationsByCampaignId: mockFindLocations,
}));

import {
  buildCampaignContentContext,
  serializeNpc,
  serializeHook,
  serializeLocation,
} from "@/modules/generation/campaign-content.js";
import type { Npc } from "@/db/schema/npcs.js";
import type { AdventureHookRow } from "@/db/schema/adventure-hooks.js";
import type { Location } from "@/db/schema/locations.js";

// ============================================================================
// Test Factories
// ============================================================================

function makeNpc(overrides: Partial<Npc> = {}): Npc {
  return {
    id: "npc-001",
    campaignId: "campaign-001",
    createdBy: "user-001",
    name: "Aldric the Bold",
    race: "Human",
    classRole: "Paladin",
    level: "5",
    appearance: "Tall and broad-shouldered with a scarred face.",
    personality: "Stoic and honorable, rarely shows emotion.",
    motivations: "Seeks to redeem a past failure that cost lives.",
    secrets: "Was once a bandit before finding faith.",
    backstory: "Born in a small village, rose through the ranks.",
    statBlock: null,
    importance: "major",
    status: "alive",
    tags: ["knight", "ally"],
    isGenerated: false,
    notes: null,
    createdAt: new Date("2024-06-01T00:00:00Z"),
    updatedAt: new Date("2024-06-01T00:00:00Z"),
    ...overrides,
  };
}

function makeHook(overrides: Partial<AdventureHookRow> = {}): AdventureHookRow {
  return {
    id: "hook-001",
    campaignId: "campaign-001",
    createdBy: "user-001",
    title: "The Missing Caravan",
    description: "A merchant caravan has vanished on the road to Ashenmoor. The guild is offering a reward.",
    npcs: ["Aldric the Bold", "Merchant Gale"],
    locations: ["Ashenmoor", "The King's Road"],
    factions: ["Merchant Guild"],
    tags: ["mystery"],
    isGenerated: true,
    notes: null,
    createdAt: new Date("2024-06-01T00:00:00Z"),
    updatedAt: new Date("2024-06-01T00:00:00Z"),
    ...overrides,
  };
}

function makeLocation(overrides: Partial<Location> = {}): Location {
  return {
    id: "loc-001",
    campaignId: "campaign-001",
    createdBy: "user-001",
    name: "The Blighted Marshes",
    terrain: "swamp",
    climate: "temperate",
    size: "large",
    readAloud: "A thick fog clings to the stagnant water. Gnarled trees rise like skeletal hands from the muck. The air smells of decay and damp earth.",
    keyFeatures: ["Ancient ruins", "Will-o'-wisps"],
    pointsOfInterest: ["Sunken temple"],
    encounters: ["Bog creatures"],
    secrets: ["Hidden treasure"],
    npcsPresent: ["Hermit Thorn"],
    factions: ["Swamp Dwellers"],
    sensoryDetails: { sights: "Fog", sounds: "Croaking", smells: "Decay" },
    tags: ["dangerous"],
    isGenerated: false,
    notes: null,
    createdAt: new Date("2024-06-01T00:00:00Z"),
    updatedAt: new Date("2024-06-01T00:00:00Z"),
    ...overrides,
  };
}

// ============================================================================
// Tests
// ============================================================================

describe("Campaign Content Serializer", () => {
  const campaignId = "campaign-001";

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("serializeNpc", () => {
    it("should serialize an NPC with all fields", () => {
      const npc = makeNpc();
      const result = serializeNpc(npc);

      expect(result).toContain("Aldric the Bold");
      expect(result).toContain("Human");
      expect(result).toContain("Paladin");
      expect(result).toContain("major");
      expect(result).toContain("Stoic and honorable");
      expect(result).toContain("Seeks to redeem");
      expect(result).toMatch(/^- /);
    });

    it("should handle NPC with minimal fields", () => {
      const npc = makeNpc({
        race: null,
        classRole: null,
        personality: null,
        motivations: null,
      });
      const result = serializeNpc(npc);

      expect(result).toContain("Aldric the Bold");
      expect(result).toMatch(/^- /);
    });

    it("should truncate long personality text", () => {
      const longText = "A".repeat(200);
      const npc = makeNpc({ personality: longText });
      const result = serializeNpc(npc);

      expect(result.length).toBeLessThan(longText.length + 100);
      expect(result).toContain("...");
    });
  });

  describe("serializeHook", () => {
    it("should serialize a hook with NPCs and locations", () => {
      const hook = makeHook();
      const result = serializeHook(hook);

      expect(result).toContain("The Missing Caravan:");
      expect(result).toContain("merchant caravan");
      expect(result).toContain("NPCs: Aldric the Bold, Merchant Gale");
      expect(result).toContain("Locations: Ashenmoor, The King's Road");
      expect(result).toMatch(/^- /);
    });

    it("should handle hook with no NPCs or locations", () => {
      const hook = makeHook({ npcs: [], locations: [] });
      const result = serializeHook(hook);

      expect(result).toContain("The Missing Caravan:");
      expect(result).not.toContain("NPCs:");
      expect(result).not.toContain("Locations:");
    });
  });

  describe("serializeLocation", () => {
    it("should serialize a location with terrain and first sentence of readAloud", () => {
      const location = makeLocation();
      const result = serializeLocation(location);

      expect(result).toContain("The Blighted Marshes");
      expect(result).toContain("swamp");
      expect(result).toContain("large");
      expect(result).toContain("A thick fog clings to the stagnant water.");
      // Should only include first sentence
      expect(result).not.toContain("Gnarled trees");
      expect(result).toMatch(/^- /);
    });

    it("should handle location with no readAloud", () => {
      const location = makeLocation({ readAloud: null });
      const result = serializeLocation(location);

      expect(result).toContain("The Blighted Marshes");
    });
  });

  describe("buildCampaignContentContext", () => {
    it("should return empty result for campaign with no content", async () => {
      mockFindNpcs.mockResolvedValue([]);
      mockFindHooks.mockResolvedValue([]);
      mockFindLocations.mockResolvedValue([]);

      const result = await buildCampaignContentContext(campaignId);

      expect(result.contentText).toBe("");
      expect(result.estimatedTokens).toBe(0);
      expect(result.counts).toEqual({ npcs: 0, hooks: 0, locations: 0 });
    });

    it("should include all entity types when present", async () => {
      mockFindNpcs.mockResolvedValue([makeNpc()]);
      mockFindHooks.mockResolvedValue([makeHook()]);
      mockFindLocations.mockResolvedValue([makeLocation()]);

      const result = await buildCampaignContentContext(campaignId);

      expect(result.contentText).toContain("NPCs:");
      expect(result.contentText).toContain("Adventure Hooks:");
      expect(result.contentText).toContain("Locations:");
      expect(result.counts).toEqual({ npcs: 1, hooks: 1, locations: 1 });
      expect(result.estimatedTokens).toBeGreaterThan(0);
    });

    it("should handle campaign with only NPCs", async () => {
      mockFindNpcs.mockResolvedValue([makeNpc()]);
      mockFindHooks.mockResolvedValue([]);
      mockFindLocations.mockResolvedValue([]);

      const result = await buildCampaignContentContext(campaignId);

      expect(result.contentText).toContain("NPCs:");
      expect(result.contentText).not.toContain("Adventure Hooks:");
      expect(result.contentText).not.toContain("Locations:");
      expect(result.counts).toEqual({ npcs: 1, hooks: 0, locations: 0 });
    });

    it("should respect token budget", async () => {
      // Create many NPCs to exceed a small budget
      const manyNpcs = Array.from({ length: 50 }, (_, i) =>
        makeNpc({
          id: `npc-${i}`,
          name: `NPC Number ${i}`,
          personality: "Very detailed personality description that takes up tokens.",
          motivations: "Complex motivations that also take up tokens.",
        })
      );

      mockFindNpcs.mockResolvedValue(manyNpcs);
      mockFindHooks.mockResolvedValue([makeHook()]);
      mockFindLocations.mockResolvedValue([makeLocation()]);

      const result = await buildCampaignContentContext(campaignId, { maxTokens: 100 });

      // Should not include all 50 NPCs
      expect(result.counts.npcs).toBeLessThan(50);
      expect(result.estimatedTokens).toBeLessThanOrEqual(120); // some tolerance for final estimation
    });

    it("should fetch all entity types in parallel", async () => {
      mockFindNpcs.mockResolvedValue([]);
      mockFindHooks.mockResolvedValue([]);
      mockFindLocations.mockResolvedValue([]);

      await buildCampaignContentContext(campaignId);

      expect(mockFindNpcs).toHaveBeenCalledWith(campaignId);
      expect(mockFindHooks).toHaveBeenCalledWith(campaignId);
      expect(mockFindLocations).toHaveBeenCalledWith(campaignId);
    });

    it("should include multiple NPCs in order", async () => {
      const npc1 = makeNpc({ id: "npc-1", name: "First NPC" });
      const npc2 = makeNpc({ id: "npc-2", name: "Second NPC" });

      mockFindNpcs.mockResolvedValue([npc1, npc2]);
      mockFindHooks.mockResolvedValue([]);
      mockFindLocations.mockResolvedValue([]);

      const result = await buildCampaignContentContext(campaignId);

      const firstIdx = result.contentText.indexOf("First NPC");
      const secondIdx = result.contentText.indexOf("Second NPC");
      expect(firstIdx).toBeLessThan(secondIdx);
      expect(result.counts.npcs).toBe(2);
    });
  });
});
