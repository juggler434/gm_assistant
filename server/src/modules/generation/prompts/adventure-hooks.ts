// SPDX-License-Identifier: AGPL-3.0-or-later

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

function buildSystemPrompt(
  tone: HookTone,
  options: { theme?: string | undefined; count?: number | undefined },
): string {
  const countInstruction = options.count !== undefined
    ? `Generate exactly ${options.count} adventure hooks.`
    : "Generate between 3 and 5 adventure hooks.";

  const toneDescriptions: Record<HookTone, string> = {
    dark: "grim, bleak, and ominous — emphasize dread, moral decay, and hopelessness",
    comedic: "humorous, absurd, and lighthearted — use wordplay, slapstick situations, and ironic twists",
    political: "scheming, diplomatic, and full of intrigue — focus on power struggles, alliances, and betrayal",
    mysterious: "enigmatic, suspenseful, and unsettling — leave questions unanswered and clues half-hidden",
    heroic: "epic, inspiring, and noble — emphasize bravery, sacrifice, and triumph against the odds",
    horror: "terrifying, disturbing, and visceral — invoke fear, body horror, and the unknown",
    intrigue: "secretive, layered, and deceptive — weave plots within plots, hidden motives, and double-crosses",
  };

  const themeInstruction = options.theme
    ? `\nThe theme "${options.theme}" is CENTRAL to this request. Every hook must directly incorporate this theme as a core element of its premise, not just a passing reference.`
    : "";

  return `You are a creative tabletop RPG game master assistant. Your writing tone for this request is ${tone.toUpperCase()}: ${toneDescriptions[tone]}.

EVERY hook you write must unmistakably reflect this ${tone} tone in its language, imagery, and narrative framing.${themeInstruction}

Rules:
- ${countInstruction}
- Each hook MUST reference specific NPCs, locations, or factions from the provided setting context when available.
- Do not invent major setting elements (cities, rulers, pantheons) not present in the context. You may invent minor details (a tavern patron's name, a rumor) to flesh out hooks.
- If a party level is provided, ensure hooks are appropriate for that level of experience.

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

  if (options.partyLevel !== undefined) {
    parts.push(`Party level: ${options.partyLevel}`);
  }

  if (options.includeNpcsLocations) {
    parts.push(`Include these specific NPCs/locations: ${options.includeNpcsLocations}`);
  }

  // Reinforce tone and theme at the end where the model pays most attention
  const reminders = [`Remember: write in a ${tone} tone`];
  if (options.theme) {
    reminders.push(`centered on the theme "${options.theme}"`);
  }
  parts.push("");
  parts.push(`Generate adventure hooks based on the setting context above. ${reminders.join(", ")}.`);

  return {
    system: buildSystemPrompt(tone, { theme: options.theme, count: options.count }),
    user: parts.join("\n"),
  };
}
