"use client";

/**
 * BoardroomProgressIndicator Component
 * Shows users where they are in the journey with clean, minimal design
 */

import React from "react";
import { Bot, CheckCircle2, ArrowRight, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { InlineLoading } from "@/components/ui/InlineLoading";
import type { SessionListItem } from "../types";

type BoardroomProgressIndicatorProps = {
  user: { name?: string | null; email?: string | null } | null;
  intakeSummary: string | null;
  chatMessages: number;
  isChatActive: boolean;
  runningSessions: SessionListItem[];
  onViewLive?: (sessionId: string) => void;
};

export function BoardroomProgressIndicator({
  user,
  intakeSummary,
  chatMessages,
  isChatActive,
  runningSessions,
  onViewLive,
}: BoardroomProgressIndicatorProps) {
  // Determine step states
  const intakeActive = isChatActive || chatMessages > 0;
  const intakeCompleted = Boolean(intakeSummary);
  const intakeState = intakeCompleted ? 'completed' : intakeActive ? 'active' : 'ready';
  
  const launchpadReady = intakeCompleted;
  const launchpadState = launchpadReady ? 'ready' : 'disabled';
  
  const hasLiveSession = runningSessions.length > 0;

  return (
    <section
      className="flex items-center overflow-x-auto text-xs uppercase tracking-[0.15em] text-base-subtext/70 scrollbar-hide md:overflow-x-visible"
      style={{ animation: "contentRise 600ms ease-out 0.2s both" }}
      aria-label="Progress through strategic briefing process"
    >
      {/* Step 1: Intake */}
      <span
        className={cn(
          "inline-flex min-w-[140px] shrink-0 md:flex-1 md:min-w-[160px] items-center justify-between gap-3 rounded-full border px-4 py-2 text-[0.7rem] transition",
          intakeState === 'completed' ? "border-gold-500 text-white" : 
          intakeActive ? "border-gold-500 text-base-text animate-pulse" :
          intakeState === 'ready' ? "border-gold-500/50 text-base-text/80 animate-pulse" :
          "border-gold-900/50 text-base-subtext"
        )}
        role="progressbar"
        aria-label={`Intake phase: ${intakeCompleted ? 'complete' : intakeActive ? 'in progress' : 'not started'}`}
        aria-live="polite"
      >
        <span>Intake</span>
        <span className="flex items-center gap-2">
          {intakeCompleted ? (
            <CheckCircle2 
              className="h-4 w-4 shrink-0 text-gold-500" 
              aria-hidden="true" 
            />
          ) : intakeActive ? (
            <>
              <Bot className={cn(
                "h-4 w-4 shrink-0",
                isChatActive && "animate-pulse"
              )} aria-hidden="true" />
              <InlineLoading size="sm" spinnerColor="text-gold-500" />
            </>
          ) : (
            <ArrowRight className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
          )}
        </span>
      </span>

      {/* Connector */}
      <div className="flex items-center">
        <div className={cn(
          "h-px w-3 transition-all duration-300",
          intakeCompleted ? "bg-teal-500" : "bg-base-divider/30"
        )} aria-hidden="true" />
      </div>

      {/* Step 2: Launchpad */}
      <span
        className={cn(
          "inline-flex min-w-[140px] shrink-0 md:flex-1 md:min-w-[160px] items-center justify-between gap-3 rounded-full border px-4 py-2 text-[0.7rem] transition",
          launchpadState === 'ready' ? "border-teal-500 text-white" : "border-teal-900/50 text-base-subtext",
          launchpadReady && "cursor-pointer hover:border-teal-400 hover:scale-[1.02]"
        )}
        onClick={launchpadReady ? () => {
          if (typeof window !== 'undefined') {
            window.location.href = '/app/launchpad';
          }
        } : undefined}
        role={launchpadReady ? "button" : undefined}
        tabIndex={launchpadReady ? 0 : -1}
        aria-label={launchpadReady ? "Continue to Launchpad" : "Launchpad - Complete intake first"}
        aria-disabled={!launchpadReady}
      >
        <span>Launchpad</span>
        <span className="flex items-center gap-2">
          {launchpadReady ? (
            <ArrowRight className="h-4 w-4 shrink-0 text-teal-500" aria-hidden="true" />
          ) : (
            <ArrowRight className="h-4 w-4 shrink-0 opacity-30" aria-hidden="true" />
          )}
        </span>
      </span>

      {/* Connector to Live Debate */}
      <div className="flex items-center">
        <div className={cn(
          "h-px w-3 transition-all duration-300",
          hasLiveSession ? "bg-cyan-500/30" : "bg-base-divider/30"
        )} aria-hidden="true" />
      </div>

      {/* Step 3: Live Debate (icon-based, minimal) - Always visible, clickable when live */}
      <span
        className={cn(
          "inline-flex min-w-[80px] flex-shrink-0 items-center justify-center gap-2 rounded-full border px-3 py-2 text-[0.7rem] transition",
          hasLiveSession 
            ? "border-cyan-500/50 text-white cursor-pointer hover:border-cyan-400 hover:scale-[1.02] hover:bg-cyan-500/10" 
            : "border-cyan-900/30 text-base-subtext/50"
        )}
        title={hasLiveSession ? "Click to view live debate" : "Live Debate"}
        aria-label={hasLiveSession ? "Active debate in progress - Click to view" : "Live Debate - No active session"}
        onClick={hasLiveSession && onViewLive && runningSessions[0] ? () => onViewLive(runningSessions[0].session_id) : undefined}
        role={hasLiveSession ? "button" : undefined}
        tabIndex={hasLiveSession ? 0 : -1}
      >
        <Users className={cn(
          "h-4 w-4 shrink-0",
          hasLiveSession ? "text-cyan-400 animate-pulse" : "text-cyan-500/30"
        )} aria-hidden="true" />
        {hasLiveSession && (
          <span className="text-[0.65rem] font-medium normal-case tracking-normal text-cyan-300">
            Live
          </span>
        )}
      </span>
    </section>
  );
}
