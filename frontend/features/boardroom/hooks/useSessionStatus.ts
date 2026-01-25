/**
 * useSessionStatus hook
 * Manages live session status tracking from localStorage
 */

import { useEffect, useState } from "react";
import { LIVE_SESSION_STATUS_KEY } from "@/features/rounds/liveSessionTransfer";
import type { DebateRunStatus } from "@/app/(app)/app/live/types";
import { LIVE_STATUS_STALE_AFTER_MS, LIVE_STATUS_MIN_GRACE_MS } from "../constants";

type UseSessionStatusOptions = {
  liveSession: { id: string } | undefined;
  sessionsQuerySuccess: boolean;
};

type UseSessionStatusReturn = {
  localSessionStatus: DebateRunStatus | null;
  localStatusUpdatedAt: number | null;
};

export function useSessionStatus({
  liveSession,
  sessionsQuerySuccess,
}: UseSessionStatusOptions): UseSessionStatusReturn {
  const [localSessionStatus, setLocalSessionStatus] = useState<DebateRunStatus | null>(null);
  const [localStatusUpdatedAt, setLocalStatusUpdatedAt] = useState<number | null>(null);

  // Read initial status from localStorage and set up listeners
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const applyStatusFromStorage = (rawValue: string | null) => {
      if (!rawValue) {
        setLocalSessionStatus(null);
        setLocalStatusUpdatedAt(null);
        return;
      }
      let parsedStatus: DebateRunStatus | null = null;
      let updatedAt: number | null = null;
      try {
        const parsed = JSON.parse(rawValue) as { status?: DebateRunStatus | null; updatedAt?: number };
        parsedStatus = (parsed.status as DebateRunStatus | null) ?? null;
        updatedAt = typeof parsed.updatedAt === "number" ? parsed.updatedAt : null;
      } catch {
        parsedStatus = (rawValue as DebateRunStatus | null) ?? null;
        updatedAt = null;
      }

      const isStaleRunning =
        parsedStatus === "running" &&
        (updatedAt === null || Date.now() - updatedAt > LIVE_STATUS_STALE_AFTER_MS);

      if (isStaleRunning) {
        window.localStorage.removeItem(LIVE_SESSION_STATUS_KEY);
        setLocalSessionStatus(null);
        setLocalStatusUpdatedAt(null);
        return;
      }

      setLocalSessionStatus(parsedStatus);
      setLocalStatusUpdatedAt(updatedAt);
    };

    applyStatusFromStorage(window.localStorage.getItem(LIVE_SESSION_STATUS_KEY));

    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea === window.localStorage && event.key === LIVE_SESSION_STATUS_KEY) {
        applyStatusFromStorage(event.newValue);
      }
    };

    const handleBroadcast = (event: Event) => {
      const detail = (event as CustomEvent<DebateRunStatus | null>).detail ?? null;
      setLocalSessionStatus(detail);
      setLocalStatusUpdatedAt(detail === "running" ? Date.now() : null);
    };

    window.addEventListener("storage", handleStorage);
    window.addEventListener("live-session-status", handleBroadcast as EventListener);

    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("live-session-status", handleBroadcast as EventListener);
    };
  }, []);

  // Clear stale running status after timeout
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    if (localSessionStatus !== "running") {
      return;
    }
    if (!localStatusUpdatedAt) {
      window.localStorage.removeItem(LIVE_SESSION_STATUS_KEY);
      setLocalSessionStatus(null);
      setLocalStatusUpdatedAt(null);
      return;
    }
    const elapsed = Date.now() - localStatusUpdatedAt;
    const remaining = LIVE_STATUS_STALE_AFTER_MS - elapsed;
    if (remaining <= 0) {
      window.localStorage.removeItem(LIVE_SESSION_STATUS_KEY);
      setLocalSessionStatus(null);
      setLocalStatusUpdatedAt(null);
      return;
    }
    const timer = window.setTimeout(() => {
      window.localStorage.removeItem(LIVE_SESSION_STATUS_KEY);
      setLocalSessionStatus(null);
      setLocalStatusUpdatedAt(null);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [localSessionStatus, localStatusUpdatedAt]);

  // Clear running status if server shows no live session after grace period
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      localSessionStatus !== "running" ||
      localStatusUpdatedAt === null ||
      liveSession ||
      !sessionsQuerySuccess
    ) {
      return;
    }
    if (Date.now() - localStatusUpdatedAt < LIVE_STATUS_MIN_GRACE_MS) {
      return;
    }
    window.localStorage.removeItem(LIVE_SESSION_STATUS_KEY);
    setLocalSessionStatus(null);
    setLocalStatusUpdatedAt(null);
  }, [liveSession, localSessionStatus, localStatusUpdatedAt, sessionsQuerySuccess]);

  return {
    localSessionStatus,
    localStatusUpdatedAt,
  };
}

