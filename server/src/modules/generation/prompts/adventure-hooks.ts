/**
 * Adventure Hooks Prompt
 *
 * Constructs the system and user prompts for generating adventure hooks
 * grounded in campaign setting context retrieved via RAG.
 */

import type { BuiltContext } from "@/modules/query/rag/types.js";
import type { HookTone } from "../types.js";

// ============================================================================
// System Prompt
// ============================================================================

function buildSystemPrompt(count?: number): string {
  const countInstruction = count !== undefined
    ? `Generate exactly ${count} adventure hooks.`
    : "Generate between 3 and 5 adventure hooks.";

  return `You are a creative tabletop RPG game master assistant specializing in crafting adventure hooks. You generate hooks that are grounded in the campaign's established setting, incorporating its NPCs, locations, and factions.

Rules:
- ${countInstruction}
- Each hook MUST reference specific NPCs, locations, or factions from the provided setting context when available.
- Do not invent major setting elements (cities, rulers, pantheons) not present in the context. You may invent minor details (a tavern patron's name, a rumor) to flesh out hooks.
- Match the requested tone precisely.
- If a party level is provided, ensure hooks are appropriate for that level of experience.
- If a theme is provided, weave it into every hook.

You MUST respond with valid JSON matching this exact schema:
{
  "hooks": [
    {
      "title": "Short hook title",
      "description": "2-4 sentence hook description incorporating setting details.",
      "npcs": ["NPC Name 1"],
      "locations": ["Location Name 1"],
      "factions": ["Faction Name 1"]
    }
  ]
}

Respond ONLY with the JSON object. No markdown fencing, no commentary.`;
}

// ============================================================================
// User Message Builder
// ============================================================================

/**
 * Build the user message combining setting context and generation parameters.
 */
export function buildAdventureHookPrompt(
  context: BuiltContext,
  tone: HookTone,
  options: { theme?: string; partyLevel?: number; count?: number; includeNpcsLocations?: string } = {},
): { system: string; user: string } {
  const parts: string[] = [];

  // Setting context section
  if (context.chunksUsed > 0) {
    parts.push("=== SETTING CONTEXT ===");
    parts.push(context.contextText);

    const sourceLegend = context.sources
      .map((s) => {
        const info = [`[${s.index}] ${s.documentName}`];
        if (s.section) info.push(`- ${s.section}`);
        if (s.pageNumber !== null) info.push(`(p. ${s.pageNumber})`);
        return info.join(" ");
      })
      .join("\n");

    parts.push(`\nSources:\n${sourceLegend}`);
    parts.push("");
  } else {
    parts.push("No setting context is available. Generate generic fantasy adventure hooks.");
    parts.push("");
  }

  // Generation parameters
  parts.push("=== GENERATION PARAMETERS ===");
  parts.push(`Tone: ${tone}`);

  if (options.theme) {
    parts.push(`Theme: ${options.theme}`);
  }

  if (options.partyLevel !== undefined) {
    parts.push(`Party level: ${options.partyLevel}`);
  }

  if (options.includeNpcsLocations) {
    parts.push(`Include these specific NPCs/locations: ${options.includeNpcsLocations}`);
  }

  parts.push("");
  parts.push("Generate adventure hooks based on the setting context above.");

  return {
    system: buildSystemPrompt(options.count),
    user: parts.join("\n"),
  };
}
