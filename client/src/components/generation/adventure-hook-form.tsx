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
import type { HookTone } from "@/types";

const TONE_OPTIONS: { value: HookTone; label: string }[] = [
  { value: "mysterious", label: "Mysterious" },
  { value: "dark", label: "Dark" },
  { value: "heroic", label: "Heroic" },
  { value: "comedic", label: "Comedic" },
  { value: "political", label: "Political" },
  { value: "horror", label: "Horror" },
  { value: "intrigue", label: "Intrigue" },
];

const COUNT_OPTIONS = [3, 4, 5];

export interface AdventureHookFormValues {
  tone: HookTone;
  theme?: string;
  count: number;
  partyLevel?: number;
  includeNpcsLocations?: string;
}

interface AdventureHookFormProps {
  onSubmit: (values: AdventureHookFormValues) => void;
  isLoading: boolean;
}

export function AdventureHookForm({ onSubmit, isLoading }: AdventureHookFormProps) {
  const [tone, setTone] = useState<HookTone>("mysterious");
  const [theme, setTheme] = useState("");
  const [count, setCount] = useState("3");
  const [partyLevel, setPartyLevel] = useState("");
  const [includeNpcsLocations, setIncludeNpcsLocations] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      tone,
      theme: theme.trim() || undefined,
      count: parseInt(count, 10),
      partyLevel: partyLevel ? parseInt(partyLevel, 10) : undefined,
      includeNpcsLocations: includeNpcsLocations.trim() || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="tone">Tone</Label>
          <Select value={tone} onValueChange={(v: string) => setTone(v as HookTone)}>
            <SelectTrigger id="tone">
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
          <Label htmlFor="theme">Theme (optional)</Label>
          <Input
            id="theme"
            placeholder="e.g. undead uprising, dragon cult"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            maxLength={200}
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="count">Number of hooks</Label>
          <Select value={count} onValueChange={setCount}>
            <SelectTrigger id="count">
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

        <div className="space-y-2">
          <Label htmlFor="partyLevel">Party level (optional)</Label>
          <Input
            id="partyLevel"
            type="number"
            placeholder="1-20"
            min={1}
            max={20}
            value={partyLevel}
            onChange={(e) => setPartyLevel(e.target.value)}
            disabled={isLoading}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="includeNpcsLocations">Include specific NPCs/locations (optional)</Label>
        <Textarea
          id="includeNpcsLocations"
          placeholder="e.g. Lord Varen, the Sunken Temple, Blackthorn Guild"
          value={includeNpcsLocations}
          onChange={(e) => setIncludeNpcsLocations(e.target.value)}
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
            Generate Hooks
          </>
        )}
      </Button>
    </form>
  );
}
