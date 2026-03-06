// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
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
import type { AdventureOutlineEntity, CreateAdventureOutlineRequest } from "@/types";

interface Act {
  title: string;
  description: string;
  keyEvents: string;
  encounters: string;
}

interface AdventureOutlineFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateAdventureOutlineRequest) => void;
  isLoading: boolean;
  outline?: AdventureOutlineEntity | null;
}

function defaultAct(): Act {
  return { title: "", description: "", keyEvents: "", encounters: "" };
}

function parseCommaSeparated(str: string): string[] | null {
  const items = str
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return items.length > 0 ? items : null;
}

export function AdventureOutlineForm({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  outline,
}: AdventureOutlineFormProps) {
  const isEditing = !!outline;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [acts, setActs] = useState<Act[]>([defaultAct()]);
  const [npcsStr, setNpcsStr] = useState("");
  const [locationsStr, setLocationsStr] = useState("");
  const [factionsStr, setFactionsStr] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (outline) {
      setTitle(outline.title);
      setDescription(outline.description);
      setActs(
        outline.acts.map((act) => ({
          title: act.title,
          description: act.description,
          keyEvents: act.keyEvents.join(", "),
          encounters: act.encounters.join(", "),
        }))
      );
      setNpcsStr(outline.npcs?.join(", ") ?? "");
      setLocationsStr(outline.locations?.join(", ") ?? "");
      setFactionsStr(outline.factions?.join(", ") ?? "");
      setTagsStr(outline.tags?.join(", ") ?? "");
      setNotes(outline.notes ?? "");
    } else {
      setTitle("");
      setDescription("");
      setActs([defaultAct()]);
      setNpcsStr("");
      setLocationsStr("");
      setFactionsStr("");
      setTagsStr("");
      setNotes("");
    }
  }, [outline, open]);

  function updateAct(index: number, field: keyof Act, value: string) {
    setActs((prev) => prev.map((act, i) => (i === index ? { ...act, [field]: value } : act)));
  }

  function addAct() {
    setActs((prev) => [...prev, defaultAct()]);
  }

  function removeAct(index: number) {
    setActs((prev) => prev.filter((_, i) => i !== index));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    const parsedActs = acts
      .filter((act) => act.title.trim())
      .map((act) => ({
        title: act.title.trim(),
        description: act.description.trim(),
        keyEvents: parseCommaSeparated(act.keyEvents) ?? [],
        encounters: parseCommaSeparated(act.encounters) ?? [],
      }));

    onSubmit({
      title: title.trim(),
      description: description.trim(),
      acts: parsedActs,
      npcs: parseCommaSeparated(npcsStr),
      locations: parseCommaSeparated(locationsStr),
      factions: parseCommaSeparated(factionsStr),
      tags: parseCommaSeparated(tagsStr),
      notes: notes.trim() || null,
    });
  }

  const canSubmit = title.trim() && description.trim() && acts.some((a) => a.title.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Adventure Outline" : "Create Adventure Outline"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="outline-title">Title *</Label>
            <Input
              id="outline-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. The Sunken Temple"
              maxLength={255}
              required
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="outline-description">Description *</Label>
            <Textarea
              id="outline-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the adventure outline..."
              maxLength={10000}
              required
              disabled={isLoading}
            />
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>Acts *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1"
                onClick={addAct}
                disabled={isLoading}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Act
              </Button>
            </div>
            {acts.map((act, index) => (
              <div key={index} className="space-y-2 rounded-md border border-border p-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Act {index + 1}
                  </span>
                  {acts.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={() => removeAct(index)}
                      disabled={isLoading}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  <Input
                    value={act.title}
                    onChange={(e) => updateAct(index, "title", e.target.value)}
                    placeholder="Act title"
                    maxLength={255}
                    disabled={isLoading}
                  />
                  <Textarea
                    value={act.description}
                    onChange={(e) => updateAct(index, "description", e.target.value)}
                    placeholder="Act description..."
                    maxLength={5000}
                    disabled={isLoading}
                    className="min-h-[60px]"
                  />
                  <Input
                    value={act.keyEvents}
                    onChange={(e) => updateAct(index, "keyEvents", e.target.value)}
                    placeholder="Key events (comma-separated)"
                    disabled={isLoading}
                  />
                  <Input
                    value={act.encounters}
                    onChange={(e) => updateAct(index, "encounters", e.target.value)}
                    placeholder="Encounters (comma-separated)"
                    disabled={isLoading}
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-2">
            <Label htmlFor="outline-npcs">NPCs (comma-separated)</Label>
            <Input
              id="outline-npcs"
              value={npcsStr}
              onChange={(e) => setNpcsStr(e.target.value)}
              placeholder="e.g. Captain Thorne, Elder Myra"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="outline-locations">Locations (comma-separated)</Label>
            <Input
              id="outline-locations"
              value={locationsStr}
              onChange={(e) => setLocationsStr(e.target.value)}
              placeholder="e.g. Darkwood Forest, Silverkeep"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="outline-factions">Factions (comma-separated)</Label>
            <Input
              id="outline-factions"
              value={factionsStr}
              onChange={(e) => setFactionsStr(e.target.value)}
              placeholder="e.g. Thieves' Guild, City Watch"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="outline-tags">Tags (comma-separated)</Label>
            <Input
              id="outline-tags"
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="e.g. mystery, political, high-level"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="outline-notes">Notes</Label>
            <Textarea
              id="outline-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="GM notes about this outline..."
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
            <Button type="submit" disabled={isLoading || !canSubmit}>
              {isLoading ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  {isEditing ? "Saving..." : "Creating..."}
                </>
              ) : isEditing ? (
                "Save Changes"
              ) : (
                "Create Outline"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
