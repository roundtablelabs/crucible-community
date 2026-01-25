"use client";

import { useEffect, useRef } from "react";

const DEFAULT_TITLE = "Crucible : Your AI Braintrust";
const NOTIFICATION_INDICATOR = "●"; // Unicode bullet point
const NOTIFICATION_TITLE = `${NOTIFICATION_INDICATOR} ${DEFAULT_TITLE}`;

/**
 * Hook to show a notification indicator in the browser tab title
 * when there's a pending session that can be resumed.
 * Similar to booking.com showing items in cart.
 * 
 * @param hasPendingSession - Whether there's a pending session to resume
 * @param enabled - Whether the notification is enabled (default: true)
 */
export function useTabNotification(hasPendingSession: boolean, enabled: boolean = true) {
  const originalTitleRef = useRef<string | null>(null);
  const animationIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled || typeof window === "undefined") {
      return;
    }

    // Store original title on first mount
    if (originalTitleRef.current === null) {
      originalTitleRef.current = document.title || DEFAULT_TITLE;
    }

    // Clear any existing animations
    if (animationIntervalRef.current) {
      clearInterval(animationIntervalRef.current);
      animationIntervalRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    if (hasPendingSession) {
      // Start with notification indicator
      document.title = NOTIFICATION_TITLE;

      // Add subtle pulsing animation (like booking.com)
      // Creates a gentle pulse: shows indicator for 2.5s, hides for 0.5s
      let isShowing = true;
      animationIntervalRef.current = setInterval(() => {
        if (isShowing) {
          // Hide indicator briefly for subtle pulse
          document.title = DEFAULT_TITLE;
          isShowing = false;
        } else {
          // Show indicator again
          document.title = NOTIFICATION_TITLE;
          isShowing = true;
        }
      }, 2500); // Toggle every 2.5 seconds
    } else {
      // Restore original title
      document.title = originalTitleRef.current || DEFAULT_TITLE;
    }

    return () => {
      if (animationIntervalRef.current) {
        clearInterval(animationIntervalRef.current);
        animationIntervalRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      // Restore original title on unmount
      if (originalTitleRef.current) {
        document.title = originalTitleRef.current;
      }
    };
  }, [hasPendingSession, enabled]);
}
