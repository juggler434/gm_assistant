// SPDX-License-Identifier: AGPL-3.0-or-later

import { CreditCard, Crown, Wand2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { useCheckout } from "@/hooks/use-billing";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { PLAN_TIERS, type PlanId } from "@/types";
import { ApiError } from "@/lib/api-client";

const PLAN_DISPLAY: Record<PlanId, { icon: typeof Crown; tagline: string; price: string }> = {
  acolyte: {
    icon: BookOpen,
    tagline: "For new Game Masters getting started",
    price: "$12",
  },
  wizard: {
    icon: Wand2,
    tagline: "For dedicated GMs running regular campaigns",
    price: "$22",
  },
  archmage: {
    icon: Crown,
    tagline: "For power users and professional GMs",
    price: "$40",
  },
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(i > 1 ? 1 : 0)} ${units[i]}`;
}

function formatLimit(value: number): string {
  return value === -1 ? "Unlimited" : value.toLocaleString();
}

export function ChoosePlanPage() {
  const checkout = useCheckout();

  function handleCheckout(planId: PlanId) {
    checkout.mutate({ planId }, {
      onError: (err) => {
        if (err instanceof ApiError) {
          toast.error(err.message);
        } else {
          toast.error("Failed to start checkout");
        }
      },
    });
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-12">
      <div className="mx-auto max-w-4xl space-y-6 text-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Choose Your Plan</h1>
          <p className="mt-2 text-muted-foreground">
            Select a plan to start managing your campaigns with AI
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {(Object.keys(PLAN_TIERS) as PlanId[]).map((planId) => {
            const plan = PLAN_TIERS[planId];
            const display = PLAN_DISPLAY[planId];
            const Icon = display.icon;

            return (
              <Card key={planId} className="flex flex-col text-left">
                <CardHeader className="text-center">
                  <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <CardDescription>{display.tagline}</CardDescription>
                  <div className="mt-2">
                    <span className="text-3xl font-bold text-foreground">
                      {display.price}
                    </span>
                    <span className="text-muted-foreground">/mo</span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 space-y-2 text-sm">
                  <FeatureRow label="RAG Queries" value={`${formatLimit(plan.limits.ragQueries)}/mo`} />
                  <FeatureRow label="Content Generations" value={`${formatLimit(plan.limits.contentGenerations)}/mo`} />
                  <FeatureRow label="Session Summaries" value={`${formatLimit(plan.limits.sessionSummaries)}/mo`} />
                  <FeatureRow
                    label="Document Storage"
                    value={plan.limits.storageBytes === -1 ? "Unlimited" : formatBytes(plan.limits.storageBytes)}
                  />
                  <FeatureRow label="Campaigns" value={formatLimit(plan.limits.campaigns)} />
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    variant="default"
                    onClick={() => handleCheckout(planId)}
                    disabled={checkout.isPending}
                  >
                    {checkout.isPending ? (
                      <Spinner label="Loading..." />
                    ) : (
                      <>
                        <CreditCard className="mr-2 h-4 w-4" />
                        Get Started
                      </>
                    )}
                  </Button>
                </CardFooter>
              </Card>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FeatureRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  );
}
