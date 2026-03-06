// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Adventure Outlines Prompt
 *
 * Constructs the system and user prompts for generating adventure outlines
 * with three-act structure, grounded in campaign setting context retrieved via RAG.
 */

import type { BuiltContext } from "@/modules/query/rag/types.js";
import type { HookTone } from "../types.js";
import type { CampaignContentResult } from "../campaign-content.js";

// ============================================================================
// System Prompt
// ============================================================================

function buildSystemPrompt(
  tone: HookTone,
  options: { theme?: string | undefined; count?: number | undefined },
): string {
  const countInstruction = options.count !== undefined
    ? `Generate exactly ${options.count} adventure outline(s).`
    : "Generate 1 adventure outline.";

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
    ? `\nThe theme "${options.theme}" is CENTRAL to this request. Every outline must directly incorporate this theme as a core element of its premise, not just a passing reference.`
    : "";

  return `You are a creative tabletop RPG game master assistant. Your writing tone for this request is ${tone.toUpperCase()}: ${toneDescriptions[tone]}.

EVERY outline you write must unmistakably reflect this ${tone} tone in its language, imagery, and narrative framing.${themeInstruction}

Rules:
- ${countInstruction}
- Each outline MUST follow a three-act structure: Beginning (setup and hook), Middle (rising action and complications), End (climax and resolution).
- Each act MUST reference specific NPCs, locations, or factions from the provided setting context when available.
- Do not invent major setting elements (cities, rulers, pantheons) not present in the context. You may invent minor details (a tavern patron's name, a rumor) to flesh out outlines.
- If a party level is provided, ensure encounters and challenges are appropriate for that level.
- When the description references information from the setting context, include the source number as [N] inline (e.g. "The cult of Vecna [1] has infiltrated the city [2]"). Only cite sources that are listed in the context.
- If saved campaign content is provided, ensure consistency with existing content and avoid creating duplicates. You may reference existing NPCs, locations, and hooks to create connections.
- Each act should have 2-4 key events and 1-3 encounters.

You MUST respond with valid JSON matching this exact schema:
{
  "outlines": [
    {
      "title": "Adventure title",
      "description": "2-3 sentence adventure premise/overview.",
      "acts": [
        {
          "title": "Act 1: Beginning",
          "description": "2-4 sentences describing the setup, inciting incident, and initial hook.",
          "keyEvents": ["Event 1 description", "Event 2 description"],
          "encounters": ["Encounter 1 description"]
        },
        {
          "title": "Act 2: Middle",
          "description": "2-4 sentences describing rising action, complications, and twists.",
          "keyEvents": ["Event 1 description", "Event 2 description"],
          "encounters": ["Encounter 1 description"]
        },
        {
          "title": "Act 3: End",
          "description": "2-4 sentences describing the climax and resolution.",
          "keyEvents": ["Event 1 description", "Event 2 description"],
          "encounters": ["Encounter 1 description"]
        }
      ],
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
export function buildAdventureOutlinePrompt(
  context: BuiltContext,
  tone: HookTone,
  options: { theme?: string; partyLevel?: string; count?: number; includeNpcsLocations?: string; campaignContent?: CampaignContentResult } = {},
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
    parts.push("No setting context is available. Generate generic fantasy adventure outlines.");
    parts.push("");
  }

  // Saved campaign content section
  if (options.campaignContent && options.campaignContent.contentText) {
    parts.push("=== SAVED CAMPAIGN CONTENT ===");
    parts.push(options.campaignContent.contentText);
    parts.push("");
  }

  // Generation parameters
  parts.push("=== GENERATION PARAMETERS ===");

  if (options.partyLevel !== undefined) {
    parts.push(`Party level / CR: ${options.partyLevel}`);
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
  parts.push(`Generate adventure outlines based on the setting context above. ${reminders.join(", ")}.`);

  return {
    system: buildSystemPrompt(tone, { theme: options.theme, count: options.count }),
    user: parts.join("\n"),
  };
}
