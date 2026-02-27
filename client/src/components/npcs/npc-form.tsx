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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import type { Npc, CreateNpcRequest, NpcImportance, NpcStatus } from "@/types";

interface NpcFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateNpcRequest) => void;
  isLoading: boolean;
  npc?: Npc | null;
}

export function NpcForm({ open, onOpenChange, onSubmit, isLoading, npc }: NpcFormProps) {
  const isEditing = !!npc;

  const [name, setName] = useState("");
  const [race, setRace] = useState("");
  const [classRole, setClassRole] = useState("");
  const [level, setLevel] = useState("");
  const [appearance, setAppearance] = useState("");
  const [personality, setPersonality] = useState("");
  const [motivations, setMotivations] = useState("");
  const [secrets, setSecrets] = useState("");
  const [backstory, setBackstory] = useState("");
  const [statBlockStr, setStatBlockStr] = useState("");
  const [importance, setImportance] = useState<NpcImportance>("minor");
  const [status, setStatus] = useState<NpcStatus>("alive");
  const [tagsStr, setTagsStr] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (npc) {
      setName(npc.name);
      setRace(npc.race ?? "");
      setClassRole(npc.classRole ?? "");
      setLevel(npc.level ?? "");
      setAppearance(npc.appearance ?? "");
      setPersonality(npc.personality ?? "");
      setMotivations(npc.motivations ?? "");
      setSecrets(npc.secrets ?? "");
      setBackstory(npc.backstory ?? "");
      setStatBlockStr(npc.statBlock ? JSON.stringify(npc.statBlock, null, 2) : "");
      setImportance(npc.importance);
      setStatus(npc.status);
      setTagsStr(npc.tags?.join(", ") ?? "");
      setNotes(npc.notes ?? "");
    } else {
      setName("");
      setRace("");
      setClassRole("");
      setLevel("");
      setAppearance("");
      setPersonality("");
      setMotivations("");
      setSecrets("");
      setBackstory("");
      setStatBlockStr("");
      setImportance("minor");
      setStatus("alive");
      setTagsStr("");
      setNotes("");
    }
  }, [npc, open]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;

    let statBlock: Record<string, unknown> | null = null;
    if (statBlockStr.trim()) {
      try {
        statBlock = JSON.parse(statBlockStr.trim());
      } catch {
        // Leave as null if invalid JSON
      }
    }

    const tags = tagsStr.trim()
      ? tagsStr.split(",").map((t) => t.trim()).filter(Boolean)
      : null;

    onSubmit({
      name: name.trim(),
      race: race.trim() || null,
      classRole: classRole.trim() || null,
      level: level.trim() || null,
      appearance: appearance.trim() || null,
      personality: personality.trim() || null,
      motivations: motivations.trim() || null,
      secrets: secrets.trim() || null,
      backstory: backstory.trim() || null,
      statBlock,
      importance,
      status,
      tags,
      notes: notes.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit NPC" : "Create NPC"}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="npc-name">Name *</Label>
              <Input
                id="npc-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Grog the Brave"
                maxLength={255}
                required
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="npc-race">Race</Label>
              <Input
                id="npc-race"
                value={race}
                onChange={(e) => setRace(e.target.value)}
                placeholder="e.g. Half-Orc"
                maxLength={100}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="npc-classRole">Class / Role</Label>
              <Input
                id="npc-classRole"
                value={classRole}
                onChange={(e) => setClassRole(e.target.value)}
                placeholder="e.g. Barbarian, Merchant"
                maxLength={100}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="npc-level">Level / CR</Label>
              <Input
                id="npc-level"
                value={level}
                onChange={(e) => setLevel(e.target.value)}
                placeholder="e.g. Level 5, CR 3"
                maxLength={50}
                disabled={isLoading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="npc-importance">Importance</Label>
              <Select
                value={importance}
                onValueChange={(v: string) => setImportance(v as NpcImportance)}
              >
                <SelectTrigger id="npc-importance">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="major">Major</SelectItem>
                  <SelectItem value="minor">Minor</SelectItem>
                  <SelectItem value="background">Background</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="npc-status">Status</Label>
              <Select
                value={status}
                onValueChange={(v: string) => setStatus(v as NpcStatus)}
              >
                <SelectTrigger id="npc-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="alive">Alive</SelectItem>
                  <SelectItem value="dead">Dead</SelectItem>
                  <SelectItem value="unknown">Unknown</SelectItem>
                  <SelectItem value="missing">Missing</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="npc-appearance">Appearance</Label>
            <Textarea
              id="npc-appearance"
              value={appearance}
              onChange={(e) => setAppearance(e.target.value)}
              placeholder="Physical description..."
              maxLength={5000}
              disabled={isLoading}
              className="min-h-[60px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="npc-personality">Personality</Label>
            <Textarea
              id="npc-personality"
              value={personality}
              onChange={(e) => setPersonality(e.target.value)}
              placeholder="Personality traits and mannerisms..."
              maxLength={5000}
              disabled={isLoading}
              className="min-h-[60px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="npc-motivations">Motivations</Label>
            <Textarea
              id="npc-motivations"
              value={motivations}
              onChange={(e) => setMotivations(e.target.value)}
              placeholder="What drives this NPC..."
              maxLength={5000}
              disabled={isLoading}
              className="min-h-[60px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="npc-secrets">Secrets</Label>
            <Textarea
              id="npc-secrets"
              value={secrets}
              onChange={(e) => setSecrets(e.target.value)}
              placeholder="Hidden knowledge or agendas..."
              maxLength={5000}
              disabled={isLoading}
              className="min-h-[60px]"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="npc-backstory">Backstory</Label>
            <Textarea
              id="npc-backstory"
              value={backstory}
              onChange={(e) => setBackstory(e.target.value)}
              placeholder="Background and history..."
              maxLength={10000}
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="npc-statBlock">Stat Block (JSON)</Label>
            <Textarea
              id="npc-statBlock"
              value={statBlockStr}
              onChange={(e) => setStatBlockStr(e.target.value)}
              placeholder='{"strength": 16, "hitPoints": 45, ...}'
              disabled={isLoading}
              className="min-h-[60px] font-mono text-xs"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="npc-tags">Tags (comma-separated)</Label>
            <Input
              id="npc-tags"
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="e.g. ally, fighter, quest-giver"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="npc-notes">Notes</Label>
            <Textarea
              id="npc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="GM notes about this NPC..."
              maxLength={10000}
              disabled={isLoading}
              className="min-h-[60px]"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading || !name.trim()}>
              {isLoading ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  {isEditing ? "Saving..." : "Creating..."}
                </>
              ) : (
                isEditing ? "Save Changes" : "Create NPC"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
