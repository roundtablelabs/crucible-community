"use client";

import React, { useRef, useEffect, useMemo } from "react";
import { ChevronUp as ArrowUp, ChevronDown as ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/glass-card";

type DebateEvent = {
  id: string;
  sequence_id: number;
  phase: string;
  event_type: string;
  payload: Record<string, any>;
  created_at: string;
};

type KnightDetail = {
  id: string;
  name: string;
  role: string;
  prompt: string | null;
  goal: string;
  backstory: string;
  model: string;
  websearch_enabled: boolean;
  author: { name: string };
  verified: boolean;
  temperature: number;
};

type EventTimelineProps = {
  events: DebateEvent[];
  selectedEventId: string | null;
  onSelect: (eventId: string) => void;
  timelineRef: React.RefObject<HTMLDivElement | null>;
  onPrevious: () => void;
  onNext: () => void;
  canGoPrevious: boolean;
  canGoNext: boolean;
  knightDetailsMap: Map<string, KnightDetail>;
};

export function EventTimeline({ 
  events, 
  selectedEventId, 
  onSelect, 
  timelineRef, 
  onPrevious, 
  onNext, 
  canGoPrevious, 
  canGoNext, 
  knightDetailsMap 
}: EventTimelineProps) {
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const hasScrolledToTop = useRef(false);

  // Scroll to top when events first load
  useEffect(() => {
    if (events.length > 0 && timelineRef.current && !hasScrolledToTop.current) {
      timelineRef.current.scrollTop = 0;
      hasScrolledToTop.current = true;
    }
  }, [events.length, timelineRef]);

  const handleItemClick = (eventId: string, element: HTMLDivElement) => {
    onSelect(eventId);
    // Scroll within the timeline container only, not the whole page
    if (timelineRef.current) {
      const container = timelineRef.current;
      const elementTop = element.offsetTop;
      const elementHeight = element.offsetHeight;
      const containerHeight = container.clientHeight;
      const scrollTop = elementTop - (containerHeight / 2) + (elementHeight / 2);
      container.scrollTo({ top: scrollTop, behavior: 'smooth' });
    }
  };

  // Calculate overall progress
  const overallProgress = useMemo(() => {
    if (events.length === 0) return 0;
    const selectedIndex = events.findIndex(e => e.id === selectedEventId);
    return selectedIndex >= 0 ? ((selectedIndex + 1) / events.length) * 100 : 0;
  }, [events, selectedEventId]);

  // Get phase color for visual distinction
  const getPhaseColor = (phase: string) => {
    const phaseMap: Record<string, { bg: string; border: string; text: string; dotBorder: string; dotBg: string; shadow: string }> = {
      research: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-300', dotBorder: 'border-blue-500', dotBg: 'bg-blue-500', shadow: 'shadow-blue-500/20' },
      opening: { bg: 'bg-teal-500/10', border: 'border-teal-500/30', text: 'text-teal-300', dotBorder: 'border-teal-500', dotBg: 'bg-teal-500', shadow: 'shadow-teal-500/20' },
      claims: { bg: 'bg-emerald-500/10', border: 'border-emerald-500/30', text: 'text-emerald-300', dotBorder: 'border-emerald-500', dotBg: 'bg-emerald-500', shadow: 'shadow-emerald-500/20' },
      cross_examination: { bg: 'bg-amber-500/10', border: 'border-amber-500/30', text: 'text-amber-300', dotBorder: 'border-amber-500', dotBg: 'bg-amber-500', shadow: 'shadow-amber-500/20' },
      challenges: { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-300', dotBorder: 'border-rose-500', dotBg: 'bg-rose-500', shadow: 'shadow-rose-500/20' },
      rebuttals: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-300', dotBorder: 'border-purple-500', dotBg: 'bg-purple-500', shadow: 'shadow-purple-500/20' },
      red_team: { bg: 'bg-rose-500/10', border: 'border-rose-500/30', text: 'text-rose-300', dotBorder: 'border-rose-500', dotBg: 'bg-rose-500', shadow: 'shadow-rose-500/20' },
      convergence: { bg: 'bg-gold-500/10', border: 'border-gold-500/30', text: 'text-gold-300', dotBorder: 'border-gold-500', dotBg: 'bg-gold-500', shadow: 'shadow-gold-500/20' },
      translator: { bg: 'bg-success-100', border: 'border-emerald-500/30', text: 'text-emerald-300', dotBorder: 'border-emerald-500', dotBg: 'bg-emerald-500', shadow: 'shadow-emerald-500/20' },
      artifact_ready: { bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/30', text: 'text-fuchsia-300', dotBorder: 'border-fuchsia-500', dotBg: 'bg-fuchsia-500', shadow: 'shadow-gold-fuchsia/20' },
      closed: { bg: 'bg-slate-500/10', border: 'border-slate-500/30', text: 'text-slate-300', dotBorder: 'border-slate-500', dotBg: 'bg-slate-500', shadow: 'shadow-slate-500/20' },
    };
    return phaseMap[phase] || { bg: 'bg-base-bg/40', border: 'border-base-divider', text: 'text-base-subtext', dotBorder: 'border-base-divider', dotBg: 'bg-base-bg', shadow: 'shadow-base-divider/20' };
  };

  return (
    <GlassCard variant="elevated" className="p-5 flex flex-col max-h-[500px] lg:max-h-[600px] overflow-hidden">
      <div className="mb-4 flex items-center justify-between flex-shrink-0">
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-base-text mb-2">Timeline</h2>
          {/* Progress Indicator */}
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 bg-base-bg/60 rounded-full overflow-hidden">
              <div 
                className="h-full bg-gradient-to-r from-gold-500 to-gold-400 transition-all duration-500 ease-out"
                style={{ width: `${overallProgress}%` }}
              />
            </div>
            <span className="text-xs text-base-subtext font-mono min-w-[3rem] text-right">
              {Math.round(overallProgress)}%
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1 ml-4">
          <button
            onClick={onPrevious}
            disabled={!canGoPrevious}
            className={cn(
              "flex items-center justify-center p-1.5 rounded-md transition-colors min-h-[44px] min-w-[44px]",
              canGoPrevious
                ? "text-base-text hover:bg-base-bg/50 cursor-pointer"
                : "text-base-subtext/30 cursor-not-allowed"
            )}
            aria-label="Previous event"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
          <button
            onClick={onNext}
            disabled={!canGoNext}
            className={cn(
              "flex items-center justify-center p-1.5 rounded-md transition-colors min-h-[44px] min-w-[44px]",
              canGoNext
                ? "text-base-text hover:bg-base-bg/50 cursor-pointer"
                : "text-base-subtext/30 cursor-not-allowed"
            )}
            aria-label="Next event"
          >
            <ArrowDown className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div
        ref={timelineRef}
        className="flex-1 overflow-y-auto space-y-0 pr-2 custom-scrollbar min-h-0"
      >
        <div className="relative">
          {/* Timeline line - perfectly centered at 20px (left-[19px] + w-[2px]/2) */}
          <div className="absolute left-[19px] top-0 bottom-0 w-[2px] bg-base-divider" />
          
          {events.map((event, eventIndex) => {
            // Ensure we have a valid unique key for each event
            const eventKey = event.id || `event-${eventIndex}-${event.sequence_id}`;
            const prevEvent = eventIndex > 0 ? events[eventIndex - 1] : null;
            const isPhaseTransition = prevEvent && prevEvent.phase !== event.phase;
            // Show separator for research phase if it's the first event or first event of research phase
            const isResearchPhaseStart = event.phase === 'research' && (eventIndex === 0 || (prevEvent && prevEvent.phase !== 'research'));
            const showSeparator = isPhaseTransition || isResearchPhaseStart;
            const phaseColor = getPhaseColor(event.phase || 'unknown');
            const isSelected = event.id === selectedEventId;
            
            // Parse payload to get knight_id
            let payload: Record<string, any> = {};
            if (event.payload) {
              if (typeof event.payload === "string") {
                try {
                  payload = JSON.parse(event.payload);
                } catch {
                  payload = {};
                }
              } else if (typeof event.payload === "object") {
                payload = event.payload;
              }
            }
            
            // Get phase and knight_id
            const phase = event.phase 
              ? (event.phase === "idle" 
                  ? "Moderator Brief" 
                  : event.phase.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()))
              : "Unknown Phase";
            const knightId = payload.knight_id ? String(payload.knight_id) : null;
            const targetKnightId = payload.target_knight_id ? String(payload.target_knight_id) : null;
            
            return (
              <React.Fragment key={eventKey}>
                {/* Phase Transition Separator */}
                {showSeparator && (
                  <div 
                    key={`separator-${eventKey}-${event.phase}-${eventIndex}`}
                    className="relative py-2 pl-10 mb-1 transition-all duration-300"
                  >
                    <div className={cn(
                      "absolute left-[15px] top-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 z-10 bg-transparent",
                      phaseColor.border.replace('/30', '')
                    )} />
                    <div className="flex items-center gap-2">
                      <span className={cn(
                        "text-xs font-semibold uppercase tracking-wider",
                        phaseColor.text
                      )}>
                        {event.phase === "idle" 
                          ? "Moderator Brief" 
                          : event.phase?.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())}
                      </span>
                    </div>
                  </div>
                )}
                
                {/* Event Item */}
                <div
                  ref={(el) => {
                    if (el) {
                      itemRefs.current.set(event.id, el);
                    }
                  }}
                  data-event-id={event.id}
                  onClick={(e) => {
                    const element = e.currentTarget;
                    handleItemClick(event.id, element);
                  }}
                  className={cn(
                    "relative flex items-start gap-4 py-3 pl-10 cursor-pointer transition-all duration-200 group",
                    isSelected 
                      ? cn(phaseColor.bg, phaseColor.text, "scale-[1.02]")
                      : "hover:bg-base-bg/50 hover:scale-[1.01]"
                  )}
                >
                  {/* Timeline dot - perfectly centered at 20px (left-[15px] + w-[10px]/2) */}
                  <div className={cn(
                    "absolute left-[15px] top-1/2 -translate-y-1/2 h-[10px] w-[10px] rounded-full border-2 z-10 transition-all duration-200 box-content",
                    isSelected
                      ? cn(
                          phaseColor.dotBorder,
                          phaseColor.dotBg,
                          "scale-125 shadow-lg",
                          phaseColor.shadow
                        )
                      : "border-base-divider bg-base-bg group-hover:border-gold-500/40"
                  )} />
                  
                  {/* Event content */}
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "text-sm font-medium transition-colors",
                      isSelected ? phaseColor.text : "text-base-text"
                    )}>
                      {phase}
                    </p>
                    <div className="flex flex-col gap-0.5 mt-0.5">
                      {knightId && (() => {
                        const knightDetails = knightDetailsMap.get(knightId);
                        const displayName = knightDetails?.role || knightId;
                        return (
                          <p className="text-xs text-base-subtext">
                            Knight: <span className="text-gold-300/80">{displayName}</span>
                          </p>
                        );
                      })()}
                      {targetKnightId && (() => {
                        const targetKnightDetails = knightDetailsMap.get(targetKnightId);
                        const targetDisplayName = targetKnightDetails?.role || targetKnightId;
                        return (
                          <p className="text-xs text-base-subtext">
                            Target Knight: <span className="text-teal-300/80">{targetDisplayName}</span>
                          </p>
                        );
                      })()}
                      <p className="text-xs text-base-subtext">
                        {new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </GlassCard>
  );
}

