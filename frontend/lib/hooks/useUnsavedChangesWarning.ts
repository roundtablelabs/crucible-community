"use client";

import { useEffect, useRef, useCallback } from "react";

interface UseUnsavedChangesWarningOptions {
  /**
   * Whether there are unsaved changes
   */
  hasUnsavedChanges: boolean;
  /**
   * Optional message to show in the warning dialog
   */
  message?: string;
  /**
   * Whether to enable the warning (default: true)
   */
  enabled?: boolean;
  /**
   * Allow external URL navigations without warning
   */
  allowExternalUrls?: boolean;
}

/**
 * Hook that warns users before navigating away with unsaved changes.
 * Handles both Next.js router navigation and browser beforeunload events.
 */
export function useUnsavedChangesWarning({
  hasUnsavedChanges,
  message = "You have unsaved changes. Are you sure you want to leave?",
  enabled = true,
  allowExternalUrls = false,
}: UseUnsavedChangesWarningOptions) {
  const skipWarningRef = useRef(false);

  // Handle browser beforeunload (page refresh/close)
  useEffect(() => {
    if (!enabled || !hasUnsavedChanges) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      // Skip warning if explicitly allowed
      if (skipWarningRef.current) {
        return;
      }
      
      // Skip warning for external URLs if allowExternalUrls is true
      if (allowExternalUrls) {
        return;
      }

      event.preventDefault();
      // Modern browsers ignore custom messages and show their own
      event.returnValue = message;
      return message;
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [hasUnsavedChanges, message, enabled, allowExternalUrls]);

  /**
   * Temporarily skip the warning for the next navigation.
   * Use this before intentional navigations (e.g., redirecting to launchpad after intake).
   * The skip flag auto-resets after 1 second.
   */
  const skipWarning = useCallback(() => {
    skipWarningRef.current = true;
    // Reset after 1 second in case navigation doesn't happen
    setTimeout(() => {
      skipWarningRef.current = false;
    }, 1000);
  }, []);

  return {
    /**
     * Call this before navigating programmatically to check for unsaved changes
     */
    checkBeforeNavigate: (): boolean => {
      if (!enabled || !hasUnsavedChanges || skipWarningRef.current) {
        return true;
      }
      return window.confirm(message);
    },
    /**
     * Call this before intentional navigation to skip the warning
     */
    skipWarning,
  };
}
