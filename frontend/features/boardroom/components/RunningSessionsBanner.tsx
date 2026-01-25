"use client";

/**
 * RunningSessionsBanner component
 * Displays a banner for active/running debate sessions
 * 
 * Extracted from frontend/app/(app)/app/page.tsx
 */

import Link from "next/link";
import { Play, ArrowRight, Radio } from "lucide-react";
import type { SessionListItem } from "../types";

type RunningSessionsBannerProps = {
  runningSessions: SessionListItem[];
  onViewLive: (sessionId: string) => void;
};

export function RunningSessionsBanner({
  runningSessions,
  onViewLive,
}: RunningSessionsBannerProps) {
  if (runningSessions.length === 0) {
    return null;
  }

  const firstSession = runningSessions[0];
  const hasMultipleSessions = runningSessions.length > 1;

  return (
    <section
      className="rounded-[28px] border-2 border-cyan-500/50 bg-gradient-to-r from-[rgba(6,24,35,0.95)] to-[rgba(6,182,212,0.1)] p-6 shadow-lg shadow-cyan-500/10"
      style={{ animation: "contentRise 600ms ease-out 0.28s both" }}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-full border-2 border-cyan-500/60 bg-[rgba(6,182,212,0.2)] text-cyan-300">
            <Radio className="h-6 w-6 animate-pulse" aria-hidden="true" />
            {/* Pulsing ring effect */}
            <span className="absolute inset-0 rounded-full border-2 border-cyan-400 animate-ping opacity-30" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-cyan-400 animate-pulse" />
              <p className="text-[0.65rem] uppercase tracking-[0.35em] text-cyan-400 font-medium">
                {hasMultipleSessions ? "Active Sessions" : "Debate in Progress"}
              </p>
            </div>
            <h3 className="text-lg font-semibold text-white mt-0.5">
              {hasMultipleSessions 
                ? `${runningSessions.length} Running Debates`
                : (firstSession.question?.slice(0, 50) || "Live Debate") + (firstSession.question && firstSession.question.length > 50 ? "..." : "")}
            </h3>
          </div>
        </div>
        {hasMultipleSessions ? (
          <Link
            href="/app/sessions"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-cyan-600 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.28em] text-[#071225] transition hover:from-cyan-400 hover:to-cyan-500 hover:scale-105 shadow-md shadow-cyan-500/30"
          >
            View All
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : (
          <button
            type="button"
            onClick={() => onViewLive(firstSession.session_id)}
            aria-label={`Return to live session: ${firstSession.question || "Untitled Debate"}`}
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-cyan-600 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.28em] text-[#071225] transition hover:from-cyan-400 hover:to-cyan-500 hover:scale-105 shadow-md shadow-cyan-500/30"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            Return to Session
          </button>
        )}
      </div>
    </section>
  );
}

