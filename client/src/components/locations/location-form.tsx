// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import type { Location, CreateLocationRequest } from "@/types";

interface LocationFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateLocationRequest) => void;
  isLoading: boolean;
  location?: Location | null;
}

export function LocationForm({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  location,
}: LocationFormProps) {
  const isEditing = !!location;

  const [name, setName] = useState("");
  const [terrain, setTerrain] = useState("");
  const [climate, setClimate] = useState("");
  const [size, setSize] = useState("");
  const [readAloud, setReadAloud] = useState("");
  const [keyFeatures, setKeyFeatures] = useState("");
  const [pointsOfInterest, setPointsOfInterest] = useState("");
  const [encounters, setEncounters] = useState("");
  const [secrets, setSecrets] = useState("");
  const [npcsPresent, setNpcsPresent] = useState("");
  const [factions, setFactions] = useState("");
  const [sights, setSights] = useState("");
  const [sounds, setSounds] = useState("");
  const [smells, setSmells] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (location) {
      setName(location.name);
      setTerrain(location.terrain ?? "");
      setClimate(location.climate ?? "");
      setSize(location.size ?? "");
      setReadAloud(location.readAloud ?? "");
      setKeyFeatures(location.keyFeatures?.join("\n") ?? "");
      setPointsOfInterest(location.pointsOfInterest?.join("\n") ?? "");
      setEncounters(location.encounters?.join("\n") ?? "");
      setSecrets(location.secrets?.join("\n") ?? "");
      setNpcsPresent(location.npcsPresent?.join(", ") ?? "");
      setFactions(location.factions?.join(", ") ?? "");
      setSights(location.sensoryDetails?.sights ?? "");
      setSounds(location.sensoryDetails?.sounds ?? "");
      setSmells(location.sensoryDetails?.smells ?? "");
      setTagsStr(location.tags?.join(", ") ?? "");
      setNotes(location.notes ?? "");
    } else {
      setName("");
      setTerrain("");
      setClimate("");
      setSize("");
      setReadAloud("");
      setKeyFeatures("");
      setPointsOfInterest("");
      setEncounters("");
      setSecrets("");
      setNpcsPresent("");
      setFactions("");
      setSights("");
      setSounds("");
      setSmells("");
      setTagsStr("");
      setNotes("");
    }
  }, [location, open]);

  function splitLines(str: string): string[] | null {
    const items = str
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    return items.length > 0 ? items : null;
  }

  function splitCommas(str: string): string[] | null {
    const items = str
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return items.length > 0 ? items : null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    const sensoryDetails =
      sights.trim() || sounds.trim() || smells.trim()
        ? {
            sights: sights.trim() || undefined,
            sounds: sounds.trim() || undefined,
            smells: smells.trim() || undefined,
          }
        : null;

    onSubmit({
      name: name.trim(),
      terrain: terrain.trim() || null,
      climate: climate.trim() || null,
      size: size.trim() || null,
      readAloud: readAloud.trim() || null,
      keyFeatures: splitLines(keyFeatures),
      pointsOfInterest: splitLines(pointsOfInterest),
      encounters: splitLines(encounters),
      secrets: splitLines(secrets),
      npcsPresent: splitCommas(npcsPresent),
      factions: splitCommas(factions),
      sensoryDetails,
      tags: splitCommas(tagsStr),
      notes: notes.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Location" : "Create Location"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2 sm:col-span-2">
              <Label htmlFor="loc-name">Name *</Label>
              <Input
                id="loc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. The Whispering Caverns"
                maxLength={255}
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="loc-terrain">Terrain</Label>
              <Input
                id="loc-terrain"
                value={terrain}
                onChange={(e) => setTerrain(e.target.value)}
                placeholder="e.g. Forest, Mountain, Swamp"
                maxLength={100}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="loc-climate">Climate</Label>
              <Input
                id="loc-climate"
                value={climate}
                onChange={(e) => setClimate(e.target.value)}
                placeholder="e.g. Temperate, Tropical, Arctic"
                maxLength={100}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="loc-size">Size</Label>
              <Input
                id="loc-size"
                value={size}
                onChange={(e) => setSize(e.target.value)}
                placeholder="e.g. Small, Medium, Large"
                maxLength={50}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="loc-readAloud">Read Aloud</Label>
            <Textarea
              id="loc-readAloud"
              value={readAloud}
              onChange={(e) => setReadAloud(e.target.value)}
              placeholder="Descriptive text to read to players when they arrive..."
              maxLength={5000}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="loc-keyFeatures">Key Features (one per line)</Label>
            <Textarea
              id="loc-keyFeatures"
              value={keyFeatures}
              onChange={(e) => setKeyFeatures(e.target.value)}
              placeholder={"A crumbling stone bridge\nAncient runes on the walls\nA hidden waterfall"}
              disabled={isLoading}
              className="min-h-[60px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="loc-poi">Points of Interest (one per line)</Label>
            <Textarea
              id="loc-poi"
              value={pointsOfInterest}
              onChange={(e) => setPointsOfInterest(e.target.value)}
              placeholder={"The abandoned shrine\nThe merchant's hidden cache"}
              disabled={isLoading}
              className="min-h-[60px]"
            />
          </div>

          <div className="space-y-4 rounded-md border border-border p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Sensory Details
            </h4>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="loc-sights">Sights</Label>
                <Textarea
                  id="loc-sights"
                  value={sights}
                  onChange={(e) => setSights(e.target.value)}
                  placeholder="What can be seen..."
                  disabled={isLoading}
                  className="min-h-[60px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="loc-sounds">Sounds</Label>
                <Textarea
                  id="loc-sounds"
                  value={sounds}
                  onChange={(e) => setSounds(e.target.value)}
                  placeholder="What can be heard..."
                  disabled={isLoading}
                  className="min-h-[60px]"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="loc-smells">Smells</Label>
                <Textarea
                  id="loc-smells"
                  value={smells}
                  onChange={(e) => setSmells(e.target.value)}
                  placeholder="What can be smelled..."
                  disabled={isLoading}
                  className="min-h-[60px]"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="loc-encounters">Potential Encounters (one per line)</Label>
            <Textarea
              id="loc-encounters"
              value={encounters}
              onChange={(e) => setEncounters(e.target.value)}
              placeholder={"Pack of dire wolves\nBandit ambush at the crossroads"}
              disabled={isLoading}
              className="min-h-[60px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="loc-secrets">Secrets (one per line)</Label>
            <Textarea
              id="loc-secrets"
              value={secrets}
              onChange={(e) => setSecrets(e.target.value)}
              placeholder={"A passage behind the waterfall\nThe runes reveal a hidden map"}
              disabled={isLoading}
              className="min-h-[60px]"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="loc-npcs">NPCs Present (comma-separated)</Label>
              <Input
                id="loc-npcs"
                value={npcsPresent}
                onChange={(e) => setNpcsPresent(e.target.value)}
                placeholder="e.g. Old Hermit, Guard Captain"
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="loc-factions">Factions (comma-separated)</Label>
              <Input
                id="loc-factions"
                value={factions}
                onChange={(e) => setFactions(e.target.value)}
                placeholder="e.g. Thieves Guild, Town Guard"
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="loc-tags">Tags (comma-separated)</Label>
            <Input
              id="loc-tags"
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="e.g. dungeon, dangerous, quest-location"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="loc-notes">Notes</Label>
            <Textarea
              id="loc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="GM notes about this location..."
              maxLength={10000}
              disabled={isLoading}
              className="min-h-[60px]"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()}>
              {isLoading ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  {isEditing ? "Saving..." : "Creating..."}
                </>
              ) : isEditing ? (
                "Save Changes"
              ) : (
                "Create Location"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
