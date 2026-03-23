// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Plus, Mic } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SessionList } from "@/components/sessions/session-list";
import { UploadSessionDialog } from "@/components/sessions/upload-session-dialog";
import { RecordSessionDialog } from "@/components/sessions/record-session-dialog";
import { useSessions } from "@/hooks/use-sessions";

export function SessionsPage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: sessions, isLoading, error, refetch } = useSessions(campaignId ?? "");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [recordOpen, setRecordOpen] = useState(false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Sessions</h2>
          <p className="text-sm text-muted-foreground">Record and manage game session recordings</p>
        </div>
        <div className="flex gap-2">
          <Button className="gap-1.5" onClick={() => setRecordOpen(true)}>
            <Mic className="h-4 w-4" />
            Record
          </Button>
          <Button variant="outline" className="gap-1.5" onClick={() => setUploadOpen(true)}>
            <Plus className="h-4 w-4" />
            Upload
          </Button>
        </div>
      </div>

      <SessionList
        sessions={sessions}
        isLoading={isLoading}
        error={error}
        onSelectSession={(session) => navigate(session.id)}
        onRetry={() => refetch()}
      />

      <UploadSessionDialog
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        campaignId={campaignId ?? ""}
      />

      <RecordSessionDialog
        open={recordOpen}
        onOpenChange={setRecordOpen}
        campaignId={campaignId ?? ""}
      />
    </div>
  );
}
