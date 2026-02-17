// SPDX-License-Identifier: AGPL-3.0-or-later

import { useEffect, useRef } from "react";
import { User, Bot } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { AnswerSource, ConfidenceLevel } from "@/types";

export interface QueryMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources?: AnswerSource[];
  confidence?: ConfidenceLevel;
  isLoading?: boolean;
  error?: string;
}

const confidenceStyles: Record<
  ConfidenceLevel,
  { label: string; variant: "success" | "warning" | "destructive" }
> = {
  high: { label: "High confidence", variant: "success" },
  medium: { label: "Medium confidence", variant: "warning" },
  low: { label: "Low confidence", variant: "destructive" },
};

interface SourceTagProps {
  source: AnswerSource;
  index: number;
  onClick?: (source: AnswerSource) => void;
}

function SourceTag({ source, index, onClick }: SourceTagProps) {
  const pageLabel = source.pageNumber != null ? ` p. ${source.pageNumber}` : "";
  return (
    <button
      type="button"
      onClick={() => onClick?.(source)}
      className="inline-flex items-center gap-1 rounded-md border border-border bg-secondary px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
    >
      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/12 text-[0.6rem] font-bold text-primary">
        {index}
      </span>
      <span className="max-w-[140px] truncate">{source.documentName}</span>
      {pageLabel && <span className="text-muted-foreground/70">{pageLabel}</span>}
    </button>
  );
}

interface MessageBubbleProps {
  message: QueryMessage;
  onSourceClick?: (source: AnswerSource) => void;
}

function MessageBubble({ message, onSourceClick }: MessageBubbleProps) {
  const isUser = message.role === "user";

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      {/* Avatar */}
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
          isUser ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground"
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>

      {/* Message content */}
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-4 py-3",
          isUser ? "bg-primary/10 text-foreground" : "bg-card border border-border text-foreground"
        )}
      >
        {message.isLoading ? (
          <div className="flex items-center gap-2">
            <Spinner className="h-4 w-4" />
            <span className="text-sm text-muted-foreground">
              Searching documents and generating answer...
            </span>
          </div>
        ) : message.error ? (
          <p className="text-sm text-destructive">{message.error}</p>
        ) : (
          <>
            <div className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</div>

            {/* Sources */}
            {message.sources && message.sources.length > 0 && (
              <div className="mt-3 border-t border-border pt-3">
                <span className="text-xs font-semibold text-muted-foreground">Sources:</span>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {message.sources.map((source, i) => (
                    <SourceTag
                      key={`${source.documentId}-${source.pageNumber ?? i}`}
                      source={source}
                      index={i + 1}
                      onClick={onSourceClick}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Confidence */}
            {message.confidence && (
              <div className="mt-2 flex items-center gap-1.5">
                <span className="text-[0.65rem] text-muted-foreground">Confidence:</span>
                <Badge
                  variant={confidenceStyles[message.confidence].variant}
                  className="text-[0.65rem] px-1.5 py-0"
                >
                  {confidenceStyles[message.confidence].label}
                </Badge>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export interface ResponseDisplayProps {
  messages: QueryMessage[];
  onSourceClick?: (source: AnswerSource) => void;
  className?: string;
}

export function ResponseDisplay({ messages, onSourceClick, className }: ResponseDisplayProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className={cn("flex-1 overflow-y-auto px-4 py-6", className)}>
      <div className="mx-auto max-w-3xl space-y-6">
        {messages.map((msg) => (
          <MessageBubble key={msg.id} message={msg} onSourceClick={onSourceClick} />
        ))}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
