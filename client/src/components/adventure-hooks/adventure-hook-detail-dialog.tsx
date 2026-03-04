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
import type { AdventureHookEntity } from "@/types";

interface AdventureHookDetailDialogProps {
  hook: AdventureHookEntity | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (hook: AdventureHookEntity) => void;
  onDelete: (hook: AdventureHookEntity) => void;
}

export function AdventureHookDetailDialog({
  hook,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: AdventureHookDetailDialogProps) {
  return (
    <Dialog open={open && hook !== null} onOpenChange={onOpenChange}>
      {hook && <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <DialogTitle className="text-xl">{hook.title}</DialogTitle>
            {hook.isGenerated && (
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
              {hook.description}
            </p>
          </div>

          {hook.npcs && hook.npcs.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                NPCs
              </h4>
              <div className="mt-1 flex flex-wrap gap-1">
                {hook.npcs.map((npc, i) => (
                  <Badge key={i} variant="default" className="gap-1">
                    <Users className="h-3 w-3" />
                    {npc}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {hook.locations && hook.locations.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Locations
              </h4>
              <div className="mt-1 flex flex-wrap gap-1">
                {hook.locations.map((loc, i) => (
                  <Badge key={i} variant="success" className="gap-1">
                    <MapPin className="h-3 w-3" />
                    {loc}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {hook.factions && hook.factions.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Factions
              </h4>
              <div className="mt-1 flex flex-wrap gap-1">
                {hook.factions.map((faction, i) => (
                  <Badge key={i} variant="warning" className="gap-1">
                    <Shield className="h-3 w-3" />
                    {faction}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {hook.notes && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Notes
              </h4>
              <p className="mt-1 whitespace-pre-wrap text-sm text-foreground">
                {hook.notes}
              </p>
            </div>
          )}

          {hook.tags && hook.tags.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tags
              </h4>
              <div className="mt-1 flex flex-wrap gap-1">
                {hook.tags.map((tag) => (
                  <Badge key={tag} variant="outline">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onEdit(hook)}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button
            variant="destructive"
            size="sm"
            className="gap-1.5"
            onClick={() => onDelete(hook)}
          >
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </DialogContent>}
    </Dialog>
  );
}
