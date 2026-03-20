// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
import {
  Loader2,
  Sparkles,
  Pencil,
  Check,
  X,
  RefreshCw,
  AlertCircle,
  Swords,
  Users,
  MapPin,
  Package,
  HelpCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  useSessionSummary,
  useGenerateSummary,
  useUpdateSummary,
} from "@/hooks/use-sessions";
import type { SessionSummary } from "@/types";

interface SessionSummarySectionProps {
  campaignId: string;
  sessionId: string;
}

function SummaryList({
  icon,
  label,
  items,
}: {
  icon: React.ReactNode;
  label: string;
  items: string[];
}) {
  if (items.length === 0) return null;

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        {icon}
        {label}
      </div>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm text-foreground">
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function SummaryContent({ summary }: { summary: SessionSummary }) {
  return (
    <div className="space-y-4">
      {summary.content && (
        <p className="text-sm leading-relaxed text-muted-foreground">
          {summary.content}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SummaryList
          icon={<Swords className="h-3.5 w-3.5" />}
          label="Key Events"
          items={summary.keyEvents}
        />
        <SummaryList
          icon={<Users className="h-3.5 w-3.5" />}
          label="NPCs Encountered"
          items={summary.npcsEncountered}
        />
        <SummaryList
          icon={<MapPin className="h-3.5 w-3.5" />}
          label="Locations Visited"
          items={summary.locationsVisited}
        />
        <SummaryList
          icon={<Package className="h-3.5 w-3.5" />}
          label="Items"
          items={summary.itemsAcquired}
        />
      </div>

      <SummaryList
        icon={<HelpCircle className="h-3.5 w-3.5" />}
        label="Open Questions & Hooks"
        items={summary.openQuestions}
      />
    </div>
  );
}

function SummaryEditor({
  summary,
  campaignId,
  sessionId,
  onDone,
}: {
  summary: SessionSummary;
  campaignId: string;
  sessionId: string;
  onDone: () => void;
}) {
  const [content, setContent] = useState(summary.content);
  const updateSummary = useUpdateSummary();

  const handleSave = () => {
    updateSummary.mutate(
      { campaignId, sessionId, data: { content } },
      {
        onSuccess: () => {
          toast.success("Summary updated");
          onDone();
        },
        onError: (error) => {
          toast.error(`Failed to save: ${error.message}`);
        },
      }
    );
  };

  return (
    <div className="space-y-3">
      <Textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        rows={8}
        className="min-h-[160px]"
      />
      <div className="flex gap-2">
        <Button
          size="sm"
          onClick={handleSave}
          disabled={updateSummary.isPending}
        >
          {updateSummary.isPending ? (
            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          ) : (
            <Check className="mr-1 h-3 w-3" />
          )}
          Save
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onDone}
          disabled={updateSummary.isPending}
        >
          <X className="mr-1 h-3 w-3" />
          Cancel
        </Button>
      </div>
    </div>
  );
}

export function SessionSummarySection({
  campaignId,
  sessionId,
}: SessionSummarySectionProps) {
  const [isEditing, setIsEditing] = useState(false);
  const {
    data: summary,
    isLoading,
  } = useSessionSummary(campaignId, sessionId);
  const generateSummary = useGenerateSummary();

  const handleGenerate = () => {
    generateSummary.mutate(
      { campaignId, sessionId },
      {
        onError: (err) => {
          toast.error(`Failed to generate summary: ${err.message}`);
        },
      }
    );
  };

  const isGenerating =
    summary?.status === "generating" || summary?.status === "pending";
  const hasError = summary?.status === "error";
  const isReady = summary?.status === "ready";
  const noSummary = !isLoading && !summary;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Summary</CardTitle>
          <div className="flex gap-2">
            {isReady && !isEditing && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setIsEditing(true)}
                >
                  <Pencil className="mr-1 h-3 w-3" />
                  Edit
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleGenerate}
                  disabled={generateSummary.isPending}
                >
                  <RefreshCw className="mr-1 h-3 w-3" />
                  Regenerate
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        )}

        {noSummary && (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium text-foreground">
                No summary yet
              </p>
              <p className="text-xs text-muted-foreground">
                Generate an AI summary from the session transcript
              </p>
            </div>
            <Button
              size="sm"
              onClick={handleGenerate}
              disabled={generateSummary.isPending}
            >
              {generateSummary.isPending ? (
                <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              )}
              Generate Summary
            </Button>
          </div>
        )}

        {isGenerating && (
          <div className="flex items-center gap-3 py-6">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            <div>
              <p className="text-sm font-medium text-foreground">
                Generating summary...
              </p>
              <p className="text-xs text-muted-foreground">
                The AI is analyzing the transcript. This may take a moment.
              </p>
            </div>
          </div>
        )}

        {hasError && (
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-destructive" />
              <div>
                <p className="text-sm font-medium text-foreground">
                  Summary generation failed
                </p>
                {summary.generationError && (
                  <p className="text-xs text-muted-foreground">
                    {summary.generationError}
                  </p>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={handleGenerate}
              disabled={generateSummary.isPending}
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
              Retry
            </Button>
          </div>
        )}

        {isReady && summary && !isEditing && (
          <SummaryContent summary={summary} />
        )}

        {isReady && summary && isEditing && (
          <SummaryEditor
            summary={summary}
            campaignId={campaignId}
            sessionId={sessionId}
            onDone={() => setIsEditing(false)}
          />
        )}
      </CardContent>
    </Card>
  );
}
