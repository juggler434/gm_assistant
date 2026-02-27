// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * NPC Generation Prompt
 *
 * Constructs the system and user prompts for generating NPCs
 * grounded in campaign setting context retrieved via RAG.
 */

import type { BuiltContext } from "@/modules/query/rag/types.js";
import type { NpcTone } from "../types.js";

// ============================================================================
// System Prompt
// ============================================================================

function buildSystemPrompt(
  tone: NpcTone,
  options: {
    race?: string | undefined;
    classRole?: string | undefined;
    level?: string | undefined;
    importance?: string | undefined;
    count?: number | undefined;
    includeStatBlock?: boolean | undefined;
  },
): string {
  const countInstruction = options.count !== undefined
    ? `Generate exactly ${options.count} NPCs.`
    : "Generate between 1 and 3 NPCs.";

  const toneDescriptions: Record<NpcTone, string> = {
    dark: "grim, haunted, and morally grey — emphasize tragedy, dark pasts, and compromised ethics",
    comedic: "humorous, quirky, and memorable — use eccentric personalities, absurd backstories, and witty traits",
    mysterious: "enigmatic, secretive, and layered — hide true motives, add cryptic mannerisms, and unresolved pasts",
    heroic: "noble, brave, and inspiring — emphasize duty, sacrifice, and strong moral convictions",
    gritty: "realistic, hardened, and pragmatic — focus on survival, scars both physical and emotional, and moral ambiguity",
    whimsical: "fantastical, lighthearted, and charming — use fairy-tale logic, unusual features, and delightful quirks",
  };

  const raceInstruction = options.race
    ? `Race/species: ${options.race}`
    : "Choose an appropriate race/species based on the campaign setting context. If the setting doesn't specify available races, use setting-appropriate options.";

  const classInstruction = options.classRole
    ? `Class/role: ${options.classRole}`
    : "Choose an appropriate class or role based on the campaign setting context and the NPC's narrative purpose.";

  const levelInstruction = options.level
    ? `Level/CR: ${options.level}`
    : "Assign an appropriate level or challenge rating based on the game system in the context, if applicable.";

  const importanceInstruction = options.importance
    ? `Importance: ${options.importance} NPC — adjust depth of detail accordingly.`
    : "";

  let statBlockInstruction = "";
  if (options.includeStatBlock) {
    statBlockInstruction = `
Include a stat block appropriate for the game system described in the context. The stat block should be a JSON object with system-appropriate attributes (e.g., ability scores, hit points, armor class, skills, etc.).
Set "statBlockGrounded" to true ONLY if the setting context contains specific game mechanics, stat references, or rulebook information that you based the stats on. If you are estimating or inventing stats without concrete mechanical references, set "statBlockGrounded" to false.`;
  } else {
    statBlockInstruction = `
Do NOT include stat blocks. Set "statBlock" to null and "statBlockGrounded" to false for all NPCs.`;
  }

  return `You are a creative tabletop RPG game master assistant specializing in NPC creation. Your writing tone for this request is ${tone.toUpperCase()}: ${toneDescriptions[tone]}.

EVERY NPC you create must unmistakably reflect this ${tone} tone in their personality, backstory, and description.

Rules:
- ${countInstruction}
- ${raceInstruction}
- ${classInstruction}
- ${levelInstruction}
${importanceInstruction ? `- ${importanceInstruction}` : ""}
- Each NPC MUST reference specific setting elements (locations, factions, events) from the provided context when available.
- Do not invent major setting elements (cities, rulers, pantheons) not present in the context. You may invent minor personal details.
- Each NPC must be distinct from the others — vary their backgrounds, motivations, and roles.
${statBlockInstruction}

You MUST respond with valid JSON matching this exact schema:
{
  "npcs": [
    {
      "name": "Full NPC name",
      "race": "Race or species",
      "classRole": "Class, profession, or social role",
      "level": "Level, CR, or rank as appropriate for the system",
      "appearance": "2-3 sentences describing physical appearance",
      "personality": "2-3 sentences describing personality traits and mannerisms",
      "motivations": "1-2 sentences about what drives this NPC",
      "secrets": "1-2 sentences about hidden knowledge or agendas",
      "backstory": "3-5 sentences of background history",
      "statBlock": null,
      "statBlockGrounded": false
    }
  ]
}

Respond ONLY with the JSON object. No markdown fencing, no commentary.`;
}

// ============================================================================
// User Message Builder
// ============================================================================

export function buildNpcPrompt(
  context: BuiltContext,
  tone: NpcTone,
  options: {
    race?: string | undefined;
    classRole?: string | undefined;
    level?: string | undefined;
    importance?: string | undefined;
    count?: number | undefined;
    includeStatBlock?: boolean | undefined;
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
    parts.push("No setting context is available. Generate generic fantasy NPCs appropriate for a tabletop RPG.");
    parts.push("");
  }

  // Generation parameters
  parts.push("=== GENERATION PARAMETERS ===");

  if (options.constraints) {
    parts.push(`Additional constraints: ${options.constraints}`);
  }

  // Reinforce tone at the end
  const reminders = [`Remember: write in a ${tone} tone`];
  parts.push("");
  parts.push(`Generate NPCs based on the setting context above. ${reminders.join(", ")}.`);

  return {
    system: buildSystemPrompt(tone, {
      race: options.race,
      classRole: options.classRole,
      level: options.level,
      importance: options.importance,
      count: options.count,
      includeStatBlock: options.includeStatBlock,
    }),
    user: parts.join("\n"),
  };
}
