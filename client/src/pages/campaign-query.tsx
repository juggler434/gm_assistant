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
import { cn } from "@/lib/utils";
import type { AnswerSource, ConfidenceLevel } from "@/types";

interface Conversation {
  id: string;
  messages: QueryMessage[];
  sources: AnswerSource[];
  confidence?: ConfidenceLevel;
}

function createId(): string {
  return crypto.randomUUID();
}

export function QueryPage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { mutateAsync, isPending } = useCampaignQuery();

  // Conversations state
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);

  // Panel visibility
  const [showHistory, setShowHistory] = useState(true);
  const [showContext, setShowContext] = useState(true);

  const pendingQueryRef = useRef(false);

  const activeConv = conversations.find((c) => c.id === activeConvId) ?? null;

  const historyEntries: QueryHistoryEntry[] = conversations
    .filter((c) => c.messages.length > 0)
    .map((c) => ({
      id: c.id,
      query: c.messages[0].content,
      timestamp: new Date(parseInt(c.id.split("-")[0] || "0", 16) || Date.now()),
    }))
    .reverse();

  const handleNewQuery = useCallback(() => {
    const conv: Conversation = {
      id: createId(),
      messages: [],
      sources: [],
    };
    setConversations((prev) => [...prev, conv]);
    setActiveConvId(conv.id);
  }, []);

  const handleSelectConversation = useCallback((id: string) => {
    setActiveConvId(id);
  }, []);

  const handleSubmit = useCallback(
    async (query: string) => {
      if (!campaignId || pendingQueryRef.current) return;

      let convId = activeConvId;

      // Create a new conversation if none is active
      if (!convId) {
        const conv: Conversation = {
          id: createId(),
          messages: [],
          sources: [],
        };
        setConversations((prev) => [...prev, conv]);
        setActiveConvId(conv.id);
        convId = conv.id;
      }

      const userMsgId = createId();
      const assistantMsgId = createId();

      // Add user message and loading assistant message
      setConversations((prev) =>
        prev.map((c) =>
          c.id === convId
            ? {
                ...c,
                messages: [
                  ...c.messages,
                  { id: userMsgId, role: "user" as const, content: query },
                  { id: assistantMsgId, role: "assistant" as const, content: "", isLoading: true },
                ],
              }
            : c
        )
      );

      pendingQueryRef.current = true;

      try {
        const response = await mutateAsync({ campaignId, query });

        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  sources: response.sources,
                  confidence: response.confidence,
                  messages: c.messages.map((m) =>
                    m.id === assistantMsgId
                      ? {
                          ...m,
                          content: response.answer,
                          sources: response.sources,
                          confidence: response.confidence,
                          isLoading: false,
                        }
                      : m
                  ),
                }
              : c
          )
        );
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : "Failed to get a response";
        toast.error("Query failed", { description: errorMsg });

        setConversations((prev) =>
          prev.map((c) =>
            c.id === convId
              ? {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === assistantMsgId
                      ? {
                          ...m,
                          content: "",
                          error: errorMsg,
                          isLoading: false,
                        }
                      : m
                  ),
                }
              : c
          )
        );
      } finally {
        pendingQueryRef.current = false;
      }
    },
    [campaignId, activeConvId, mutateAsync]
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
        {!activeConv || activeConv.messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center p-6">
            <EmptyState
              icon={<MessageSquare />}
              heading="Ask a question"
              description="Query your campaign documents using AI-powered search. Ask about lore, rules, NPCs, locations, or anything in your uploaded documents."
              className={cn("max-w-md border-0")}
            />
          </div>
        ) : (
          <ResponseDisplay messages={activeConv.messages} onSourceClick={handleSourceClick} />
        )}

        {/* Query input */}
        <QueryInput onSubmit={handleSubmit} isLoading={isPending} />
      </div>

      {/* Right: Context Panel */}
      {showContext && (
        <div className="hidden w-[300px] shrink-0 lg:block">
          <ContextPanel
            sources={activeConv?.sources ?? []}
            confidence={activeConv?.confidence}
            onOpenDocument={handleOpenDocument}
          />
        </div>
      )}
    </div>
  );
}
