"use client";

import React, { use, useState, useMemo, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueries } from "@tanstack/react-query";
import { FileDown, AlertCircle, ArrowLeft, ArrowRight, ChevronDown, ChevronUp, ChevronUp as ArrowUp, ChevronDown as ArrowDown, Users } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/components/providers/AuthProvider";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import { MarkdownRenderer } from "@/components/common/MarkdownRenderer";
import { apiFetch, getApiBaseUrl } from "@/lib/api/client";
import { logError, logDebug, getErrorMessage } from "@/lib/utils/errorHandler";
import { InlineLoading } from "@/components/ui/InlineLoading";
import { QualityBadge } from "@/features/sessions/components/QualityBadge";
import { SessionHeader } from "@/features/sessions/components/SessionHeader";
import { ParticipantDrawer } from "@/features/sessions/components/ParticipantDrawer";
import { EventTimeline } from "@/features/sessions/components/EventTimeline";
import { Breadcrumbs } from "@/components/navigation/Breadcrumbs";
import { ShareableDebateResult } from "@/components/debate/ShareableDebateResult";


type PageProps = {
  params: Promise<{ id: string }>;
  // Explicitly handle searchParams to prevent serialization errors
  // If searchParams is needed in the future, unwrap it with use() in client components
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

export default function SessionOutputPage({ params, searchParams: _searchParams }: PageProps) {
  const { id } = use(params);
  const { user, token, status: authStatus } = useAuth();
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isDownloadingArtifact, setIsDownloadingArtifact] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [translatorExpanded, setTranslatorExpanded] = useState(false);
  const [redTeamExpanded, setRedTeamExpanded] = useState(false);
  const [convergenceExpanded, setConvergenceExpanded] = useState(false);
  const [idleExpanded, setIdleExpanded] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [hoveredKnightId, setHoveredKnightId] = useState<string | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const hasInitializedSelection = useRef(false);

  const jsonQuery = useQuery({
    queryKey: ["session-json", id],
    queryFn: async () => {
      const response = await fetch(`/api/artifacts/${id}/json`, {
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
    enabled: true, // Always enabled in community edition
  });

  // Fetch session data to check if PDF exists and get quality info
  const sessionQuery = useQuery({
    queryKey: ["session", id],
    queryFn: async () => {
      // Ensure we have a JWT token (exchange UUID if needed)
      let jwtToken = token;
      if (token) {
        const { ensureJWTToken } = await import("@/lib/auth/client-token");
        jwtToken = await ensureJWTToken(token);
        if (!jwtToken) {
          throw new Error("Failed to authenticate. Please try signing in again.");
        }
      }
      
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/sessions`, {
        credentials: "include",
        headers: {
          ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
        },
      });
      if (!response.ok) {
        throw new Error("Failed to load session");
      }
      const sessions = (await response.json()) as Array<{
        id: string;
        session_id: string;
        artifact_uri: string | null;
        audit_log_uri: string | null;
        quality_score: number | null;
        quality_tier: string | null;
        quality_breakdown: Record<string, number> | null;
      }>;
      const session = sessions.find((s) => s.session_id === id);
      return session;
    },
    enabled: true, // Always enabled in community edition
  });

  // Check if PDF exists (artifact_uri exists and ends with .pdf)
  const hasPdf = Boolean(sessionQuery.data?.artifact_uri && sessionQuery.data.artifact_uri.endsWith(".pdf"));

  // Memoize events array sorted by sequence_id to ensure chronological order
  const events = useMemo(() => {
    const eventsArray = jsonQuery.data?.events ?? [];
    // Sort by sequence_id to ensure events are in chronological order
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
      // Only include knights from research phase
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

  // Fetch knight details for all participants (for timeline display and drawer)
  const knightQueries = useQueries({
    queries: participantIds.map((knightId) => ({
      queryKey: ["knight", knightId] as const,
      queryFn: async () => {
        return apiFetch<KnightDetail>(`/knights/${encodeURIComponent(knightId)}`, {
          token: token ?? undefined,
          credentials: "include",
        });
      },
      enabled: !!knightId, // Fetch for all participants
    })),
  });

  // Create a map of knight_id to knight details for quick lookup
  const knightDetailsMap = useMemo(() => {
    const map = new Map<string, KnightDetail>();
    participantIds.forEach((knightId, idx) => {
      const query = knightQueries[idx];
      if (query?.data) {
        map.set(knightId, query.data);
      }
    });
    return map;
  }, [participantIds, knightQueries]);

  // Create a map of knight_id to knight details
  const participants: ParticipantInfo[] = useMemo(() => {
    return participantIds.map((knightId, idx) => {
      const query = knightQueries[idx];
      return {
        id: knightId,
        name: query?.data?.name || knightId, // Fallback to ID if name not loaded yet
        data: query?.data,
        isLoading: query?.isLoading || false,
      };
    });
  }, [participantIds, knightQueries]);

  // Fetch assigned models from database for this session
  const assignedModelsQuery = useQuery({
    queryKey: ["assigned-models", id],
    queryFn: async () => {
      const response = await fetch(`/api/debate/session/${id}/assigned-models`, {
        credentials: "include",
      });
      if (!response.ok) {
        if (response.status === 404) {
          return {}; // Session not found or no assigned models
        }
        throw new Error("Failed to load assigned models");
      }
      return (await response.json()) as Record<string, { model_id?: string; provider?: string; model_name?: string }>;
    },
    enabled: !!id && !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Convert assigned models to Map for ParticipantDrawer
  const assignedModels = useMemo(() => {
    const map = new Map<string, { provider?: string; model?: string; role?: string }>();
    if (assignedModelsQuery.data) {
      Object.entries(assignedModelsQuery.data).forEach(([knightId, modelInfo]) => {
        map.set(knightId, {
          provider: modelInfo.provider,
          model: modelInfo.model_name || modelInfo.model_id,
        });
      });
    }
    return map;
  }, [assignedModelsQuery.data]);
  
  // Scroll timeline to top on initial load (no auto-selection)
  useEffect(() => {
    if (events.length > 0 && !hasInitializedSelection.current) {
      hasInitializedSelection.current = true;
      
      // Scroll timeline to top to show first event
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

  // Calculate duration from timeline events (first event to last event)
  // Uses the same logic as sessions page
  const duration = useMemo(() => {
    if (events.length === 0) return null;
    
    // Events are already sorted by sequence_id, so first is earliest, last is latest
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
      // Scroll within the timeline container only
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
      // Scroll within the timeline container only
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

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input/textarea
      if (
        (e.target as HTMLElement).tagName === "INPUT" ||
        (e.target as HTMLElement).tagName === "TEXTAREA"
      ) {
        return;
      }

      if (e.key === "ArrowUp" || e.key === "k" || e.key === "K") {
        e.preventDefault();
        if (currentIndex > 0) {
          goToPrevious();
        }
      } else if (e.key === "ArrowDown" || e.key === "j" || e.key === "J") {
        e.preventDefault();
        if (currentIndex < events.length - 1) {
          goToNext();
        }
      }
    };

    window.addEventListener("keydown", handleKeyPress);
    return () => window.removeEventListener("keydown", handleKeyPress);
  }, [currentIndex, events.length, goToPrevious, goToNext]);

  const handleDownloadArtifact = async () => {
    setIsDownloadingArtifact(true);
    try {
      // Ensure we have a JWT token (exchange UUID if needed)
      let jwtToken = token;
      if (token) {
        const { ensureJWTToken } = await import("@/lib/auth/client-token");
        jwtToken = await ensureJWTToken(token);
        if (!jwtToken) {
          throw new Error("Failed to authenticate. Please try signing in again.");
        }
      }
      
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/artifacts/${id}/download`, {
        method: "GET",
        credentials: "include",
        headers: {
          ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to download artifact");
      }

      // Download the JSON file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${id}_debate_output.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      logError(error, "SessionOutput: downloadArtifact");
      alert(`Failed to download artifact: ${getErrorMessage(error)}`);
    } finally {
      setIsDownloadingArtifact(false);
    }
  };

  const handleDownloadPdf = async () => {
    setIsDownloadingPdf(true);
    try {
      // Use Next.js API route which handles token exchange server-side
      const response = await fetch(`/api/artifacts/${id}/pdf`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to download PDF");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `executive_brief_${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      logError(error, "SessionOutput: downloadPDF");
      alert(`Failed to download PDF: ${getErrorMessage(error)}`);
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  if (jsonQuery.isLoading) {
    return (
      <div className="container-box flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <InlineLoading size="lg" />
          <p className="text-sm text-base-subtext">Loading session output...</p>
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
          { label: "Decision Log", href: "/app/sessions" },
          { label: `Session ${id.slice(0, 8)}...`, href: `/app/sessions/${id}` },
          { label: "Output", href: `/app/sessions/${id}/output` },
        ]}
        rightContent={
          <ShareableDebateResult
            sessionId={id}
            topic={metadata?.topic || undefined}
            recommendation={(() => {
              if (!convergenceEvent) return undefined;
              let payload: Record<string, any> = {};
              if (convergenceEvent.payload) {
                if (typeof convergenceEvent.payload === "string") {
                  try {
                    payload = JSON.parse(convergenceEvent.payload);
                  } catch {
                    return undefined;
                  }
                } else if (typeof convergenceEvent.payload === "object") {
                  payload = convergenceEvent.payload;
                }
              }
              return payload.summary || payload.recommendation || payload.content || undefined;
            })()}
            participants={participants.map((p) => ({
              name: p.name,
            }))}
            variant="compact"
          />
        }
      />
      {/* Header */}
      <SessionHeader
        metadata={metadata}
        strategicQuestion={strategicQuestion}
        duration={duration}
        participants={participants}
        hasPdf={hasPdf}
        isDownloadingPdf={isDownloadingPdf}
        onDownloadPdf={handleDownloadPdf}
        onOpenDrawer={() => setDrawerOpen(!drawerOpen)}
        qualityTier={sessionQuery.data?.quality_tier}
        qualityScore={sessionQuery.data?.quality_score}
        qualityBreakdown={sessionQuery.data?.quality_breakdown}
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
                // Parse payload if it's a string, otherwise use as-is
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

                // Extract moderator_brief from payload
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

                // Helper to format key names (camelCase to Title Case)
                const formatKey = (key: string): string => {
                  return key
                    .replace(/([A-Z])/g, " $1")
                    .replace(/^./, (str) => str.toUpperCase())
                    .trim();
                };

                return (
                  <>
                    {Object.entries(moderatorBrief).map(([key, value]) => {
                      // Skip recommendedExperts key
                      if (key === "recommendedExperts" || key === "recommended_experts") {
                        return null;
                      }

                      // Skip strategicQuestion key (moved to header)
                      if (key === "strategicQuestion" || key === "strategic_question") {
                        return null;
                      }

                      // Skip topicSummary key
                      if (key === "topicSummary" || key === "topic_summary") {
                        return null;
                      }

                      // Handle keyAssumptions as a list
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

                      // Handle other fields
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
                // Parse payload if it's a string, otherwise use as-is
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
              {translatorOutput.payload.translated_content && (
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
              {redTeamCritique.payload.critique && (
                <div>
                  <div className="text-base text-base-text leading-relaxed">
                    <MarkdownRenderer content={String(redTeamCritique.payload.critique || "")} variant="red" />
                  </div>
                </div>
              )}
              {redTeamCritique.payload.flaws_identified && redTeamCritique.payload.flaws_identified.length > 0 && (
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
              {redTeamCritique.payload.severity && (
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

        {/* Right Column: Content Viewer - Always visible, shows placeholder when nothing selected */}
        <div className="w-full">
          <ContentViewer 
            event={selectedEvent} 
            sessionId={id}
            onDownloadArtifact={handleDownloadArtifact}
            isDownloadingArtifact={isDownloadingArtifact}
            hasPdf={hasPdf}
            onDownloadPdf={handleDownloadPdf}
            isDownloadingPdf={isDownloadingPdf}
            knightDetailsMap={knightDetailsMap}
          />
        </div>
      </div>

      {/* Participants Drawer */}
      <ParticipantDrawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        participants={participants}
        hoveredKnightId={hoveredKnightId}
        onHoverKnight={setHoveredKnightId}
        assignedModels={assignedModels}
      />
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
          "flex w-full items-center justify-between text-left cursor-pointer",
          isExpanded && "pb-4 border-b border-base-border/30"
        )}
      >
        <p className="text-xs uppercase ">{title}</p>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-gold-400/60 transition-transform flex-shrink-0" />
        ) : (
          <ChevronDown className="h-4 w-4 text-gold-400/60 transition-transform flex-shrink-0" />
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

type ParticipantInfo = {
  id: string;
  name: string;
  data: KnightDetail | undefined;
  isLoading: boolean;
};



// Content Viewer Component
type ContentViewerProps = {
  event: DebateEvent | null;
  sessionId: string;
  onDownloadArtifact?: () => void;
  isDownloadingArtifact?: boolean;
  hasPdf?: boolean;
  onDownloadPdf?: () => void;
  isDownloadingPdf?: boolean;
  knightDetailsMap: Map<string, KnightDetail>;
};

function ContentViewer({ event, sessionId, onDownloadArtifact, isDownloadingArtifact, hasPdf, onDownloadPdf, isDownloadingPdf, knightDetailsMap }: ContentViewerProps) {
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
        // If parsing fails, treat as plain text
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

  // Helper to parse citations - handles both array and semicolon-separated strings
  const parseCitations = (citation: any): Array<{ text: string; url?: string }> => {
    if (!citation) return [];
    
    if (Array.isArray(citation)) {
      return citation.map((item) => {
        if (typeof item === "string") {
          // Check if it's a URL
          if (item.startsWith("http://") || item.startsWith("https://")) {
            return { text: item, url: item };
          }
          return { text: item };
        }
        // If it's an object with url/title
        if (typeof item === "object" && item !== null) {
          return {
            text: item.title || item.text || item.url || String(item),
            url: item.url,
          };
        }
        return { text: String(item) };
      });
    }
    
    if (typeof citation === "string") {
      // Handle semicolon-separated or comma-separated strings
      const items = citation.split(/[;,]/).map((s) => s.trim()).filter(Boolean);
      return items.map((item) => {
        if (item.startsWith("http://") || item.startsWith("https://")) {
          return { text: item, url: item };
        }
        return { text: item };
      });
    }
    
    return [];
  };

  // Helper to extract all URLs and citations from payload for references section
  // Directly accesses JSON keys from the payload - no assumptions about structure
  const extractReferences = (phase: string, payload: Record<string, any>): Array<{ text: string; url?: string }> => {
    const references: Array<{ text: string; url?: string }> = [];
    const seenUrls = new Set<string>(); // Avoid duplicates
    
    // Helper to add reference if not duplicate
    const addReference = (ref: { text: string; url?: string }) => {
      const key = ref.url || ref.text;
      if (!seenUrls.has(key)) {
        seenUrls.add(key);
        references.push(ref);
      }
    };
    
    // Directly check for common citation/reference keys in the JSON payload
    // Check multiple possible key names to handle different naming conventions
    const citationKeys = ['citation', 'citations', 'references', 'reference', 'sources', 'source', 'urls', 'url', 'links', 'link'];
    
    for (const key of citationKeys) {
      if (payload[key]) {
        const parsed = parseCitations(payload[key]);
        parsed.forEach(ref => addReference(ref));
      }
    }
    
    // For research phase, handle 'source' specifically (might be array of objects)
    if (phase === "research" && payload.source) {
      if (Array.isArray(payload.source)) {
        payload.source.forEach((source: any) => {
          if (typeof source === "object" && source !== null) {
            // Handle object with url/title structure
            if (source.url) {
              addReference({
                text: source.title || source.name || source.url,
                url: source.url,
              });
            } else if (source.title || source.name) {
              // Object without URL - just text
              addReference({
                text: source.title || source.name || String(source),
              });
            }
          } else if (typeof source === "string") {
            // String source - check if it's a URL
            if (source.startsWith("http://") || source.startsWith("https://")) {
              addReference({ text: source, url: source });
            } else {
              addReference({ text: source });
            }
          }
        });
      } else if (typeof payload.source === "string") {
        // Single string source
        if (payload.source.startsWith("http://") || payload.source.startsWith("https://")) {
          addReference({ text: payload.source, url: payload.source });
        } else {
          addReference({ text: payload.source });
        }
      }
    }
    
    // Fallback: Scan all string values in payload for URLs (in case citations are in unexpected keys)
    const scanForUrls = (obj: any, depth = 0): void => {
      if (depth > 3) return; // Limit recursion depth
      
      if (typeof obj === "string") {
        // Check if string contains URLs
        const urlPattern = /https?:\/\/[^\s\)]+/g;
        const matches = obj.match(urlPattern);
        if (matches) {
          matches.forEach(url => {
            addReference({ text: url, url: url });
          });
        }
      } else if (Array.isArray(obj)) {
        obj.forEach(item => scanForUrls(item, depth + 1));
      } else if (typeof obj === "object" && obj !== null) {
        Object.values(obj).forEach(value => scanForUrls(value, depth + 1));
      }
    };
    
    // Only scan if we haven't found any references yet
    if (references.length === 0) {
      scanForUrls(payload);
    }
    
    return references;
  };

  // Phase-based content renderer
  const renderPhaseContent = (phase: string, payload: Record<string, any>) => {
    // Debug: Log payload structure to help identify citation keys
    logDebug(`[Phase: ${phase}] Payload keys:`, Object.keys(payload));
    logDebug(`[Phase: ${phase}] Payload:`, payload);
    
    const references = extractReferences(phase, payload);
    
    switch (phase) {
      case "research": {
        return (
          <>
            {payload.summary && (
              <div>
                <p className="text-sm font-medium text-base-subtext mb-2">Finding</p>
                <div className="text-base text-base-text leading-relaxed">
                  <MarkdownRenderer content={renderMarkdown(payload.summary)} variant="base" />
                </div>
              </div>
            )}
            {payload.source && Array.isArray(payload.source) && payload.source.length > 0 && (
              <div>
                <p className="text-sm font-medium text-base-subtext mb-2">Sources</p>
                <div className="space-y-2">
                  {payload.source.map((source: any, idx: number) => {
                    const url = typeof source === "object" ? source.url : (typeof source === "string" && (source.startsWith("http://") || source.startsWith("https://")) ? source : null);
                    const title = typeof source === "object" ? source.title : (url ? url : String(source));
                    return (
                      <div key={idx} className="flex items-start gap-2">
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-sm text-emerald-300 hover:text-emerald-200 transition underline"
                          >
                            {title}
                          </a>
                        ) : (
                          <span className="text-sm text-base-text">{title}</span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            {references.length > 0 && (
              <div className="mt-4 pt-4 border-t border-base-divider">
                <div className="rounded-lg bg-base-bg/80 border border-base-divider/40 p-3">
                  <p className="text-xs font-medium text-base-subtext mb-2 uppercase tracking-[0.2em]">References</p>
                  <div className="space-y-1">
                    {references.map((ref, idx) => (
                      <div key={idx} className="text-xs text-base-subtext">
                        {ref.url ? (
                          <a
                            href={ref.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-300 hover:text-emerald-200 transition underline"
                          >
                            {ref.text}
                          </a>
                        ) : (
                          <span>{ref.text}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        );
      }
      
      case "opening": {
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
            {references.length > 0 && (
              <div className="mt-4 pt-4 border-t border-base-divider">
                <div className="rounded-lg bg-base-bg/80 border border-base-divider/40 p-3">
                  <p className="text-xs font-medium text-base-subtext mb-2 uppercase tracking-[0.2em]">Citations</p>
                  <div className="space-y-1">
                    {references.map((ref, idx) => (
                      <div key={idx} className="text-xs text-base-subtext">
                        {ref.url ? (
                          <a
                            href={ref.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-300 hover:text-emerald-200 transition underline break-all"
                          >
                            {ref.text}
                          </a>
                        ) : (
                          <span>{ref.text}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        );
      }
      
      case "cross_examination": {
        return (
          <>
            {payload.contestation && (
              <div>
                <p className="text-sm font-medium text-base-subtext mb-2">Contestation</p>
                <div className="text-base text-base-text leading-relaxed">
                  <MarkdownRenderer content={renderMarkdown(payload.contestation)} variant="rebuttal" />
                </div>
              </div>
            )}
            {references.length > 0 && (
              <div className="mt-4 pt-4 border-t border-base-divider">
                <div className="rounded-lg bg-base-bg/80 border border-base-divider/40 p-3">
                  <p className="text-xs font-medium text-base-subtext mb-2 uppercase tracking-[0.2em]">Citations</p>
                  <div className="space-y-1">
                    {references.map((ref, idx) => (
                      <div key={idx} className="text-xs text-base-subtext">
                        {ref.url ? (
                          <a
                            href={ref.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-300 hover:text-emerald-200 transition underline break-all"
                          >
                            {ref.text}
                          </a>
                        ) : (
                          <span>{ref.text}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        );
      }
      
      case "rebuttals": {
        return (
          <>
            {payload.target_claim_id && (
              <div>
                <p className="text-gold-500">{String(payload.target_claim_id)}</p>
              </div>
            )}
            {payload.body && (
              <div>
                <div className="text-base text-base-text leading-relaxed">
                  <MarkdownRenderer content={renderMarkdown(payload.body)} variant="rebuttal" />
                </div>
              </div>
            )}
            {references.length > 0 && (
              <div className="mt-4 pt-4 border-t border-base-divider">
                <div className="rounded-lg bg-base-bg/80 border border-base-divider/40 p-3">
                  <p className="text-xs font-medium text-base-subtext mb-2 uppercase tracking-[0.2em]">Citations</p>
                  <div className="space-y-1">
                    {references.map((ref, idx) => (
                      <div key={idx} className="text-xs text-base-subtext">
                        {ref.url ? (
                          <a
                            href={ref.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-emerald-300 hover:text-emerald-200 transition underline break-all"
                          >
                            {ref.text}
                          </a>
                        ) : (
                          <span>{ref.text}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        );
      }
      
      case "red_team": {
        return (
          <>
            {payload.critique && (
              <div>
                <p className="text-sm font-medium text-base-subtext mb-2">Critique</p>
                <div className="text-base text-base-text leading-relaxed">
                  <MarkdownRenderer content={renderMarkdown(payload.critique)} variant="red" />
                </div>
              </div>
            )}
            {payload.flaws_identified && Array.isArray(payload.flaws_identified) && payload.flaws_identified.length > 0 && (
              <div>
                <p className="text-sm font-medium text-rose-600 mb-2">Flaws Identified</p>
                <div className="rounded-lg bg-rose-950/40 border border-rose-900/30 p-3">
                  <ol className="list-decimal list-inside space-y-1 text-sm text-base-text ml-4">
                    {payload.flaws_identified.map((flaw: string, idx: number) => (
                      <li key={idx} className="leading-relaxed">{flaw}</li>
                    ))}
                  </ol>
                </div>
              </div>
            )}
          </>
        );
      }
      
      case "convergence": {
        return (
          <>
            {payload.summary && (
              <div>
                <p className="text-sm font-medium text-base-subtext mb-2">Summary</p>
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
      }
      
      case "translator": {
        return (
          <>
            {payload.translated_content && (
              <div>
                <div className="text-base text-base-text leading-relaxed">
                  <MarkdownRenderer content={renderMarkdown(payload.translated_content)} variant="base" />
                </div>
              </div>
            )}
            {payload.readability_score !== undefined && (
              <div>
                <p className="text-sm font-medium text-base-subtext mb-1">Readability Score</p>
                <p className="text-base text-base-text">{typeof payload.readability_score === "number" ? payload.readability_score.toFixed(2) : String(payload.readability_score)}</p>
              </div>
            )}
          </>
        );
      }
      
      case "artifact_ready":
      case "atrifact_ready": { // Handle typo variant
        return (
          <>
            <div className="space-y-3">
              <p className="text-sm font-medium text-base-subtext mb-2">Artifact Ready</p>
              <p className="text-sm text-base-text">
                The final report with recommendations is ready for download.
              </p>
              <div className="flex flex-col gap-2">
                {hasPdf && onDownloadPdf && (
                  <button
                    onClick={onDownloadPdf}
                    disabled={isDownloadingPdf}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-gold-500/40 bg-[linear-gradient(135deg,rgba(217,164,65,0.32),rgba(6,24,35,0.88))] px-4 py-2 text-sm font-bold text-gold-100 hover:bg-[linear-gradient(135deg,rgba(217,164,65,0.4),rgba(6,24,35,0.88))] transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDownloadingPdf ? (
                      <>
                        <InlineLoading size="sm" />
                        Downloading PDF...
                      </>
                    ) : (
                      <>
                        <FileDown className="h-4 w-4" />
                        Download PDF
                      </>
                    )}
                  </button>
                )}
                {payload.artifact_url && onDownloadArtifact && (
                  <button
                    onClick={onDownloadArtifact}
                    disabled={isDownloadingArtifact}
                    className="inline-flex items-center justify-center gap-2 rounded-full border border-base-divider bg-base-bg/40 px-4 py-2 text-sm font-medium text-base-text hover:bg-base-bg/60 transition disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDownloadingArtifact ? (
                      <>
                        <InlineLoading size="sm" />
                        Downloading JSON...
                      </>
                    ) : (
                      <>
                        <FileDown className="h-4 w-4" />
                        Download JSON
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>
          </>
        );
      }
      
      case "closed": {
        return (
          <>
            {payload.ruling && (
              <div>
                <p className="text-sm font-medium text-base-subtext mb-2">Ruling</p>
                <div className="text-base text-base-text leading-relaxed">
                  <MarkdownRenderer content={renderMarkdown(payload.ruling)} variant="judge" />
                </div>
              </div>
            )}
            {payload.notes && (
              <div>
                <p className="text-sm font-medium text-base-subtext mb-2">Notes</p>
                <div className="text-base text-base-text leading-relaxed">
                  <MarkdownRenderer content={renderMarkdown(payload.notes)} variant="judge" />
                </div>
              </div>
            )}
          </>
        );
      }
      
      case "idle": {
        // Extract moderator_brief from payload
        const moderatorBrief = payload.moderator_brief || payload.moderatorBrief;
        if (!moderatorBrief || typeof moderatorBrief !== "object") {
          return <p className="text-sm text-base-subtext">No moderator brief available</p>;
        }

        // Helper to format key names (camelCase to Title Case)
        const formatKey = (key: string): string => {
          return key
            .replace(/([A-Z])/g, " $1")
            .replace(/^./, (str) => str.toUpperCase())
            .trim();
        };

        return (
          <>
            {Object.entries(moderatorBrief).map(([key, value]) => {
              // Skip recommendedExperts key
              if (key === "recommendedExperts" || key === "recommended_experts") {
                return null;
              }

              // Skip strategicQuestion key (moved to header)
              if (key === "strategicQuestion" || key === "strategic_question") {
                return null;
              }

              // Skip topicSummary key
              if (key === "topicSummary" || key === "topic_summary") {
                return null;
              }

              // Handle keyAssumptions as a list
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

              // Handle other fields
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
      }
      
      default: {
        // Fallback for unknown phases or event_type-based rendering
        return null;
      }
    }
  };

  // Get phase label
  const phaseLabel = event.phase 
    ? event.phase.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
    : eventTypeLabel;

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
              {/* Knight Display and Confidence - Top Right */}
              <div className="flex flex-col items-end gap-2 flex-shrink-0">
                {/* Knight Display */}
                {(() => {
                  const knightId = payload.knight_id ? String(payload.knight_id) : null;
                  const targetKnightId = payload.target_knight_id ? String(payload.target_knight_id) : null;
                  const isCrossExamination = event.phase === "cross_examination";
                  
                  if (!knightId) return null;
                  
                  const knightDetails = knightDetailsMap.get(knightId);
                  const knightDisplayName = knightDetails?.role || knightId;
                  const targetKnightDetails = targetKnightId ? knightDetailsMap.get(targetKnightId) : null;
                  const targetKnightDisplayName = targetKnightDetails?.role || targetKnightId;
                  
                  return (
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
                  );
                })()}
                
                {/* Confidence Circle - Only for opening phase, positioned below knight ID */}
                {event.phase === "opening" && payload.confidence !== undefined && payload.confidence !== null && (() => {
                  const confidenceValue = typeof payload.confidence === "number" ? payload.confidence : parseFloat(payload.confidence);
                  if (isNaN(confidenceValue)) return null;
                  const confidencePercent = confidenceValue > 1 ? confidenceValue : confidenceValue * 100;
                  const radius = 12;
                  const circumference = 2 * Math.PI * radius;
                  const offset = circumference - (confidencePercent / 100) * circumference;
                  
                  return (
                    <div className="relative w-8 h-8 flex items-center justify-center" title={`Confidence: ${confidencePercent.toFixed(1)}%`}>
                      <svg className="w-8 h-8 transform -rotate-90" viewBox="0 0 28 28">
                        {/* Background circle */}
                        <circle
                          cx="14"
                          cy="14"
                          r={radius}
                          stroke="currentColor"
                          strokeWidth="2"
                          fill="none"
                          className="text-base-divider"
                        />
                        {/* Progress circle */}
                        <circle
                          cx="14"
                          cy="14"
                          r={radius}
                          stroke="currentColor"
                          strokeWidth="2"
                          fill="none"
                          strokeDasharray={circumference}
                          strokeDashoffset={offset}
                          strokeLinecap="round"
                          className="text-teal-400 transition-all duration-300"
                        />
                      </svg>
                      <span className="absolute text-[10px] font-semibold text-teal-400">
                        {Math.round(confidencePercent)}
                      </span>
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>

        {/* Phase-based Content */}
        <div className="space-y-4 prose prose-invert max-w-none">
          {event.phase ? renderPhaseContent(event.phase, payload) : (
            // Fallback to event_type-based rendering for backward compatibility
            <>
              {event.event_type === "POSITION_CARD" && (
                <>
                  {payload.headline && (
                    <div>
                      <h3 className="text-lg font-semibold text-base-text mb-2">{String(payload.headline)}</h3>
                    </div>
                  )}
                  {payload.body ? (
                    <div>
                      <p className="text-sm font-medium text-base-subtext mb-2">Body</p>
                      <div className="text-base text-base-text leading-relaxed">
                        <MarkdownRenderer content={renderMarkdown(payload.body)} variant="base" />
                      </div>
                    </div>
                  ) : payload.content ? (
                    <div>
                      <p className="text-sm font-medium text-base-subtext mb-2">Content</p>
                      <div className="text-base text-base-text leading-relaxed">
                        <MarkdownRenderer content={renderMarkdown(payload.content)} variant="base" />
                      </div>
                    </div>
                  ) : null}
                  {payload.citations && Array.isArray(payload.citations) && payload.citations.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-base-divider">
                      <div className="rounded-lg bg-base-bg/60 p-3">
                        <p className="text-xs font-medium text-base-subtext mb-2 uppercase tracking-[0.2em]">Citations</p>
                        <div className="space-y-1">
                          {payload.citations.map((citation: string, idx: number) => (
                            <div key={idx} className="text-xs text-base-subtext">
                              {citation.startsWith("http://") || citation.startsWith("https://") ? (
                                <a
                                  href={citation}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-emerald-300 hover:text-emerald-200 transition underline"
                                >
                                  {citation}
                                </a>
                              ) : (
                                <span>{citation}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  {payload.confidence !== undefined && (
                    <div>
                      <p className="text-sm font-medium text-base-subtext mb-1">Confidence</p>
                      <p className="text-base text-base-text">{(payload.confidence * 100).toFixed(1)}%</p>
                    </div>
                  )}
                </>
              )}

              {event.event_type === "CHALLENGE" && (
                <>
                  {payload.contestation ? (
                    <div>
                      <p className="text-sm font-medium text-base-subtext mb-2">Contestation</p>
                      <div className="text-base text-base-text leading-relaxed">
                        <MarkdownRenderer content={renderMarkdown(payload.contestation)} variant="rebuttal" />
                      </div>
                    </div>
                  ) : payload.content ? (
                    <div>
                      <p className="text-sm font-medium text-base-subtext mb-2">Content</p>
                      <div className="text-base text-base-text leading-relaxed">
                        <MarkdownRenderer content={renderMarkdown(payload.content)} variant="rebuttal" />
                      </div>
                    </div>
                  ) : null}
                </>
              )}

              {event.event_type === "RESEARCH_RESULT" && (
                <>
                  {payload.query && (
                    <div>
                      <p className="text-sm font-medium text-base-subtext mb-1">Query</p>
                      <p className="text-base text-base-text">{payload.query}</p>
                    </div>
                  )}
                  {payload.summary ? (
                    <div>
                      <p className="text-sm font-medium text-base-subtext mb-2">Summary</p>
                      <div className="text-base text-base-text leading-relaxed">
                        <MarkdownRenderer content={renderMarkdown(payload.summary)} variant="base" />
                      </div>
                    </div>
                  ) : payload.content ? (
                    <div>
                      <p className="text-sm font-medium text-base-subtext mb-2">Content</p>
                      <div className="text-base text-base-text leading-relaxed">
                        <MarkdownRenderer content={renderMarkdown(payload.content)} variant="base" />
                      </div>
                    </div>
                  ) : null}
                  {payload.sources && Array.isArray(payload.sources) && payload.sources.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-base-divider">
                      <div className="rounded-lg bg-base-bg/60 p-3">
                        <p className="text-xs font-medium text-base-subtext mb-2 uppercase tracking-[0.2em]">Sources</p>
                        <div className="space-y-1">
                          {payload.sources.map((source: any, idx: number) => {
                            const url = typeof source === "object" ? source.url : (typeof source === "string" && (source.startsWith("http://") || source.startsWith("https://")) ? source : null);
                            const title = typeof source === "object" ? source.title : (url ? url : String(source));
                            return (
                              <div key={idx} className="text-xs text-base-subtext">
                                {url ? (
                                  <a
                                    href={url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="text-emerald-300 hover:text-emerald-200 transition underline"
                                  >
                                    {title}
                                  </a>
                                ) : (
                                  <span>{title}</span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </>
              )}

              {event.event_type === "CONVERGENCE" && (
                <>
                  {payload.summary ? (
                    <div>
                      <p className="text-sm font-medium text-base-subtext mb-2">Summary</p>
                      <div className="text-base text-base-text leading-relaxed">
                        <MarkdownRenderer content={renderMarkdown(payload.summary)} variant="judge" />
                      </div>
                    </div>
                  ) : payload.content ? (
                    <div>
                      <p className="text-sm font-medium text-base-subtext mb-2">Content</p>
                      <div className="text-base text-base-text leading-relaxed">
                        <MarkdownRenderer content={renderMarkdown(payload.content)} variant="judge" />
                      </div>
                    </div>
                  ) : null}
                  {payload.confidence !== undefined && (
                    <div>
                      <p className="text-sm font-medium text-base-subtext mb-1">Confidence</p>
                      <p className="text-base font-semibold text-base-text">{(payload.confidence * 100).toFixed(1)}%</p>
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
              )}

              {event.event_type === "MODERATOR_RULING" && (
                <>
                  {payload.ruling ? (
                    <div>
                      <p className="text-sm font-medium text-base-subtext mb-2">Ruling</p>
                      <div className="text-base text-base-text leading-relaxed">
                        <MarkdownRenderer content={renderMarkdown(payload.ruling)} variant="judge" />
                      </div>
                    </div>
                  ) : payload.content ? (
                    <div>
                      <p className="text-sm font-medium text-base-subtext mb-2">Content</p>
                      <div className="text-base text-base-text leading-relaxed">
                        <MarkdownRenderer content={renderMarkdown(payload.content)} variant="judge" />
                      </div>
                    </div>
                  ) : null}
                  {payload.notes && (
                    <div>
                      <p className="text-sm font-medium text-base-subtext mb-2">Notes</p>
                      <div className="text-base text-base-text leading-relaxed">
                        <MarkdownRenderer content={renderMarkdown(payload.notes)} variant="judge" />
                      </div>
                    </div>
                  )}
                </>
              )}

              {event.event_type === "TRANSLATOR_OUTPUT" && (
                <>
                  {payload.translated_content ? (
                    <div>
                      <p className="text-sm font-medium text-base-subtext mb-2">Translated Content</p>
                      <div className="text-base text-base-text leading-relaxed">
                        <MarkdownRenderer content={renderMarkdown(payload.translated_content)} variant="base" />
                      </div>
                    </div>
                  ) : payload.content ? (
                    <div>
                      <p className="text-sm font-medium text-base-subtext mb-2">Content</p>
                      <div className="text-base text-base-text leading-relaxed">
                        <MarkdownRenderer content={renderMarkdown(payload.content)} variant="base" />
                      </div>
                    </div>
                  ) : null}
                  {payload.target_audience && (
                    <div>
                      <p className="text-sm font-medium text-base-subtext mb-1">Target Audience</p>
                      <p className="text-base text-base-text">{payload.target_audience}</p>
                    </div>
                  )}
                </>
              )}

              {event.event_type === "RED_TEAM_CRITIQUE" && (
                <>
                  {payload.critique ? (
                    <div>
                      <p className="text-sm font-medium text-base-subtext mb-2">Critique</p>
                      <div className="text-base text-base-text leading-relaxed">
                        <MarkdownRenderer content={renderMarkdown(payload.critique)} variant="red" />
                      </div>
                    </div>
                  ) : payload.content ? (
                    <div>
                      <p className="text-sm font-medium text-base-subtext mb-2">Content</p>
                      <div className="text-base text-base-text leading-relaxed">
                        <MarkdownRenderer content={renderMarkdown(payload.content)} variant="red" />
                      </div>
                    </div>
                  ) : null}
                  {payload.flaws_identified && Array.isArray(payload.flaws_identified) && payload.flaws_identified.length > 0 && (
                    <div>
                      <p className="text-sm font-medium text-rose-600 mb-2">Flaws Identified</p>
                      <div className="rounded-lg bg-rose-950/40 border border-rose-900/30 p-3">
                        <ol className="list-decimal list-inside space-y-1 text-sm text-base-text ml-4">
                          {payload.flaws_identified.map((flaw: string, idx: number) => (
                            <li key={idx} className="leading-relaxed">{flaw}</li>
                          ))}
                        </ol>
                      </div>
                    </div>
                  )}
                  {payload.severity && (
                    <div>
                      <p className="text-sm font-medium text-base-subtext mb-2">Severity</p>
                      <span className={cn(
                        "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium uppercase tracking-[0.2em]",
                        payload.severity === "high" && "border border-rose-500/40 bg-rose-500/10 text-rose-300",
                        payload.severity === "medium" && "border border-amber-500/40 bg-amber-500/10 text-amber-300",
                        payload.severity === "low" && "border border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                      )}>
                        {payload.severity}
                      </span>
                    </div>
                  )}
                </>
              )}

              {/* Default: Show readable content for other event types */}
              {!["POSITION_CARD", "CHALLENGE", "RESEARCH_RESULT", "CONVERGENCE", "MODERATOR_RULING", "TRANSLATOR_OUTPUT", "RED_TEAM_CRITIQUE"].includes(event.event_type) && (
                <div>
                  {(() => {
                    const textFields = ["body", "content", "text", "summary", "message", "detail", "description", "output"];
                    let readable = { title: "Content", content: "" };
                    for (const field of textFields) {
                      if (payload[field] && typeof payload[field] === "string") {
                        readable = { title: field.charAt(0).toUpperCase() + field.slice(1), content: payload[field] };
                        break;
                      }
                    }
                    if (!readable.content) {
                      readable.content = JSON.stringify(payload, null, 2);
                    }
                    const isJsonString = readable.content.trim().startsWith("{") || readable.content.trim().startsWith("[");
                    
                    return (
                      <>
                        <p className="text-sm font-medium text-base-subtext mb-2">{readable.title}</p>
                        {isJsonString ? (
                          <pre className="text-xs text-base-text bg-base-bg/40 p-4 rounded-lg overflow-auto">
                            {readable.content}
                          </pre>
                        ) : (
                          <div className="text-base text-base-text leading-relaxed">
                            <MarkdownRenderer content={readable.content} variant="base" />
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}
            </>
          )}
        </div>
      </div>
      </div>
      
    </GlassCard>
  );
}


