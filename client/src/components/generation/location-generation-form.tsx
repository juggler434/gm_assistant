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
import type { LocationTone } from "@/types";

const TONE_OPTIONS: { value: LocationTone; label: string }[] = [
  { value: "mysterious", label: "Mysterious" },
  { value: "dark", label: "Dark" },
  { value: "peaceful", label: "Peaceful" },
  { value: "bustling", label: "Bustling" },
  { value: "ruined", label: "Ruined" },
  { value: "magical", label: "Magical" },
];

const COUNT_OPTIONS = [1, 2, 3, 4, 5];

export interface LocationGenerationFormValues {
  tone: LocationTone;
  terrain?: string;
  climate?: string;
  size?: "small" | "medium" | "large";
  count: number;
  constraints?: string;
}

interface LocationGenerationFormProps {
  onSubmit: (values: LocationGenerationFormValues) => void;
  isLoading: boolean;
}

export function LocationGenerationForm({ onSubmit, isLoading }: LocationGenerationFormProps) {
  const [tone, setTone] = useState<LocationTone>("mysterious");
  const [terrain, setTerrain] = useState("");
  const [climate, setClimate] = useState("");
  const [size, setSize] = useState("");
  const [count, setCount] = useState("2");
  const [constraints, setConstraints] = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({
      tone,
      terrain: terrain.trim() || undefined,
      climate: climate.trim() || undefined,
      size: (size || undefined) as LocationGenerationFormValues["size"],
      count: parseInt(count, 10),
      constraints: constraints.trim() || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-2">
          <Label htmlFor="loc-gen-tone">Tone</Label>
          <Select value={tone} onValueChange={(v: string) => setTone(v as LocationTone)}>
            <SelectTrigger id="loc-gen-tone">
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
          <Label htmlFor="loc-gen-terrain">Terrain (optional)</Label>
          <Input
            id="loc-gen-terrain"
            placeholder="e.g. forest, mountain, coastal"
            value={terrain}
            onChange={(e) => setTerrain(e.target.value)}
            maxLength={100}
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="loc-gen-climate">Climate (optional)</Label>
          <Input
            id="loc-gen-climate"
            placeholder="e.g. tropical, arctic, arid"
            value={climate}
            onChange={(e) => setClimate(e.target.value)}
            maxLength={100}
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="loc-gen-size">Size</Label>
          <Select
            value={size || "any"}
            onValueChange={(v: string) => setSize(v === "any" ? "" : v)}
          >
            <SelectTrigger id="loc-gen-size">
              <SelectValue placeholder="Any" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="any">Any</SelectItem>
              <SelectItem value="small">Small</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="large">Large</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="loc-gen-count">Number of Locations</Label>
          <Select value={count} onValueChange={setCount}>
            <SelectTrigger id="loc-gen-count">
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

      <div className="space-y-2">
        <Label htmlFor="loc-gen-constraints">Additional constraints (optional)</Label>
        <Textarea
          id="loc-gen-constraints"
          placeholder="e.g. Should be near a river, include an ancient temple, no undead"
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
            <Spinner className="h-4 w-4 text-primary-foreground" />
            Generating...
          </>
        ) : (
          <>
            <Sparkles className="h-4 w-4" />
            Generate Locations
          </>
        )}
      </Button>
    </form>
  );
}
