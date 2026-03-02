// SPDX-License-Identifier: AGPL-3.0-or-later

import { useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { LocationList } from "@/components/locations/location-list";
import { LocationForm } from "@/components/locations/location-form";
import { LocationDetailDialog } from "@/components/locations/location-detail-dialog";
import {
  useLocations,
  useCreateLocation,
  useUpdateLocation,
  useDeleteLocation,
} from "@/hooks/use-locations";
import type { Location, CreateLocationRequest } from "@/types";

export function LocationsPage() {
  const { id: campaignId } = useParams<{ id: string }>();
  const { data: locations, isLoading, error, refetch } = useLocations(campaignId ?? "");
  const createLocation = useCreateLocation(campaignId ?? "");
  const deleteLocation = useDeleteLocation(campaignId ?? "");

  const [formOpen, setFormOpen] = useState(false);
  const [editingLocation, setEditingLocation] = useState<Location | null>(null);
  const [detailLocation, setDetailLocation] = useState<Location | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const updateLocation = useUpdateLocation(campaignId ?? "", editingLocation?.id ?? "");

  const handleCreate = useCallback(() => {
    setEditingLocation(null);
    setFormOpen(true);
  }, []);

  const handleSelectLocation = useCallback((location: Location) => {
    setDetailLocation(location);
    setDetailOpen(true);
  }, []);

  const handleEdit = useCallback((location: Location) => {
    setDetailOpen(false);
    setEditingLocation(location);
    setFormOpen(true);
  }, []);

  const handleDelete = useCallback(
    async (location: Location) => {
      setDetailOpen(false);
      try {
        await deleteLocation.mutateAsync(location.id);
        toast.success(`${location.name} deleted`);
      } catch {
        toast.error("Failed to delete location");
      }
    },
    [deleteLocation]
  );

  const handleSubmit = useCallback(
    async (data: CreateLocationRequest) => {
      try {
        if (editingLocation) {
          await updateLocation.mutateAsync(data);
          toast.success(`${data.name} updated`);
        } else {
          await createLocation.mutateAsync(data);
          toast.success(`${data.name} created`);
        }
        setFormOpen(false);
        setEditingLocation(null);
      } catch {
        toast.error(
          editingLocation ? "Failed to update location" : "Failed to create location"
        );
      }
    },
    [editingLocation, createLocation, updateLocation]
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Locations</h2>
          <p className="text-sm text-muted-foreground">
            Manage locations for this campaign
          </p>
        </div>
        <Button className="gap-1.5" onClick={handleCreate}>
          <Plus className="h-4 w-4" />
          Create Location
        </Button>
      </div>

      <LocationList
        locations={locations}
        isLoading={isLoading}
        error={error}
        onSelectLocation={handleSelectLocation}
        onRetry={() => refetch()}
      />

      <LocationForm
        open={formOpen}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditingLocation(null);
        }}
        onSubmit={handleSubmit}
        isLoading={createLocation.isPending || updateLocation.isPending}
        location={editingLocation}
      />

      <LocationDetailDialog
        location={detailLocation}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onEdit={handleEdit}
        onDelete={handleDelete}
      />
    </div>
  );
}
