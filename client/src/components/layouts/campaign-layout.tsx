import { NavLink, Outlet, useParams, Link } from "react-router-dom";
import { ArrowLeft, FileText, MessageSquare, Sparkles, Clock, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCampaign } from "@/hooks/use-campaigns";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";

const tabs = [
  { to: "documents", label: "Documents", icon: FileText },
  { to: "query", label: "Query", icon: MessageSquare },
  { to: "generate", label: "Generate", icon: Sparkles },
  { to: "sessions", label: "Sessions", icon: Clock },
  { to: "settings", label: "Settings", icon: Settings },
];

export function CampaignLayout() {
  const { id } = useParams<{ id: string }>();
  const { data: campaign, isLoading, isError, refetch } = useCampaign(id!);

  return (
    <div className="flex flex-col">
      {/* Campaign header */}
      <div className="border-b border-border px-6 py-4">
        <Link
          to="/campaigns"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to campaigns
        </Link>
        <h1 className="text-xl font-semibold text-foreground">
          {isLoading ? (
            <Skeleton className="h-7 w-48 inline-block" />
          ) : (
            (campaign?.name ?? "Campaign")
          )}
        </h1>
      </div>

      {isError ? (
        <div className="p-6">
          <ErrorState
            description="Failed to load campaign. Please try again."
            onRetry={() => refetch()}
          />
        </div>
      ) : (
        <>
          {/* Tab navigation */}
          <div className="border-b border-border px-6">
            <nav className="-mb-px flex gap-4">
              {tabs.map((tab) => (
                <NavLink
                  key={tab.to}
                  to={`/campaigns/${id}/${tab.to}`}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors",
                      isActive
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:border-border hover:text-foreground"
                    )
                  }
                >
                  <tab.icon className="h-4 w-4" />
                  {tab.label}
                </NavLink>
              ))}
            </nav>
          </div>

          {/* Tab content */}
          <div className="p-6">
            <Outlet />
          </div>
        </>
      )}
    </div>
  );
}
