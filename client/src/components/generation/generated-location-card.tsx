// SPDX-License-Identifier: AGPL-3.0-or-later

import { Copy, Check, Eye, EyeOff, Save } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { GeneratedLocation } from "@/types";

interface GeneratedLocationCardProps {
  location: GeneratedLocation;
  onSave?: (location: GeneratedLocation) => void;
  isSaving?: boolean;
}

function ListSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {title}
      </h4>
      <ul className="mt-0.5 list-inside list-disc space-y-0.5 text-sm text-foreground">
        {items.map((item, i) => (
          <li key={i}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export function GeneratedLocationCard({ location, onSave, isSaving }: GeneratedLocationCardProps) {
  const [copied, setCopied] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);

  const subtitle = [location.terrain, location.climate, location.size].filter(Boolean).join(" · ");

  function handleCopy() {
    const parts = [location.name, ""];
    if (location.readAloud) {
      parts.push("READ ALOUD:");
      parts.push(location.readAloud);
      parts.push("");
    }
    if (location.keyFeatures.length > 0) {
      parts.push(`Key Features: ${location.keyFeatures.join(", ")}`);
    }
    if (location.pointsOfInterest.length > 0) {
      parts.push(`Points of Interest: ${location.pointsOfInterest.join(", ")}`);
    }
    const sd = location.sensoryDetails;
    if (sd.sights || sd.sounds || sd.smells) {
      parts.push("");
      parts.push("SENSORY DETAILS:");
      if (sd.sights) parts.push(`  Sights: ${sd.sights}`);
      if (sd.sounds) parts.push(`  Sounds: ${sd.sounds}`);
      if (sd.smells) parts.push(`  Smells: ${sd.smells}`);
    }
    if (location.encounters.length > 0) {
      parts.push(`\nEncounters: ${location.encounters.join(", ")}`);
    }
    if (location.secrets.length > 0) {
      parts.push(`Secrets: ${location.secrets.join(", ")}`);
    }
    if (location.npcsPresent.length > 0) {
      parts.push(`NPCs: ${location.npcsPresent.join(", ")}`);
    }
    if (location.factions.length > 0) {
      parts.push(`Factions: ${location.factions.join(", ")}`);
    }

    navigator.clipboard.writeText(parts.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-base">{location.name}</CardTitle>
            {subtitle && <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 gap-1">
            {onSave && (
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => onSave(location)}
                disabled={isSaving}
              >
                <Save className="h-3.5 w-3.5" />
                Save to Campaign
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={handleCopy}
              title="Copy to clipboard"
            >
              {copied ? (
                <Check className="h-3.5 w-3.5 text-success" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Read-aloud box */}
        {location.readAloud && (
          <div className="rounded-md border border-primary/20 bg-primary/5 p-3">
            <h4 className="mb-1 text-xs font-semibold uppercase tracking-wider text-primary">
              Read Aloud
            </h4>
            <p className="text-sm italic text-foreground">{location.readAloud}</p>
          </div>
        )}

        {/* Key features & points of interest */}
        <ListSection title="Key Features" items={location.keyFeatures} />
        <ListSection title="Points of Interest" items={location.pointsOfInterest} />

        {/* Sensory details */}
        {(location.sensoryDetails.sights ||
          location.sensoryDetails.sounds ||
          location.sensoryDetails.smells) && (
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Sensory Details
            </h4>
            <div className="mt-1 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {location.sensoryDetails.sights && (
                <div className="rounded-md bg-secondary p-2">
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                    Sights
                  </span>
                  <p className="mt-0.5 text-xs text-foreground">{location.sensoryDetails.sights}</p>
                </div>
              )}
              {location.sensoryDetails.sounds && (
                <div className="rounded-md bg-secondary p-2">
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                    Sounds
                  </span>
                  <p className="mt-0.5 text-xs text-foreground">{location.sensoryDetails.sounds}</p>
                </div>
              )}
              {location.sensoryDetails.smells && (
                <div className="rounded-md bg-secondary p-2">
                  <span className="text-[10px] font-semibold uppercase text-muted-foreground">
                    Smells
                  </span>
                  <p className="mt-0.5 text-xs text-foreground">{location.sensoryDetails.smells}</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Encounters */}
        <ListSection title="Potential Encounters" items={location.encounters} />

        {/* Secrets - hidden by default */}
        {location.secrets.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowSecrets(!showSecrets)}
              className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
            >
              {showSecrets ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
              Secrets ({location.secrets.length})
            </button>
            {showSecrets && (
              <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-foreground">
                {location.secrets.map((secret, i) => (
                  <li key={i}>{secret}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* NPCs & Factions badges */}
        {(location.npcsPresent.length > 0 || location.factions.length > 0) && (
          <div className="flex flex-wrap gap-1.5">
            {location.npcsPresent.map((npc, i) => (
              <Badge key={`npc-${i}`} variant="default">
                {npc}
              </Badge>
            ))}
            {location.factions.map((faction, i) => (
              <Badge key={`faction-${i}`} variant="warning">
                {faction}
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
