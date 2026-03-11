// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Adventure Generation Prompts - Multi-Step Pipeline
 *
 * Provides focused prompt builders for each step of the chained adventure
 * generation pipeline: outline, locations, NPCs, encounters, and scene
 * composition. Each prompt is designed for a single, focused LLM call.
 */

import type { HookTone } from "../types.js";

// ============================================================================
// Shared Tone Descriptions
// ============================================================================

const toneDescriptions: Record<HookTone, string> = {
  dark: "grim, bleak, and ominous — emphasize dread, moral decay, and hopelessness",
  comedic: "humorous, absurd, and lighthearted — use wordplay, slapstick situations, and ironic twists",
  political: "scheming, diplomatic, and full of intrigue — focus on power struggles, alliances, and betrayal",
  mysterious: "enigmatic, suspenseful, and unsettling — leave questions unanswered and clues half-hidden",
  heroic: "epic, inspiring, and noble — emphasize bravery, sacrifice, and triumph against the odds",
  horror: "terrifying, disturbing, and visceral — invoke fear, body horror, and the unknown",
  intrigue: "secretive, layered, and deceptive — weave plots within plots, hidden motives, and double-crosses",
};

// ============================================================================
// Shared Context Types (passed to each prompt builder)
// ============================================================================

export interface PipelinePromptContext {
  settingText: string;
  sourceLegend: string;
  campaignContentText: string;
}

export interface ActDescription {
  actNumber: number;
  title: string;
  description: string;
  keyEvents: string[];
  encounterIdeas: string[];
}

// ============================================================================
// 1. Outline Step Prompt
// ============================================================================

export function buildOutlineStepPrompt(
  ctx: PipelinePromptContext,
  tone: HookTone,
  options: {
    theme?: string | undefined;
    partyLevel?: string | undefined;
  } = {},
): { system: string; user: string } {
  const themeInstruction = options.theme
    ? `\nThe adventure theme is "${options.theme}". The entire outline must revolve around this theme.`
    : "";

  const system = `You are a creative tabletop RPG game master assistant. Your tone is ${tone.toUpperCase()}: ${toneDescriptions[tone]}.${themeInstruction}

Generate a single three-act adventure outline with a clear narrative arc:
- Act 1: Setup, world introduction, and inciting incident
- Act 2: Rising action, complications, revelations, and moral choices
- Act 3: Climax and resolution

Rules:
- Do not invent major setting elements (cities, rulers, pantheons) not found in the context
- Include 2-4 key events per act
- Include 1-3 encounter ideas per act (brief descriptions, not full encounters)
- The outline must feel cohesive — each act flows naturally into the next
- ONLY add [N] citations when you mention a specific named person, place, faction, or organization that appears in the setting context (e.g. "The Zhentarim [1] have agents in Waterdeep [2]"). Do not cite general themes, tone, or ideas. Only cite sources listed in the context.

Respond with valid JSON matching this schema:
{
  "outline": {
    "title": "Adventure title",
    "synopsis": "2-4 sentence overview of the adventure",
    "estimatedDuration": "4-6 hours",
    "acts": [
      {
        "actNumber": 1,
        "title": "Act title",
        "description": "2-3 sentences describing this act's role in the story",
        "keyEvents": ["Key event 1", "Key event 2"],
        "encounterIdeas": ["Brief encounter idea 1"]
      }
    ]
  }
}

Respond ONLY with the JSON object. No markdown fencing, no commentary.`;

  const parts: string[] = [];

  if (ctx.settingText) {
    parts.push("=== SETTING CONTEXT ===");
    parts.push(ctx.settingText);
    if (ctx.sourceLegend) {
      parts.push(`\nSources:\n${ctx.sourceLegend}`);
    }
    parts.push("");
  } else {
    parts.push("No setting context available. Create a generic fantasy adventure outline.");
    parts.push("");
  }

  if (ctx.campaignContentText) {
    parts.push("=== EXISTING CAMPAIGN CONTENT ===");
    parts.push(ctx.campaignContentText);
    parts.push("");
  }

  parts.push("=== PARAMETERS ===");
  parts.push(`Tone: ${tone}`);
  if (options.partyLevel) {
    parts.push(`Party level / CR: ${options.partyLevel}`);
  }
  if (options.theme) {
    parts.push(`Theme: ${options.theme}`);
  }
  parts.push("");
  parts.push("Generate a three-act adventure outline based on the context above.");

  return { system, user: parts.join("\n") };
}

// ============================================================================
// 2. Act Locations Prompt
// ============================================================================

export function buildActLocationsPrompt(
  ctx: PipelinePromptContext,
  tone: HookTone,
  act: ActDescription,
  options: {
    theme?: string | undefined;
  } = {},
): { system: string; user: string } {
  const system = `You are a creative tabletop RPG game master assistant. Your tone is ${tone.toUpperCase()}: ${toneDescriptions[tone]}.

Generate 1-3 locations that would feature in a specific act of an adventure. Each location should be vivid, atmospheric, and suitable for tabletop play.

Rules:
- Include specific gameable features (cover, hazards, exits, environmental effects)
- Atmosphere should match the ${tone} tone
- Do not invent major setting elements not in the context. You may create minor locations.
- Map suggestions should describe the physical layout concisely
- ONLY add [N] citations when you mention a specific named place, landmark, or faction that appears in the setting context (e.g. "The crumbling tower of Ashenmoor [1]"). Do not cite general descriptions or atmosphere. Only cite sources listed in the context.

Respond with valid JSON:
{
  "locations": [
    {
      "name": "Location name",
      "description": "2-3 sentences describing the location",
      "keyFeatures": ["Gameable detail 1", "Gameable detail 2"],
      "atmosphere": "Sensory details (sights, sounds, smells)",
      "mapSuggestion": "Physical layout description"
    }
  ]
}

Respond ONLY with JSON.`;

  const parts: string[] = [];

  if (ctx.settingText) {
    parts.push("=== SETTING CONTEXT ===");
    parts.push(ctx.settingText);
    if (ctx.sourceLegend) {
      parts.push(`\nSources:\n${ctx.sourceLegend}`);
    }
    parts.push("");
  }

  parts.push(`=== ACT ${act.actNumber}: ${act.title} ===`);
  parts.push(act.description);
  if (act.keyEvents.length > 0) {
    parts.push(`Key events: ${act.keyEvents.join("; ")}`);
  }
  parts.push("");

  if (options.theme) {
    parts.push(`Theme: ${options.theme}`);
  }
  parts.push(`Generate 1-3 locations for Act ${act.actNumber}.`);

  return { system, user: parts.join("\n") };
}

// ============================================================================
// 3. Act NPCs Prompt
// ============================================================================

export interface PipelineLocationSummary {
  name: string;
  description: string;
}

export function buildActNpcsPrompt(
  ctx: PipelinePromptContext,
  tone: HookTone,
  act: ActDescription,
  locations: PipelineLocationSummary[],
  options: {
    theme?: string | undefined;
  } = {},
): { system: string; user: string } {
  const system = `You are a creative tabletop RPG game master assistant. Your tone is ${tone.toUpperCase()}: ${toneDescriptions[tone]}.

Generate 2-4 NPCs who appear in a specific act of an adventure. Each NPC should have a distinct personality and useful dialogue for the GM.

Rules:
- Each NPC needs a clear role in this act's events
- Dialogue should be practical — things the NPC would actually say to the party
- Include context for when/why each dialogue line would be used
- Do not invent major NPCs contradicting the setting context
- If existing campaign NPCs are relevant, reference them by name
- ONLY add [N] citations when you mention a specific named person, place, faction, or organization that appears in the setting context (e.g. "A former knight of the Silver Order [1]"). Do not cite personality traits, motivations, or dialogue you invented. Only cite sources listed in the context.

Respond with valid JSON:
{
  "npcs": [
    {
      "name": "NPC name",
      "role": "Brief role in this act",
      "personality": "Key personality traits",
      "motivations": "What they want",
      "appearance": "Brief physical description",
      "keyDialogue": [
        { "dialogue": "What they say", "context": "When/why they say it" }
      ]
    }
  ]
}

Respond ONLY with JSON.`;

  const parts: string[] = [];

  if (ctx.settingText) {
    parts.push("=== SETTING CONTEXT ===");
    parts.push(ctx.settingText);
    if (ctx.sourceLegend) {
      parts.push(`\nSources:\n${ctx.sourceLegend}`);
    }
    parts.push("");
  }

  if (ctx.campaignContentText) {
    parts.push("=== EXISTING CAMPAIGN CONTENT ===");
    parts.push(ctx.campaignContentText);
    parts.push("");
  }

  parts.push(`=== ACT ${act.actNumber}: ${act.title} ===`);
  parts.push(act.description);
  if (act.keyEvents.length > 0) {
    parts.push(`Key events: ${act.keyEvents.join("; ")}`);
  }
  parts.push("");

  if (locations.length > 0) {
    parts.push("=== LOCATIONS IN THIS ACT ===");
    for (const loc of locations) {
      parts.push(`- ${loc.name}: ${loc.description}`);
    }
    parts.push("");
  }

  if (options.theme) {
    parts.push(`Theme: ${options.theme}`);
  }
  parts.push(`Generate 2-4 NPCs for Act ${act.actNumber}.`);

  return { system, user: parts.join("\n") };
}

// ============================================================================
// 4. Act Encounters Prompt
// ============================================================================

export interface PipelineNpcSummary {
  name: string;
  role: string;
}

export function buildActEncountersPrompt(
  ctx: PipelinePromptContext,
  tone: HookTone,
  act: ActDescription,
  locations: PipelineLocationSummary[],
  npcs: PipelineNpcSummary[],
  options: {
    partyLevel?: string | undefined;
    includeStatBlocks?: boolean | undefined;
    theme?: string | undefined;
  } = {},
): { system: string; user: string } {
  const wantStatBlocks = options.includeStatBlocks !== false;
  const statBlockInstruction = wantStatBlocks
    ? `\n- You MUST include a "statBlock" object for EVERY encounter. Use creature stats from the setting/rulebook context when available. For creatures not in the context, generate appropriate stat blocks scaled to the party level. Each statBlock must include at minimum: "ac" (number), "hp" (string like "45 (6d10+12)"), "speed" (string), "abilities" (object with "str","dex","con","int","wis","cha" as numbers), and "actions" (array of {"name","description"} objects). You may also include "size", "type", "cr", "savingThrows", "skills", "damageResistances", "senses", "languages", and "traits" (array of {"name","description"}).`
    : "\n- Set statBlock to null for all encounters.";

  const statBlockExample = wantStatBlocks
    ? `"statBlock": { "ac": 15, "hp": "45 (6d10+12)", "speed": "30 ft.", "abilities": { "str": 16, "dex": 12, "con": 14, "int": 8, "wis": 10, "cha": 6 }, "actions": [{ "name": "Multiattack", "description": "Makes two claw attacks." }, { "name": "Claw", "description": "+5 to hit, reach 5 ft., 1d8+3 slashing damage." }] }`
    : `"statBlock": null`;

  const system = `You are a creative tabletop RPG game master assistant. Your tone is ${tone.toUpperCase()}: ${toneDescriptions[tone]}.

Generate 1-3 encounters for a specific act of an adventure. Each encounter should be tactically interesting and fit the narrative.

Rules:
- Place each encounter in one of the provided locations
- Scale difficulty appropriately to the party level${statBlockInstruction}
- Tactics should describe how creatures fight, retreat, and use the environment
- Creatures array should include count, e.g. "Goblin Warrior (3)"
- ONLY add [N] citations when you mention a specific named creature, faction, or location that appears in the setting context (e.g. "Zhentarim agents [1]"). Do not cite general tactics or encounter descriptions. Only cite sources listed in the context.

Respond with valid JSON:
{
  "encounters": [
    {
      "name": "Encounter name",
      "description": "What triggers this encounter and what happens",
      "difficulty": "easy|medium|hard|deadly",
      "creatures": ["Creature Name (count)"],
      "tactics": "How the creatures fight and use the environment",
      ${statBlockExample},
      "locationName": "Name of the location where this occurs"
    }
  ]
}

Respond ONLY with JSON.`;

  const parts: string[] = [];

  if (ctx.settingText) {
    parts.push("=== SETTING CONTEXT ===");
    parts.push(ctx.settingText);
    if (ctx.sourceLegend) {
      parts.push(`\nSources:\n${ctx.sourceLegend}`);
    }
    parts.push("");
  }

  parts.push(`=== ACT ${act.actNumber}: ${act.title} ===`);
  parts.push(act.description);
  if (act.keyEvents.length > 0) {
    parts.push(`Key events: ${act.keyEvents.join("; ")}`);
  }
  if (act.encounterIdeas.length > 0) {
    parts.push(`Encounter ideas from outline: ${act.encounterIdeas.join("; ")}`);
  }
  parts.push("");

  if (locations.length > 0) {
    parts.push("=== LOCATIONS ===");
    for (const loc of locations) {
      parts.push(`- ${loc.name}: ${loc.description}`);
    }
    parts.push("");
  }

  if (npcs.length > 0) {
    parts.push("=== NPCs ===");
    for (const npc of npcs) {
      parts.push(`- ${npc.name}: ${npc.role}`);
    }
    parts.push("");
  }

  if (options.partyLevel) {
    parts.push(`Party level / CR: ${options.partyLevel}`);
  }
  if (options.theme) {
    parts.push(`Theme: ${options.theme}`);
  }
  parts.push(`Generate 1-3 encounters for Act ${act.actNumber}.`);

  return { system, user: parts.join("\n") };
}

// ============================================================================
// 5. Act Scene Composition Prompt
// ============================================================================

export interface PipelineOutlineSummary {
  title: string;
  synopsis: string;
}

export interface PipelineNpcDetail {
  name: string;
  role: string;
  personality: string;
  appearance: string;
  keyDialogue: { dialogue: string; context: string }[];
}

export interface PipelineLocationDetail {
  name: string;
  description: string;
  keyFeatures: string[];
  atmosphere: string;
  mapSuggestion: string;
}

export interface PipelineEncounterDetail {
  name: string;
  description: string;
  difficulty: string;
  creatures: string[];
  tactics: string;
  locationName: string;
}

export function buildActScenesPrompt(
  ctx: PipelinePromptContext,
  tone: HookTone,
  outline: PipelineOutlineSummary,
  act: ActDescription,
  locations: PipelineLocationDetail[],
  npcs: PipelineNpcDetail[],
  encounters: PipelineEncounterDetail[],
  options: {
    theme?: string | undefined;
  } = {},
): { system: string; user: string } {
  const system = `You are a creative tabletop RPG game master assistant. Your tone is ${tone.toUpperCase()}: ${toneDescriptions[tone]}.

Compose 1-3 detailed, playable scenes for a specific act of an adventure. Weave together the provided locations, NPCs, and encounters into a coherent narrative.

Each scene MUST include ALL of these elements:
- title: Scene name
- description: 2-4 sentences of GM-facing notes (what's happening, player options, potential outcomes)
- readAloud: Atmospheric second-person text to read aloud to players (2-4 sentences, vivid and immersive)
- npcDialogue: At least one NPC dialogue line from the provided NPCs
- encounters: Combat or social encounters from the provided list (set statBlock to null — stat blocks are added separately)
- treasure: 1-3 level-appropriate rewards
- mapSuggestion: Physical layout description based on the provided locations

Rules:
- Every provided encounter must appear in exactly one scene
- Reference provided NPC dialogue but you may add more lines
- Base map suggestions on the provided location details
- ONLY add [N] citations when you mention a specific named person, place, faction, or organization that appears in the setting context (e.g. "The Zhentarim [1] have agents in Waterdeep [2]"). Do not cite scene descriptions, atmosphere, or dialogue you composed. Only cite sources listed in the context.
- Set statBlock to null for ALL encounters

Respond with valid JSON:
{
  "scenes": [
    {
      "title": "Scene title",
      "actNumber": ${act.actNumber},
      "description": "GM notes",
      "readAloud": "Second-person atmospheric text",
      "npcDialogue": [
        { "npcName": "NPC Name", "dialogue": "What they say", "context": "When/why" }
      ],
      "encounters": [
        {
          "name": "Encounter name",
          "description": "What happens",
          "difficulty": "medium",
          "creatures": ["Creature (count)"],
          "tactics": "How they fight",
          "statBlock": null
        }
      ],
      "treasure": ["Reward 1"],
      "mapSuggestion": "Layout description"
    }
  ]
}

Respond ONLY with JSON.`;

  const parts: string[] = [];

  if (ctx.settingText) {
    parts.push("=== SETTING CONTEXT ===");
    parts.push(ctx.settingText);
    if (ctx.sourceLegend) {
      parts.push(`\nSources:\n${ctx.sourceLegend}`);
    }
    parts.push("");
  }

  parts.push("=== ADVENTURE OVERVIEW ===");
  parts.push(`Title: ${outline.title}`);
  parts.push(`Synopsis: ${outline.synopsis}`);
  parts.push("");

  parts.push(`=== ACT ${act.actNumber}: ${act.title} ===`);
  parts.push(act.description);
  if (act.keyEvents.length > 0) {
    parts.push("Key events:");
    for (const event of act.keyEvents) {
      parts.push(`- ${event}`);
    }
  }
  parts.push("");

  if (locations.length > 0) {
    parts.push("=== GENERATED LOCATIONS ===");
    for (const loc of locations) {
      parts.push(`## ${loc.name}`);
      parts.push(loc.description);
      if (loc.keyFeatures.length > 0) {
        parts.push(`Features: ${loc.keyFeatures.join("; ")}`);
      }
      parts.push(`Atmosphere: ${loc.atmosphere}`);
      parts.push(`Map: ${loc.mapSuggestion}`);
      parts.push("");
    }
  }

  if (npcs.length > 0) {
    parts.push("=== GENERATED NPCs ===");
    for (const npc of npcs) {
      parts.push(`## ${npc.name} (${npc.role})`);
      parts.push(`Personality: ${npc.personality}`);
      parts.push(`Appearance: ${npc.appearance}`);
      if (npc.keyDialogue.length > 0) {
        parts.push("Dialogue:");
        for (const d of npc.keyDialogue) {
          parts.push(`- "${d.dialogue}" (${d.context})`);
        }
      }
      parts.push("");
    }
  }

  if (encounters.length > 0) {
    parts.push("=== GENERATED ENCOUNTERS ===");
    for (const enc of encounters) {
      parts.push(`## ${enc.name} [${enc.difficulty}] at ${enc.locationName}`);
      parts.push(enc.description);
      parts.push(`Creatures: ${enc.creatures.join(", ")}`);
      parts.push(`Tactics: ${enc.tactics}`);
      parts.push("");
    }
  }

  if (options.theme) {
    parts.push(`Theme: ${options.theme}`);
  }
  parts.push(`Compose 1-3 detailed scenes for Act ${act.actNumber}, incorporating all the content above.`);

  return { system, user: parts.join("\n") };
}
