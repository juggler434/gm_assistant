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
import type { Npc } from "@/types";

interface NpcDetailDialogProps {
  npc: Npc | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: (npc: Npc) => void;
  onDelete: (npc: Npc) => void;
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

export function NpcDetailDialog({
  npc,
  open,
  onOpenChange,
  onEdit,
  onDelete,
}: NpcDetailDialogProps) {
  if (!npc) return null;

  const subtitle = [npc.race, npc.classRole].filter(Boolean).join(" · ");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <DialogTitle className="text-xl">{npc.name}</DialogTitle>
              {subtitle && (
                <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
              )}
              {npc.level && (
                <p className="text-sm text-muted-foreground">{npc.level}</p>
              )}
            </div>
            <div className="flex gap-1">
              <Badge variant={npc.importance === "major" ? "default" : npc.importance === "minor" ? "secondary" : "outline"}>
                {npc.importance}
              </Badge>
              <Badge variant={npc.status === "alive" ? "success" : npc.status === "dead" ? "destructive" : "secondary"}>
                {npc.status}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <Section title="Appearance" content={npc.appearance} />
          <Section title="Personality" content={npc.personality} />
          <Section title="Motivations" content={npc.motivations} />
          <Section title="Secrets" content={npc.secrets} />
          <Section title="Backstory" content={npc.backstory} />
          <Section title="Notes" content={npc.notes} />

          {npc.statBlock && Object.keys(npc.statBlock).length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Stat Block
              </h4>
              <pre className="mt-1 overflow-x-auto rounded-md bg-secondary p-3 text-xs text-foreground">
                {JSON.stringify(npc.statBlock, null, 2)}
              </pre>
            </div>
          )}

          {npc.tags && npc.tags.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Tags
              </h4>
              <div className="mt-1 flex flex-wrap gap-1">
                {npc.tags.map((tag) => (
                  <Badge key={tag} variant="outline">{tag}</Badge>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-border pt-4">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => onEdit(npc)}>
            <Pencil className="h-3.5 w-3.5" />
            Edit
          </Button>
          <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => onDelete(npc)}>
            <Trash2 className="h-3.5 w-3.5" />
            Delete
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
