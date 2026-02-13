import { MessageSquare, Plus, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface QueryHistoryEntry {
  id: string;
  query: string;
  timestamp: Date;
}

function groupByTime(
  entries: QueryHistoryEntry[]
): { label: string; items: QueryHistoryEntry[] }[] {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const lastWeek = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; items: QueryHistoryEntry[] }[] = [
    { label: "Today", items: [] },
    { label: "Yesterday", items: [] },
    { label: "Last 7 Days", items: [] },
    { label: "Older", items: [] },
  ];

  for (const entry of entries) {
    const ts = entry.timestamp;
    if (ts >= today) {
      groups[0].items.push(entry);
    } else if (ts >= yesterday) {
      groups[1].items.push(entry);
    } else if (ts >= lastWeek) {
      groups[2].items.push(entry);
    } else {
      groups[3].items.push(entry);
    }
  }

  return groups.filter((g) => g.items.length > 0);
}

export interface QueryHistoryProps {
  entries: QueryHistoryEntry[];
  activeId?: string;
  onSelect: (id: string) => void;
  onNewQuery: () => void;
  className?: string;
}

export function QueryHistory({
  entries,
  activeId,
  onSelect,
  onNewQuery,
  className,
}: QueryHistoryProps) {
  const groups = groupByTime(entries);

  return (
    <div className={cn("flex h-full flex-col bg-sidebar", className)}>
      {/* Header */}
      <div className="border-b border-border p-3">
        <Button size="sm" className="w-full" onClick={onNewQuery}>
          <Plus className="h-4 w-4" />
          New Query
        </Button>
      </div>

      {/* History list */}
      <div className="flex-1 overflow-y-auto p-2">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center py-8 text-center">
            <Clock className="mb-2 h-6 w-6 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Your query history will appear here.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="mb-1 px-2 text-[0.65rem] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </p>
                <div className="space-y-0.5">
                  {group.items.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => onSelect(entry.id)}
                      className={cn(
                        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors",
                        entry.id === activeId
                          ? "bg-accent text-foreground"
                          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
                      )}
                    >
                      <MessageSquare className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{entry.query}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
