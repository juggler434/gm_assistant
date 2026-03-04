// SPDX-License-Identifier: AGPL-3.0-or-later

import { Save, AlertTriangle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CitedText } from "@/components/ui/cited-text";
import type { GeneratedNpc, AnswerSource } from "@/types";

interface GeneratedNpcCardProps {
  npc: GeneratedNpc;
  onSave: (npc: GeneratedNpc) => void;
  isSaving?: boolean;
  sources?: AnswerSource[];
}

function Section({ title, content, sources = [] }: { title: string; content: string; sources?: AnswerSource[] }) {
  if (!content) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <p className="mt-0.5 text-sm text-foreground">
        <CitedText text={content} sources={sources} />
      </p>
    </div>
  );
}

export function GeneratedNpcCard({ npc, onSave, isSaving, sources = [] }: GeneratedNpcCardProps) {
  const subtitle = [npc.race, npc.classRole].filter(Boolean).join(" · ");

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{npc.name}</CardTitle>
            {subtitle && (
              <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
            )}
            {npc.level && (
              <p className="text-xs text-muted-foreground">{npc.level}</p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="shrink-0 gap-1.5"
            onClick={() => onSave(npc)}
            disabled={isSaving}
          >
            <Save className="h-3.5 w-3.5" />
            Save to Campaign
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <Section title="Appearance" content={npc.appearance} sources={sources} />
        <Section title="Personality" content={npc.personality} sources={sources} />
        <Section title="Motivations" content={npc.motivations} sources={sources} />
        <Section title="Secrets" content={npc.secrets} sources={sources} />
        <Section title="Backstory" content={npc.backstory} sources={sources} />

        {npc.statBlock && Object.keys(npc.statBlock).length > 0 && (
          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Stat Block
              </h4>
              {!npc.statBlockGrounded && (
                <Badge variant="warning" className="gap-1 text-[10px]">
                  <AlertTriangle className="h-2.5 w-2.5" />
                  Unverified
                </Badge>
              )}
            </div>
            {!npc.statBlockGrounded && (
              <p className="mt-0.5 text-xs text-warning">
                Stat block is unverified — review against your rulebook.
              </p>
            )}
            <pre className="mt-1 overflow-x-auto rounded-md bg-secondary p-3 text-xs text-foreground">
              {JSON.stringify(npc.statBlock, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
