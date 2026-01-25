/**
 * useLaunchpadHandlers hook
 * Manages launchpad-related handlers including intake reset, start, resume, and replacement logic
 */

import { useCallback, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  readSessionCache,
  writeSessionCache,
} from "@/lib/storage/sessionCache";
import {
  LAUNCHPAD_TRANSFER_CACHE_VERSION,
  LAUNCHPAD_INTAKE_CACHE_VERSION,
  BOARDROOM_CHAT_CACHE_VERSION,
  LAUNCHPAD_TRANSFER_TTL_MS,
} from "@/features/rounds/storageKeys";
import type {
  IntakeChatMessage,
  BoardroomIntakeCache,
  LaunchpadTransferCache,
  LaunchpadIntakeCache,
} from "../types";
import {
  CHAT_CACHE_KEY,
  LAUNCHPAD_TRANSFER_KEY,
  LAUNCHPAD_CACHE_KEY,
} from "../constants";

type UseLaunchpadHandlersOptions = {
  // Dependencies
  skipWarning: () => void;
  pendingCachedIntake: BoardroomIntakeCache | null;
  
  // State setters
  clearAllIntakeCaches: () => void;
  setChatMessages: React.Dispatch<React.SetStateAction<IntakeChatMessage[]>>;
  setIntakeSummary: React.Dispatch<React.SetStateAction<string | null>>;
  setChatError: React.Dispatch<React.SetStateAction<string | null>>;
  setPendingCachedIntake: React.Dispatch<React.SetStateAction<BoardroomIntakeCache | null>>;
  setIsChatActive: React.Dispatch<React.SetStateAction<boolean>>;
  hasBootstrappedChat: React.MutableRefObject<boolean>;
  bootstrapChat: () => Promise<void>;
};

type UseLaunchpadHandlersReturn = {
  // State
  showReplaceLaunchpadModal: boolean;
  setShowReplaceLaunchpadModal: React.Dispatch<React.SetStateAction<boolean>>;
  pendingLaunchpadReplaceAction: React.MutableRefObject<(() => void) | null>;
  
  // Functions
  hasLaunchpadIntake: () => boolean;
  requestLaunchpadReplacement: (action: () => void) => void;
  performBoardroomIntakeReset: () => void;
  performBoardroomIntakeStart: () => void;
  handleLaunchpadReplaceConfirm: () => void;
  handleLaunchpadReplaceCancel: () => void;
  handleStartFreshIntake: () => Promise<void>;
  handleResumeIntake: () => Promise<void>;
};

/**
 * Hook to manage launchpad-related handlers
 */
export function useLaunchpadHandlers({
  skipWarning,
  pendingCachedIntake,
  clearAllIntakeCaches,
  setChatMessages,
  setIntakeSummary,
  setChatError,
  setPendingCachedIntake,
  setIsChatActive,
  hasBootstrappedChat,
  bootstrapChat,
}: UseLaunchpadHandlersOptions): UseLaunchpadHandlersReturn {
  const router = useRouter();
  const [showReplaceLaunchpadModal, setShowReplaceLaunchpadModal] = useState(false);
  const pendingLaunchpadReplaceAction = useRef<(() => void) | null>(null);

  /**
   * Check if launchpad has existing intake data
   */
  const hasLaunchpadIntake = useCallback(() => {
    const transfer = readSessionCache<LaunchpadTransferCache>(
      LAUNCHPAD_TRANSFER_KEY,
      {
        version: LAUNCHPAD_TRANSFER_CACHE_VERSION,
      },
    );
    if (
      transfer &&
      ((Array.isArray(transfer.messages) && transfer.messages.length > 0) ||
        (typeof transfer.summary === "string" &&
          transfer.summary.trim().length > 0))
    ) {
      return true;
    }

    const launchpadCache = readSessionCache<LaunchpadIntakeCache>(
      LAUNCHPAD_CACHE_KEY,
      {
        version: LAUNCHPAD_INTAKE_CACHE_VERSION,
      },
    );
    if (
      launchpadCache &&
      ((Array.isArray(launchpadCache.messages) &&
        launchpadCache.messages.length > 0) ||
        (typeof launchpadCache.summary === "string" &&
          launchpadCache.summary.trim().length > 0))
    ) {
      return true;
    }

    return false;
  }, []);

  /**
   * Request launchpad replacement - shows modal if intake exists, otherwise executes action
   */
  const requestLaunchpadReplacement = useCallback(
    (action: () => void) => {
      if (!hasLaunchpadIntake()) {
        action();
        return;
      }
      pendingLaunchpadReplaceAction.current = action;
      setShowReplaceLaunchpadModal(true);
    },
    [hasLaunchpadIntake]
  );

  /**
   * Reset boardroom intake state (clear cache and state, don't start intake)
   */
  const performBoardroomIntakeReset = useCallback(() => {
    clearAllIntakeCaches();
    setChatMessages([]);
    setIntakeSummary(null);
    setChatError(null);
    setPendingCachedIntake(null);
    setIsChatActive(false);
    hasBootstrappedChat.current = false;
    // Don't automatically start the intake - let user click "Start intake" button
  }, [clearAllIntakeCaches, setChatMessages, setIntakeSummary, setChatError, setPendingCachedIntake, setIsChatActive]);

  /**
   * Start fresh boardroom intake (clear cache, state, and bootstrap chat)
   */
  const performBoardroomIntakeStart = useCallback(() => {
    clearAllIntakeCaches();
    setChatMessages([]);
    setIntakeSummary(null);
    setChatError(null);
    setPendingCachedIntake(null);
    setIsChatActive(true);
    hasBootstrappedChat.current = false;
    void bootstrapChat();
  }, [clearAllIntakeCaches, setChatMessages, setIntakeSummary, setChatError, setPendingCachedIntake, setIsChatActive, bootstrapChat]);

  /**
   * Confirm launchpad replacement - executes pending action
   */
  const handleLaunchpadReplaceConfirm = useCallback(() => {
    setShowReplaceLaunchpadModal(false);
    const action = pendingLaunchpadReplaceAction.current;
    pendingLaunchpadReplaceAction.current = null;
    if (action) {
      action();
    }
  }, []);

  /**
   * Cancel launchpad replacement - clears pending action
   */
  const handleLaunchpadReplaceCancel = useCallback(() => {
    pendingLaunchpadReplaceAction.current = null;
    setShowReplaceLaunchpadModal(false);
  }, []);

  /**
   * Start fresh intake.
   */
  const handleStartFreshIntake = useCallback(async () => {
    requestLaunchpadReplacement(performBoardroomIntakeStart);
  }, [requestLaunchpadReplacement, performBoardroomIntakeStart]);

  /**
   * Resume existing intake - transfers cache to launchpad.
   */
  const handleResumeIntake = useCallback(async () => {
    // First try to read full launchpad cache (has moderatorBrief, knights, etc.)
    const launchpadFullCache = readSessionCache<{
      messages?: IntakeChatMessage[];
      summary?: string | null;
      moderatorBrief?: unknown;
      knights?: unknown;
    }>(
      LAUNCHPAD_CACHE_KEY,
      {
        version: LAUNCHPAD_INTAKE_CACHE_VERSION,
      },
    );
    
    let messages: IntakeChatMessage[] = [];
    let summary: string | null = null;
    let moderatorBrief: unknown = null;
    let knights: unknown = null;
    
    if (launchpadFullCache) {
      // Use full launchpad cache if available (has all the data)
      messages = launchpadFullCache.messages ?? [];
      summary = launchpadFullCache.summary ?? null;
      moderatorBrief = launchpadFullCache.moderatorBrief ?? null;
      knights = launchpadFullCache.knights ?? null;
    } else if (pendingCachedIntake) {
      // Fallback to pending cached intake
      messages = pendingCachedIntake.messages ?? [];
      summary = pendingCachedIntake.summary ?? null;
    } else {
      // Fallback: read directly from boardroom cache
      const cached = readSessionCache<BoardroomIntakeCache>(CHAT_CACHE_KEY, {
        version: BOARDROOM_CHAT_CACHE_VERSION,
      });
      if (cached) {
        messages = cached.messages ?? [];
        summary = cached.summary ?? null;
      }
    }
    
    // Create transfer payload with autoStart: true so launchpad auto-resumes
    if (messages.length > 0 || summary) {
      writeSessionCache(
        LAUNCHPAD_TRANSFER_KEY,
        {
          messages,
          summary,
          moderatorBrief: moderatorBrief ?? undefined,
          knights: knights ?? undefined,
          autoStart: true, // Auto-resume when launchpad loads
        },
        {
          version: LAUNCHPAD_TRANSFER_CACHE_VERSION,
          ttlMs: LAUNCHPAD_TRANSFER_TTL_MS,
        },
      );
    }
    
    // Redirect to launchpad - it will auto-resume from the transfer payload
    skipWarning();
    router.push("/app/launchpad");
  }, [router, pendingCachedIntake, skipWarning]);

  return {
    // State
    showReplaceLaunchpadModal,
    setShowReplaceLaunchpadModal,
    pendingLaunchpadReplaceAction,
    
    // Functions
    hasLaunchpadIntake,
    requestLaunchpadReplacement,
    performBoardroomIntakeReset,
    performBoardroomIntakeStart,
    handleLaunchpadReplaceConfirm,
    handleLaunchpadReplaceCancel,
    handleStartFreshIntake,
    handleResumeIntake,
  };
}

