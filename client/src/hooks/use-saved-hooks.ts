import { useCallback, useState } from "react";
import type { AdventureHook } from "@/types";

function storageKey(campaignId: string): string {
  return `gm-assistant:saved-hooks:${campaignId}`;
}

function loadSavedHooks(campaignId: string): AdventureHook[] {
  try {
    const raw = localStorage.getItem(storageKey(campaignId));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function persistSavedHooks(campaignId: string, hooks: AdventureHook[]): void {
  localStorage.setItem(storageKey(campaignId), JSON.stringify(hooks));
}

/**
 * Manages saved adventure hooks in localStorage, scoped by campaign.
 */
export function useSavedHooks(campaignId: string) {
  const [savedHooks, setSavedHooks] = useState<AdventureHook[]>(() => loadSavedHooks(campaignId));

  const saveHook = useCallback(
    (hook: AdventureHook) => {
      setSavedHooks((prev) => {
        const alreadySaved = prev.some(
          (h) => h.title === hook.title && h.description === hook.description
        );
        if (alreadySaved) return prev;
        const next = [...prev, hook];
        persistSavedHooks(campaignId, next);
        return next;
      });
    },
    [campaignId]
  );

  const unsaveHook = useCallback(
    (hook: AdventureHook) => {
      setSavedHooks((prev) => {
        const next = prev.filter(
          (h) => !(h.title === hook.title && h.description === hook.description)
        );
        persistSavedHooks(campaignId, next);
        return next;
      });
    },
    [campaignId]
  );

  return { savedHooks, saveHook, unsaveHook };
}
