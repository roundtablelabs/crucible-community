/**
 * useCachePersistence hook
 * Handles persisting intake chat state to session cache
 * 
 * Extracted from frontend/app/(app)/app/page.tsx
 */

import { useEffect } from "react";
import { logDebug } from "@/lib/utils/errorHandler";
import {
  readSessionCache,
  removeSessionCache,
} from "@/lib/storage/sessionCache";
import {
  BOARDROOM_CHAT_CACHE_VERSION,
  BOARDROOM_CHAT_TTL_MS,
  LAUNCHPAD_INTAKE_CACHE_VERSION,
  LAUNCHPAD_INTAKE_TTL_MS,
} from "@/features/rounds/storageKeys";
import { getCacheSyncManager } from "@/lib/storage/cacheSync";
import {
  CHAT_CACHE_KEY,
  LAUNCHPAD_CACHE_KEY,
} from "../constants";
import type { BoardroomIntakeCache, IntakeChatMessage, LaunchpadIntakeCache } from "../types";

type ToastOptions = {
  title: string;
  description: string;
  variant?: "info" | "success" | "error";
};

type UseCachePersistenceOptions = {
  chatMessages: IntakeChatMessage[];
  intakeSummary: string | null;
  isChatActive: boolean;
  pendingCachedIntake: BoardroomIntakeCache | null;
  hasBootstrappedChat: React.MutableRefObject<boolean>;
  setStorageError: (error: string | null) => void;
  showToast: (options: ToastOptions) => void;
};

/**
 * Hook to manage cache persistence for intake chat state.
 * 
 * This hook:
 * 1. Saves chat messages and summary to session cache when they change
 * 2. Syncs to launchpad cache (preserving moderatorBrief/knights)
 * 3. Handles storage errors and quota exceeded
 * 4. Broadcasts cache updates via BroadcastChannel
 * 5. Protects against clearing cache during restoration
 */
export function useCachePersistence({
  chatMessages,
  intakeSummary,
  isChatActive,
  pendingCachedIntake,
  hasBootstrappedChat,
  setStorageError,
  showToast,
}: UseCachePersistenceOptions): void {
  useEffect(() => {
    // Don't clear cache during initial mount before restoration completes
    // This prevents clearing the cache before the restoration useEffect can read it
    if (!hasBootstrappedChat.current) {
      return;
    }
    if (!isChatActive) {
      return;
    }
    // Don't clear cache if there's a pending cached intake (user hasn't chosen to resume or start fresh yet)
    // This prevents clearing the cache when component remounts and pendingCachedIntake is set but state vars are still empty
    const hasPendingCachedIntake = Boolean(pendingCachedIntake);
    
    // Also check if cache exists - if it does, don't clear it even if state is empty
    // This handles the case where component remounts and pendingCachedIntake hasn't been set yet
    (async () => {
      const cached = await readSessionCache<BoardroomIntakeCache>(CHAT_CACHE_KEY, {
        version: BOARDROOM_CHAT_CACHE_VERSION,
      });
      const hasCachedState = Boolean(
        cached &&
        (cached.messages?.length > 0 || cached.summary)
      );
    
      if (chatMessages.length === 0 && !intakeSummary) {
        // Only clear cache if there's no pending cached intake AND no cached state
        // This prevents clearing cache during remount before restoration can set pendingCachedIntake
        if (!hasPendingCachedIntake && !hasCachedState) {
          removeSessionCache(CHAT_CACHE_KEY);
          // Don't clear launchpad cache here - it might have moderatorBrief/knights even if messages are empty
          // The launchpad page will clear its own cache if it has no state
        } else {
          logDebug("[Boardroom] No state but pendingCachedIntake or cachedState exists, preserving cache", {
            hasPendingCachedIntake,
            hasCachedState,
          });
        }
      }
    })();
    
    // Save cache when state changes (with encryption for sensitive data)
    (async () => {
      const { writeSessionCacheAsync } = await import("@/lib/storage/sessionCache");
      const writeResult = await writeSessionCacheAsync(
        CHAT_CACHE_KEY,
        {
          messages: chatMessages,
          summary: intakeSummary,
        },
        {
          version: BOARDROOM_CHAT_CACHE_VERSION,
          ttlMs: BOARDROOM_CHAT_TTL_MS,
          encrypt: true, // Encrypt sensitive chat data
        },
      );
      
      if (!writeResult.success) {
        if (writeResult.reason === "quota_exceeded") {
          setStorageError("Storage is full. Please clear old sessions or refresh the page.");
          showToast({
            title: "Storage full",
            description: "Unable to save your progress. Please clear old sessions or refresh the page.",
            variant: "error",
          });
        } else if (writeResult.reason === "storage_unavailable") {
          setStorageError("Storage is unavailable. Your progress may not be saved.");
          showToast({
            title: "Storage unavailable",
            description: "Unable to save your progress. Please refresh the page.",
            variant: "error",
          });
        }
      } else {
        setStorageError(null);
        // Broadcast cache update
        const syncManager = getCacheSyncManager();
        syncManager.broadcastUpdate(CHAT_CACHE_KEY, Date.now());
      }
      
      // Also sync to launchpad cache (preserve moderatorBrief and knights if they exist)
      const { readSessionCacheAsync } = await import("@/lib/storage/sessionCache");
      const existingLaunchpadCache = await readSessionCacheAsync<LaunchpadIntakeCache>(
        LAUNCHPAD_CACHE_KEY,
        {
          version: LAUNCHPAD_INTAKE_CACHE_VERSION,
        },
      );
      const launchpadWriteResult = await writeSessionCacheAsync(
        LAUNCHPAD_CACHE_KEY,
        {
          messages: chatMessages,
          summary: intakeSummary,
          moderatorBrief: existingLaunchpadCache?.moderatorBrief,
        },
        {
          version: LAUNCHPAD_INTAKE_CACHE_VERSION,
          ttlMs: LAUNCHPAD_INTAKE_TTL_MS,
          encrypt: true, // Encrypt sensitive chat data
        },
      );
      
      if (launchpadWriteResult.success) {
        const syncManager = getCacheSyncManager();
        syncManager.broadcastUpdate(LAUNCHPAD_CACHE_KEY, Date.now());
      }
    })();
  }, [chatMessages, intakeSummary, isChatActive, pendingCachedIntake, hasBootstrappedChat, setStorageError, showToast]);
}

