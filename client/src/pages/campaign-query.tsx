// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { MessageSquare, PanelRightOpen, PanelRightClose, History } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryInput } from "@/components/query/query-input";
import { ResponseDisplay, type QueryMessage } from "@/components/query/response-display";
import { QueryHistory, type QueryHistoryEntry } from "@/components/query/query-history";
import { ContextPanel } from "@/components/query/context-panel";
import { useCampaignQuery } from "@/hooks/use-campaign-query";
import { useConversations, useCreateConversation, useAddMessages } from "@/hooks/use-conversations";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import type { AnswerSource, ConfidenceLevel, ConversationDetailResponse } from "@/types";

function createId(): string {
  return crypto.randomUUID();
}

export function QueryPage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { mutateAsync: queryAsync, isPending } = useCampaignQuery();
  const { mutateAsync: createConvAsync } = useCreateConversation();
  const { mutateAsync: addMsgsAsync } = useAddMessages();

  // Server-backed conversation list for sidebar
  const { data: serverConversations = [] } = useConversations(campaignId);

  // Active conversation
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  const [localMessages, setLocalMessages] = useState<QueryMessage[]>([]);
  const [activeSources, setActiveSources] = useState<AnswerSource[]>([]);
  const [activeConfidence, setActiveConfidence] = useState<ConfidenceLevel | undefined>();

  // Panel visibility
  const [showHistory, setShowHistory] = useState(true);
  const [showContext, setShowContext] = useState(true);

  const pendingQueryRef = useRef(false);

  // Build history entries from server conversations
  const historyEntries: QueryHistoryEntry[] = serverConversations.map((c) => ({
    id: c.id,
    query: c.title,
    timestamp: new Date(c.updatedAt),
  }));

  // Select a conversation from the sidebar - load its messages from server
  const handleSelectConversation = useCallback(
    async (id: string) => {
      if (!campaignId) return;
      setActiveConvId(id);

      try {
        const detail = await api.get<ConversationDetailResponse>(
          `/api/campaigns/${campaignId}/conversations/${id}`
        );

        const msgs: QueryMessage[] = detail.conversation.messages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          sources: m.sources ?? undefined,
          confidence: m.confidence ?? undefined,
        }));

        setLocalMessages(msgs);

        // Set context panel from the last assistant message
        const lastAssistant = [...msgs].reverse().find((m) => m.role === "assistant");
        setActiveSources(lastAssistant?.sources ?? []);
        setActiveConfidence(lastAssistant?.confidence);
      } catch {
        toast.error("Failed to load conversation");
      }
    },
    [campaignId]
  );

  // Start a new query (clear active state; server conversation created on first submit)
  const handleNewQuery = useCallback(() => {
    setActiveConvId(null);
    setLocalMessages([]);
    setActiveSources([]);
    setActiveConfidence(undefined);
  }, []);

  const handleSubmit = useCallback(
    async (query: string) => {
      if (!campaignId || pendingQueryRef.current) return;

      let convId = activeConvId;

      // Create a server-side conversation if none is active
      if (!convId) {
        try {
          const title = query.length > 100 ? query.slice(0, 100) + "..." : query;
          const result = await createConvAsync({ campaignId, title });
          convId = result.conversation.id;
          setActiveConvId(convId);
        } catch {
          toast.error("Failed to create conversation");
          return;
        }
      }

      const userMsgId = createId();
      const assistantMsgId = createId();

      // Add user message and loading assistant message locally
      setLocalMessages((prev) => [
        ...prev,
        { id: userMsgId, role: "user" as const, content: query },
        { id: assistantMsgId, role: "assistant" as const, content: "", isLoading: true },
      ]);

      pendingQueryRef.current = true;

      try {
        const response = await queryAsync({ campaignId, query });

        // Update local UI
        setLocalMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: response.answer,
                  sources: response.sources,
                  confidence: response.confidence,
                  isLoading: false,
                }
              : m
          )
        );
        setActiveSources(response.sources);
        setActiveConfidence(response.confidence);

        // Persist messages to server (fire and forget, sidebar refresh handled by mutation)
        addMsgsAsync({
          campaignId,
          conversationId: convId,
          messages: [
            { role: "user", content: query },
            {
              role: "assistant",
              content: response.answer,
              sources: response.sources,
              confidence: response.confidence,
            },
          ],
        }).catch(() => {
          // Non-critical: conversation still works locally
        });
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : "Failed to get a response";
        toast.error("Query failed", { description: errorMsg });

        setLocalMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMsgId
              ? {
                  ...m,
                  content: "",
                  error: errorMsg,
                  isLoading: false,
                }
              : m
          )
        );
      } finally {
        pendingQueryRef.current = false;
      }
    },
    [campaignId, activeConvId, queryAsync, createConvAsync, addMsgsAsync]
  );

  const handleSourceClick = useCallback(
    (source: AnswerSource) => {
      if (campaignId) {
        navigate(`/campaigns/${campaignId}/documents#doc-${source.documentId}`);
      }
    },
    [campaignId, navigate]
  );

  const handleOpenDocument = useCallback(
    (documentId: string) => {
      if (campaignId) {
        navigate(`/campaigns/${campaignId}/documents#doc-${documentId}`);
      }
    },
    [campaignId, navigate]
  );

  return (
    <div className="-m-6 flex h-[calc(100vh-8rem)]">
      {/* Left: Query History Sidebar */}
      {showHistory && (
        <div className="hidden w-[260px] shrink-0 lg:block">
          <QueryHistory
            entries={historyEntries}
            activeId={activeConvId ?? undefined}
            onSelect={handleSelectConversation}
            onNewQuery={handleNewQuery}
          />
        </div>
      )}

      {/* Center: Chat Area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Chat header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="hidden lg:inline-flex"
              onClick={() => setShowHistory((v) => !v)}
              aria-label={showHistory ? "Hide history" : "Show history"}
            >
              <History className="h-4 w-4" />
            </Button>
            <h2 className="text-sm font-semibold text-foreground">AI Query</h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:inline-flex"
            onClick={() => setShowContext((v) => !v)}
            aria-label={showContext ? "Hide context panel" : "Show context panel"}
          >
            {showContext ? (
              <PanelRightClose className="h-4 w-4" />
            ) : (
              <PanelRightOpen className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Messages or empty state */}
        {localMessages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState
              icon={<MessageSquare />}
              heading="Ask a question"
              description="Query your campaign documents using AI-powered search. Ask about lore, rules, NPCs, locations, or anything in your uploaded documents."
              className={cn("max-w-md border-0")}
            />
          </div>
        ) : (
          <ResponseDisplay messages={localMessages} onSourceClick={handleSourceClick} />
        )}

        {/* Query input */}
        <QueryInput onSubmit={handleSubmit} isLoading={isPending} />
      </div>

      {/* Right: Context Panel */}
      {showContext && (
        <div className="hidden w-[300px] shrink-0 lg:block">
          <ContextPanel
            sources={activeSources}
            confidence={activeConfidence}
            onOpenDocument={handleOpenDocument}
          />
        </div>
      )}
    </div>
  );
}
