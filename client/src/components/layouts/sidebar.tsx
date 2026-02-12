import { NavLink, useParams } from "react-router-dom";
import { LayoutDashboard, FileText, MessageSquare, Sparkles, Clock, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { CampaignSwitcher } from "@/components/layouts/campaign-switcher";

const campaignNavItems = [
  { to: "documents", label: "Documents", icon: FileText },
  { to: "query", label: "Ask Questions", icon: MessageSquare },
  { to: "generate", label: "Generate Content", icon: Sparkles },
  { to: "sessions", label: "Sessions", icon: Clock },
  { to: "settings", label: "Settings", icon: Settings },
];

interface SidebarProps {
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const { id: campaignId } = useParams<{ id: string }>();

  return (
    <div className="flex h-full flex-col">
      {/* Logo */}
      <div className="flex h-14 shrink-0 items-center gap-2 border-b border-border px-4">
        <LayoutDashboard className="h-5 w-5 text-primary" />
        <span className="text-lg font-semibold text-foreground">GM Assistant</span>
      </div>

      {/* Campaign switcher */}
      <div className="border-b border-border p-3">
        <CampaignSwitcher />
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-3">
        {/* Campaigns overview link */}
        <NavLink
          to="/campaigns"
          end
          onClick={onNavigate}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              isActive
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
            )
          }
        >
          <LayoutDashboard className="h-4 w-4" />
          Campaigns
        </NavLink>

        {/* Campaign-specific navigation */}
        {campaignId && (
          <>
            <div className="px-3 pb-1 pt-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-sidebar-muted-foreground">
                Campaign
              </span>
            </div>
            {campaignNavItems.map((item) => (
              <NavLink
                key={item.to}
                to={`/campaigns/${campaignId}/${item.to}`}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-muted-foreground hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </>
        )}
      </nav>
    </div>
  );
}
