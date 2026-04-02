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
  /** Rulebook-only context for stat blocks / game mechanics. Kept separate
   *  from settingText so the LLM can distinguish narrative lore from rules. */
  rulebookText?: string | undefined;
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
    previousNpcNames?: string[] | undefined;
  } = {},
): { system: string; user: string } {
  const avoidNamesRule = options.previousNpcNames && options.previousNpcNames.length > 0
    ? `\n- The following NPC names have ALREADY been used in earlier acts. Do NOT reuse any of them: ${options.previousNpcNames.join(", ")}.`
    : "";

  const system = `You are a creative tabletop RPG game master assistant. Your tone is ${tone.toUpperCase()}: ${toneDescriptions[tone]}.

Generate 2-4 NPCs who appear in a specific act of an adventure. Each NPC should have a distinct personality and useful dialogue for the GM.

Rules:
- Each NPC needs a clear role in this act's events
- When creating each NPC's name, generate it as if inventing a fresh identity, not recalling one. Choose time- and setting-appropriate first and last names that sound natural yet distinctive. Use diverse phonetics, syllable counts, cultural origins, and naming styles to create variety. Each name should feel individual and grounded only in the setting and character's origin. Aim for names that could belong to anyone, not just an archetype.${avoidNamesRule}
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
  const hasRulebook = !!ctx.rulebookText;
  let statBlockInstruction: string;
  let statBlockExample: string;

  if (!wantStatBlocks) {
    statBlockInstruction = "\n- Set statBlock to null for all encounters.";
    statBlockExample = `"statBlock": null`;
  } else if (hasRulebook) {
    statBlockInstruction =
      "\n- You MUST include a \"statBlock\" object for EVERY encounter." +
      " Derive the stat block FORMAT, ATTRIBUTES, and MECHANICS **exclusively** from the RULEBOOK section below." +
      " Do NOT assume D&D / d20 attributes (no str/dex/con/int/wis/cha unless that is what the RULEBOOK uses)." +
      " Do NOT borrow mechanics from the setting context — setting documents may be from a different game system." +
      " Study the RULEBOOK section carefully: identify which attributes, defenses, skills, and action formats it uses, then replicate that structure in your statBlock JSON." +
      " For creatures not found in the rulebook, invent stats that are consistent with the rulebook's system and scaled to the party level.";
    statBlockExample =
      `"statBlock": { "...keys and structure derived from the RULEBOOK's game system..." }`;
  } else {
    statBlockInstruction =
      "\n- Include a \"statBlock\" object for each encounter with stats appropriate for the game system described in the context." +
      " If no game system is evident, use a generic format with attributes, hit points, defenses, and actions.";
    statBlockExample =
      `"statBlock": { "...system-appropriate stats..." }`;
  }

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
    parts.push("=== SETTING CONTEXT (narrative / lore only) ===");
    parts.push(ctx.settingText);
    if (ctx.sourceLegend) {
      parts.push(`\nSources:\n${ctx.sourceLegend}`);
    }
    parts.push("");
  }

  if (ctx.rulebookText) {
    parts.push("=== RULEBOOK (use ONLY this section for stat block rules, mechanics, and creature stats) ===");
    parts.push(ctx.rulebookText);
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

// ============================================================================
// Node-Based Adventure Prompts
// ============================================================================

// ============================================================================
// N1. Front + Doom Timeline Prompt
// ============================================================================

export function buildFrontAndDoomPrompt(
  ctx: PipelinePromptContext,
  tone: HookTone,
  options: {
    theme?: string | undefined;
    partyLevel?: string | undefined;
    outlineSeed?: string | undefined;
  } = {},
): { system: string; user: string } {
  const themeInstruction = options.theme
    ? `\nThe adventure theme is "${options.theme}". The entire front must revolve around this theme.`
    : "";

  const system = `You are a creative tabletop RPG game master assistant. Your tone is ${tone.toUpperCase()}: ${toneDescriptions[tone]}.${themeInstruction}

You design adventures as SITUATIONS, not plots. Instead of scripting what happens, you describe:
1. A FRONT — an evolving situation with factions that have goals, resources, and plans
2. A DOOM TIMELINE — what happens over time if the players never intervene

The front presents a situation the players react to freely. The doom timeline creates urgency — each stage escalates the consequences, giving the GM a "clock" to apply pressure.

Generate a single adventure front with a doom timeline.

Rules:
- The front must describe a situation with 2-4 factions/forces, each with a clear goal and the resources to pursue it
- Stakes must be concrete — what specifically will happen if no one stops it
- The doom timeline must have 4-6 stages, each escalating from the last
- Timeline labels should indicate approximate timing (e.g. "Day 1", "After 3 days", "One week later")
- Each timeline stage should name which parts of the situation change
- Do not invent major setting elements (cities, rulers, pantheons) not found in the context
- ONLY add [N] citations when you mention a specific named person, place, faction, or organization from the setting context. Only cite sources listed in the context.

Respond with valid JSON matching this schema:
{
  "title": "Adventure title",
  "synopsis": "2-4 sentence overview of the situation",
  "estimatedDuration": "4-6 hours",
  "front": {
    "description": "What is happening — the evolving situation the players walk into",
    "stakes": "What happens if no one intervenes",
    "keyFactions": [
      {
        "name": "Faction or force name",
        "goal": "What they want to achieve",
        "resources": "What they have at their disposal (people, magic, leverage, etc.)"
      }
    ]
  },
  "doomTimeline": [
    {
      "stage": 1,
      "label": "Day 1 — The Warning Signs",
      "event": "What happens at this stage",
      "consequence": "How the situation changes as a result",
      "nodesAffected": []
    }
  ]
}

The nodesAffected array will be empty for now — it will be filled in after nodes are generated.

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
    parts.push("No setting context available. Create a generic fantasy adventure front.");
    parts.push("");
  }

  if (ctx.campaignContentText) {
    parts.push("=== EXISTING CAMPAIGN CONTENT ===");
    parts.push(ctx.campaignContentText);
    parts.push("");
  }

  if (options.outlineSeed) {
    parts.push("=== OUTLINE SEED ===");
    parts.push("Use this existing adventure outline as inspiration for the front, but restructure it as a situation rather than a linear plot:");
    parts.push(options.outlineSeed);
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
  parts.push("Generate an adventure front with a doom timeline based on the context above.");

  return { system, user: parts.join("\n") };
}

// ============================================================================
// N2. Node Map Prompt
// ============================================================================

export interface FrontSummary {
  title: string;
  synopsis: string;
  description: string;
  stakes: string;
  factions: { name: string; goal: string }[];
}

export interface DoomTimelineSummary {
  stages: { stage: number; label: string; event: string }[];
}

export function buildNodeMapPrompt(
  ctx: PipelinePromptContext,
  tone: HookTone,
  front: FrontSummary,
  doomTimeline: DoomTimelineSummary,
  options: {
    theme?: string | undefined;
    partyLevel?: string | undefined;
  } = {},
): { system: string; user: string } {
  const system = `You are a creative tabletop RPG game master assistant. Your tone is ${tone.toUpperCase()}: ${toneDescriptions[tone]}.

Design a NODE MAP for an adventure — a web of interconnected locations and situations linked by clues. This is NOT a linear path. Players can discover nodes in any order by following clues.

Key design principles:
- THE THREE CLUE RULE: For every conclusion or node the players need to reach, provide at least 3 different clues pointing to it. Players will miss clues, misinterpret them, or ignore them. Three paths ensure they can always find their way.
- ENTRY POINTS: Mark 1-2 nodes as entry points — where the adventure begins. These are the nodes the players encounter first or are directed to.
- CLUE CONNECTIONS: Every non-entry node must be reachable via clues from other nodes. Clues can be physical evidence, NPC information, observations, documents, or trails.
- VARIETY: Mix node types — locations to explore, events to witness, encounters to fight, and social situations to navigate.

Generate 5-8 nodes forming an interconnected web.

Rules:
- Use simple IDs: "n1", "n2", "n3", etc.
- Each node needs a brief description (2-3 sentences) — details will be fleshed out later
- Connections must describe WHAT clue leads to the next node and HOW it is found
- Hidden clues require active investigation; obvious clues are found automatically
- Not every node needs to be visited to resolve the adventure — create optional nodes that add depth
- Do not invent major setting elements not in the context
- ONLY add [N] citations when mentioning specific named entities from the setting context. Only cite sources listed in the context.

Respond with valid JSON:
{
  "nodes": [
    {
      "id": "n1",
      "name": "Node name",
      "type": "location",
      "briefDescription": "2-3 sentences describing what this node is about",
      "isEntryPoint": true,
      "connections": [
        {
          "pointsTo": "n2",
          "clueDescription": "What clue or information leads the players to the next node",
          "clueType": "evidence",
          "isHidden": false
        }
      ]
    }
  ]
}

Valid node types: "location", "event", "encounter", "social"
Valid clue types: "evidence", "npc_info", "observation", "document", "trail"

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

  parts.push("=== ADVENTURE FRONT ===");
  parts.push(`Title: ${front.title}`);
  parts.push(`Synopsis: ${front.synopsis}`);
  parts.push(`Situation: ${front.description}`);
  parts.push(`Stakes: ${front.stakes}`);
  parts.push("");
  parts.push("Factions:");
  for (const faction of front.factions) {
    parts.push(`- ${faction.name}: ${faction.goal}`);
  }
  parts.push("");

  parts.push("=== DOOM TIMELINE ===");
  for (const stage of doomTimeline.stages) {
    parts.push(`${stage.stage}. ${stage.label}: ${stage.event}`);
  }
  parts.push("");

  if (options.partyLevel) {
    parts.push(`Party level / CR: ${options.partyLevel}`);
  }
  if (options.theme) {
    parts.push(`Theme: ${options.theme}`);
  }
  parts.push("Generate a web of 5-8 interconnected nodes for this adventure.");

  return { system, user: parts.join("\n") };
}

// ============================================================================
// N3. Node Detail Prompt
// ============================================================================

export interface NodeStub {
  id: string;
  name: string;
  type: string;
  briefDescription: string;
  isEntryPoint: boolean;
  connections: {
    pointsTo: string;
    clueDescription: string;
    clueType: string;
    isHidden: boolean;
  }[];
}

export function buildNodeDetailPrompt(
  ctx: PipelinePromptContext,
  tone: HookTone,
  front: FrontSummary,
  doomTimeline: DoomTimelineSummary,
  node: NodeStub,
  allNodes: NodeStub[],
  options: {
    theme?: string | undefined;
    partyLevel?: string | undefined;
    includeStatBlocks?: boolean | undefined;
    previousNpcNames?: string[] | undefined;
  } = {},
): { system: string; user: string } {
  const avoidNamesRule = options.previousNpcNames && options.previousNpcNames.length > 0
    ? `\n- The following NPC names have ALREADY been used in other nodes. Do NOT reuse any of them: ${options.previousNpcNames.join(", ")}.`
    : "";

  const wantStatBlocks = options.includeStatBlocks !== false;
  const hasRulebook = !!ctx.rulebookText;
  let statBlockInstruction: string;

  if (!wantStatBlocks) {
    statBlockInstruction = "\n- Set statBlock to null for all encounters.";
  } else if (hasRulebook) {
    statBlockInstruction =
      "\n- Include a \"statBlock\" object for EVERY encounter." +
      " Derive the format and mechanics from the RULEBOOK section below." +
      " Do NOT assume D&D attributes unless that is what the RULEBOOK uses.";
  } else {
    statBlockInstruction =
      "\n- Include a \"statBlock\" object for each encounter with stats appropriate for the game system in the context." +
      " If no game system is evident, use a generic format.";
  }

  const system = `You are a creative tabletop RPG game master assistant. Your tone is ${tone.toUpperCase()}: ${toneDescriptions[tone]}.

Flesh out a single adventure NODE with full detail. This node is part of a non-linear, situation-based adventure where players explore a web of interconnected locations and events.

Generate complete details for this node including:
- A vivid GM-facing description with player options and potential outcomes
- Atmospheric read-aloud text for players (2-4 sentences, second person)
- 1-4 NPCs with distinct personalities and useful dialogue
- 0-3 encounters appropriate for the node type
- Clues that connect this node to other nodes in the adventure
- Treasure and rewards appropriate for the node
- A map/layout suggestion

Rules:
- NPCs: When creating NPC names, generate fresh, setting-appropriate names with diverse phonetics and cultural origins. Each name should feel individual.${avoidNamesRule}
- NPC dialogue should be practical — things they would actually say to the party, with context for when
- Clues must match the connections defined in the node map — use the exact pointsTo IDs provided
- Encounters should fit the node's narrative context${statBlockInstruction}
- Do not invent major NPCs or elements contradicting the setting context
- If existing campaign NPCs are relevant, reference them by name
- ONLY add [N] citations when mentioning specific named entities from the setting context. Only cite sources listed in the context.

Respond with valid JSON:
{
  "node": {
    "id": "${node.id}",
    "name": "${node.name}",
    "type": "${node.type}",
    "description": "Detailed GM-facing description (3-5 sentences)",
    "readAloud": "Atmospheric second-person text to read aloud (2-4 sentences)",
    "npcDialogue": [
      {
        "npcName": "NPC Name",
        "dialogue": "What they say",
        "context": "When/why they say it"
      }
    ],
    "encounters": [
      {
        "name": "Encounter name",
        "description": "What triggers this and what happens",
        "difficulty": "easy|medium|hard|deadly",
        "creatures": ["Creature (count)"],
        "tactics": "How they fight and use the environment",
        "statBlock": null
      }
    ],
    "treasure": ["Reward 1"],
    "mapSuggestion": "Physical layout description",
    "clues": [
      {
        "description": "What the clue is and how players find it",
        "pointsTo": "target_node_id",
        "type": "evidence|npc_info|observation|document|trail",
        "isHidden": false
      }
    ],
    "isEntryPoint": ${node.isEntryPoint}
  }
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

  if (ctx.rulebookText) {
    parts.push("=== RULEBOOK (use ONLY this for stat block mechanics) ===");
    parts.push(ctx.rulebookText);
    parts.push("");
  }

  if (ctx.campaignContentText) {
    parts.push("=== EXISTING CAMPAIGN CONTENT ===");
    parts.push(ctx.campaignContentText);
    parts.push("");
  }

  parts.push("=== ADVENTURE FRONT ===");
  parts.push(`Title: ${front.title}`);
  parts.push(`Situation: ${front.description}`);
  parts.push(`Stakes: ${front.stakes}`);
  parts.push("");

  parts.push("=== DOOM TIMELINE ===");
  for (const stage of doomTimeline.stages) {
    parts.push(`${stage.stage}. ${stage.label}: ${stage.event}`);
  }
  parts.push("");

  parts.push("=== ALL NODES IN THIS ADVENTURE ===");
  for (const n of allNodes) {
    const marker = n.id === node.id ? " ← THIS NODE (flesh out)" : "";
    const entry = n.isEntryPoint ? " [ENTRY POINT]" : "";
    parts.push(`- ${n.id}: ${n.name} (${n.type})${entry}${marker}`);
    parts.push(`  ${n.briefDescription}`);
  }
  parts.push("");

  parts.push(`=== NODE TO FLESH OUT: ${node.id} — ${node.name} ===`);
  parts.push(`Type: ${node.type}`);
  parts.push(`Entry point: ${node.isEntryPoint}`);
  parts.push(`Brief: ${node.briefDescription}`);
  parts.push("");
  if (node.connections.length > 0) {
    parts.push("Defined clue connections (you MUST include these clues in your output):");
    for (const conn of node.connections) {
      const targetNode = allNodes.find(n => n.id === conn.pointsTo);
      const targetName = targetNode ? targetNode.name : conn.pointsTo;
      parts.push(`- → ${targetName} (${conn.pointsTo}): "${conn.clueDescription}" [${conn.clueType}, ${conn.isHidden ? "hidden" : "obvious"}]`);
    }
    parts.push("");
  }

  if (options.partyLevel) {
    parts.push(`Party level / CR: ${options.partyLevel}`);
  }
  if (options.theme) {
    parts.push(`Theme: ${options.theme}`);
  }
  parts.push(`Generate full details for node ${node.id}: ${node.name}.`);

  return { system, user: parts.join("\n") };
}

// ============================================================================
// N4. Doom Timeline Update Prompt (links timeline stages to node IDs)
// ============================================================================

export function buildDoomTimelineUpdatePrompt(
  front: FrontSummary,
  doomTimeline: DoomTimelineSummary,
  allNodes: NodeStub[],
): { system: string; user: string } {
  const system = `You are a tabletop RPG game master assistant. Your task is simple: for each doom timeline stage, identify which adventure nodes are affected by that stage's events.

Respond with valid JSON:
{
  "doomTimeline": [
    {
      "stage": 1,
      "label": "same label",
      "event": "same event",
      "consequence": "same consequence",
      "nodesAffected": ["n1", "n3"]
    }
  ]
}

Only use node IDs that exist in the provided node list. A timeline stage can affect 0 or more nodes.
Respond ONLY with JSON.`;

  const parts: string[] = [];

  parts.push("=== ADVENTURE FRONT ===");
  parts.push(`Title: ${front.title}`);
  parts.push(`Situation: ${front.description}`);
  parts.push("");

  parts.push("=== NODES ===");
  for (const n of allNodes) {
    parts.push(`- ${n.id}: ${n.name} — ${n.briefDescription}`);
  }
  parts.push("");

  parts.push("=== DOOM TIMELINE (add nodesAffected to each) ===");
  for (const stage of doomTimeline.stages) {
    parts.push(`${stage.stage}. ${stage.label}: ${stage.event}`);
  }
  parts.push("");
  parts.push("For each timeline stage, determine which nodes are affected. Return the updated timeline.");

  return { system, user: parts.join("\n") };
}
