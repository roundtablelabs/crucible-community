"use client";

import { useMemo, useState, useCallback, useEffect, useRef, useTransition } from "react";
import { useDebateEvents, type DebateEvent } from "../hooks/useDebateEvents";
import { cn } from "@/lib/utils";
import { Target, ClipboardList, X, CheckCircle2, ChevronDown, ChevronUp, Terminal, FileText } from "lucide-react";
import type { ModeratorBrief } from "@/features/moderator/types";
import { MarkdownRenderer } from "@/components/common/MarkdownRenderer";
import { Tooltip } from "@/components/ui/tooltip";
import { InlineLoading } from "@/components/ui/InlineLoading";

// Phase definitions and color mapping
type Phase = 
  | "idle"
  | "research"
  | "opening"
  | "claims"
  | "cross_examination"
  | "challenges"
  | "rebuttals"
  | "red_team"
  | "convergence"
  | "translator"
  | "artifact_ready"
  | "closed";

type PhaseInfo = {
  phase: Phase;
  label: string;
  borderColor: string;
  iconColor: string;
  gradient: string;
};

const PHASE_SEQUENCE: Phase[] = [
  "idle",
  "research",
  "opening",
  "cross_examination",
  "red_team",
  "rebuttals",
  "convergence",
  "translator",
  "artifact_ready",
  "closed",
];

const PHASE_INFO: Record<Phase, PhaseInfo> = {
  idle: {
    phase: "idle",
    label: "Brief",
    borderColor: "border-cyan-500",
    iconColor: "text-cyan-500",
    gradient: "from-cyan-500/20 to-cyan-500/20",
  },
  research: {
    phase: "research",
    label: "Research",
    borderColor: "border-purple-500",
    iconColor: "text-purple-500",
    gradient: "from-purple-500/20 to-pink-500/20",
  },
  opening: {
    phase: "opening",
    label: "Opening",
    borderColor: "border-emerald-500",
    iconColor: "text-emerald-500",
    gradient: "from-emerald-500/20 to-teal-500/20",
  },
  claims: {
    phase: "claims",
    label: "Claims",
    borderColor: "border-amber-500",
    iconColor: "text-amber-500",
    gradient: "from-amber-500/20 to-orange-500/20",
  },
  cross_examination: {
    phase: "cross_examination",
    label: "Cross-Exam",
    borderColor: "border-orange-500",
    iconColor: "text-orange-500",
    gradient: "from-orange-500/20 to-amber-500/20",
  },
  challenges: {
    phase: "challenges",
    label: "Challenges",
    borderColor: "border-amber-500",
    iconColor: "text-amber-500",
    gradient: "from-amber-500/20 to-orange-500/20",
  },
  rebuttals: {
    phase: "rebuttals",
    label: "Rebuttals",
    borderColor: "border-amber-500",
    iconColor: "text-amber-500",
    gradient: "from-amber-500/20 to-orange-500/20",
  },
  red_team: {
    phase: "red_team",
    label: "Red Team",
    borderColor: "border-rose-500",
    iconColor: "text-rose-500",
    gradient: "from-rose-500/20 to-pink-500/20",
  },
  convergence: {
    phase: "convergence",
    label: "Convergence",
    borderColor: "border-rose-500",
    iconColor: "text-rose-500",
    gradient: "from-rose-500/20 to-pink-500/20",
  },
  translator: {
    phase: "translator",
    label: "Translation",
    borderColor: "border-blue-500",
    iconColor: "text-blue-500",
    gradient: "from-blue-500/20 to-cyan-500/20",
  },
  artifact_ready: {
    phase: "artifact_ready",
    label: "Artifact",
    borderColor: "border-gold-500",
    iconColor: "text-gold-500",
    gradient: "from-gold-500/20 to-yellow-500/20",
  },
  closed: {
    phase: "closed",
    label: "Closed",
    borderColor: "border-slate-500",
    iconColor: "text-slate-500",
    gradient: "from-slate-500/20 to-slate-500/20",
  },
};

// Phase descriptions for tooltips - simplified, non-jargon language
const PHASE_DESCRIPTIONS: Record<Phase, string> = {
  idle: "The background and goal for this discussion.",
  research: "Gathering information and evidence to inform positions.",
  opening: "Each expert presents their initial position. This is the first stage where experts share their views.",
  claims: "Breaking down each expert's arguments into specific points.",
  cross_examination: "Experts challenge each other's positions through direct questioning. This is the second stage where experts test each other's arguments.",
  challenges: "Identifying weaknesses, contradictions, or gaps in opposing positions.",
  rebuttals: "Experts defend their positions and respond to challenges with counter-arguments and additional evidence.",
  red_team: "A critical review to spot risks and weaknesses.",
  convergence: "Bringing different viewpoints together into a final agreement.",
  translator: "Creating the executive summary, translating the discussion into actionable language for decision-makers.",
  artifact_ready: "The final report with recommendations is ready for download.",
  closed: "The session is complete. All stages have finished and the final decision has been issued.",
};

// Helper to get border color value with opacity
const getBorderColorValue = (borderColorClass: string, opacity: number = 1): string => {
  const colorMap: Record<string, [number, number, number]> = {
    'border-cyan-500': [6, 182, 212],
    'border-purple-500': [168, 85, 247],
    'border-emerald-500': [16, 185, 129],
    'border-amber-500': [245, 158, 11],
    'border-orange-500': [249, 115, 22],
    'border-rose-500': [244, 63, 94],
    'border-blue-500': [59, 130, 246],
    'border-gold-500': [217, 164, 65],
    'border-slate-500': [100, 116, 139],
  };
  const rgb = colorMap[borderColorClass] || [148, 163, 184];
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${opacity})`;
};

// Helper to get left border class for phase
const getPhaseLeftBorder = (phase: Phase): string => {
  const borderMap: Record<Phase, string> = {
    idle: "border-l-4 border-l-cyan-500",
    research: "border-l-4 border-l-purple-500",
    opening: "border-l-4 border-l-emerald-500",
    claims: "border-l-4 border-l-amber-500",
    cross_examination: "border-l-4 border-l-orange-500",
    challenges: "border-l-4 border-l-amber-500",
    rebuttals: "border-l-4 border-l-amber-500",
    red_team: "border-l-4 border-l-rose-500",
    convergence: "border-l-4 border-l-rose-500",
    translator: "border-l-4 border-l-blue-500",
    artifact_ready: "border-l-4 border-l-gold-500",
    closed: "border-l-4 border-l-slate-500",
  };
  return borderMap[phase] || "border-l-4 border-l-base-divider";
};

// Normalize phase from event
const normalizePhase = (event: DebateEvent): Phase => {
  // Use phase field if available, otherwise map from round
  if (event.phase) {
    const phaseLower = event.phase.toLowerCase();
    if (PHASE_SEQUENCE.includes(phaseLower as Phase)) {
      return phaseLower as Phase;
    }
  }
  
  // Check for MODERATOR_RULING events (closed phase) by headline or ruling field
  if (event.headline === "Final Ruling" || event.ruling) {
    return "closed";
  }
  
  // Fallback to round mapping
  const roundToPhase: Record<string, Phase> = {
    research: "research",
    position: "opening",
    challenge: "cross_examination",
    rebuttals: "rebuttals",
    red_team: "red_team",
    convergence: "convergence",
    translator: "translator",
    artifact: "artifact_ready",
    closed: "closed",
  };
  
  return roundToPhase[event.round] || "idle";
};

type BriefData = {
  intakeSummary?: string | null;
  moderatorBrief?: ModeratorBrief | Record<string, any> | null;
};

type DebateStreamProps = {
  sessionId: string;
  brief?: BriefData | ModeratorBrief | null;
  // Optional: provide events directly (for demo mode)
  events?: DebateEvent[];
  isComplete?: boolean;
  isLoading?: boolean;
  streamStatus?: { taskRunning?: boolean; taskDispatchFailed?: boolean; message?: string } | null;
  // Callback when authentication is required
  onAuthRequired?: () => void;
  // Callback to expose SSE connection status to parent
  onStreamStatusChange?: (isActive: boolean) => void;
  // Callback to expose events to parent for state derivation
  onEventsChange?: (events: DebateEvent[]) => void;
};

export function DebateStream({ 
  sessionId, 
  brief: propBrief,
  events: providedEvents,
  isComplete: providedIsComplete,
  isLoading: providedIsLoading,
  streamStatus: providedStreamStatus,
  onAuthRequired,
  onStreamStatusChange,
  onEventsChange,
}: DebateStreamProps) {
  // Use provided events if available (demo mode), otherwise fetch via hook
  // When events are provided, skipSSE=true prevents SSE but hook may still try database fetch
  // This is fine - we'll just use provided events and ignore hook results
  const hookResult = useDebateEvents(sessionId, !!providedEvents);
  const events = providedEvents ?? hookResult.events;
  const isComplete = providedIsComplete ?? hookResult.isComplete;
  const isLoading = providedIsLoading ?? hookResult.isLoading;
  const streamStatus = providedStreamStatus ?? hookResult.streamStatus;
  
  // Handle auth errors from useDebateEvents
  useEffect(() => {
    if (hookResult.authError && onAuthRequired) {
      onAuthRequired();
    }
  }, [hookResult.authError, onAuthRequired]);
  
  // Expose SSE connection status to parent
  useEffect(() => {
    if (onStreamStatusChange) {
      // If events are provided (demo mode), SSE is not active
      const isActive = !providedEvents && hookResult.streamIsActive;
      onStreamStatusChange(isActive);
    }
  }, [hookResult.streamIsActive, providedEvents, onStreamStatusChange]);
  
  // Expose events to parent for state derivation
  useEffect(() => {
    if (onEventsChange) {
      onEventsChange(events);
    }
  }, [events, onEventsChange]);
  
  // Extract brief data from SESSION_INITIALIZATION events
  const extractedBrief = useMemo(() => {
    // Look for SESSION_INITIALIZATION events
    const initEvent = events.find(
      (e) => e.headline === "Session Initialized" || (e.phase === "idle" && (e.intake_summary || e.moderator_brief))
    );
    
    if (!initEvent) return null;
    
    return {
      intakeSummary: initEvent.intake_summary || null,
      moderatorBrief: initEvent.moderator_brief || null,
    };
  }, [events]);
  
  // Combine prop brief with extracted brief (prop takes priority, but merge intake_summary if available)
  const brief = useMemo((): BriefData | null => {
    // If propBrief is a ModeratorBrief (old format), convert it
    if (propBrief && 'missionStatement' in propBrief) {
      return {
        intakeSummary: extractedBrief?.intakeSummary || null,
        moderatorBrief: propBrief as ModeratorBrief,
      };
    }
    
    // If propBrief is already in BriefData format
    if (propBrief && ('intakeSummary' in propBrief || 'moderatorBrief' in propBrief)) {
      return {
        intakeSummary: (propBrief as BriefData).intakeSummary || extractedBrief?.intakeSummary || null,
        moderatorBrief: (propBrief as BriefData).moderatorBrief || null,
      };
    }
    
    // Otherwise use extracted brief
    if (extractedBrief) {
      return extractedBrief;
    }
    
    return null;
  }, [propBrief, extractedBrief]);
  const [selectedPhase, setSelectedPhase] = useState<Phase | null>(null);
  const [viewedPhases, setViewedPhases] = useState<Set<Phase>>(new Set());
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const previousEventCountRef = useRef(0);
  const lastEventIdsRef = useRef<Set<string>>(new Set());
  const [isPending, startTransition] = useTransition();
  
  // Debounce refs for stable phase state updates
  const phaseStatesStableRef = useRef<Map<Phase, "pending" | "active" | "completed">>(new Map());
  const lastPhaseUpdateRef = useRef<number>(0);
  const newEventPhasesStableRef = useRef<Set<Phase>>(new Set());
  const newEventPhasesTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Track event count for reconnection detection
  const previousEventCountForReconnectRef = useRef<number>(0);
  const lastBulkLoadTimeRef = useRef<number>(0);
  
  // Refs to match console height to timeline
  const timelineRef = useRef<HTMLDivElement>(null);
  const consoleRef = useRef<HTMLDivElement>(null);
  const [consoleHeight, setConsoleHeight] = useState<number | undefined>(undefined);
  
  // Match console height to timeline
  useEffect(() => {
    const updateHeight = () => {
      if (timelineRef.current && consoleRef.current) {
        const timelineHeight = timelineRef.current.offsetHeight;
        setConsoleHeight(timelineHeight);
      }
    };
    
    updateHeight();
    window.addEventListener('resize', updateHeight);
    
    // Use ResizeObserver for more accurate tracking
    const resizeObserver = new ResizeObserver(updateHeight);
    if (timelineRef.current) {
      resizeObserver.observe(timelineRef.current);
    }
    
    return () => {
      window.removeEventListener('resize', updateHeight);
      resizeObserver.disconnect();
    };
  }, [events, selectedPhase]); // Recalculate when events or selected phase changes

  // Group events by phase
  const eventsByPhase = useMemo(() => {
    const grouped = new Map<Phase, DebateEvent[]>();
    
    events.forEach((event) => {
      const phase = normalizePhase(event);
      if (!grouped.has(phase)) {
        grouped.set(phase, []);
      }
      grouped.get(phase)!.push(event);
    });

    // Sort events within each phase by timestamp/sequence
    grouped.forEach((phaseEvents) => {
      phaseEvents.sort((a, b) => {
        // Try to sort by ID if it contains sequence info
        const aSeq = parseInt(a.id.split('-').pop() || '0', 10);
        const bSeq = parseInt(b.id.split('-').pop() || '0', 10);
        return aSeq - bSeq;
      });
    });

    return grouped;
  }, [events]);

  // Determine which phases have events
  const phasesWithEvents = useMemo(() => {
    return PHASE_SEQUENCE.filter((phase) => eventsByPhase.has(phase) && eventsByPhase.get(phase)!.length > 0);
  }, [eventsByPhase]);

  // Determine phase states with debouncing to reduce flickering
  const phaseStates = useMemo(() => {
    const now = Date.now();
    const timeSinceLastUpdate = now - lastPhaseUpdateRef.current;
    const DEBOUNCE_DELAY = 300; // 300ms debounce for phase state changes
    
    // Detect reconnection: bulk loading of events (significant increase in event count)
    const currentEventCount = events.length;
    const previousEventCount = previousEventCountForReconnectRef.current;
    const eventCountIncrease = currentEventCount - previousEventCount;
    
    // Consider it bulk loading if:
    // 1. Event count increased significantly (more than 3 events at once)
    // 2. Or went from 0 to any number (initial load)
    // 3. Or increased by more than 50% of previous count (if previous count > 0)
    const isBulkLoad = eventCountIncrease > 3 || 
                       (previousEventCount === 0 && currentEventCount > 0) ||
                       (previousEventCount > 0 && eventCountIncrease > previousEventCount * 0.5);
    
    // Track bulk load time to allow immediate updates for a short period after reconnection
    if (isBulkLoad) {
      lastBulkLoadTimeRef.current = now;
    }
    
    const timeSinceBulkLoad = now - lastBulkLoadTimeRef.current;
    const BULK_LOAD_GRACE_PERIOD = 1000; // 1 second grace period after bulk load
    
    // Check if this is initial load (no previous states or events just loaded)
    // Also treat bulk loading as initial load for phase state purposes (reconnection scenario)
    const isInitialLoad = phaseStatesStableRef.current.size === 0 || 
                          (events.length > 0 && previousEventCountRef.current === 0) ||
                          isBulkLoad;
    
    // Skip debounce if:
    // 1. It's an initial load
    // 2. It's a bulk load (reconnection detected)
    // 3. We're within grace period after bulk load
    // 4. Session is complete
    const shouldSkipDebounce = isInitialLoad || 
                                isBulkLoad || 
                                timeSinceBulkLoad < BULK_LOAD_GRACE_PERIOD ||
                                isComplete;
    
    // Only debounce if not initial load, not bulk load, and session is not complete
    // This ensures immediate updates when returning to the page or reconnecting
    if (!shouldSkipDebounce && timeSinceLastUpdate < DEBOUNCE_DELAY && !isComplete) {
      return phaseStatesStableRef.current;
    }
    
    // Update previous event count for next comparison
    previousEventCountForReconnectRef.current = currentEventCount;
    
    const states = new Map<Phase, "pending" | "active" | "completed">();
    
    // Determine current phase: use last event's phase if available, otherwise use phasesWithEvents
    let currentPhase: Phase | null = null;
    let currentPhaseIndex = -1;
    
    // First, try to use the last event's phase (most accurate for returning users)
    if (events.length > 0) {
      const lastEvent = events[events.length - 1];
      const lastEventPhase = normalizePhase(lastEvent);
      if (lastEventPhase && PHASE_SEQUENCE.includes(lastEventPhase)) {
        currentPhase = lastEventPhase;
        currentPhaseIndex = PHASE_SEQUENCE.indexOf(lastEventPhase);
      }
    }
    
    // Fallback to phasesWithEvents if we couldn't determine from last event
    if (currentPhaseIndex === -1 && phasesWithEvents.length > 0) {
      currentPhase = phasesWithEvents[phasesWithEvents.length - 1];
      currentPhaseIndex = PHASE_SEQUENCE.indexOf(currentPhase);
    }

    PHASE_SEQUENCE.forEach((phase, index) => {
      const hasEvents = eventsByPhase.has(phase) && eventsByPhase.get(phase)!.length > 0;
      
      if (currentPhaseIndex >= 0) {
        // We have a valid current phase
        if (index < currentPhaseIndex) {
          states.set(phase, "completed");
        } else if (index === currentPhaseIndex) {
          // Always mark current phase as active when session is not complete
          // This ensures the spinner shows correctly when returning to the page
          states.set(phase, isComplete ? "completed" : "active");
        } else {
          states.set(phase, "pending");
        }
      } else {
        // No current phase determined yet - mark phases with events as completed
        // and the last phase with events as active (if session not complete)
        if (hasEvents) {
          const isLastPhaseWithEvents = phase === phasesWithEvents[phasesWithEvents.length - 1];
          states.set(phase, isComplete || !isLastPhaseWithEvents ? "completed" : "active");
        } else {
          states.set(phase, "pending");
        }
      }
    });

    // Update stable ref and timestamp
    phaseStatesStableRef.current = states;
    lastPhaseUpdateRef.current = now;
    
    return states;
  }, [events, phasesWithEvents, eventsByPhase, isComplete]);

  // Track new events per phase with stable badge display (minimum 2 seconds)
  const newEventPhases = useMemo(() => {
    const newPhases = new Set<Phase>();
    
    if (events.length > previousEventCountRef.current) {
      events.forEach((event) => {
        if (!lastEventIdsRef.current.has(event.id)) {
          const phase = normalizePhase(event);
          newPhases.add(phase);
          // Add to stable ref - will be cleared when viewed
          newEventPhasesStableRef.current.add(phase);
        }
      });
    }

    // Update refs
    previousEventCountRef.current = events.length;
    events.forEach((event) => lastEventIdsRef.current.add(event.id));

    // Return stable ref instead of immediate new phases to prevent flickering
    return newEventPhasesStableRef.current;
  }, [events]);

  // Auto-select latest phase with events on initial load
  useEffect(() => {
    if (selectedPhase === null && phasesWithEvents.length > 0) {
      setSelectedPhase(phasesWithEvents[phasesWithEvents.length - 1]);
    }
  }, [selectedPhase, phasesWithEvents]);

  // Get current phase events
  const currentEvents = useMemo(() => {
    if (!selectedPhase) return [];
    const phaseEvents = eventsByPhase.get(selectedPhase) || [];
    // Filter out "PDF Generation: success" events and PDF_GENERATION_STATUS events
    return phaseEvents.filter(event => 
      event.headline !== "PDF Generation: success" && 
      event.event_type !== "PDF_GENERATION_STATUS"
    );
  }, [selectedPhase, eventsByPhase]);

  // Handle phase selection
  const handlePhaseClick = useCallback((phase: Phase) => {
    startTransition(() => {
      setSelectedPhase(phase);
      setViewedPhases((prev) => new Set([...prev, phase]));
      // Clear NEW badge for this phase after a short delay to ensure it was seen
      setTimeout(() => {
        newEventPhasesStableRef.current.delete(phase);
      }, 500);
    });
  }, []);

  // Handle event expand/collapse
  const toggleEventExpanded = useCallback((eventId: string) => {
    setExpandedEvents((prev) => {
      const next = new Set(prev);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  }, []);


  const getRoundLabel = (round: string) => {
    return round.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  };

  return (
    <div className="flex flex-1 gap-6 min-h-0 items-start">
        {/* Left Column: Console View */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Events Display - Match timeline height */}
          <div 
            ref={consoleRef}
            className="overflow-y-auto rounded-xl border border-base-divider/60 bg-base-bg/40 p-4 relative [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
            style={{ height: consoleHeight ? `${consoleHeight}px` : 'auto', maxHeight: consoleHeight ? `${consoleHeight}px` : 'none' }}
          >
            {/* Terminal Icon Background */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-5">
              <Terminal className="h-64 w-64 text-base-text" />
            </div>
            <div className="relative z-10">
            {isLoading && events.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-gold-500/30 bg-base-bg/80 p-6 text-sm text-center">
                <div className="mb-3">
                  <InlineLoading size="lg" />
                </div>
                <p className="text-base-text font-medium">Connecting to debate stream...</p>
                <p className="text-base-subtext text-xs mt-2">Waiting for events to start</p>
              </div>
            ) : streamStatus?.taskDispatchFailed && events.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-rose-500/30 bg-base-bg/80 p-6 text-sm text-center">
                <p className="text-rose-400 font-medium mb-2">⚠️ Debate task failed to start</p>
                <p className="text-base-subtext text-xs">{streamStatus.message || "The debate engine could not be started. Please try refreshing the page."}</p>
                <p className="text-base-subtext text-xs mt-2">This may be due to a backend connection issue.</p>
              </div>
            ) : currentEvents.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-base-divider bg-base-bg/80 p-6 text-sm text-base-subtext text-center">
                {selectedPhase 
                  ? `No events for ${PHASE_INFO[selectedPhase].label} phase yet.`
                  : "Select a phase from the timeline to view events"}
              </div>
            ) : (
              <ol className="flex flex-col gap-3">
                {currentEvents.map((event, eventIndex) => {
                  // Determine phase for this event
                  const eventPhase = normalizePhase(event);
                  
                  // Find the first artifact event with artifact_url to show download button only once
                  const isFirstArtifactWithUrl = eventPhase === "artifact_ready" && 
                    event.artifact_url && 
                    currentEvents.findIndex(e => normalizePhase(e) === "artifact_ready" && e.artifact_url) === eventIndex;
                  
                  // Phases that should always be expanded (non-collapsible)
                  const alwaysExpandedPhases: Phase[] = ["idle", "red_team", "convergence", "translator", "artifact_ready", "closed"];
                  const isAlwaysExpanded = alwaysExpandedPhases.includes(eventPhase);
                  
                  const isExpanded = isAlwaysExpanded || expandedEvents.has(event.id);
                  const hasDetails = event.detail || 
                    (event.round === "research" && event.sources) ||
                    (event.round === "red_team" && event.flaws) ||
                    (event.round === "artifact" && event.artifact_url);

                  return (
                    <li
                      key={event.id}
                      className={cn(
                        "rounded-2xl border border-base-divider bg-base-panel shadow-soft transition-all",
                        getPhaseLeftBorder(eventPhase),
                        hasDetails && !isAlwaysExpanded && "cursor-pointer",
                      )}
                      onClick={(e) => {
                        // Don't toggle if user is selecting text
                        const selection = window.getSelection();
                        if (selection && selection.toString().length > 0) {
                          return;
                        }
                        if (hasDetails && !isAlwaysExpanded) {
                          toggleEventExpanded(event.id);
                        }
                      }}
                    >
                      {/* Collapsed Header - Always Visible */}
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-base-subtext/70 mb-2">
                              <Tooltip 
                                content={`Knight: ${event.knight}\n\nKnights are specialized AI experts with distinct perspectives and expertise. Each Knight contributes unique insights to the debate.`}
                                side="top"
                              >
                                <span className="rounded-full bg-gold-500/20 border border-gold-500/40 px-2 py-0.5 text-gold-300 font-bold">
                                  {event.knight}
                                </span>
                              </Tooltip>
                              <span>{event.timestamp} UTC</span>
                            </div>
                            <Tooltip
                              content={
                                event.headline === "Session Initialized" 
                                  ? "The moderator brief contains the mission statement, key assumptions, and context for the debate."
                                  : event.round === "position"
                                  ? "Position cards contain each Knight's initial thesis and arguments. This is Round 1 where experts state their positions."
                                  : event.round === "challenge"
                                  ? "Challenges are direct questions or critiques of another Knight's position. This is Round 2 where experts test each other's arguments."
                                  : event.round === "research"
                                  ? "Research results show information gathered from external sources, with citations and evidence to support positions."
                                  : event.round === "red_team"
                                  ? "Red Team critique identifies potential flaws, risks, and failure modes in the proposed solutions."
                                  : event.round === "convergence"
                                  ? "Convergence shows where the final judge synthesizes all positions to identify consensus and key disagreements."
                                  : event.round === "translator"
                                  ? "Translation converts the technical debate into an executive summary with actionable recommendations."
                                  : event.round === "artifact"
                                  ? "The Decision Brief artifact contains the final analysis, recommendations, and full citations."
                                  : "This event contains information from the debate process."
                              }
                              side="top"
                            >
                              <h4 className="text-base font-semibold text-base-text">
                                {event.headline === "Session Initialized" ? "Moderator Brief" : event.headline}
                              </h4>
                            </Tooltip>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {/* Confidence Circle - Left of expand icon, only for opening and convergence */}
                            {((event.round === "position" || event.round === "convergence") && event.confidence > 0) && (() => {
                              const confidencePercent = event.confidence > 1 ? event.confidence : event.confidence * 100;
                              const radius = 10;
                              const circumference = 2 * Math.PI * radius;
                              const offset = circumference - (confidencePercent / 100) * circumference;
                              
                              return (
                                <div className="relative w-7 h-7 flex items-center justify-center" title={`Confidence: ${confidencePercent.toFixed(1)}%`}>
                                  <svg className="w-7 h-7 transform -rotate-90" viewBox="0 0 24 24">
                                    {/* Background circle */}
                                    <circle
                                      cx="12"
                                      cy="12"
                                      r={radius}
                                      stroke="currentColor"
                                      strokeWidth="1.5"
                                      fill="none"
                                      className="text-base-divider/40"
                                    />
                                    {/* Progress circle */}
                                    <circle
                                      cx="12"
                                      cy="12"
                                      r={radius}
                                      stroke="currentColor"
                                      strokeWidth="1.5"
                                      fill="none"
                                      strokeDasharray={circumference}
                                      strokeDashoffset={offset}
                                      strokeLinecap="round"
                                      className={cn(
                                        "transition-all duration-300",
                                        event.round === "position" && "text-emerald-400",
                                        event.round === "convergence" && "text-emerald-400"
                                      )}
                                    />
                                  </svg>
                                  <span className={cn(
                                    "absolute text-[9px] font-semibold",
                                    event.round === "position" && "text-emerald-400",
                                    event.round === "convergence" && "text-emerald-400"
                                  )}>
                                    {Math.round(confidencePercent)}
                                  </span>
                                </div>
                              );
                            })()}
                            {hasDetails && !isAlwaysExpanded && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleEventExpanded(event.id);
                                }}
                                className="flex-shrink-0 p-1 rounded-md hover:bg-base-bg/50 transition"
                                aria-label={isExpanded ? "Collapse" : "Expand"}
                              >
                                {isExpanded ? (
                                  <ChevronUp className="h-5 w-5 text-base-subtext" />
                                ) : (
                                  <ChevronDown className="h-5 w-5 text-base-subtext" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Expanded Content */}
                      {isExpanded && (
                        <div 
                          className="px-4 pb-4 border-t border-base-divider/60 pt-4 space-y-4"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => e.stopPropagation()}
                        >
                          {/* Standard Detail - Skip if it's the same as intake_summary or if closed phase (ruling will be shown instead) */}
                          {event.detail && event.phase !== "idle" && event.phase !== "closed" && (
                            <MarkdownRenderer content={event.detail} variant="cyan" className="text-sm" />
                          )}
                          {event.detail && event.phase === "idle" && event.detail !== event.intake_summary && (
                            <MarkdownRenderer content={event.detail} variant="cyan" className="text-sm" />
                          )}

                          {/* Session Initialization - Mission & Key Assumptions */}
                          {event.phase === "idle" && event.moderator_brief && (
                            <div className="space-y-4">
                              {(() => {
                                const briefObj = event.moderator_brief as Record<string, any>;
                                const missionStatement = briefObj.missionStatement || briefObj.mission_statement;
                                const keyAssumptions = briefObj.keyAssumptions || briefObj.key_assumptions;
                                
                                return (
                                  <>
                                    {missionStatement && (
                                      <div className="rounded-2xl border border-cyan-500/30 bg-[rgba(6,24,35,0.85)] p-5">
                                        <div className="flex items-center gap-2 mb-3">
                                          <Target className="h-4 w-4 text-cyan-200" aria-hidden="true" />
                                          <h4 className="text-sm font-medium text-cyan-100/80">Mission Statement</h4>
                                        </div>
                                        <div className="text-sm text-cyan-50/90">
                                          <MarkdownRenderer content={missionStatement} variant="cyan" />
                                        </div>
                                      </div>
                                    )}

                                    {Array.isArray(keyAssumptions) && keyAssumptions.length > 0 && (
                                      <div className="rounded-2xl border border-cyan-500/30 bg-[rgba(6,24,35,0.85)] p-5">
                                        <div className="flex items-center gap-2 mb-3">
                                          <ClipboardList className="h-4 w-4 text-cyan-200" aria-hidden="true" />
                                          <h4 className="text-sm font-medium text-cyan-100/80">Key Assumptions</h4>
                                        </div>
                                        <div className="rounded-lg bg-blue-950/40 border border-blue-900/30 p-3">
                                          <ul className="list-disc list-outside space-y-1 text-sm text-base-text pl-6">
                                            {keyAssumptions.map((assumption: string, idx: number) => (
                                              <li key={idx} className="leading-relaxed">
                                                <MarkdownRenderer content={assumption} variant="cyan" className="inline" />
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      </div>
                                    )}
                                  </>
                                );
                              })()}
                            </div>
                          )}

                          {/* Research Sources */}
                          {event.round === "research" && event.sources && (
                            <div className="space-y-2 rounded-xl bg-base-bg/50 p-3">
                              <p className="text-xs font-semibold uppercase tracking-wider text-base-subtext">Sources</p>
                              {event.sources.map((s, i) => (
                                <div key={i} className="text-xs">
                                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline">
                                    {s.title}
                                  </a>
                                  {s.snippet && (
                                    <div className="text-base-subtext line-clamp-1">
                                      <MarkdownRenderer content={s.snippet} variant="cyan" className="text-xs" />
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Red Team Flaws */}
                          {event.round === "red_team" && event.flaws && (
                            <div className="rounded-xl bg-red-500/10 p-3 text-red-900">
                              <p className="text-xs font-bold uppercase text-red-900 tracking-wider">Identified Flaws</p>
                              <ul className="mt-1 list-disc pl-4 text-xs">
                                {event.flaws.map((flaw, i) => (
                                  <li key={i}>
                                    <MarkdownRenderer content={flaw} variant="red" className="inline" />
                                  </li>
                                ))}
                              </ul>
                              {event.severity && (
                                <p className="mt-2 text-xs font-bold uppercase">Severity: {event.severity}</p>
                              )}
                            </div>
                          )}

                          {/* Artifact Ready Phase - Single Download Button */}
                          {isFirstArtifactWithUrl && (
                            <div>
                              <a
                                href={`/api/artifacts/${sessionId}/pdf`}
                                target="_blank"
                                rel="noopener noreferrer"
                                download
                                className="inline-flex items-center rounded-full bg-gold-500/50 px-4 py-2 text-sm font-bold hover:bg-gold-500/70"
                                onClick={async (e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  
                                  try {
                                    const response = await fetch(`/api/artifacts/${sessionId}/pdf`, {
                                      credentials: "include",
                                    });
                                    
                                    if (!response.ok) {
                                      throw new Error(`Failed to download PDF: ${response.status}`);
                                    }
                                    
                                    const blob = await response.blob();
                                    const url = window.URL.createObjectURL(blob);
                                    const a = document.createElement("a");
                                    a.href = url;
                                    a.download = `${sessionId}_executive_brief.pdf`;
                                    document.body.appendChild(a);
                                    a.click();
                                    document.body.removeChild(a);
                                    window.URL.revokeObjectURL(url);
                                  } catch (error) {
                                    console.error("Failed to download PDF:", error);
                                    alert("Failed to download PDF. Please try again.");
                                  }
                                }}
                              >
                                Download Decision Brief
                              </a>
                            </div>
                          )}

                          {/* Closed Phase - Final Ruling */}
                          {eventPhase === "closed" && (event.ruling || event.notes) && (
                            <div className="space-y-4">
                              {event.ruling && (
                                <div className="rounded-2xl border border-cyan-500/30 bg-[rgba(6,24,35,0.85)] p-5">
                                  <div className="text-sm text-cyan-50/90">
                                    <MarkdownRenderer content={event.ruling} variant="cyan" />
                                  </div>
                                </div>
                              )}
                              {event.notes && (
                                <div className="rounded-2xl border border-cyan-500/30 bg-[rgba(6,24,35,0.85)] p-5">
  
                                  <div className="text-sm text-cyan-50/90">
                                    <MarkdownRenderer content={event.notes} variant="cyan" />
                                  </div>
                                </div>
                              )}
                            </div>
                          )}

                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
            </div>
          </div>

        </div>

        {/* Right Column: Timeline */}
        <div className="w-64 flex-shrink-0">
          <div ref={timelineRef} className="rounded-xl border border-base-divider/60 bg-base-bg/40 p-4">
            <div className="flex items-center justify-between mb-4">
              <Tooltip
                content="The timeline shows all phases of the debate process. Click on any phase to view its events. Phases light up as they progress."
                side="right"
              >
                <h4 className="text-sm font-semibold text-base-text">Timeline</h4>
              </Tooltip>
              {isLoading && events.length === 0 && (
                <InlineLoading size="sm" text="Connecting..." />
              )}
            </div>
            <div className="relative">
              {/* Vertical Timeline Line */}
              <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-base-divider/30" />
              
              {/* Timeline Items */}
              <div className="relative space-y-4">
                {PHASE_SEQUENCE.map((phase, index) => {
                  const info = PHASE_INFO[phase];
                  const state = phaseStates.get(phase) || "pending";
                  const hasEvents = eventsByPhase.has(phase) && eventsByPhase.get(phase)!.length > 0;
                  const isSelected = selectedPhase === phase;
                  const hasNew = newEventPhases.has(phase) && !viewedPhases.has(phase);
                  const isLit = state === "active" || state === "completed";

                  return (
                    <div
                      key={phase}
                      className="relative flex items-center cursor-pointer group"
                      onClick={() => handlePhaseClick(phase)}
                    >
                      {/* Timeline Circle */}
                      <div
                        className={cn(
                          "relative flex h-12 w-12 items-center justify-center rounded-full border-2 transition-all duration-500 z-10 bg-base-panel shadow-lg will-change-[transform,border-color]",
                          isSelected && "scale-110",
                          isLit && info.borderColor,
                          !isLit && "border-base-divider/40",
                          isSelected && isLit && "shadow-lg",
                        )}
                        style={{
                          borderColor: isLit && isSelected 
                            ? getBorderColorValue(info.borderColor, 0.6)
                            : isLit
                            ? getBorderColorValue(info.borderColor, 0.4)
                            : undefined,
                        }}
                      >
                        {/* Glow effect when lit */}
                        {isLit && (
                          <div
                            className={cn(
                              "absolute inset-0 rounded-full blur-xl transition-opacity duration-500",
                              info.borderColor.replace('border-', 'bg-').replace('-500', '-500/10')
                            )}
                            style={{ opacity: isLit ? 1 : 0 }}
                          />
                        )}

                        {/* Spinner for active phase (when not complete) */}
                        {state === "active" && !isComplete ? (
                          <InlineLoading size="md" spinnerColor={info.iconColor} />
                        ) : (
                          /* Phase number */
                          <span
                            className={cn(
                              "text-xs font-bold transition-colors duration-500",
                              isLit ? info.iconColor : "text-base-subtext/60"
                            )}
                          >
                            {index + 1}
                          </span>
                        )}

                        {/* Checkmark for completed */}
                        {state === "completed" && (
                          <CheckCircle2 className={cn("absolute -bottom-1 -right-1 h-4 w-4", info.iconColor)} />
                        )}

                        {/* NEW badge */}
                        {hasNew && (
                          <span className="absolute -top-3 right-4 rounded-full bg-gold-500/70 text-white text-[10px] font-bold px-1.5 py-0.5 border-2 border-base-panel">
                            NEW
                          </span>
                        )}
                      </div>

                      {/* Phase Label */}
                      <div className="ml-4 flex-1 min-w-0">
                        <Tooltip 
                          content={PHASE_DESCRIPTIONS[phase]}
                          side="right"
                        >
                          <div
                            className={cn(
                              "text-sm font-medium transition-colors duration-500",
                              isSelected && isLit
                                ? "text-base-text"
                                : isLit
                                ? "text-base-text/80"
                                : "text-base-subtext/60"
                            )}
                          >
                            {info.label}
                          </div>
                        </Tooltip>
                        {hasEvents && (
                          <div className="text-xs text-base-subtext/60 mt-0.5 will-change-[contents]">
                            {eventsByPhase.get(phase)!.length} event{eventsByPhase.get(phase)!.length !== 1 ? 's' : ''}
                          </div>
                        )}
                      </div>

                      {/* Active pulse animation */}
                      {state === "active" && (
                        <div
                          className={cn(
                            "absolute left-6 top-1/2 -translate-y-1/2 -translate-x-1/2 h-12 w-12 rounded-full animate-pulse",
                            info.borderColor.replace('border-', 'bg-').replace('-500', '-500/20')
                          )}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>
  );
}
