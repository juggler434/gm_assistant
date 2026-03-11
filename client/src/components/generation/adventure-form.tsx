// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
import { BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { AdventureTone } from "@/types";

const TONE_OPTIONS: { value: AdventureTone; label: string }[] = [
  { value: "mysterious", label: "Mysterious" },
  { value: "dark", label: "Dark" },
  { value: "heroic", label: "Heroic" },
  { value: "comedic", label: "Comedic" },
  { value: "political", label: "Political" },
  { value: "horror", label: "Horror" },
  { value: "intrigue", label: "Intrigue" },
];

export interface AdventureFormValues {
  tone: AdventureTone;
  theme?: string;
  partyLevel?: string;
  sourceOutlineId?: string;
  includeStatBlocks: boolean;
}

interface AdventureFormProps {
  onSubmit: (values: AdventureFormValues) => void;
  isLoading: boolean;
  outlines?: { id: string; title: string }[];
}

export function AdventureForm({ onSubmit, isLoading, outlines = [] }: AdventureFormProps) {
  const [tone, setTone] = useState<AdventureTone>("mysterious");
  const [theme, setTheme] = useState("");
  const [partyLevel, setPartyLevel] = useState("");
  const [sourceOutlineId, setSourceOutlineId] = useState("none");
  const [includeStatBlocks, setIncludeStatBlocks] = useState(true);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      tone,
      theme: theme.trim() || undefined,
      partyLevel: partyLevel.trim() || undefined,
      sourceOutlineId: sourceOutlineId !== "none" ? sourceOutlineId : undefined,
      includeStatBlocks,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="adventure-tone">Tone</Label>
          <Select value={tone} onValueChange={(v: string) => setTone(v as AdventureTone)}>
            <SelectTrigger id="adventure-tone">
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
          <Label htmlFor="adventure-theme">Theme / Premise (optional)</Label>
          <Input
            id="adventure-theme"
            placeholder="e.g. dragon slaying, heist, mystery"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            maxLength={200}
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="adventure-partyLevel">Party level / CR (optional)</Label>
          <Input
            id="adventure-partyLevel"
            placeholder="e.g. 5, 10-12, any"
            value={partyLevel}
            onChange={(e) => setPartyLevel(e.target.value)}
            maxLength={50}
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="adventure-statBlocks">Include stat blocks</Label>
          <Select
            value={includeStatBlocks ? "yes" : "no"}
            onValueChange={(v: string) => setIncludeStatBlocks(v === "yes")}
          >
            <SelectTrigger id="adventure-statBlocks">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="yes">Yes (if rules uploaded)</SelectItem>
              <SelectItem value="no">No</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {outlines.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="adventure-outline">Expand from outline (optional)</Label>
          <Select value={sourceOutlineId} onValueChange={setSourceOutlineId}>
            <SelectTrigger id="adventure-outline">
              <SelectValue placeholder="Generate from scratch" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Generate from scratch</SelectItem>
              {outlines.map((outline) => (
                <SelectItem key={outline.id} value={outline.id}>
                  {outline.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <Button type="submit" disabled={isLoading} className="gap-2">
        {isLoading ? (
          <>
            <Spinner className="h-4 w-4 text-primary-foreground" />
            Generating adventure...
          </>
        ) : (
          <>
            <BookOpen className="h-4 w-4" />
            Generate Full Adventure
          </>
        )}
      </Button>
    </form>
  );
}
