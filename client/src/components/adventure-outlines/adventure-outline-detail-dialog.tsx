// SPDX-License-Identifier: AGPL-3.0-or-later

import { Pencil, Trash2, Users, MapPin, Shield } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { AdventureOutlineEntity } from "@/types";

interface AdventureOutlineDetailDialogProps {
  outline: AdventureOutlineEntity | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (outline: AdventureOutlineEntity) => void;
  onDelete: (outline: AdventureOutlineEntity) => void;
}

export function AdventureOutlineDetailDialog({
  outline,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: AdventureOutlineDetailDialogProps) {
  return (
    <Dialog open={open && outline !== null} onOpenChange={onOpenChange}>
      {outline && (
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <div className="flex items-start justify-between gap-2">
              <DialogTitle className="text-xl">{outline.title}</DialogTitle>
              {outline.isGenerated && (
                <Badge variant="secondary" className="shrink-0">
                  Generated
                </Badge>
              )}
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Description
              </h4>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                {outline.description}
              </p>
            </div>

            {outline.acts.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Acts
                </h4>
                <div className="mt-2 space-y-3">
                  {outline.acts.map((act, i) => (
                    <div key={i} className="rounded-md border border-border p-3 space-y-2">
                      <p className="text-sm font-medium text-foreground">
                        Act {i + 1}: {act.title}
                      </p>
                      {act.description && (
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {act.description}
                        </p>
                      )}
                      {act.keyEvents.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Key Events
                          </p>
                          <ul className="mt-1 list-disc list-inside space-y-0.5">
                            {act.keyEvents.map((event, j) => (
                              <li key={j} className="text-sm text-foreground">
                                {event}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {act.encounters.length > 0 && (
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Encounters
                          </p>
                          <ul className="mt-1 list-disc list-inside space-y-0.5">
                            {act.encounters.map((enc, j) => (
                              <li key={j} className="text-sm text-foreground">
                                {enc}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {outline.npcs && outline.npcs.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  NPCs
                </h4>
                <div className="mt-1 flex flex-wrap gap-1">
                  {outline.npcs.map((npc, i) => (
                    <Badge key={i} variant="default" className="gap-1">
                      <Users className="h-3 w-3" />
                      {npc}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {outline.locations && outline.locations.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Locations
                </h4>
                <div className="mt-1 flex flex-wrap gap-1">
                  {outline.locations.map((loc, i) => (
                    <Badge key={i} variant="success" className="gap-1">
                      <MapPin className="h-3 w-3" />
                      {loc}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {outline.factions && outline.factions.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Factions
                </h4>
                <div className="mt-1 flex flex-wrap gap-1">
                  {outline.factions.map((faction, i) => (
                    <Badge key={i} variant="warning" className="gap-1">
                      <Shield className="h-3 w-3" />
                      {faction}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {outline.notes && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Notes
                </h4>
                <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{outline.notes}</p>
              </div>
            )}

            {outline.tags && outline.tags.length > 0 && (
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Tags
                </h4>
                <div className="mt-1 flex flex-wrap gap-1">
                  {outline.tags.map((tag) => (
                    <Badge key={tag} variant="outline">
                      {tag}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => onEdit(outline)}
            >
              <Pencil className="h-3.5 w-3.5" />
              Edit
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1.5"
              onClick={() => onDelete(outline)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </DialogContent>
      )}
    </Dialog>
  );
}
