/**
 * useCacheRestoration hook
 * Handles cache restoration logic for boardroom intake
 * 
 * Extracted from frontend/app/(app)/app/page.tsx
 */

import React, { useEffect } from "react";
import { logDebug } from "@/lib/utils/errorHandler";
import {
  readSessionCache,
  readSessionCacheWithDetails,
} from "@/lib/storage/sessionCache";
import {
  BOARDROOM_CHAT_CACHE_VERSION,
  LAUNCHPAD_INTAKE_CACHE_VERSION,
} from "@/features/rounds/storageKeys";
import {
  CHAT_CACHE_KEY,
  LAUNCHPAD_CACHE_KEY,
} from "../constants";
import type { BoardroomIntakeCache, LaunchpadIntakeCache, CacheRestoreInfo } from "../types";

// Shared flag key to prevent duplicate toasts across page navigation
const RESTORE_TOAST_FLAG = "rt:intake:restore-toast-shown";

type ToastOptions = {
  title: string;
  description: string;
  variant?: "info" | "success" | "error";
};

type UseCacheRestorationOptions = {
  setPendingCachedIntake: (data: BoardroomIntakeCache | null) => void;
  setCacheRestoreInfo: (info: CacheRestoreInfo | null) => void;
  showToast: (options: ToastOptions) => void;
  /** Ref to track if chat has been bootstrapped - passed from useIntakeChat */
  hasBootstrappedChat: React.MutableRefObject<boolean>;
};

/**
 * Hook to manage cache restoration on component mount.
 * 
 * This hook:
 * 1. Reads boardroom cache (primary)
 * 2. Falls back to launchpad cache if no boardroom cache
 * 3. Sets pending cached intake for user to resume
 * 4. Shows toast notifications
 * 5. Handles version mismatches
 * 
 * @param options - Configuration options including hasBootstrappedChat ref from useIntakeChat
 */
export function useCacheRestoration({
  setPendingCachedIntake,
  setCacheRestoreInfo,
  showToast,
  hasBootstrappedChat,
}: UseCacheRestorationOptions): void {

  useEffect(() => {
    if (hasBootstrappedChat.current) {
      return;
    }

    (async () => {
      // First check for boardroom's own cache (supports encrypted data)
      const cacheResult = await readSessionCacheWithDetails<BoardroomIntakeCache>(
        CHAT_CACHE_KEY,
        {
          version: BOARDROOM_CHAT_CACHE_VERSION,
          encrypt: true, // Support reading encrypted data
        }
      );

      if (cacheResult.success) {
        logDebug("[Boardroom] Found cached intake, setting as pending for user to resume");
        const messageCount = cacheResult.data.messages?.length ?? 0;
        const hasSummary = Boolean(cacheResult.data.summary);

        setPendingCachedIntake({
          messages: cacheResult.data.messages ?? [],
          summary: cacheResult.data.summary ?? null,
        });

        setCacheRestoreInfo({
          messageCount,
          hasSummary,
          timestamp: cacheResult.timestamp,
        });

        // Check flag right before showing toast to prevent race conditions
        if (sessionStorage.getItem(RESTORE_TOAST_FLAG) !== "true") {
          const restoreMessage =
            messageCount > 0
              ? `Found your previous intake conversation with ${messageCount} message${
                  messageCount !== 1 ? "s" : ""
                }${hasSummary ? " and a summary" : ""}`
              : hasSummary
              ? "Found your previous intake summary"
              : "Found your previous intake";

          showToast({
            title: "Intake restored",
            description: restoreMessage,
            variant: "info",
          });

          sessionStorage.setItem(RESTORE_TOAST_FLAG, "true");
        }

        hasBootstrappedChat.current = true;
        return;
      } else if (cacheResult.reason === "version_mismatch") {
        showToast({
          title: "Cache format updated",
          description: "Your saved intake used an older format. Starting fresh.",
          variant: "info",
        });
      }

      // If no boardroom cache, check for launchpad cache (they share the same intake)
      const launchpadCacheResult = await readSessionCacheWithDetails<LaunchpadIntakeCache>(
        LAUNCHPAD_CACHE_KEY,
        {
          version: LAUNCHPAD_INTAKE_CACHE_VERSION,
          encrypt: true, // Support reading encrypted data
        }
      );

      if (launchpadCacheResult.success) {
        const launchpadData = launchpadCacheResult.data;
        if (
          (Array.isArray(launchpadData.messages) && launchpadData.messages.length > 0) ||
          (typeof launchpadData.summary === "string" && launchpadData.summary.trim().length > 0)
        ) {
          logDebug("[Boardroom] Found launchpad cached intake, setting as pending for user to resume");
          const messageCount = launchpadData.messages?.length ?? 0;
          const hasSummary = Boolean(launchpadData.summary);

          setPendingCachedIntake({
            messages: launchpadData.messages ?? [],
            summary: launchpadData.summary ?? null,
          });

          setCacheRestoreInfo({
            messageCount,
            hasSummary,
            timestamp: launchpadCacheResult.timestamp,
          });

          // Check flag right before showing toast to prevent race conditions
          if (sessionStorage.getItem(RESTORE_TOAST_FLAG) !== "true") {
            const restoreMessage =
              messageCount > 0
                ? `Found your previous intake conversation with ${messageCount} message${
                    messageCount !== 1 ? "s" : ""
                  }${hasSummary ? " and a summary" : ""}`
                : hasSummary
                ? "Found your previous intake summary"
                : "Found your previous intake";

            showToast({
              title: "Intake restored",
              description: restoreMessage,
              variant: "info",
            });

            sessionStorage.setItem(RESTORE_TOAST_FLAG, "true");
          }

          hasBootstrappedChat.current = true;
          return;
        }
      } else if (launchpadCacheResult.reason === "version_mismatch") {
        showToast({
          title: "Cache format updated",
          description: "Your saved intake used an older format. Starting fresh.",
          variant: "info",
        });
      }

      hasBootstrappedChat.current = true;
    })();
  }, [setPendingCachedIntake, setCacheRestoreInfo, showToast, hasBootstrappedChat]);
}

