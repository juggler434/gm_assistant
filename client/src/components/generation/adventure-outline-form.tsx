// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
import { Route } from "lucide-react";
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
import type { OutlineTone } from "@/types";

const TONE_OPTIONS: { value: OutlineTone; label: string }[] = [
  { value: "mysterious", label: "Mysterious" },
  { value: "dark", label: "Dark" },
  { value: "heroic", label: "Heroic" },
  { value: "comedic", label: "Comedic" },
  { value: "political", label: "Political" },
  { value: "horror", label: "Horror" },
  { value: "intrigue", label: "Intrigue" },
];

const COUNT_OPTIONS = [1, 2, 3];

export interface AdventureOutlineFormValues {
  tone: OutlineTone;
  theme?: string;
  count: number;
  partyLevel?: string;
  includeNpcsLocations?: string;
}

interface AdventureOutlineFormProps {
  onSubmit: (values: AdventureOutlineFormValues) => void;
  isLoading: boolean;
}

export function AdventureOutlineForm({ onSubmit, isLoading }: AdventureOutlineFormProps) {
  const [tone, setTone] = useState<OutlineTone>("mysterious");
  const [theme, setTheme] = useState("");
  const [count, setCount] = useState("1");
  const [partyLevel, setPartyLevel] = useState("");
  const [includeNpcsLocations, setIncludeNpcsLocations] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      tone,
      theme: theme.trim() || undefined,
      count: parseInt(count, 10),
      partyLevel: partyLevel.trim() || undefined,
      includeNpcsLocations: includeNpcsLocations.trim() || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="outline-tone">Tone</Label>
          <Select value={tone} onValueChange={(v: string) => setTone(v as OutlineTone)}>
            <SelectTrigger id="outline-tone">
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
          <Label htmlFor="outline-theme">Theme / Premise (optional)</Label>
          <Input
            id="outline-theme"
            placeholder="e.g. dragon slaying, heist, mystery"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            maxLength={200}
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="outline-count">Number of outlines</Label>
          <Select value={count} onValueChange={setCount}>
            <SelectTrigger id="outline-count">
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
          <Label htmlFor="outline-partyLevel">Party level / CR (optional)</Label>
          <Input
            id="outline-partyLevel"
            placeholder="Any"
            value={partyLevel}
            onChange={(e) => setPartyLevel(e.target.value)}
            maxLength={50}
            disabled={isLoading}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="outline-includeNpcsLocations">
          Include specific NPCs/locations (optional)
        </Label>
        <Textarea
          id="outline-includeNpcsLocations"
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
            <Spinner className="h-4 w-4 text-primary-foreground" />
            Generating...
          </>
        ) : (
          <>
            <Route className="h-4 w-4" />
            Generate Outlines
          </>
        )}
      </Button>
    </form>
  );
}
