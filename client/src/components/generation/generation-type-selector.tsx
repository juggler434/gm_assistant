import { Sparkles, Route, BookOpen, Users, MapPin, Lock, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type GenerationType =
  | "adventure-hooks"
  | "adventure-outlines"
  | "full-adventures"
  | "npcs"
  | "locations";

interface GenerationTypeOption {
  id: GenerationType;
  label: string;
  description: string;
  icon: LucideIcon;
  available: boolean;
}

const generationTypes: GenerationTypeOption[] = [
  {
    id: "adventure-hooks",
    label: "Adventure Hooks",
    description: "Quick story starters and plot hooks for your campaign",
    icon: Sparkles,
    available: true,
  },
  {
    id: "adventure-outlines",
    label: "Adventure Outlines",
    description: "Structured adventure outlines with scenes and encounters",
    icon: Route,
    available: false,
  },
  {
    id: "full-adventures",
    label: "Full Adventures",
    description: "Complete adventures with detailed scenes and dialogue",
    icon: BookOpen,
    available: false,
  },
  {
    id: "npcs",
    label: "NPCs",
    description: "Non-player characters with backstories and motivations",
    icon: Users,
    available: false,
  },
  {
    id: "locations",
    label: "Locations",
    description: "Detailed locations with descriptions and points of interest",
    icon: MapPin,
    available: false,
  },
];

interface GenerationTypeSelectorProps {
  selected: GenerationType;
  onSelect: (type: GenerationType) => void;
}

export function GenerationTypeSelector({ selected, onSelect }: GenerationTypeSelectorProps) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      {generationTypes.map((type) => {
        const Icon = type.icon;
        const isSelected = selected === type.id;

        return (
          <button
            key={type.id}
            type="button"
            onClick={() => type.available && onSelect(type.id)}
            disabled={!type.available}
            className={cn(
              "relative flex flex-col items-start gap-2 rounded-[var(--radius)] border p-4 text-left transition-colors",
              isSelected
                ? "border-primary bg-primary/8"
                : "border-border bg-card hover:border-primary/50",
              !type.available && "cursor-not-allowed opacity-60 hover:border-border"
            )}
          >
            <div className="flex w-full items-center justify-between">
              <div
                className={cn(
                  "rounded-md p-1.5",
                  isSelected ? "bg-primary/15 text-primary" : "bg-secondary text-muted-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
              </div>
              {!type.available && (
                <Badge variant="secondary" className="gap-1 text-[10px]">
                  <Lock className="h-2.5 w-2.5" />
                  Soon
                </Badge>
              )}
            </div>
            <div>
              <h3 className="text-sm font-semibold text-foreground">{type.label}</h3>
              <p className="mt-0.5 text-xs text-muted-foreground">{type.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
