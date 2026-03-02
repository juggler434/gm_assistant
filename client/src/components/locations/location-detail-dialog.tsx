// SPDX-License-Identifier: AGPL-3.0-or-later

import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Location } from "@/types";

interface LocationDetailDialogProps {
  location: Location | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (location: Location) => void;
  onDelete: (location: Location) => void;
}

function Section({ title, content }: { title: string; content: string | null }) {
  if (!content) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">{content}</p>
    </div>
  );
}

function ListSection({ title, items }: { title: string; items: string[] | null }) {
  if (!items || items.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-foreground">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function LocationDetailDialog({
  location,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: LocationDetailDialogProps) {
  if (!location) return null;

  const subtitle = [location.terrain, location.climate, location.size]
    .filter(Boolean)
    .join(" · ");

  const sensory = location.sensoryDetails;
  const hasSensory = sensory && (sensory.sights || sensory.sounds || sensory.smells);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <DialogTitle className="text-xl">{location.name}</DialogTitle>
              {subtitle && (
                <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
              )}
            </div>
            {location.isGenerated && (
              <Badge variant="secondary">Generated</Badge>
            )}
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* Read-aloud box */}
          {location.readAloud && (
            <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
              <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">
                Read Aloud
              </h4>
              <p className="text-sm italic text-foreground">{location.readAloud}</p>
            </div>
          )}

          <ListSection title="Key Features" items={location.keyFeatures} />
          <ListSection title="Points of Interest" items={location.pointsOfInterest} />

          {/* Sensory details */}
          {hasSensory && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sensory Details
              </h4>
              <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
                {sensory.sights && (
                  <div className="rounded-md bg-secondary p-2">
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                      Sights
                    </span>
                    <p className="mt-0.5 text-xs text-foreground">{sensory.sights}</p>
                  </div>
                )}
                {sensory.sounds && (
                  <div className="rounded-md bg-secondary p-2">
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                      Sounds
                    </span>
                    <p className="mt-0.5 text-xs text-foreground">{sensory.sounds}</p>
                  </div>
                )}
                {sensory.smells && (
                  <div className="rounded-md bg-secondary p-2">
                    <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                      Smells
                    </span>
                    <p className="mt-0.5 text-xs text-foreground">{sensory.smells}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <ListSection title="Potential Encounters" items={location.encounters} />
          <ListSection title="Secrets" items={location.secrets} />

          {/* NPCs & Factions */}
          {((location.npcsPresent && location.npcsPresent.length > 0) ||
            (location.factions && location.factions.length > 0)) && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                NPCs & Factions
              </h4>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {location.npcsPresent?.map((npc, i) => (
                  <Badge key={`npc-${i}`} variant="default">
                    {npc}
                  </Badge>
                ))}
                {location.factions?.map((faction, i) => (
                  <Badge key={`faction-${i}`} variant="warning">
                    {faction}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          <Section title="Notes" content={location.notes} />

          {location.tags && location.tags.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tags
              </h4>
              <div className="mt-1 flex flex-wrap gap-1">
                {location.tags.map((tag) => (
                  <Badge key={tag} variant="outline">{tag}</Badge>
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
            onClick={() => onEdit(location)}
          >
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={() => onDelete(location)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
