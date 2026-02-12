import { useNavigate, useParams, useLocation } from "react-router-dom";
import { ChevronsUpDown, Plus, BookOpen } from "lucide-react";
import { useCampaigns } from "@/hooks/use-campaigns";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export function CampaignSwitcher() {
  const { id: campaignId } = useParams<{ id: string }>();
  const { data: campaigns } = useCampaigns();
  const navigate = useNavigate();
  const location = useLocation();

  const activeCampaign = campaigns?.find((c) => c.id === campaignId);

  function handleSelectCampaign(id: string) {
    // Preserve the current sub-route (documents, query, etc.) when switching
    const subRoute = location.pathname.match(/\/campaigns\/[^/]+\/(.+)/)?.[1] ?? "documents";
    navigate(`/campaigns/${id}/${subRoute}`);
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-sm transition-colors hover:bg-sidebar-accent",
          "focus:outline-none focus:ring-1 focus:ring-sidebar-ring"
        )}
      >
        <BookOpen className="h-4 w-4 shrink-0 text-primary" />
        <span className="flex-1 truncate text-left text-sidebar-foreground">
          {activeCampaign?.name ?? "Select campaign"}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-sidebar-muted-foreground" />
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[--radix-dropdown-menu-trigger-width]" align="start">
        <DropdownMenuLabel>Campaigns</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {campaigns?.map((campaign) => (
          <DropdownMenuItem
            key={campaign.id}
            className={cn(
              "cursor-pointer",
              campaign.id === campaignId && "bg-accent text-accent-foreground"
            )}
            onSelect={() => handleSelectCampaign(campaign.id)}
          >
            <BookOpen className="h-4 w-4 shrink-0" />
            <span className="truncate">{campaign.name}</span>
          </DropdownMenuItem>
        ))}
        {campaigns?.length === 0 && (
          <div className="px-2 py-1.5 text-sm text-muted-foreground">No campaigns yet</div>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer" onSelect={() => navigate("/campaigns")}>
          <Plus className="h-4 w-4" />
          <span>All campaigns</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
