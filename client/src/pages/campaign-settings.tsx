// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Settings,
  HardDrive,
  FileText,
  Database,
  AlertTriangle,
  Download,
  Trash2,
  Sparkles,
} from "lucide-react";
import { useCampaign, useUpdateCampaign, useCampaignStats } from "@/hooks/use-campaigns";
import { DeleteCampaignDialog } from "@/components/campaigns/delete-campaign-dialog";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type {
  GenerationSettings,
  HookTone,
  NpcTone,
  LocationTone,
} from "@/types";

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

const STATUS_LABELS: Record<string, { label: string; variant: "default" | "secondary" | "success" | "warning" | "destructive" }> = {
  pending: { label: "Pending", variant: "secondary" },
  processing: { label: "Processing", variant: "warning" },
  ready: { label: "Ready", variant: "success" },
  failed: { label: "Failed", variant: "destructive" },
};

const HOOK_TONE_OPTIONS: { value: HookTone; label: string }[] = [
  { value: "mysterious", label: "Mysterious" },
  { value: "dark", label: "Dark" },
  { value: "heroic", label: "Heroic" },
  { value: "comedic", label: "Comedic" },
  { value: "political", label: "Political" },
  { value: "horror", label: "Horror" },
  { value: "intrigue", label: "Intrigue" },
];

const NPC_TONE_OPTIONS: { value: NpcTone; label: string }[] = [
  { value: "mysterious", label: "Mysterious" },
  { value: "dark", label: "Dark" },
  { value: "heroic", label: "Heroic" },
  { value: "comedic", label: "Comedic" },
  { value: "gritty", label: "Gritty" },
  { value: "whimsical", label: "Whimsical" },
];

const LOCATION_TONE_OPTIONS: { value: LocationTone; label: string }[] = [
  { value: "mysterious", label: "Mysterious" },
  { value: "dark", label: "Dark" },
  { value: "peaceful", label: "Peaceful" },
  { value: "bustling", label: "Bustling" },
  { value: "ruined", label: "Ruined" },
  { value: "magical", label: "Magical" },
];

function temperatureLabel(temp: number): string {
  if (temp <= 0.4) return "Conservative";
  if (temp <= 0.8) return "Balanced";
  if (temp <= 1.2) return "Creative";
  return "Wild";
}

export function SettingsPage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: campaign, isLoading, isError, refetch } = useCampaign(campaignId!);
  const { data: stats, isLoading: statsLoading } = useCampaignStats(campaignId!);
  const updateMutation = useUpdateCampaign(campaignId!);

  const [name, setName] = useState<string | null>(null);
  const [description, setDescription] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Generation settings state — initialized from campaign data
  const [genSettingsLoaded, setGenSettingsLoaded] = useState(false);
  const [temperature, setTemperature] = useState(0.8);
  const [customInstructions, setCustomInstructions] = useState("");
  const [hookTone, setHookTone] = useState("");
  const [npcTone, setNpcTone] = useState("");
  const [locationTone, setLocationTone] = useState("");
  const [outlineTone, setOutlineTone] = useState("");
  const [adventureTone, setAdventureTone] = useState("");

  // Sync generation settings from campaign data on first load
  useEffect(() => {
    if (campaign && !genSettingsLoaded) {
      const gs = campaign.generationSettings;
      if (gs) {
        setTemperature(gs.temperature ?? 0.8);
        setCustomInstructions(gs.customInstructions ?? "");
        setHookTone(gs.defaultTones?.hook ?? "");
        setNpcTone(gs.defaultTones?.npc ?? "");
        setLocationTone(gs.defaultTones?.location ?? "");
        setOutlineTone(gs.defaultTones?.outline ?? "");
        setAdventureTone(gs.defaultTones?.adventure ?? "");
      }
      setGenSettingsLoaded(true);
    }
  }, [campaign, genSettingsLoaded]);

  // Use local state if user has edited, otherwise fall back to campaign data
  const currentName = name ?? campaign?.name ?? "";
  const currentDescription = description ?? campaign?.description ?? "";

  const hasChanges =
    campaign &&
    (currentName !== campaign.name || currentDescription !== (campaign.description ?? ""));

  function buildGenSettings(): GenerationSettings {
    const defaultTones: GenerationSettings["defaultTones"] = {};
    if (hookTone) defaultTones.hook = hookTone as HookTone;
    if (npcTone) defaultTones.npc = npcTone as NpcTone;
    if (locationTone) defaultTones.location = locationTone as LocationTone;
    if (outlineTone) defaultTones.outline = outlineTone as HookTone;
    if (adventureTone) defaultTones.adventure = adventureTone as HookTone;
    return {
      temperature,
      ...(customInstructions.trim() && { customInstructions: customInstructions.trim() }),
      ...(Object.keys(defaultTones).length > 0 && { defaultTones }),
    };
  }

  const hasGenChanges = (() => {
    if (!campaign || !genSettingsLoaded) return false;
    const gs = campaign.generationSettings;
    const saved = {
      temperature: gs?.temperature ?? 0.8,
      customInstructions: gs?.customInstructions ?? "",
      hookTone: gs?.defaultTones?.hook ?? "",
      npcTone: gs?.defaultTones?.npc ?? "",
      locationTone: gs?.defaultTones?.location ?? "",
      outlineTone: gs?.defaultTones?.outline ?? "",
      adventureTone: gs?.defaultTones?.adventure ?? "",
    };
    return (
      temperature !== saved.temperature ||
      customInstructions !== saved.customInstructions ||
      hookTone !== saved.hookTone ||
      npcTone !== saved.npcTone ||
      locationTone !== saved.locationTone ||
      outlineTone !== saved.outlineTone ||
      adventureTone !== saved.adventureTone
    );
  })();

  function handleSaveGenSettings(e: React.FormEvent) {
    e.preventDefault();
    updateMutation.mutate(
      { generationSettings: buildGenSettings() },
      {
        onSuccess: () => {
          toast.success("Generation settings updated");
          setGenSettingsLoaded(false);
        },
        onError: () => toast.error("Failed to update generation settings"),
      }
    );
  }

  if (isError) {
    return (
      <ErrorState
        description="Failed to load campaign settings."
        onRetry={() => refetch()}
      />
    );
  }

  function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = currentName.trim();
    if (!trimmedName) return;

    updateMutation.mutate(
      { name: trimmedName, description: currentDescription.trim() || null },
      {
        onSuccess: () => {
          toast.success("Campaign updated");
          setName(null);
          setDescription(null);
        },
        onError: () => toast.error("Failed to update campaign"),
      }
    );
  }

  async function handleExport() {
    setExporting(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/export`, {
        credentials: "include",
      });
      if (!response.ok) throw new Error("Export failed");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download =
        response.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ??
        "campaign-export.json";
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Campaign data exported");
    } catch {
      toast.error("Failed to export campaign data");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* General Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-muted-foreground" />
            General Settings
          </CardTitle>
          <CardDescription>Update your campaign name and description.</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <form onSubmit={handleSave} className="space-y-4">
              <div className="grid gap-2">
                <Label htmlFor="campaign-name">Name</Label>
                <Input
                  id="campaign-name"
                  value={currentName}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Campaign name"
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="campaign-description">Description</Label>
                <Textarea
                  id="campaign-description"
                  value={currentDescription}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="A brief description of your campaign..."
                  rows={3}
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={!hasChanges || !currentName.trim() || updateMutation.isPending}>
                  {updateMutation.isPending && <Spinner label="Saving" />}
                  Save Changes
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Generation Settings */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
            Generation Settings
          </CardTitle>
          <CardDescription>
            Configure default AI generation preferences for this campaign.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          ) : (
            <form onSubmit={handleSaveGenSettings} className="space-y-6">
              {/* Temperature / Creativity */}
              <div className="grid gap-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="gen-temperature">Creativity Level</Label>
                  <span className="text-sm text-muted-foreground">
                    {temperature.toFixed(1)} &mdash; {temperatureLabel(temperature)}
                  </span>
                </div>
                <input
                  id="gen-temperature"
                  type="range"
                  min="0.1"
                  max="1.5"
                  step="0.1"
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Conservative</span>
                  <span>Balanced</span>
                  <span>Creative</span>
                  <span>Wild</span>
                </div>
              </div>

              {/* Custom Instructions */}
              <div className="grid gap-2">
                <Label htmlFor="gen-instructions">Custom Instructions</Label>
                <Textarea
                  id="gen-instructions"
                  value={customInstructions}
                  onChange={(e) => setCustomInstructions(e.target.value)}
                  placeholder="e.g. &quot;All NPCs speak with old English dialect&quot; or &quot;This is a steampunk Victorian setting&quot;"
                  rows={3}
                  maxLength={2000}
                />
                <p className="text-xs text-muted-foreground">
                  These instructions are included in every generation prompt for this campaign.
                </p>
              </div>

              {/* Default Tones */}
              <div className="grid gap-3">
                <Label>Default Tones</Label>
                <p className="text-xs text-muted-foreground -mt-1">
                  Pre-fill the tone selector when generating content. Leave empty to choose each time.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="grid gap-1.5">
                    <Label htmlFor="gen-tone-hook" className="text-xs text-muted-foreground">Hooks &amp; Outlines</Label>
                    <Select value={hookTone} onValueChange={(v: string) => { setHookTone(v === "none" ? "" : v); setOutlineTone(v === "none" ? "" : v); }}>
                      <SelectTrigger id="gen-tone-hook">
                        <SelectValue placeholder="No default" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No default</SelectItem>
                        {HOOK_TONE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="gen-tone-npc" className="text-xs text-muted-foreground">NPCs</Label>
                    <Select value={npcTone} onValueChange={(v: string) => setNpcTone(v === "none" ? "" : v)}>
                      <SelectTrigger id="gen-tone-npc">
                        <SelectValue placeholder="No default" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No default</SelectItem>
                        {NPC_TONE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="gen-tone-location" className="text-xs text-muted-foreground">Locations</Label>
                    <Select value={locationTone} onValueChange={(v: string) => setLocationTone(v === "none" ? "" : v)}>
                      <SelectTrigger id="gen-tone-location">
                        <SelectValue placeholder="No default" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No default</SelectItem>
                        {LOCATION_TONE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-1.5">
                    <Label htmlFor="gen-tone-adventure" className="text-xs text-muted-foreground">Adventures</Label>
                    <Select value={adventureTone} onValueChange={(v: string) => setAdventureTone(v === "none" ? "" : v)}>
                      <SelectTrigger id="gen-tone-adventure">
                        <SelectValue placeholder="No default" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No default</SelectItem>
                        {HOOK_TONE_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <Button type="submit" disabled={!hasGenChanges || updateMutation.isPending}>
                  {updateMutation.isPending && <Spinner label="Saving" />}
                  Save Generation Settings
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>

      {/* Storage Usage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <HardDrive className="h-5 w-5 text-muted-foreground" />
            Storage Usage
          </CardTitle>
          <CardDescription>Documents and data stored in this campaign.</CardDescription>
        </CardHeader>
        <CardContent>
          {statsLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-5 w-48" />
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-5 w-40" />
            </div>
          ) : stats ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    Documents
                  </div>
                  <p className="text-2xl font-semibold">{stats.documentCount}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <HardDrive className="h-4 w-4" />
                    Total Size
                  </div>
                  <p className="text-2xl font-semibold">{formatBytes(stats.totalSizeBytes)}</p>
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Database className="h-4 w-4" />
                    Chunks
                  </div>
                  <p className="text-2xl font-semibold">{stats.chunkCount}</p>
                </div>
              </div>

              {Object.keys(stats.documentsByStatus).length > 0 && (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">Documents by status</p>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(stats.documentsByStatus).map(([status, count]) => {
                      const info = STATUS_LABELS[status] ?? { label: status, variant: "secondary" as const };
                      return (
                        <Badge key={status} variant={info.variant}>
                          {info.label}: {count}
                        </Badge>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No storage data available.</p>
          )}
        </CardContent>
      </Card>

      {/* Danger Zone */}
      <Card className="border-destructive/50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" />
            Danger Zone
          </CardTitle>
          <CardDescription>Irreversible actions for this campaign.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between rounded-lg border border-border p-4">
            <div>
              <p className="text-sm font-medium">Export campaign data</p>
              <p className="text-sm text-muted-foreground">
                Download all campaign data as a JSON file.
              </p>
            </div>
            <Button variant="outline" onClick={handleExport} disabled={exporting}>
              {exporting ? <Spinner label="Exporting" /> : <Download className="mr-2 h-4 w-4" />}
              Export
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-destructive/50 p-4">
            <div>
              <p className="text-sm font-medium">Delete this campaign</p>
              <p className="text-sm text-muted-foreground">
                Permanently remove this campaign and all its data.
              </p>
            </div>
            <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      {campaign && (
        <DeleteCampaignDialog
          open={deleteOpen}
          onOpenChange={setDeleteOpen}
          campaign={campaign}
          onDeleted={() => navigate("/campaigns")}
        />
      )}
    </div>
  );
}
