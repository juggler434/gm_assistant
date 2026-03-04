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
import type { AdventureHookEntity, CreateAdventureHookRequest } from "@/types";

interface AdventureHookFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (data: CreateAdventureHookRequest) => void;
  isLoading: boolean;
  hook?: AdventureHookEntity | null;
}

export function AdventureHookForm({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
  hook,
}: AdventureHookFormProps) {
  const isEditing = !!hook;

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [npcsStr, setNpcsStr] = useState("");
  const [locationsStr, setLocationsStr] = useState("");
  const [factionsStr, setFactionsStr] = useState("");
  const [tagsStr, setTagsStr] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (hook) {
      setTitle(hook.title);
      setDescription(hook.description);
      setNpcsStr(hook.npcs?.join(", ") ?? "");
      setLocationsStr(hook.locations?.join(", ") ?? "");
      setFactionsStr(hook.factions?.join(", ") ?? "");
      setTagsStr(hook.tags?.join(", ") ?? "");
      setNotes(hook.notes ?? "");
    } else {
      setTitle("");
      setDescription("");
      setNpcsStr("");
      setLocationsStr("");
      setFactionsStr("");
      setTagsStr("");
      setNotes("");
    }
  }, [hook, open]);

  function parseCommaSeparated(str: string): string[] | null {
    const items = str
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return items.length > 0 ? items : null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    onSubmit({
      title: title.trim(),
      description: description.trim(),
      npcs: parseCommaSeparated(npcsStr),
      locations: parseCommaSeparated(locationsStr),
      factions: parseCommaSeparated(factionsStr),
      tags: parseCommaSeparated(tagsStr),
      notes: notes.trim() || null,
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Edit Adventure Hook" : "Create Adventure Hook"}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="hook-title">Title *</Label>
            <Input
              id="hook-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. The Missing Caravan"
              maxLength={255}
              required
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hook-description">Description *</Label>
            <Textarea
              id="hook-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the adventure hook..."
              maxLength={10000}
              required
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hook-npcs">NPCs (comma-separated)</Label>
            <Input
              id="hook-npcs"
              value={npcsStr}
              onChange={(e) => setNpcsStr(e.target.value)}
              placeholder="e.g. Captain Thorne, Elder Myra"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hook-locations">Locations (comma-separated)</Label>
            <Input
              id="hook-locations"
              value={locationsStr}
              onChange={(e) => setLocationsStr(e.target.value)}
              placeholder="e.g. Darkwood Forest, Silverkeep"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hook-factions">Factions (comma-separated)</Label>
            <Input
              id="hook-factions"
              value={factionsStr}
              onChange={(e) => setFactionsStr(e.target.value)}
              placeholder="e.g. Thieves' Guild, City Watch"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hook-tags">Tags (comma-separated)</Label>
            <Input
              id="hook-tags"
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="e.g. mystery, political, low-level"
              disabled={isLoading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="hook-notes">Notes</Label>
            <Textarea
              id="hook-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="GM notes about this hook..."
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
            <Button type="submit" disabled={isLoading || !title.trim() || !description.trim()}>
              {isLoading ? (
                <>
                  <Spinner className="mr-2 h-4 w-4" />
                  {isEditing ? "Saving..." : "Creating..."}
                </>
              ) : isEditing ? (
                "Save Changes"
              ) : (
                "Create Hook"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
