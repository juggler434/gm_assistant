import { RefreshCw, Users, MapPin, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { ErrorState } from "@/components/ui/error-state";
import type { AdventureHook, AnswerSource } from "@/types";

interface GenerationResultProps {
  hooks: AdventureHook[];
  sources: AnswerSource[];
  status: string | null;
  error: Error | null;
  isStreaming: boolean;
  onRegenerate: () => void;
}

export function GenerationResult({
  hooks,
  sources,
  status,
  error,
  isStreaming,
  onRegenerate,
}: GenerationResultProps) {
  if (error) {
    return (
      <ErrorState
        heading="Generation failed"
        description={error.message}
        onRetry={onRegenerate}
        retryLabel="Try again"
      />
    );
  }

  if (hooks.length === 0 && !isStreaming) {
    return null;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-base font-semibold text-foreground">Generated Hooks</h3>
          {isStreaming && <Spinner className="h-4 w-4" label="Generating hooks" />}
          {status && <span className="text-xs text-muted-foreground">{status}</span>}
        </div>
        {!isStreaming && hooks.length > 0 && (
          <Button variant="outline" size="sm" onClick={onRegenerate} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" />
            Regenerate
          </Button>
        )}
      </div>

      <div className="grid gap-3">
        {hooks.map((hook, index) => (
          <HookCard key={index} hook={hook} />
        ))}
      </div>

      {!isStreaming && sources.length > 0 && (
        <div className="rounded-[var(--radius)] border border-border bg-secondary/50 p-4">
          <h4 className="mb-2 text-sm font-medium text-muted-foreground">
            Sources ({sources.length})
          </h4>
          <ul className="space-y-1">
            {sources.map((source, i) => (
              <li key={i} className="text-xs text-muted-foreground">
                {source.documentName}
                {source.section && <span className="ml-1 opacity-70">- {source.section}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function HookCard({ hook }: { hook: AdventureHook }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{hook.title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground leading-relaxed">{hook.description}</p>
        <div className="flex flex-wrap gap-2">
          {hook.npcs.length > 0 &&
            hook.npcs.map((npc, i) => (
              <Badge key={`npc-${i}`} variant="default" className="gap-1">
                <Users className="h-2.5 w-2.5" />
                {npc}
              </Badge>
            ))}
          {hook.locations.length > 0 &&
            hook.locations.map((loc, i) => (
              <Badge key={`loc-${i}`} variant="success" className="gap-1">
                <MapPin className="h-2.5 w-2.5" />
                {loc}
              </Badge>
            ))}
          {hook.factions.length > 0 &&
            hook.factions.map((faction, i) => (
              <Badge key={`fac-${i}`} variant="warning" className="gap-1">
                <Shield className="h-2.5 w-2.5" />
                {faction}
              </Badge>
            ))}
        </div>
      </CardContent>
    </Card>
  );
}
