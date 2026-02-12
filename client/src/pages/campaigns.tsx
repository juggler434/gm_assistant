import { Link } from "react-router-dom";
import { BookOpen, Plus, Calendar } from "lucide-react";
import { useCampaigns } from "@/hooks/use-campaigns";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { CardSkeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Button } from "@/components/ui/button";
import type { Campaign } from "@/types";

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function CampaignCard({ campaign }: { campaign: Campaign }) {
  return (
    <Link to={`/campaigns/${campaign.id}`} className="block">
      <Card className="transition-colors hover:border-primary/50">
        <CardHeader>
          <CardTitle>{campaign.name}</CardTitle>
          {campaign.description && (
            <CardDescription className="line-clamp-2">{campaign.description}</CardDescription>
          )}
        </CardHeader>
        <CardFooter className="text-xs text-muted-foreground">
          <Calendar className="mr-1 h-3.5 w-3.5" />
          Created {formatDate(campaign.createdAt)}
        </CardFooter>
      </Card>
    </Link>
  );
}

export function CampaignListPage() {
  const { data: campaigns, isLoading, isError, refetch } = useCampaigns();

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Your Campaigns</h1>
        <Button size="sm">
          <Plus className="h-4 w-4" />
          New Campaign
        </Button>
      </div>

      {isLoading && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      )}

      {isError && (
        <ErrorState
          description="Failed to load campaigns. Please try again."
          onRetry={() => refetch()}
        />
      )}

      {campaigns && campaigns.length === 0 && (
        <EmptyState
          icon={<BookOpen />}
          heading="No campaigns yet"
          description="Create your first campaign to start organizing your RPG world."
          action={
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Create Campaign
            </Button>
          }
        />
      )}

      {campaigns && campaigns.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {campaigns.map((campaign) => (
            <CampaignCard key={campaign.id} campaign={campaign} />
          ))}
        </div>
      )}
    </div>
  );
}
