// SPDX-License-Identifier: AGPL-3.0-or-later

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import type {
  Location,
  LocationListResponse,
  LocationResponse,
  CreateLocationRequest,
  UpdateLocationRequest,
} from "@/types";

export const locationKeys = {
  all: (campaignId: string) => ["locations", campaignId] as const,
  detail: (campaignId: string, id: string) => ["locations", campaignId, id] as const,
};

export function useLocations(campaignId: string) {
  return useQuery({
    queryKey: locationKeys.all(campaignId),
    queryFn: () =>
      api.get<LocationListResponse>(`/api/campaigns/${campaignId}/locations`),
    select: (data) => data.locations,
    enabled: !!campaignId,
  });
}

export function useCreateLocation(campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: CreateLocationRequest) =>
      api.post<LocationResponse>(`/api/campaigns/${campaignId}/locations`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: locationKeys.all(campaignId) });
    },
  });
}

export function useUpdateLocation(campaignId: string, id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateLocationRequest) =>
      api.patch<LocationResponse>(
        `/api/campaigns/${campaignId}/locations/${id}`,
        data
      ),
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: locationKeys.detail(campaignId, id),
      });
      queryClient.invalidateQueries({
        queryKey: locationKeys.all(campaignId),
      });
    },
  });
}

export function useDeleteLocation(campaignId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      api.delete(`/api/campaigns/${campaignId}/locations/${id}`),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: locationKeys.all(campaignId) });
      const previous = queryClient.getQueryData<LocationListResponse>(
        locationKeys.all(campaignId)
      );
      if (previous) {
        queryClient.setQueryData<LocationListResponse>(
          locationKeys.all(campaignId),
          { locations: previous.locations.filter((l: Location) => l.id !== id) }
        );
      }
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(locationKeys.all(campaignId), context.previous);
      }
    },
    onSettled: (_data, _err, id) => {
      queryClient.removeQueries({ queryKey: locationKeys.detail(campaignId, id) });
      queryClient.invalidateQueries({ queryKey: locationKeys.all(campaignId) });
    },
  });
}
