import type { MouseEvent } from "react";
import { Link } from "react-router-dom";
import { Calendar, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Campaign } from "@/types";

function stopNav(e: MouseEvent) {
  e.preventDefault();
  e.stopPropagation();
}

function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

interface CampaignCardProps {
  campaign: Campaign;
  onEdit: (campaign: Campaign) => void;
  onDelete: (campaign: Campaign) => void;
}

export function CampaignCard({ campaign, onEdit, onDelete }: CampaignCardProps) {
  return (
    <Link to={`/campaigns/${campaign.id}`} className="group block">
      <Card className="transition-all hover:border-primary/50 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-primary/5">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <CardTitle className="line-clamp-1">{campaign.name}</CardTitle>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                  onClick={stopNav}
                >
                  <MoreHorizontal className="h-4 w-4" />
                  <span className="sr-only">Campaign actions</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={stopNav}>
                <DropdownMenuItem
                  onClick={(e: MouseEvent) => {
                    stopNav(e);
                    onEdit(campaign);
                  }}
                >
                  <Pencil />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={(e: MouseEvent) => {
                    stopNav(e);
                    onDelete(campaign);
                  }}
                >
                  <Trash2 />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
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
