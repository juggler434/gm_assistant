// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
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

  // Use local state if user has edited, otherwise fall back to campaign data
  const currentName = name ?? campaign?.name ?? "";
  const currentDescription = description ?? campaign?.description ?? "";

  const hasChanges =
    campaign &&
    (currentName !== campaign.name || currentDescription !== (campaign.description ?? ""));

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

      {/* Generation Settings (placeholder) */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
            Generation Settings
          </CardTitle>
          <CardDescription>
            Per-campaign AI generation preferences coming soon.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Configure default tone, style, and parameters for AI-generated content in this
            campaign. This feature is not yet available.
          </p>
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
