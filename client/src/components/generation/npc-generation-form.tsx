// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { NpcTone } from "@/types";

const TONE_OPTIONS: { value: NpcTone; label: string }[] = [
  { value: "mysterious", label: "Mysterious" },
  { value: "dark", label: "Dark" },
  { value: "heroic", label: "Heroic" },
  { value: "comedic", label: "Comedic" },
  { value: "gritty", label: "Gritty" },
  { value: "whimsical", label: "Whimsical" },
];

const COUNT_OPTIONS = [1, 2, 3, 4, 5];

export interface NpcGenerationFormValues {
  tone: NpcTone;
  race?: string;
  classRole?: string;
  level?: string;
  importance?: "major" | "minor" | "background";
  count: number;
  includeStatBlock: boolean;
  constraints?: string;
}

interface NpcGenerationFormProps {
  onSubmit: (values: NpcGenerationFormValues) => void;
  isLoading: boolean;
}

export function NpcGenerationForm({ onSubmit, isLoading }: NpcGenerationFormProps) {
  const [tone, setTone] = useState<NpcTone>("mysterious");
  const [race, setRace] = useState("");
  const [classRole, setClassRole] = useState("");
  const [level, setLevel] = useState("");
  const [importance, setImportance] = useState("");
  const [count, setCount] = useState("2");
  const [includeStatBlock, setIncludeStatBlock] = useState(false);
  const [constraints, setConstraints] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      tone,
      race: race.trim() || undefined,
      classRole: classRole.trim() || undefined,
      level: level.trim() || undefined,
      importance: (importance || undefined) as NpcGenerationFormValues["importance"],
      count: parseInt(count, 10),
      includeStatBlock,
      constraints: constraints.trim() || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="npc-gen-tone">Tone</Label>
          <Select value={tone} onValueChange={(v: string) => setTone(v as NpcTone)}>
            <SelectTrigger id="npc-gen-tone">
              <SelectValue placeholder="Select tone" />
            </SelectTrigger>
            <SelectContent>
              {TONE_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="npc-gen-race">Race (optional)</Label>
          <Input
            id="npc-gen-race"
            placeholder="Any"
            value={race}
            onChange={(e) => setRace(e.target.value)}
            maxLength={100}
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="npc-gen-classRole">Class / Role (optional)</Label>
          <Input
            id="npc-gen-classRole"
            placeholder="Any"
            value={classRole}
            onChange={(e) => setClassRole(e.target.value)}
            maxLength={100}
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="npc-gen-level">Level / CR (optional)</Label>
          <Input
            id="npc-gen-level"
            placeholder="Any"
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            maxLength={50}
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="npc-gen-importance">Importance</Label>
          <Select value={importance || "any"} onValueChange={(v: string) => setImportance(v === "any" ? "" : v)}>
            <SelectTrigger id="npc-gen-importance">
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="major">Major</SelectItem>
              <SelectItem value="minor">Minor</SelectItem>
              <SelectItem value="background">Background</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="npc-gen-count">Number of NPCs</Label>
          <Select value={count} onValueChange={setCount}>
            <SelectTrigger id="npc-gen-count">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {COUNT_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>
                  {n}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="npc-gen-statBlock"
          checked={includeStatBlock}
          onChange={(e) => setIncludeStatBlock(e.target.checked)}
          disabled={isLoading}
          className="h-4 w-4 rounded border-border"
        />
        <Label htmlFor="npc-gen-statBlock" className="cursor-pointer">
          Include stat blocks
        </Label>
      </div>

      <div className="space-y-2">
        <Label htmlFor="npc-gen-constraints">Additional constraints (optional)</Label>
        <Textarea
          id="npc-gen-constraints"
          placeholder="e.g. All NPCs should be members of the Thieves Guild, no magic users"
          value={constraints}
          onChange={(e) => setConstraints(e.target.value)}
          maxLength={500}
          disabled={isLoading}
          className="min-h-[60px]"
        />
      </div>

      <Button type="submit" disabled={isLoading} className="gap-2">
        {isLoading ? (
          <>
            <Spinner className="h-4 w-4" />
            Generating...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Generate NPCs
          </>
        )}
      </Button>
    </form>
  );
}
