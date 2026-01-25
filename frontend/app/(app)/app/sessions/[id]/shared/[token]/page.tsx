"use client";

import React, { use, useState, useMemo, useRef, useEffect, useCallback } from "react";
import { useQuery, useQueries } from "@tanstack/react-query";
import { FileDown, AlertCircle, ArrowLeft, ChevronDown, ChevronUp, Users, ArrowRight } from "lucide-react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/common/MarkdownRenderer";
import { logError, logDebug, getErrorMessage } from "@/lib/utils/errorHandler";
import { InlineLoading } from "@/components/ui/InlineLoading";
import { Breadcrumbs } from "@/components/navigation/Breadcrumbs";
import { SessionHeader } from "@/features/sessions/components/SessionHeader";
import { EventTimeline } from "@/features/sessions/components/EventTimeline";

type PageProps = {
  params: Promise<{ id: string; token: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type DebateEvent = {
  id: string;
  sequence_id: number;
  phase: string;
  event_type: string;
  payload: Record<string, any>;
  created_at: string;
};

type SessionJsonData = {
  session_metadata: {
    session_id: string;
    topic: string | null;
    status: string;
    created_at: string | null;
    completed_at: string | null;
    exported_at: string;
    participants?: Array<{ knight_id: string | null }>;
  };
  events: DebateEvent[];
};

export default function SharedSessionOutputPage({ params, searchParams: _searchParams }: PageProps) {
  const { id, token } = use(params);
  const [isDownloadingArtifact, setIsDownloadingArtifact] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [translatorExpanded, setTranslatorExpanded] = useState(false);
  const [redTeamExpanded, setRedTeamExpanded] = useState(false);
  const [convergenceExpanded, setConvergenceExpanded] = useState(false);
  const [idleExpanded, setIdleExpanded] = useState(false);
  const timelineRef = useRef<HTMLDivElement>(null);
  const hasInitializedSelection = useRef(false);

  // Verify share token and get session metadata
  const sharedSessionQuery = useQuery({
    queryKey: ["shared-session", id, token],
    queryFn: async () => {
      const response = await fetch(`/api/sessions/${id}/shared/${token}`);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Shared session not found");
        }
        if (response.status === 403) {
          throw new Error("This share link has expired or been revoked");
        }
        throw new Error("Failed to load shared session");
      }
      return await response.json();
    },
  });

  // Fetch JSON data using the shared token
  const jsonQuery = useQuery({
    queryKey: ["shared-session-json", id, token],
    queryFn: async () => {
      // Use a special endpoint that accepts the token
      const response = await fetch(`/api/artifacts/${id}/json?token=${token}`, {
        credentials: "include",
      });
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Session output not found");
        }
        if (response.status === 403) {
          throw new Error("Access denied");
        }
        throw new Error("Failed to load session output");
      }
      return (await response.json()) as SessionJsonData;
    },
    enabled: sharedSessionQuery.isSuccess,
  });

  // Memoize events array sorted by sequence_id
  const events = useMemo(() => {
    const eventsArray = jsonQuery.data?.events ?? [];
    return [...eventsArray].sort((a, b) => a.sequence_id - b.sequence_id);
  }, [jsonQuery.data?.events]);
  const metadata = jsonQuery.data?.session_metadata;

  // Extract key information from events
  const translatorOutput = useMemo(() => 
    events.find((e) => e.phase === "translator"), 
    [events]
  );
  const redTeamCritique = useMemo(() => 
    events.find((e) => e.phase === "red_team"), 
    [events]
  );
  const convergenceEvent = useMemo(() => 
    events.find((e) => e.phase === "convergence" || e.event_type === "CONVERGENCE"), 
    [events]
  );
  const idleEvent = useMemo(() => 
    events.find((e) => e.phase === "idle" || e.event_type === "SESSION_INITIALIZATION"), 
    [events]
  );

  // Extract unique knights/participants from research phase events only
  const participantIds = useMemo(() => {
    const knightSet = new Set<string>();
    events.forEach((event) => {
      if (event.phase !== "research") return;
      
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
      if (payload.knight_id) {
        knightSet.add(String(payload.knight_id));
      }
      if (payload.target_knight_id) {
        knightSet.add(String(payload.target_knight_id));
      }
    });
    return Array.from(knightSet);
  }, [events]);

  // Fetch knight details for all participants
  const knightQueries = useQueries({
    queries: participantIds.map((knightId) => ({
      queryKey: ["knight", knightId] as const,
      queryFn: async () => {
        // For shared sessions, we might not have auth, so use public endpoint if available
        const response = await fetch(`/api/knights/${encodeURIComponent(knightId)}`);
        if (!response.ok) {
          return null;
        }
        return await response.json();
      },
      enabled: !!knightId,
    })),
  });

  // Create a map of knight_id to knight details
  const knightDetailsMap = useMemo(() => {
    const map = new Map<string, any>();
    participantIds.forEach((knightId, idx) => {
      const query = knightQueries[idx];
      if (query?.data) {
        map.set(knightId, query.data);
      }
    });
    return map;
  }, [participantIds, knightQueries]);

  // Create participant info structure
  const participants: Array<{ id: string; name: string; data: any; isLoading: boolean }> = useMemo(() => {
    return participantIds.map((knightId, idx) => {
      const query = knightQueries[idx];
      return {
        id: knightId,
        name: query?.data?.name || query?.data?.role || knightId,
        data: query?.data,
        isLoading: query?.isLoading || false,
      };
    });
  }, [participantIds, knightQueries]);

  // Auto-select artifact_ready event if available
  useEffect(() => {
    if (events.length > 0 && !hasInitializedSelection.current) {
      hasInitializedSelection.current = true;
      
      const artifactReadyEvent = events.find(e => e.phase === "artifact_ready" || e.phase === "atrifact_ready");
      if (artifactReadyEvent) {
        setSelectedEventId(artifactReadyEvent.id);
        setTimeout(() => {
          const timeline = timelineRef.current;
          if (timeline) {
            const selectedElement = timeline.querySelector(`[data-event-id="${artifactReadyEvent.id}"]`) as HTMLElement;
            if (selectedElement) {
              const elementTop = selectedElement.offsetTop;
              const elementHeight = selectedElement.offsetHeight;
              const containerHeight = timeline.clientHeight;
              const scrollTop = elementTop - (containerHeight / 2) + (elementHeight / 2);
              timeline.scrollTo({ top: scrollTop, behavior: 'smooth' });
            }
          }
        }, 100);
        return;
      }
      
      setTimeout(() => {
        const timeline = timelineRef.current;
        if (timeline) {
          timeline.scrollTop = 0;
        }
      }, 100);
    }
  }, [events]);

  const selectedEvent = useMemo(() => {
    if (!selectedEventId) return null;
    return events.find((e) => e.id === selectedEventId) || null;
  }, [events, selectedEventId]);

  // Calculate duration
  const duration = useMemo(() => {
    if (events.length === 0) return null;
    
    const firstEvent = events[0];
    const lastEvent = events[events.length - 1];
    
    if (!firstEvent?.created_at || !lastEvent?.created_at) return null;
    
    const start = new Date(firstEvent.created_at).getTime();
    const end = new Date(lastEvent.created_at).getTime();
    const durationMs = end - start;
    if (durationMs < 0) return null;
    
    const minutes = Math.floor(durationMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  }, [events]);

  // Extract strategic question from moderator brief
  const strategicQuestion = useMemo(() => {
    if (!idleEvent) return null;
    let payload: Record<string, any> = {};
    if (idleEvent.payload) {
      if (typeof idleEvent.payload === "string") {
        try {
          payload = JSON.parse(idleEvent.payload);
        } catch {
          return null;
        }
      } else if (typeof idleEvent.payload === "object") {
        payload = idleEvent.payload;
      }
    }
    const moderatorBrief = payload.moderator_brief || payload.moderatorBrief;
    if (!moderatorBrief || typeof moderatorBrief !== "object") return null;
    return moderatorBrief.strategicQuestion || moderatorBrief.strategic_question || null;
  }, [idleEvent]);

  // Navigation functions
  const currentIndex = useMemo(() => {
    if (!selectedEventId) return -1;
    return events.findIndex(e => e.id === selectedEventId);
  }, [events, selectedEventId]);

  const goToPrevious = useCallback(() => {
    if (currentIndex > 0) {
      setSelectedEventId(events[currentIndex - 1].id);
      setTimeout(() => {
        const timeline = timelineRef.current;
        if (timeline) {
          const selectedElement = timeline.querySelector(`[data-event-id="${events[currentIndex - 1].id}"]`) as HTMLElement;
          if (selectedElement) {
            const elementTop = selectedElement.offsetTop;
            const elementHeight = selectedElement.offsetHeight;
            const containerHeight = timeline.clientHeight;
            const scrollTop = elementTop - (containerHeight / 2) + (elementHeight / 2);
            timeline.scrollTo({ top: scrollTop, behavior: 'smooth' });
          }
        }
      }, 50);
    }
  }, [currentIndex, events]);

  const goToNext = useCallback(() => {
    if (currentIndex < events.length - 1) {
      setSelectedEventId(events[currentIndex + 1].id);
      setTimeout(() => {
        const timeline = timelineRef.current;
        if (timeline) {
          const selectedElement = timeline.querySelector(`[data-event-id="${events[currentIndex + 1].id}"]`) as HTMLElement;
          if (selectedElement) {
            const elementTop = selectedElement.offsetTop;
            const elementHeight = selectedElement.offsetHeight;
            const containerHeight = timeline.clientHeight;
            const scrollTop = elementTop - (containerHeight / 2) + (elementHeight / 2);
            timeline.scrollTo({ top: scrollTop, behavior: 'smooth' });
          }
        }
      }, 50);
    }
  }, [currentIndex, events]);

  if (sharedSessionQuery.isLoading) {
    return (
      <div className="container-box flex min-h-[60vh] items-center justify-center">
        <InlineLoading size="lg" />
      </div>
    );
  }

  if (sharedSessionQuery.isError) {
    return (
      <div className="container-box py-16">
        <GlassCard className="p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <AlertCircle className="h-12 w-12 text-red-500" />
            <div>
              <h2 className="text-xl font-semibold text-base-text">Error Loading Shared Session</h2>
              <p className="mt-2 text-sm text-base-subtext">
                {sharedSessionQuery.error instanceof Error ? sharedSessionQuery.error.message : "Unknown error occurred"}
              </p>
            </div>
            <Link
              href="/app/sessions"
              className="inline-flex items-center gap-2 rounded-full border border-base-divider px-4 py-2 text-sm text-base-text transition hover:border-navy-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Sessions
            </Link>
          </div>
        </GlassCard>
      </div>
    );
  }

  if (jsonQuery.isLoading) {
    return (
      <div className="container-box flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <InlineLoading size="lg" />
          <p className="text-sm text-base-subtext">Loading shared session output...</p>
        </div>
      </div>
    );
  }

  if (jsonQuery.isError) {
    return (
      <div className="container-box py-16">
        <GlassCard className="p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <AlertCircle className="h-12 w-12 text-red-500" />
            <div>
              <h2 className="text-xl font-semibold text-base-text">Error Loading Session</h2>
              <p className="mt-2 text-sm text-base-subtext">
                {jsonQuery.error instanceof Error ? jsonQuery.error.message : "Unknown error occurred"}
              </p>
            </div>
          </div>
        </GlassCard>
      </div>
    );
  }

  const data = jsonQuery.data;
  if (!data) {
    return (
      <div className="container-box py-16">
        <GlassCard className="p-8">
          <div className="flex flex-col items-center gap-4 text-center">
            <InlineLoading size="lg" />
            <div>
              <h2 className="text-xl font-semibold text-base-text">Loading Session</h2>
              <p className="mt-2 text-sm text-base-subtext">Please wait while we load the session data...</p>
            </div>
          </div>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="container-box space-y-6 py-8">
      {/* Breadcrumbs */}
      <Breadcrumbs
        items={[
          { label: "Shared Session", href: "#" },
          { label: `Session ${id.slice(0, 8)}...`, href: "#" },
        ]}
      />

      {/* Shared Session Notice */}
      <GlassCard className="p-4 bg-blue-500/10 border-blue-500/30">
        <p className="text-sm text-blue-300">
          🔗 This is a shared session. You're viewing a read-only version.
        </p>
      </GlassCard>

      {/* Header */}
      <SessionHeader
        metadata={metadata}
        strategicQuestion={strategicQuestion}
        duration={duration}
        participants={participants}
        hasPdf={false}
        isDownloadingPdf={false}
        onDownloadPdf={() => {}}
        onOpenDrawer={() => {}}
        sessionIdFromUrl={id}
      />

      {/* Expandable Stage Content */}
      <div className="space-y-4">
        {/* Moderator Brief (Idle Phase) */}
        {idleEvent && (
          <ExpandableSection
            title="Moderator Brief"
            isExpanded={idleExpanded}
            onToggle={() => setIdleExpanded(!idleExpanded)}
            bgColor="bg-blue-500/10"
          >
            <div className="space-y-4 prose prose-invert max-w-none">
              {(() => {
                let payload: Record<string, any> = {};
                if (idleEvent.payload) {
                  if (typeof idleEvent.payload === "string") {
                    try {
                      payload = JSON.parse(idleEvent.payload);
                    } catch {
                      payload = { content: idleEvent.payload };
                    }
                  } else if (typeof idleEvent.payload === "object") {
                    payload = idleEvent.payload;
                  }
                }

                const moderatorBrief = payload.moderator_brief || payload.moderatorBrief;
                if (!moderatorBrief || typeof moderatorBrief !== "object") {
                  return <p className="text-sm text-base-subtext">No moderator brief available</p>;
                }

                const renderMarkdown = (content: any): string => {
                  if (!content) return "";
                  if (typeof content === "string") return content;
                  if (typeof content === "number" || typeof content === "boolean") return String(content);
                  return JSON.stringify(content);
                };

                const formatKey = (key: string): string => {
                  return key
                    .replace(/([A-Z])/g, " $1")
                    .replace(/^./, (str) => str.toUpperCase())
                    .trim();
                };

                return (
                  <>
                    {Object.entries(moderatorBrief).map(([key, value]) => {
                      if (key === "recommendedExperts" || key === "recommended_experts") return null;
                      if (key === "strategicQuestion" || key === "strategic_question") return null;
                      if (key === "topicSummary" || key === "topic_summary") return null;

                      if (key === "keyAssumptions" || key === "key_assumptions") {
                        if (Array.isArray(value) && value.length > 0) {
                          return (
                            <div key={key}>
                              <p className="text-sm font-medium text-base-subtext mb-2">
                                {formatKey(key)}
                              </p>
                              <div className="rounded-lg bg-blue-950/40 border border-blue-900/30 p-3">
                                <ul className="list-disc list-outside space-y-1 text-sm text-base-text pl-6">
                                  {value.map((assumption: string, idx: number) => (
                                    <li key={idx}>{assumption}</li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          );
                        }
                        return null;
                      }

                      if (value === null || value === undefined || value === "") {
                        return null;
                      }

                      return (
                        <div key={key}>
                          <p className="text-sm font-medium text-base-subtext mb-2">
                            {formatKey(key)}
                          </p>
                          <div className="text-base text-base-text leading-relaxed">
                            <MarkdownRenderer content={renderMarkdown(value)} variant="base" />
                          </div>
                        </div>
                      );
                    })}
                  </>
                );
              })()}
            </div>
          </ExpandableSection>
        )}

        {/* Final Recommendation */}
        {convergenceEvent && (
          <ExpandableSection
            title="Final Recommendation"
            isExpanded={convergenceExpanded}
            onToggle={() => setConvergenceExpanded(!convergenceExpanded)}
            bgColor="bg-teal-500/10"
          >
            <div className="space-y-4 prose prose-invert max-w-none">
              {(() => {
                let payload: Record<string, any> = {};
                if (convergenceEvent.payload) {
                  if (typeof convergenceEvent.payload === "string") {
                    try {
                      payload = JSON.parse(convergenceEvent.payload);
                    } catch {
                      payload = { content: convergenceEvent.payload };
                    }
                  } else if (typeof convergenceEvent.payload === "object") {
                    payload = convergenceEvent.payload;
                  }
                }

                const renderMarkdown = (content: any): string => {
                  if (!content) return "";
                  if (typeof content === "string") return content;
                  if (typeof content === "number" || typeof content === "boolean") return String(content);
                  return JSON.stringify(content);
                };

                return (
                  <>
                    {payload.summary && (
                      <div>
                        <div className="text-base text-base-text leading-relaxed">
                          <MarkdownRenderer content={renderMarkdown(payload.summary)} variant="judge" />
                        </div>
                      </div>
                    )}
                    {payload.confidence !== undefined && (
                      <div>
                        <p className="text-sm font-medium text-base-subtext mb-1">Confidence</p>
                        <p className="text-base font-semibold text-base-text">{((typeof payload.confidence === "number" ? payload.confidence : parseFloat(payload.confidence)) * 100).toFixed(1)}%</p>
                      </div>
                    )}
                    {payload.dissenting_points && Array.isArray(payload.dissenting_points) && payload.dissenting_points.length > 0 && (
                      <div>
                        <p className="text-sm font-medium text-base-subtext mb-2">Dissenting Points</p>
                        <ul className="list-disc list-outside space-y-1 text-base text-base-text pl-6">
                          {payload.dissenting_points.map((point: string, idx: number) => (
                            <li key={idx}>{point}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          </ExpandableSection>
        )}

        {/* Executive Summary */}
        {translatorOutput && (
          <ExpandableSection
            title="Executive Summary"
            isExpanded={translatorExpanded}
            onToggle={() => setTranslatorExpanded(!translatorExpanded)}
            bgColor="bg-success-100"
          >
            <div className="space-y-4 prose prose-invert max-w-none">
              {translatorOutput.payload?.translated_content && (
                <div>
                  <div className="text-base text-base-text leading-relaxed">
                    <MarkdownRenderer content={String(translatorOutput.payload.translated_content || "")} variant="base" />
                  </div>
                </div>
              )}
            </div>
          </ExpandableSection>
        )}

        {/* Critical Review */}
        {redTeamCritique && (
          <ExpandableSection
            title="Critical Review"
            isExpanded={redTeamExpanded}
            onToggle={() => setRedTeamExpanded(!redTeamExpanded)}
            bgColor="bg-rose-500/10"
          >
            <div className="space-y-4 prose prose-invert max-w-none">
              {redTeamCritique.payload?.critique && (
                <div>
                  <div className="text-base text-base-text leading-relaxed">
                    <MarkdownRenderer content={String(redTeamCritique.payload.critique || "")} variant="red" />
                  </div>
                </div>
              )}
              {redTeamCritique.payload?.flaws_identified && Array.isArray(redTeamCritique.payload.flaws_identified) && redTeamCritique.payload.flaws_identified.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-rose-600 mb-2">Flaws Identified</p>
                  <div className="rounded-lg bg-rose-950/40 border border-rose-900/30 p-3">
                    <ul className="list-disc list-inside space-y-1 text-sm text-base-text">
                      {redTeamCritique.payload.flaws_identified.map((flaw: string, idx: number) => (
                        <li key={idx}>{flaw}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}
              {redTeamCritique.payload?.severity && (
                <div>
                  <p className="text-sm font-medium text-base-subtext mb-2">Severity</p>
                  <span className={cn(
                    "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.2em]",
                    redTeamCritique.payload.severity === "high" && "border border-rose-500/40 bg-rose-500/10 text-rose-300",
                    redTeamCritique.payload.severity === "medium" && "border border-amber-500/40 bg-amber-500/10 text-amber-300",
                    redTeamCritique.payload.severity === "low" && "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  )}>
                    {redTeamCritique.payload.severity}
                  </span>
                </div>
              )}
            </div>
          </ExpandableSection>
        )}
      </div>

      {/* Two Column Layout: Timeline and Content Viewer */}
      <div className="grid gap-6 grid-cols-1 lg:grid-cols-[320px_1fr] lg:items-stretch">
        {/* Left Column: Timeline */}
        <div className="w-full">
          <EventTimeline
            events={events}
            selectedEventId={selectedEventId}
            onSelect={setSelectedEventId}
            timelineRef={timelineRef}
            onPrevious={goToPrevious}
            onNext={goToNext}
            canGoPrevious={currentIndex > 0}
            canGoNext={currentIndex < events.length - 1}
            knightDetailsMap={knightDetailsMap}
          />
        </div>

        {/* Right Column: Content Viewer */}
        <div className="w-full">
          <ContentViewer 
            event={selectedEvent} 
            sessionId={id}
            knightDetailsMap={knightDetailsMap}
          />
        </div>
      </div>
    </div>
  );
}

// Expandable Section Component
type ExpandableSectionProps = {
  title: string;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  bgColor?: string;
};

function ExpandableSection({ title, isExpanded, onToggle, children, bgColor }: ExpandableSectionProps) {
  return (
    <GlassCard variant="elevated" className={cn("p-5", bgColor)}>
      <button
        type="button"
        onClick={onToggle}
        className={cn(
          "flex w-full items-center justify-between text-left",
          isExpanded && "pb-4 border-b border-base-border/30"
        )}
      >
        <p className="text-xs uppercase ">{title}</p>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-gold-400/60 transition-transform" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gold-400/60 transition-transform" />
        )}
      </button>
      {isExpanded && (
        <div className="mt-4 transition-all">
          {children}
        </div>
      )}
    </GlassCard>
  );
}

// Knight Type for API response
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

// Content Viewer Component
type ContentViewerProps = {
  event: DebateEvent | null;
  sessionId: string;
  knightDetailsMap: Map<string, KnightDetail>;
};

function ContentViewer({ event, sessionId, knightDetailsMap }: ContentViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [event?.id]);

  if (!event) {
    return (
      <GlassCard variant="elevated" className="p-6 flex items-center justify-center text-base-subtext h-[500px] lg:h-[600px]">
        Select an event from the timeline to view its content.
      </GlassCard>
    );
  }

  const eventTypeLabel = event.event_type.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  
  // Parse payload if it's a string, otherwise use as-is
  let payload: Record<string, any> = {};
  if (event.payload) {
    if (typeof event.payload === "string") {
      try {
        payload = JSON.parse(event.payload);
      } catch {
        payload = { content: event.payload };
      }
    } else if (typeof event.payload === "object") {
      payload = event.payload;
    }
  }
  
  // Helper function to safely render markdown content
  const renderMarkdown = (content: any): string => {
    if (!content) return "";
    if (typeof content === "string") return content;
    if (typeof content === "number" || typeof content === "boolean") return String(content);
    return JSON.stringify(content);
  };

  // Get phase label
  const phaseLabel = event.phase 
    ? event.phase.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
    : eventTypeLabel;

  // Simplified content rendering - show main content based on phase
  const renderContent = () => {
    switch (event.phase) {
      case "research":
        return payload.summary ? (
          <div>
            <p className="text-sm font-medium text-base-subtext mb-2">Finding</p>
            <div className="text-base text-base-text leading-relaxed">
              <MarkdownRenderer content={renderMarkdown(payload.summary)} variant="base" />
            </div>
          </div>
        ) : null;
      
      case "opening":
        return (
          <>
            {payload.headline && (
              <div>
                <h3 className="text-lg font-semibold text-gold-500 mb-2">{String(payload.headline)}</h3>
              </div>
            )}
            {payload.body && (
              <div>
                <div className="text-base text-base-text leading-relaxed">
                  <MarkdownRenderer content={renderMarkdown(payload.body)} variant="base" />
                </div>
              </div>
            )}
          </>
        );
      
      case "cross_examination":
        return payload.contestation ? (
          <div>
            <p className="text-sm font-medium text-base-subtext mb-2">Contestation</p>
            <div className="text-base text-base-text leading-relaxed">
              <MarkdownRenderer content={renderMarkdown(payload.contestation)} variant="rebuttal" />
            </div>
          </div>
        ) : null;
      
      case "rebuttals":
        return payload.body ? (
          <div>
            <div className="text-base text-base-text leading-relaxed">
              <MarkdownRenderer content={renderMarkdown(payload.body)} variant="rebuttal" />
            </div>
          </div>
        ) : null;
      
      case "convergence":
        return payload.summary ? (
          <div>
            <p className="text-sm font-medium text-base-subtext mb-2">Summary</p>
            <div className="text-base text-base-text leading-relaxed">
              <MarkdownRenderer content={renderMarkdown(payload.summary)} variant="judge" />
            </div>
          </div>
        ) : null;
      
      case "translator":
        return payload.translated_content ? (
          <div>
            <div className="text-base text-base-text leading-relaxed">
              <MarkdownRenderer content={renderMarkdown(payload.translated_content)} variant="base" />
            </div>
          </div>
        ) : null;
      
      case "red_team":
        return payload.critique ? (
          <div>
            <p className="text-sm font-medium text-base-subtext mb-2">Critique</p>
            <div className="text-base text-base-text leading-relaxed">
              <MarkdownRenderer content={renderMarkdown(payload.critique)} variant="red" />
            </div>
          </div>
        ) : null;
      
      default:
        // Fallback: show any content field
        if (payload.content) {
          return (
            <div>
              <div className="text-base text-base-text leading-relaxed">
                <MarkdownRenderer content={renderMarkdown(payload.content)} variant="base" />
              </div>
            </div>
          );
        }
        return <p className="text-sm text-base-subtext">No content available for this event.</p>;
    }
  };

  // Get knight display info
  const knightId = payload.knight_id ? String(payload.knight_id) : null;
  const targetKnightId = payload.target_knight_id ? String(payload.target_knight_id) : null;
  const knightDetails = knightId ? knightDetailsMap.get(knightId) : null;
  const knightDisplayName = knightDetails?.role || knightId;
  const targetKnightDetails = targetKnightId ? knightDetailsMap.get(targetKnightId) : null;
  const targetKnightDisplayName = targetKnightDetails?.role || targetKnightId;
  const isCrossExamination = event.phase === "cross_examination";

  return (
    <GlassCard variant="elevated" className="p-0 overflow-hidden flex flex-col max-h-[500px] lg:max-h-[600px]">
      <div ref={scrollRef} className="p-6 overflow-y-auto custom-scrollbar flex-1">
        <div className="space-y-6">
          {/* Event Header */}
          <div className="border-b border-base-divider pb-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-semibold text-base-text">{phaseLabel}</h2>
                <p className="mt-1 text-sm text-base-subtext">
                  Phase: {event.phase} • Sequence: {event.sequence_id}
                </p>
                {event.created_at && (
                  <p className="mt-1 text-xs text-base-subtext">
                    {new Date(event.created_at).toLocaleString()}
                  </p>
                )}
              </div>
              {/* Knight Display */}
              {knightId && (
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    {isCrossExamination && targetKnightId ? (
                      <>
                        <span className="font-mono text-xs text-base-text bg-base-bg/60 border border-base-divider rounded-full px-3 py-1.5">
                          {knightDisplayName}
                        </span>
                        <ArrowRight className="h-4 w-4 text-base-subtext flex-shrink-0" />
                        <span className="font-mono text-xs text-base-text bg-base-bg/60 border border-base-divider rounded-full px-3 py-1.5">
                          {targetKnightDisplayName}
                        </span>
                      </>
                    ) : (
                      <span className="font-mono text-xs text-base-text bg-base-bg/60 border border-base-divider rounded-full px-3 py-1.5">
                        {knightDisplayName}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Phase-based Content */}
          <div className="space-y-4 prose prose-invert max-w-none">
            {renderContent()}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}

