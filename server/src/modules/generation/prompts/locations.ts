// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Location Generation Prompt
 *
 * Constructs the system and user prompts for generating location descriptions
 * grounded in campaign setting context retrieved via RAG.
 */

import type { BuiltContext } from "@/modules/query/rag/types.js";
import type { LocationTone } from "../types.js";

// ============================================================================
// System Prompt
// ============================================================================

function buildSystemPrompt(
  tone: LocationTone,
  options: {
    terrain?: string | undefined;
    climate?: string | undefined;
    size?: string | undefined;
    count?: number | undefined;
  },
): string {
  const countInstruction = options.count !== undefined
    ? `Generate exactly ${options.count} locations.`
    : "Generate between 1 and 3 locations.";

  const toneDescriptions: Record<LocationTone, string> = {
    dark: "grim, foreboding, and oppressive — emphasize decay, danger, and dread lurking in every shadow",
    peaceful: "serene, welcoming, and idyllic — emphasize beauty, comfort, and a sense of safety and belonging",
    mysterious: "enigmatic, eerie, and layered with hidden secrets — emphasize the unknown, strange phenomena, and unanswered questions",
    bustling: "lively, chaotic, and full of activity — emphasize crowds, commerce, noise, and the energy of many lives intersecting",
    ruined: "desolate, crumbling, and haunted by the past — emphasize decay, remnants of former glory, and the weight of history",
    magical: "wondrous, enchanted, and defying mundane expectations — emphasize supernatural beauty, arcane phenomena, and a sense of awe",
  };

  const terrainInstruction = options.terrain
    ? `Terrain: ${options.terrain}`
    : "Choose an appropriate terrain based on the campaign setting context.";

  const climateInstruction = options.climate
    ? `Climate: ${options.climate}`
    : "Choose an appropriate climate based on the campaign setting context.";

  const sizeInstruction = options.size
    ? `Size: ${options.size} — adjust scope and detail accordingly.`
    : "";

  return `You are a creative tabletop RPG game master assistant specializing in location descriptions. Your writing tone for this request is ${tone.toUpperCase()}: ${toneDescriptions[tone]}.

EVERY location you create must unmistakably reflect this ${tone} tone in its description, sensory details, and atmosphere.

Rules:
- ${countInstruction}
- ${terrainInstruction}
- ${climateInstruction}
${sizeInstruction ? `- ${sizeInstruction}` : ""}
- Each location MUST reference specific setting elements (regions, factions, history) from the provided context when available.
- Do not invent major setting elements (cities, rulers, pantheons) not present in the context. You may invent minor environmental details.
- Each location must be distinct from the others — vary their terrain, purpose, and atmosphere.
- When narrative text fields (readAloud, sensoryDetails, keyFeatures, pointsOfInterest, encounters, secrets) reference information from the setting context, include the source number as [N] inline (e.g. "The crumbling tower of Ashenmoor [1] overlooks the Blighted Marshes [2]"). Only cite sources that are listed in the context.
- The "readAloud" field should be a vivid, atmospheric paragraph (3-5 sentences) suitable for reading aloud to players at the table.
- "sensoryDetails" must include sights, sounds, and smells specific to this location.
- "encounters" should list potential encounters or events players might experience here.
- "secrets" should list hidden features, lore, or discoveries players could uncover.

You MUST respond with valid JSON matching this exact schema:
{
  "locations": [
    {
      "name": "Location name",
      "terrain": "Terrain type (forest, mountain, urban, etc.)",
      "climate": "Climate description",
      "size": "small, medium, or large",
      "readAloud": "A vivid 3-5 sentence atmospheric description to read aloud to players",
      "keyFeatures": ["Notable feature 1", "Notable feature 2"],
      "pointsOfInterest": ["Specific place or landmark within the location"],
      "sensoryDetails": {
        "sights": "What players see",
        "sounds": "What players hear",
        "smells": "What players smell"
      },
      "encounters": ["Potential encounter or event"],
      "secrets": ["Hidden detail or discovery"],
      "npcsPresent": ["NPC name and brief role"],
      "factions": ["Faction with presence here"]
    }
  ]
}

Respond ONLY with the JSON object. No markdown fencing, no commentary.`;
}

// ============================================================================
// User Message Builder
// ============================================================================

export function buildLocationPrompt(
  context: BuiltContext,
  tone: LocationTone,
  options: {
    terrain?: string | undefined;
    climate?: string | undefined;
    size?: string | undefined;
    count?: number | undefined;
    constraints?: string | undefined;
  } = {},
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
    parts.push("No setting context is available. Generate generic fantasy locations appropriate for a tabletop RPG.");
    parts.push("");
  }

  // Generation parameters
  parts.push("=== GENERATION PARAMETERS ===");

  if (options.constraints) {
    parts.push(`Additional constraints: ${options.constraints}`);
  }

  // Reinforce tone at the end
  parts.push("");
  parts.push(`Generate locations based on the setting context above. Remember: write in a ${tone} tone.`);

  return {
    system: buildSystemPrompt(tone, {
      terrain: options.terrain,
      climate: options.climate,
      size: options.size,
      count: options.count,
    }),
    user: parts.join("\n"),
  };
}
