"use client";

import { useEffect, useState } from "react";
import { apiGet } from "@/lib/api/client";

type VersionCheckResult = {
  latest_version: string;
  current_version: string;
  update_available: boolean;
  error?: string;
};

type VersionCheckState = {
  currentVersion: string;
  latestVersion: string;
  updateAvailable: boolean;
  isLoading: boolean;
  error: string | null;
};

/**
 * Hook to check for version updates from the main product API.
 * Only checks when component mounts and internet is available.
 */
export function useVersionCheck() {
  const [state, setState] = useState<VersionCheckState>({
    currentVersion: "0.0.1",
    latestVersion: "unknown",
    updateAvailable: false,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let mounted = true;

    const checkVersion = async () => {
      try {
        // Add a small delay to avoid blocking initial render
        await new Promise((resolve) => setTimeout(resolve, 1500));

        if (!mounted) return;

        const result = await apiGet<VersionCheckResult>("/version/check");

        if (!mounted) return;

        setState({
          currentVersion: result.current_version,
          latestVersion: result.latest_version,
          updateAvailable: result.update_available,
          isLoading: false,
          error: result.error || null,
        });
      } catch (error) {
        if (!mounted) return;

        // Silently handle errors - don't show errors to users if check fails
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: error instanceof Error ? error.message : "unknown_error",
        }));
      }
    };

    // Only check if we're online
    if (typeof window !== "undefined" && navigator.onLine) {
      checkVersion();
    } else {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: "offline",
      }));
    }

    return () => {
      mounted = false;
    };
  }, []);

  return state;
}
