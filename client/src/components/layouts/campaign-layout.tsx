import { Outlet, useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { useCampaign } from "@/hooks/use-campaigns";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";

export function CampaignLayout() {
  const { id } = useParams<{ id: string }>();
  const { data: campaign, isLoading, isError, refetch } = useCampaign(id!);

  return (
    <div className="flex flex-col">
      {/* Campaign header */}
      <div className="border-b border-border px-6 py-4">
        <Link
          to="/campaigns"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground lg:hidden"
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
        {campaign?.description && (
          <p className="mt-1 text-sm text-muted-foreground">{campaign.description}</p>
        )}
      </div>

      {isError ? (
        <div className="p-6">
          <ErrorState
            description="Failed to load campaign. Please try again."
            onRetry={() => refetch()}
          />
        </div>
      ) : (
        <div className="p-6">
          <Outlet />
        </div>
      )}
    </div>
  );
}
