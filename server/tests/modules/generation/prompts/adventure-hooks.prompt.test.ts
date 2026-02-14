import { describe, it, expect } from "vitest";
import { buildAdventureHookPrompt } from "@/modules/generation/prompts/adventure-hooks.js";
import type { BuiltContext, SourceCitation } from "@/modules/query/rag/types.js";
import type { HookTone } from "@/modules/generation/types.js";

function makeContext(overrides: Partial<BuiltContext> = {}): BuiltContext {
  return {
    contextText:
      overrides.contextText ??
      "[1] Setting Guide - Geography (p. 5)\nThe city of Valdris sits at the edge of the Ashfall Wastes.",
    sources: overrides.sources ?? [
      {
        index: 1,
        documentName: "Setting Guide",
        documentId: "doc-001",
        documentType: "setting",
        pageNumber: 5,
        section: "Geography",
        relevanceScore: 0.85,
      },
    ],
    chunksUsed: overrides.chunksUsed ?? 1,
    estimatedTokens: overrides.estimatedTokens ?? 50,
  };
}

describe("Adventure Hooks Prompt", () => {
  describe("buildAdventureHookPrompt", () => {
    it("should return system and user message strings", () => {
      const context = makeContext();
      const result = buildAdventureHookPrompt(context, "dark");

      expect(result).toHaveProperty("system");
      expect(result).toHaveProperty("user");
      expect(typeof result.system).toBe("string");
      expect(typeof result.user).toBe("string");
    });

    it("should include setting context when chunks are available", () => {
      const context = makeContext();
      const { user } = buildAdventureHookPrompt(context, "dark");

      expect(user).toContain("=== SETTING CONTEXT ===");
      expect(user).toContain("The city of Valdris");
      expect(user).toContain("Setting Guide");
    });

    it("should include source legend with document details", () => {
      const sources: SourceCitation[] = [
        {
          index: 1,
          documentName: "World Lore",
          documentId: "doc-001",
          documentType: "setting",
          pageNumber: 12,
          section: "Factions",
          relevanceScore: 0.9,
        },
        {
          index: 2,
          documentName: "NPC Notes",
          documentId: "doc-002",
          documentType: "notes",
          pageNumber: null,
          section: "Villains",
          relevanceScore: 0.75,
        },
      ];
      const context = makeContext({ sources, chunksUsed: 2 });
      const { user } = buildAdventureHookPrompt(context, "intrigue");

      expect(user).toContain("[1] World Lore - Factions (p. 12)");
      expect(user).toContain("[2] NPC Notes - Villains");
    });

    it("should show fallback message when no context is available", () => {
      const context = makeContext({
        contextText: "",
        sources: [],
        chunksUsed: 0,
        estimatedTokens: 0,
      });
      const { user } = buildAdventureHookPrompt(context, "comedic");

      expect(user).toContain("No setting context is available");
      expect(user).not.toContain("=== SETTING CONTEXT ===");
    });

    it("should include the requested tone in system and user prompts", () => {
      const context = makeContext();
      const tones: HookTone[] = ["dark", "comedic", "political", "mysterious", "heroic", "horror", "intrigue"];

      for (const tone of tones) {
        const { system, user } = buildAdventureHookPrompt(context, tone);
        expect(system).toContain(tone.toUpperCase());
        expect(system).toContain(`this ${tone} tone`);
        expect(user).toContain(`write in a ${tone} tone`);
      }
    });

    it("should include generation parameters section", () => {
      const context = makeContext();
      const { user } = buildAdventureHookPrompt(context, "dark");

      expect(user).toContain("=== GENERATION PARAMETERS ===");
    });

    it("should include theme in system and user prompts when provided", () => {
      const context = makeContext();
      const { system, user } = buildAdventureHookPrompt(context, "dark", { theme: "undead uprising" });

      expect(system).toContain("undead uprising");
      expect(user).toContain("undead uprising");
    });

    it("should not include theme when not provided", () => {
      const context = makeContext();
      const { system, user } = buildAdventureHookPrompt(context, "dark");

      expect(system).not.toContain("theme");
      expect(user).not.toContain("theme");
    });

    it("should include party level when provided", () => {
      const context = makeContext();
      const { user } = buildAdventureHookPrompt(context, "heroic", { partyLevel: 5 });

      expect(user).toContain("Party level: 5");
    });

    it("should not include party level when not provided", () => {
      const context = makeContext();
      const { user } = buildAdventureHookPrompt(context, "heroic");

      expect(user).not.toContain("Party level:");
    });

    it("should include all optional parameters together", () => {
      const context = makeContext();
      const { system, user } = buildAdventureHookPrompt(context, "political", {
        theme: "trade war",
        partyLevel: 10,
      });

      expect(system).toContain("POLITICAL");
      expect(system).toContain("trade war");
      expect(user).toContain("political tone");
      expect(user).toContain("trade war");
      expect(user).toContain("Party level: 10");
    });

    it("should include exact count in system prompt when provided", () => {
      const context = makeContext();
      const { system } = buildAdventureHookPrompt(context, "dark", { count: 7 });

      expect(system).toContain("Generate exactly 7 adventure hooks.");
      expect(system).not.toContain("between 3 and 5");
    });

    it("should use default 3-5 range in system prompt when count is not provided", () => {
      const context = makeContext();
      const { system } = buildAdventureHookPrompt(context, "dark");

      expect(system).toContain("Generate between 3 and 5 adventure hooks.");
      expect(system).not.toContain("exactly");
    });

    it("should include generation instruction at the end", () => {
      const context = makeContext();
      const { user } = buildAdventureHookPrompt(context, "dark");

      expect(user).toContain("Generate adventure hooks based on the setting context above.");
    });

    it("should include JSON schema instructions in system prompt", () => {
      const context = makeContext();
      const { system } = buildAdventureHookPrompt(context, "dark");

      expect(system).toContain("hooks");
      expect(system).toContain("title");
      expect(system).toContain("description");
      expect(system).toContain("npcs");
      expect(system).toContain("locations");
      expect(system).toContain("factions");
      expect(system).toContain("JSON");
    });

    it("should instruct the LLM to ground hooks in setting context", () => {
      const context = makeContext();
      const { system } = buildAdventureHookPrompt(context, "dark");

      expect(system).toContain("NPCs, locations, or factions");
      expect(system).toContain("setting context");
    });

    it("should omit page number from source legend when null", () => {
      const sources: SourceCitation[] = [
        {
          index: 1,
          documentName: "Notes",
          documentId: "doc-001",
          documentType: "notes",
          pageNumber: null,
          section: null,
          relevanceScore: 0.8,
        },
      ];
      const context = makeContext({
        contextText: "[1] Notes\nSome campaign notes about the world.",
        sources,
        chunksUsed: 1,
      });
      const { user } = buildAdventureHookPrompt(context, "dark");

      expect(user).toContain("[1] Notes");
      expect(user).not.toContain("(p.");
    });
  });
});
