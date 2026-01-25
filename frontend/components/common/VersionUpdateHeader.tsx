"use client";

import { useState, useEffect } from "react";
import { ExternalLink } from "lucide-react";
import { useVersionCheck } from "@/lib/hooks/useVersionCheck";
import { cn } from "@/lib/utils";

const GITHUB_RELEASES_URL = "https://github.com/roundtablelabs/crucible-community/releases";

/**
 * Small header notification that shows next to Sign out button
 * when a new version is available. Clickable to open GitHub releases.
 */
export function VersionUpdateHeader() {
  const { updateAvailable, latestVersion, isLoading } = useVersionCheck();
  const [isDismissed, setIsDismissed] = useState(false);

  // Check if user has dismissed this version notification
  useEffect(() => {
    if (typeof window !== "undefined") {
      const dismissedVersion = localStorage.getItem(
        "version_notification_dismissed"
      );
      if (dismissedVersion === latestVersion) {
        setIsDismissed(true);
      }
    }
  }, [latestVersion]);

  // Don't show if loading, no update available, or dismissed
  if (isLoading || !updateAvailable || isDismissed) {
    return null;
  }

  const handleClick = () => {
    if (typeof window !== "undefined") {
      window.open(GITHUB_RELEASES_URL, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "flex items-center gap-1.5 rounded-full border border-gold-500/70 bg-gold-500/20 px-3 py-1.5 text-xs font-medium",
        "text-base-text transition hover:bg-gold-500/30 hover:border-gold-500/80",
        "focus:outline-none focus:ring-2 focus:ring-gold-500/50 focus:ring-offset-1"
      )}
      aria-label="New version available - click to view on GitHub"
    >
      <span className="text-[0.7rem]">new version available →</span>
      <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-70" aria-hidden="true" />
    </button>
  );
}
