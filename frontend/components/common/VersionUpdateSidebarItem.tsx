"use client";

import { useState, useEffect } from "react";
import { ExternalLink } from "lucide-react";
import { useVersionCheck } from "@/lib/hooks/useVersionCheck";
import { cn } from "@/lib/utils";

const GITHUB_RELEASES_URL = "https://github.com/roundtablelabs/crucible-community/releases";

/**
 * Small sidebar notification item that shows at the bottom of navigation
 * when a new version is available. Clickable to open GitHub releases.
 */
export function VersionUpdateSidebarItem({
  isCollapsed,
}: {
  isCollapsed: boolean;
}) {
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
        "group flex w-full items-center gap-2 px-3 py-1.5 text-xs font-medium transition",
        "rounded-md border border-info-500/20 bg-info-500/5 text-info-400",
        "hover:bg-info-500/15 hover:border-info-500/30 hover:text-info-300",
        "focus:outline-none focus:ring-2 focus:ring-info-500/50 focus:ring-offset-1",
        "mt-1",
        isCollapsed ? "xl:justify-center xl:px-2" : ""
      )}
      aria-label="New version available - click to view on GitHub"
    >
      <span
        className={cn(
          "flex-1 text-left text-[0.7rem] transition-all duration-400 ease-in-out",
          isCollapsed
            ? "xl:max-w-0 xl:opacity-0 xl:overflow-hidden"
            : "xl:opacity-100",
          "max-xl:opacity-100"
        )}
      >
        new version available →
      </span>
      {!isCollapsed && (
        <ExternalLink className="h-3 w-3 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity" aria-hidden="true" />
      )}
    </button>
  );
}
