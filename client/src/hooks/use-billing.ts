// SPDX-License-Identifier: AGPL-3.0-or-later

import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  BillingStatusResponse,
  CheckoutRequest,
  CheckoutResponse,
  PortalResponse,
} from "@/types";

export const billingKeys = {
  status: ["billing", "status"] as const,
};

export function useBillingStatus(enabled = true) {
  return useQuery({
    queryKey: billingKeys.status,
    queryFn: () => api.get<BillingStatusResponse>("/api/billing/status"),
    staleTime: 0,
    refetchOnWindowFocus: true,
    enabled,
  });
}

export function useCheckout() {
  return useMutation({
    mutationFn: (data: CheckoutRequest) =>
      api.post<CheckoutResponse>("/api/billing/checkout", data),
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
  });
}

export function usePortal() {
  return useMutation({
    mutationFn: () => api.post<PortalResponse>("/api/billing/portal"),
    onSuccess: (data) => {
      if (data.url) {
        window.location.href = data.url;
      }
    },
  });
}
