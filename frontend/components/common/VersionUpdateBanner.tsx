"use client";

import { useState, useEffect } from "react";
import { X, ExternalLink } from "lucide-react";
import { useVersionCheck } from "@/lib/hooks/useVersionCheck";
import { cn } from "@/lib/utils";

const GITHUB_RELEASES_URL = "https://github.com/roundtablelabs/crucible-community/releases";

/**
 * Minimal version update banner that displays at the top of the page
 * when a new version is available. Non-intrusive and dismissible.
 */
export function VersionUpdateBanner() {
  const { updateAvailable, latestVersion, currentVersion, isLoading } =
    useVersionCheck();
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

  const handleDismiss = () => {
    setIsDismissed(true);
    if (typeof window !== "undefined" && latestVersion) {
      localStorage.setItem("version_notification_dismissed", latestVersion);
    }
  };

  return (
    <div
      className={cn(
        "relative z-10 mx-auto mb-4 flex items-center justify-between gap-3 rounded-lg border px-4 py-2.5 text-sm",
        "bg-info-50/50 border-info-200/60 text-info-700",
        "transition-all duration-200"
      )}
      role="status"
      aria-live="polite"
    >
      <div className="flex flex-1 items-center gap-2 min-w-0">
        <span className="flex-shrink-0 font-medium">
          New version available:
        </span>
        <span className="flex-shrink-0 font-mono text-xs">
          v{latestVersion}
        </span>
        <span className="text-info-600/70">(current: v{currentVersion})</span>
      </div>

      <div className="flex items-center gap-2 flex-shrink-0">
        <a
          href={GITHUB_RELEASES_URL}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            "flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium",
            "bg-info-100 hover:bg-info-200 text-info-800 transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-info-500/50 focus:ring-offset-1"
          )}
          onClick={(e) => {
            // Don't dismiss when clicking the link
            e.stopPropagation();
          }}
        >
          <span>View on GitHub</span>
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>

        <button
          type="button"
          onClick={handleDismiss}
          className={cn(
            "flex-shrink-0 rounded-md p-1 text-info-600 hover:text-info-800",
            "hover:bg-info-100 transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-info-500/50 focus:ring-offset-1"
          )}
          aria-label="Dismiss version notification"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  );
}
