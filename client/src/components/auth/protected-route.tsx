// SPDX-License-Identifier: AGPL-3.0-or-later

import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/hooks/use-auth";
import { useBillingStatus } from "@/hooks/use-billing";
import { Spinner } from "@/components/ui/spinner";

export function ProtectedRoute() {
  const { isAuthenticated, isEmailVerified, isLoading: authLoading } = useAuth();
  const shouldCheckBilling = isAuthenticated && isEmailVerified;
  const { data: billing, isLoading: billingLoading } = useBillingStatus(shouldCheckBilling);

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (!isEmailVerified) {
    return <Navigate to="/verify-email" replace />;
  }

  if (billingLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  const hasActiveSubscription = billing?.subscription?.status === "active";
  if (!hasActiveSubscription) {
    return <Navigate to="/choose-plan" replace />;
  }

  return <Outlet />;
}
