// SPDX-License-Identifier: AGPL-3.0-or-later

import { Mic, Loader2, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GameSession, GameSessionStatus } from "@/types";

const STATUS_CONFIG: Record<
  GameSessionStatus,
  { label: string; variant: "default" | "warning" | "success"; icon: typeof Mic }
> = {
  recording: { label: "Recording", variant: "default", icon: Mic },
  processing: { label: "Processing", variant: "warning", icon: Loader2 },
  ready: { label: "Ready", variant: "success", icon: CheckCircle2 },
};

function formatDuration(seconds: number | null): string {
  if (seconds == null) return "—";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function formatDate(isoString: string): string {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

interface SessionCardProps {
  session: GameSession;
  onClick: (session: GameSession) => void;
}

export function SessionCard({ session, onClick }: SessionCardProps) {
  const config = STATUS_CONFIG[session.status];
  const StatusIcon = config.icon;

  return (
    <Card
      className="cursor-pointer transition-colors hover:border-primary/50"
      onClick={() => onClick(session)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-base">{session.title}</CardTitle>
          <Badge variant={config.variant} className="shrink-0 text-[10px]">
            <StatusIcon
              className={`mr-1 h-3 w-3 ${session.status === "processing" ? "animate-spin" : ""}`}
            />
            {config.label}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-3 text-sm text-muted-foreground">
          <span>{formatDate(session.date)}</span>
          <span>·</span>
          <span>{formatDuration(session.duration)}</span>
        </div>
      </CardContent>
    </Card>
  );
}
