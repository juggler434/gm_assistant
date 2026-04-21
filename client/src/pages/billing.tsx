// SPDX-License-Identifier: AGPL-3.0-or-later

import { CreditCard, Zap, ExternalLink, Crown, Wand2, BookOpen } from "lucide-react";
import { toast } from "sonner";
import { useBillingStatus, useCheckout, usePortal } from "@/hooks/use-billing";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

function UsageBar({ current, limit, label }: { current: number; limit: number; label: string }) {
  const isUnlimited = limit === -1;
  const pct = isUnlimited ? 0 : Math.min((current / limit) * 100, 100);
  const isNearLimit = !isUnlimited && pct >= 80;
  const isAtLimit = !isUnlimited && pct >= 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">
          {current.toLocaleString()} / {formatLimit(limit)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full transition-all ${
            isAtLimit
              ? "bg-destructive"
              : isNearLimit
                ? "bg-warning"
                : "bg-primary"
          }`}
          style={{ width: isUnlimited ? "0%" : `${pct}%` }}
        />
      </div>
    </div>
  );
}

function StorageBar({ current, limit }: { current: number; limit: number }) {
  const isUnlimited = limit === -1;
  const pct = isUnlimited ? 0 : Math.min((current / limit) * 100, 100);
  const isNearLimit = !isUnlimited && pct >= 80;
  const isAtLimit = !isUnlimited && pct >= 100;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span className="text-muted-foreground">Document Storage</span>
        <span className="font-medium text-foreground">
          {formatBytes(current)} / {isUnlimited ? "Unlimited" : formatBytes(limit)}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-secondary">
        <div
          className={`h-full rounded-full transition-all ${
            isAtLimit
              ? "bg-destructive"
              : isNearLimit
                ? "bg-warning"
                : "bg-primary"
          }`}
          style={{ width: isUnlimited ? "0%" : `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function BillingPage() {
  const { data: billing, isLoading, error } = useBillingStatus();
  const checkout = useCheckout();
  const portal = usePortal();

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner label="Loading billing..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <p className="text-destructive">Failed to load billing information.</p>
      </div>
    );
  }

  const activePlan = billing?.subscription?.status === "active"
    ? (billing.subscription.planId as PlanId)
    : null;

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

  function handlePortal() {
    portal.mutate(undefined, {
      onError: (err) => {
        if (err instanceof ApiError) {
          toast.error(err.message);
        } else {
          toast.error("Failed to open billing portal");
        }
      },
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-8 p-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Billing & Plans</h1>
        <p className="mt-1 text-muted-foreground">
          Manage your subscription and monitor usage
        </p>
      </div>

      {/* Current usage (only shown when subscribed) */}
      {billing?.subscription && billing.limits && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-primary" />
                Current Usage
              </CardTitle>
              <CardDescription>
                {PLAN_TIERS[activePlan!]?.name ?? "Unknown"} plan — resets{" "}
                {new Date(billing.subscription.currentPeriodEnd).toLocaleDateString()}
              </CardDescription>
            </div>
            {billing.subscription.cancelAtPeriodEnd && (
              <Badge variant="warning">Cancels at period end</Badge>
            )}
          </CardHeader>
          <CardContent className="space-y-4">
            <UsageBar
              current={billing.usage.ragQueries}
              limit={billing.limits.ragQueries}
              label="RAG Queries"
            />
            <UsageBar
              current={billing.usage.contentGenerations}
              limit={billing.limits.contentGenerations}
              label="Content Generations"
            />
            <UsageBar
              current={billing.usage.sessionSummaries}
              limit={billing.limits.sessionSummaries}
              label="Session Summaries"
            />
            <StorageBar
              current={billing.usage.storageBytes}
              limit={billing.limits.storageBytes}
            />
            <UsageBar
              current={billing.usage.campaigns}
              limit={billing.limits.campaigns}
              label="Campaigns"
            />
          </CardContent>
          <CardFooter>
            <Button variant="outline" onClick={handlePortal} disabled={portal.isPending}>
              {portal.isPending ? (
                <Spinner label="Opening portal..." />
              ) : (
                <>
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Manage Subscription
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* Plan cards */}
      <div>
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          {activePlan ? "Change Plan" : "Choose a Plan"}
        </h2>
        <div className="grid gap-4 md:grid-cols-3">
          {(Object.keys(PLAN_TIERS) as PlanId[]).map((planId) => {
            const plan = PLAN_TIERS[planId];
            const display = PLAN_DISPLAY[planId];
            const Icon = display.icon;
            const isCurrent = activePlan === planId;

            return (
              <Card
                key={planId}
                className={`flex flex-col ${
                  isCurrent ? "border-primary" : ""
                }`}
              >
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
                  {isCurrent ? (
                    <Button className="w-full" variant="outline" disabled>
                      Current Plan
                    </Button>
                  ) : (
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
                          {activePlan ? "Switch Plan" : "Subscribe"}
                        </>
                      )}
                    </Button>
                  )}
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
