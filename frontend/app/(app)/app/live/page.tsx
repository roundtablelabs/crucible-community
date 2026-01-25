"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { InlineLoading } from "@/components/ui/InlineLoading";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { Users, Play, ArrowRight, Zap } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/providers/AuthProvider";
import { apiGet } from "@/lib/api/client";
import type { SessionListItem } from "@/features/boardroom/types";
import { logDebug, logWarning, logError, getErrorMessage, getActionableErrorMessage } from "@/lib/utils/errorHandler";
import { ErrorDisplay } from "@/components/common/ErrorDisplay";
import { RetryButton } from "@/components/ui/RetryButton";
import {
  LIVE_SESSION_STATUS_KEY,
  LIVE_SESSION_TRANSFER_KEY,
  type LiveSessionTransfer,
} from "@/features/rounds/liveSessionTransfer";
import {
  LIVE_SESSION_TRANSFER_VERSION,
} from "@/features/rounds/storageKeys";
import {
  readSessionCache,
  removeSessionCache,
} from "@/lib/storage/sessionCache";
import type { Stage, StageMeta } from "@/features/rounds/types";

import {
  LiveSessionHeader,
} from "./components/LiveSessionLayout";
import { DebateStream } from "@/features/sessions/components/DebateStream";
import type { DebateEvent } from "@/features/sessions/hooks/useDebateEvents";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { buildParticipantsFromKnights, collectEvidenceUrls, MAX_LOG_LINES, parseJson } from "./helpers";
import type { DebateRunStatus, DebateSessionApiResult } from "./types";
// Import client-only version to prevent bundling pg
import { getAuthToken } from "@/lib/auth/get-token.client";

const STAGE_SEQUENCE: Stage[] = [
  "RESEARCH",
  "OPENING",
  "CROSS_EXAMINATION",
  "RED_TEAM",
  "CONVERGENCE",
  "TRANSLATOR",
  "ARTIFACT_READY",
];

const BASE_STAGE_META: Record<Stage, Omit<StageMeta, "status">> = {
  PREP: { stage: "PREP", label: "Brief", summary: "Moderator aligns the room", exitCriteria: [] },
  RESEARCH: {
    stage: "RESEARCH",
    label: "Research",
    summary: "Knights gathering context",
    exitCriteria: ["Queries executed", "Sources cited"],
  },
  OPENING: {
    stage: "OPENING",
    label: "Opening",
    summary: "Initial position statements",
    exitCriteria: ["Positions stated", "Claims logged"],
  },
  CLAIMS: { stage: "CLAIMS", label: "Claims", summary: "Detailed claim extraction", exitCriteria: [] },
  CROSS_EXAMINATION: {
    stage: "CROSS_EXAMINATION",
    label: "Cross-Exam",
    summary: "Challenges and rebuttals",
    exitCriteria: ["Challenges issued", "Defenses logged"],
  },
  RED_TEAM: {
    stage: "RED_TEAM",
    label: "Red Team",
    summary: "Adversarial critique",
    exitCriteria: ["Flaws identified", "Severity assessed"],
  },
  CONVERGENCE: {
    stage: "CONVERGENCE",
    label: "Convergence",
    summary: "Synthesizing the verdict",
    exitCriteria: ["Consensus reached", "Dissent noted"],
  },
  TRANSLATOR: {
    stage: "TRANSLATOR",
    label: "Translation",
    summary: "Executive summary generation",
    exitCriteria: ["Translation complete", "Tone adjusted"],
  },
  ARTIFACT_READY: {
    stage: "ARTIFACT_READY",
    label: "Artifact",
    summary: "Final decision brief ready",
    exitCriteria: ["PDF generated", "Download available"],
  },
  WRAP: { stage: "WRAP", label: "Wrap", summary: "Session archived", exitCriteria: [] },
};

function buildStageMeta(currentStage: Stage): StageMeta[] {
  const currentIndex = STAGE_SEQUENCE.indexOf(currentStage);
  return STAGE_SEQUENCE.map((stage, index) => {
    const base = BASE_STAGE_META[stage];
    let status: StageMeta["status"] = "later";
    if (index < currentIndex) {
      status = "done";
    } else if (index === currentIndex) {
      // If we're at ARTIFACT_READY, mark it as done since artifact is ready
      // This shows completion immediately when artifact is ready, even before status becomes "completed"
      status = (stage === "ARTIFACT_READY") ? "done" : "current";
    } else if (index === currentIndex + 1) {
      status = "up-next";
    }
    return {
      ...base,
      status,
    };
  });
}

function determineCurrentStage(
  status: DebateRunStatus,
  result: DebateSessionApiResult | null,
  liveStage: Stage | null,
  logs: string[],
  events: any[] = [], // Add events
): Stage {
  // Prefer phase-based stage detection (most accurate)
  if (events.length > 0) {
    const lastEvent = events[events.length - 1];
    // Use phase field if available (from StreamEnvelope)
    if (lastEvent.phase) {
      const phaseMap: Record<string, Stage> = {
        "research": "RESEARCH",
        "opening": "OPENING",
        "claims": "CLAIMS",
        "cross_examination": "CROSS_EXAMINATION",
        "challenges": "CROSS_EXAMINATION",
        "rebuttals": "CROSS_EXAMINATION",
        "red_team": "RED_TEAM",
        "convergence": "CONVERGENCE",
        "translator": "TRANSLATOR",
        "artifact_ready": "ARTIFACT_READY",
        "closed": "WRAP",
      };
      const stage = phaseMap[lastEvent.phase.toLowerCase()];
      if (stage) {
        // If artifact is ready and we have a result or status is completed, transition to WRAP
        if (stage === "ARTIFACT_READY" && (status === "completed" || result?.final_summary)) {
          return "WRAP";
        }
        return stage;
      }
    }
    // Fallback to round-based detection
    if (lastEvent.round === "research") return "RESEARCH";
    if (lastEvent.round === "position") return "OPENING";
    if (lastEvent.round === "challenge") return "CROSS_EXAMINATION";
    if (lastEvent.round === "red_team") return "RED_TEAM";
    if (lastEvent.round === "convergence") return "CONVERGENCE";
    if (lastEvent.round === "translator") return "TRANSLATOR";
    if (lastEvent.round === "artifact") {
      // If artifact is ready and we have a result or status is completed, transition to WRAP
      if (status === "completed" || result?.final_summary) {
        return "WRAP";
      }
      return "ARTIFACT_READY";
    }
  }

  if (liveStage) {
    return liveStage;
  }
  const inferredFromLogs = inferStageFromLogs(logs);
  if (inferredFromLogs) {
    return inferredFromLogs;
  }
  if (status === "completed" && result?.final_summary) {
    return "WRAP";
  }
  if (status === "running") {
    return result?.transcript?.length ? "CROSS_EXAMINATION" : "OPENING";
  }
  if (status === "error") {
    return "CONVERGENCE";
  }
  return "PREP";
}

function inferStageFromLogs(logs: string[]): Stage | null {
  if (!logs.length) return null;
  // Scan all logs (newest first) and pick the furthest stage we see.
  const text = logs
    .slice()
    .reverse()
    .map((line) => line.toLowerCase());

  const stagesInOrder: Array<{ key: Stage; match: (t: string) => boolean }> = [
    { key: "WRAP", match: (t) => t.includes("wrap phase") || t.includes("archiving") || t.includes("pdf") },
    { key: "ARTIFACT_READY", match: (t) => t.includes("artifact ready") || t.includes("download") },
    { key: "TRANSLATOR", match: (t) => t.includes("translator") || t.includes("executive summary") },
    { key: "CONVERGENCE", match: (t) => t.includes("convergence") || t.includes("verdict") || t.includes("final summary") },
    { key: "RED_TEAM", match: (t) => t.includes("red team") || t.includes("adversarial") },
    { key: "CROSS_EXAMINATION", match: (t) => t.includes("cross-examination") || t.includes("challenge") || t.includes("cross-talk") },
    { key: "CLAIMS", match: (t) => t.includes("claims") || t.includes("extraction") },
    { key: "OPENING", match: (t) => t.includes("opening") || t.includes("statement phase") || t.includes("round 1") },
    { key: "RESEARCH", match: (t) => t.includes("research") || t.includes("gathering context") },
    { key: "PREP", match: (t) => t.includes("moderator brief") || t.includes("briefing") || t.includes("intake") },
  ];

  for (const line of text) {
    const match = stagesInOrder.find((entry) => entry.match(line));
    if (match) {
      return match.key;
    }
  }
  return null;
}

// Derive stage from debate events
function inferStageFromEvents(events: DebateEvent[]): Stage | null {
  if (!events.length) return null;
  
  // Map event phases/rounds to Stage enum
  const phaseToStage: Record<string, Stage> = {
    "research": "RESEARCH",
    "opening": "OPENING",
    "cross_examination": "CROSS_EXAMINATION",
    "challenges": "CROSS_EXAMINATION",
    "rebuttals": "CROSS_EXAMINATION",
    "red_team": "RED_TEAM",
    "convergence": "CONVERGENCE",
    "translator": "TRANSLATOR",
    "artifact_ready": "ARTIFACT_READY",
    "closed": "WRAP",
  };
  
  const roundToStage: Record<string, Stage> = {
    "research": "RESEARCH",
    "position": "OPENING",
    "challenge": "CROSS_EXAMINATION",
    "rebuttals": "CROSS_EXAMINATION",
    "red_team": "RED_TEAM",
    "convergence": "CONVERGENCE",
    "translator": "TRANSLATOR",
    "artifact": "ARTIFACT_READY",
    "closed": "WRAP",
  };
  
  // Find the latest event and map its phase/round to stage
  const latestEvent = events[events.length - 1];
  if (latestEvent.phase && phaseToStage[latestEvent.phase]) {
    return phaseToStage[latestEvent.phase];
  }
  if (latestEvent.round && roundToStage[latestEvent.round]) {
    return roundToStage[latestEvent.round];
  }
  
  return null;
}

// Derive logs from debate events (convert events to log strings)
function deriveLogsFromEvents(events: DebateEvent[]): string[] {
  return events.map((event) => {
    const phase = event.phase || event.round || "unknown";
    const knight = event.knight || "System";
    const headline = event.headline || "Event";
    return `[${phase}] ${knight}: ${headline}`;
  });
}

const DEFAULT_TRANSFER: LiveSessionTransfer = {
  id: "demo-live-session",
  createdAt: new Date().toISOString(),
  summary: "Live Session",
  conversationTranscript: [].join("\n"),
  moderatorBrief: {
    topicSummary: "Live Session",
    strategicQuestion: "Moderator brief in progress",
    keyAssumptions: [],
    recommendedExperts: [],
    missionStatement: "Waiting for session to start...",
  },
};

function readTransferFromStorage(): LiveSessionTransfer | null {
  return readSessionCache<LiveSessionTransfer>(LIVE_SESSION_TRANSFER_KEY, {
    version: LIVE_SESSION_TRANSFER_VERSION,
  });
}

function LiveSessionContent() {
  const searchParams = useSearchParams();
  const { user, token, status: authStatus, requireAuth } = useAuth();
  const querySessionId = searchParams?.get("session");
  const mockMode = searchParams?.get("mock") === "true" || (typeof window !== "undefined" && window.localStorage.getItem("live_mock_mode") === "true");
  const [handoff, setHandoff] = useState<LiveSessionTransfer | null>(null);
  const [sessionStatus, setSessionStatus] = useState<DebateRunStatus>("idle");
  const [sessionStage, setSessionStage] = useState<Stage | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [sessionLogs, setSessionLogs] = useState<string[]>([]);
  const [remoteResult, setRemoteResult] = useState<DebateSessionApiResult | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [fetchedSessionData, setFetchedSessionData] = useState<{ moderatorBrief?: any; topic?: string } | null>(null);
  const [localTopic, setLocalTopic] = useState<string | null>(null);
  const [sessionIsComplete, setSessionIsComplete] = useState(false);
  const [isLoadingSessionData, setIsLoadingSessionData] = useState(true);
  const [requiresAuth, setRequiresAuth] = useState(false);
  // Track SSE connection status from DebateStream
  const [streamIsActive, setStreamIsActive] = useState(false);
  // Track events from DebateStream for state derivation
  const [debateEvents, setDebateEvents] = useState<DebateEvent[]>([]);
  // Debounce guard to prevent rapid poll() calls (defense-in-depth)
  const lastPollTimeRef = useRef<number>(0);
  const POLL_DEBOUNCE_MS = 3000; // Don't poll more than once every 3 seconds
  
  // Track previous event count for reconnection detection
  const previousEventCountRef = useRef<number>(0);
  
  // Track if we've validated the session from localStorage
  const [validatedSessionId, setValidatedSessionId] = useState<string | null>(null);
  const [isValidatingSession, setIsValidatingSession] = useState(false);
  
  // Prevent page jump on navigation - ensure page starts at top
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Prevent browser scroll restoration
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = "manual";
      }
      // Scroll to top immediately on mount
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  }, []); // Run once on mount
  
  // Stabilize session ID with localStorage backup
  // Only use localStorage sessionId if it's been validated or if we have handoff/query param
  const activeSessionId = useMemo(() => {
    // Priority: handoff > query param > validated localStorage
    if (handoff?.sessionId) {
      console.log("[LiveSession] Using sessionId from handoff:", handoff.sessionId);
      return handoff.sessionId;
    }
    if (querySessionId) {
      console.log("[LiveSession] Using sessionId from query param:", querySessionId);
      return querySessionId;
    }
    // Only use localStorage if it's been validated
    if (validatedSessionId) {
      console.log("[LiveSession] Using sessionId from validated localStorage:", validatedSessionId);
    }
    return validatedSessionId;
  }, [handoff?.sessionId, querySessionId, validatedSessionId]);
  
  // Validate session from localStorage on mount (only if no handoff or query param)
  useEffect(() => {
    // Skip validation if we have handoff or query param
    if (handoff?.sessionId || querySessionId) {
      return;
    }
    
    // Skip if already validating or validated
    if (isValidatingSession || validatedSessionId) {
      return;
    }
    
    // Skip if not authenticated
    if (authStatus !== "ready" || !user) {
      return;
    }
    
    const storedSessionId = typeof window !== "undefined" ? localStorage.getItem(`active_session_id`) : null;
    if (!storedSessionId) {
      return;
    }
    
    // Validate the session exists
    setIsValidatingSession(true);
    const validateSession = async () => {
      try {
        const token = await getAuthToken();
        if (!token) {
          // No token, clear localStorage
          if (typeof window !== "undefined") {
            localStorage.removeItem(`active_session_id`);
          }
          setIsValidatingSession(false);
          return;
        }
        
        const response = await fetch(`/api/sessions/external/${storedSessionId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          credentials: "include",
        });
        
        if (response.ok) {
          // Session exists, use it
          setValidatedSessionId(storedSessionId);
        } else if (response.status === 404) {
          // Session doesn't exist - but it might just be starting or temporarily unavailable
          // Don't clear localStorage immediately - mark as unvalidated and let user retry
          logDebug(`[live] Session ${storedSessionId} returned 404, marking as unvalidated (will keep in localStorage for retry)`);
          // Keep in localStorage but don't set as validated
          setValidatedSessionId(null);
        } else if (response.status === 401) {
          // Authentication error - don't clear session, just mark as needing auth
          logWarning(`[live] Authentication error validating session ${storedSessionId}, keeping in localStorage but requiring re-auth`);
          setValidatedSessionId(null);
        } else {
          // Other error (500, etc.) - keep in localStorage for retry
          logWarning(`[live] Failed to validate session ${storedSessionId}: ${response.status}, keeping in localStorage for retry`);
          setValidatedSessionId(null);
        }
      } catch (error) {
        logError(error, `[live] Error validating session from localStorage`);
        // On error, keep in localStorage for retry - don't clear immediately
        // Network errors or temporary issues shouldn't lose the session reference
        logWarning(`[live] Keeping session ${storedSessionId} in localStorage despite validation error`);
        setValidatedSessionId(null);
      } finally {
        setIsValidatingSession(false);
      }
    };
    
    validateSession();
  }, [handoff?.sessionId, querySessionId, authStatus, user, isValidatingSession, validatedSessionId]);
  
  // Store sessionId in localStorage when it changes (only if from handoff or query param)
  useEffect(() => {
    if (activeSessionId && typeof window !== "undefined") {
      // Only store if it came from handoff or query param (not from localStorage)
      if (handoff?.sessionId || querySessionId) {
        localStorage.setItem(`active_session_id`, activeSessionId);
        // Also update validatedSessionId so we don't re-validate
        if (!validatedSessionId || validatedSessionId !== activeSessionId) {
          setValidatedSessionId(activeSessionId);
        }
      }
    }
  }, [activeSessionId, handoff?.sessionId, querySessionId, validatedSessionId]);

  // Get topic from sessionStorage (backend has Redis/DB fallbacks for persistence)
  useEffect(() => {
    if (activeSessionId && typeof window !== "undefined") {
      const stored = sessionStorage.getItem(`session_topic_${activeSessionId}`);
      if (stored) {
        setLocalTopic(stored);
      }
    }
  }, [activeSessionId]);
  const previewTransfer = handoff ?? DEFAULT_TRANSFER;
  // Track in-flight requests to prevent duplicate simultaneous requests
  const fetchRequestRef = useRef<AbortController | null>(null);
  // Track polling interval for strategic question retry
  const strategicQuestionPollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // NOTE: useDebateEvents is now called only in DebateStream component to avoid duplicate SSE connections

  // Helper function to handle 401 errors with token refresh and retry
  const fetchWithAuthRetry = useCallback(async (
    url: string,
    options: RequestInit = {},
    retryCount = 0
  ): Promise<Response> => {
    const response = await fetch(url, options);
    
    // Handle 401 errors with token refresh
    if (response.status === 401 && retryCount === 0) {
      const newToken = await getAuthToken();
      
      if (newToken) {
        // Retry with new token
        const newHeaders = new Headers(options.headers);
        newHeaders.set('Authorization', `Bearer ${newToken}`);
        return fetchWithAuthRetry(url, { ...options, headers: newHeaders }, retryCount + 1);
      } else {
        // Token refresh failed, need re-authentication
        logWarning(`[live] Token refresh failed, requiring re-authentication`);
        setRequiresAuth(true);
        setSessionError("Your session expired. Please sign in to continue viewing your debate.");
        // Don't clear session state - preserve it for after re-auth
        return response; // Return the 401 response
      }
    }
    
    return response;
  }, []);

  const persistLiveSessionStatus = useCallback((status: DebateRunStatus | null) => {
    if (typeof window === "undefined") {
      return;
    }
    if (status) {
      window.localStorage.setItem(
        LIVE_SESSION_STATUS_KEY,
        JSON.stringify({ status, updatedAt: Date.now() }),
      );
    } else {
      window.localStorage.removeItem(LIVE_SESSION_STATUS_KEY);
    }
    window.dispatchEvent(new CustomEvent<DebateRunStatus | null>("live-session-status", { detail: status }));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const handleUnload = () => persistLiveSessionStatus(null);
    window.addEventListener("beforeunload", handleUnload);
    window.addEventListener("pagehide", handleUnload);
    return () => {
      window.removeEventListener("beforeunload", handleUnload);
      window.removeEventListener("pagehide", handleUnload);
      persistLiveSessionStatus(null);
    };
  }, [persistLiveSessionStatus]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const load = () => {
      setHandoff(readTransferFromStorage());
    };
    load();
    const handleStorage = (event: StorageEvent) => {
      if (event.storageArea === window.sessionStorage && event.key === LIVE_SESSION_TRANSFER_KEY) {
        load();
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Track previous session ID to prevent unnecessary state clearing
  const prevSessionIdRef = useRef<string | null>(null);
  
  useEffect(() => {
    // Only clear state if session ID actually changed to a different session
    // Don't clear if switching from handoff to query param for same session
    if (prevSessionIdRef.current && prevSessionIdRef.current !== activeSessionId && activeSessionId) {
      // Session ID changed to a different session - ensure cleanup happens before new connection
      // The DebateStream component will handle connection cleanup via useDebateEvents
      // But we should clear state immediately to prevent stale data
      setRemoteResult(null);
      setSessionLogs([]);
      setSessionError(null);
      setFetchedSessionData(null);
      setSessionIsComplete(false);
      setSessionStatus("idle");
      setSessionStage(null);
      setRequiresAuth(false);
      // Clear debate events to prevent stale event data
      setDebateEvents([]);
    }
    
    prevSessionIdRef.current = activeSessionId;
    
    // Cleanup polling interval when session changes
    if (prevSessionIdRef.current !== activeSessionId && strategicQuestionPollIntervalRef.current) {
      clearInterval(strategicQuestionPollIntervalRef.current);
      strategicQuestionPollIntervalRef.current = null;
    }
    
    if (!activeSessionId) {
      persistLiveSessionStatus(null);
      // Clear localStorage when no session
      if (typeof window !== "undefined") {
        localStorage.removeItem(`active_session_id`);
      }
      // Clear validated session ID
      setValidatedSessionId(null);
    }
  }, [activeSessionId, persistLiveSessionStatus]);

    // Fetch session metadata when using query parameter (if no handoff exists)
    // Also check if session is complete to skip SSE
    // Only refetch when activeSessionId or handoff changes - NOT when authStatus/user changes
    useEffect(() => {
      if (!activeSessionId) {
        return;
      }

      // Don't fetch if user is not authenticated (will show sign-in prompt instead)
      // Check auth status but don't include it in dependencies to prevent refetch on auth changes
      if (authStatus !== "ready" || !user) {
        setIsLoadingSessionData(false);
        return;
      }

      // Cancel any in-flight request to prevent duplicate requests
      if (fetchRequestRef.current) {
        fetchRequestRef.current.abort();
      }

      const abortController = new AbortController();
      fetchRequestRef.current = abortController;

      const fetchSessionData = async () => {
        setIsLoadingSessionData(true);
        try {
          // Fetch from backend API to get topic, topic_summary, and strategic_question
          const backendResponse = await fetchWithAuthRetry(`/api/sessions/external/${activeSessionId}`, {
            signal: abortController.signal,
            credentials: "include",
          });
        let topicFromBackend: string | null = null;
        let topicSummaryFromBackend: string | null = null;
        let strategicQuestionFromBackend: string | null = null;
        
        // Handle 401 errors (already handled by fetchWithAuthRetry, but check status)
        if (backendResponse.status === 401) {
          // Authentication error - fetchWithAuthRetry should have handled it
          // But if we get here, token refresh failed
          logWarning(`[live] Authentication failed after token refresh attempt for backend API`);
          // Don't clear session state, just return
          return;
        }
        
        if (backendResponse.ok) {
          const backendData = await backendResponse.json();
          topicFromBackend = backendData.topic || null;
          topicSummaryFromBackend = backendData.topic_summary || null;
          strategicQuestionFromBackend = backendData.strategic_question || null;
          
          // Store topic, topicSummary, and strategicQuestion from backend if available
          // This ensures the title and subtitle show even if debate store doesn't have the session yet
          if (topicFromBackend || topicSummaryFromBackend || strategicQuestionFromBackend) {
            setFetchedSessionData((prev) => {
              // If we have topicSummary or strategicQuestion from backend, create/update moderatorBrief
              // Always create a moderatorBrief object if we have any of these fields
              const moderatorBrief = (topicSummaryFromBackend || strategicQuestionFromBackend)
                ? { 
                    ...prev?.moderatorBrief, 
                    ...(topicSummaryFromBackend && { topicSummary: topicSummaryFromBackend }),
                    ...(strategicQuestionFromBackend && { strategicQuestion: strategicQuestionFromBackend }),
                  }
                : prev?.moderatorBrief;
              
              // Stop polling if we now have the strategic question
              if (moderatorBrief?.strategicQuestion && strategicQuestionPollIntervalRef.current) {
                clearInterval(strategicQuestionPollIntervalRef.current);
                strategicQuestionPollIntervalRef.current = null;
              }
              
              return {
                moderatorBrief: moderatorBrief || undefined,
                topic: topicFromBackend || prev?.topic,
              };
            });
          }
        }
        
        // Also fetch from debate session store for moderator brief and topic
        // Only fetch if we have the correct session ID
        const response = await fetchWithAuthRetry(`/api/debate/session/${activeSessionId}`, {
          signal: abortController.signal,
          credentials: "include",
        });
        if (response.ok) {
          const data = await response.json();
          
          // Verify the session ID matches (defensive check)
          if (data.sessionId && data.sessionId !== activeSessionId) {
            logWarning(`[live] Session ID mismatch: expected ${activeSessionId}, got ${data.sessionId}`);
            return; // Don't use data from wrong session
          }
          
          // Check if session is complete
          if (data.status === "completed") {
            setSessionIsComplete(true);
            setSessionStatus("completed");
            if (data.result) {
              setRemoteResult(data.result);
            }
          }
          
          // Fetch moderator brief and topic if no handoff exists
          // Prioritize moderator brief as it contains strategicQuestion
          // Merge with existing fetchedSessionData to preserve data from backend API (especially strategicQuestion)
          if (!handoff) {
            setFetchedSessionData((prev) => {
              // Preserve strategicQuestion from backend API if it exists
              const mergedModeratorBrief = data.moderatorBrief 
                ? {
                    ...data.moderatorBrief,
                    // Preserve strategicQuestion from backend API if debate store doesn't have it
                    strategicQuestion: data.moderatorBrief.strategicQuestion || prev?.moderatorBrief?.strategicQuestion,
                    // Preserve topicSummary from backend API if debate store doesn't have it
                    topicSummary: data.moderatorBrief.topicSummary || prev?.moderatorBrief?.topicSummary,
                  }
                : prev?.moderatorBrief || undefined;
              
              // Stop polling if we now have the strategic question
              if (mergedModeratorBrief?.strategicQuestion && strategicQuestionPollIntervalRef.current) {
                clearInterval(strategicQuestionPollIntervalRef.current);
                strategicQuestionPollIntervalRef.current = null;
              }
              
              return {
                moderatorBrief: mergedModeratorBrief,
                topic: data.topic || prev?.topic || undefined,
              };
            });
            
            // Store topic in sessionStorage so useDebateEvents can use it
            // Backend has Redis/DB fallbacks for persistence across sessions
            if (data.topic && typeof window !== "undefined") {
              sessionStorage.setItem(`session_topic_${activeSessionId}`, data.topic);
            }
          }
        } else if (response.status === 401) {
          // Authentication error - already handled by fetchWithAuthRetry
          // But if we get here, token refresh failed
          logWarning(`[live] Authentication failed after token refresh attempt`);
        } else if (response.status === 404) {
          // Session not found in debate store - this is OK if it's a new session
          // The session might not be created in the debate store yet
        }
        
        // If strategicQuestion is still missing after both fetches,
        // start polling for it. This handles cases where the session hasn't started yet
        // and the SESSION_INITIALIZATION event doesn't exist yet.
        if (!strategicQuestionFromBackend) {
          // Clear any existing polling interval
          if (strategicQuestionPollIntervalRef.current) {
            clearInterval(strategicQuestionPollIntervalRef.current);
            strategicQuestionPollIntervalRef.current = null;
          }
          
          // Start polling every 2 seconds for strategic question
          let pollCount = 0;
          const maxPolls = 30; // Poll for up to 60 seconds (2s * 30)
          
          strategicQuestionPollIntervalRef.current = setInterval(async () => {
            pollCount++;
            
            // Check if we already have the strategic question (from state update)
            // Use a function to get the latest state
            setFetchedSessionData((prev) => {
              if (prev?.moderatorBrief?.strategicQuestion) {
                // We have it now, stop polling
                if (strategicQuestionPollIntervalRef.current) {
                  clearInterval(strategicQuestionPollIntervalRef.current);
                  strategicQuestionPollIntervalRef.current = null;
                }
                return prev; // No change needed
              }
              return prev;
            });
            
            // Stop polling if we've exceeded max attempts
            if (pollCount >= maxPolls) {
              if (strategicQuestionPollIntervalRef.current) {
                clearInterval(strategicQuestionPollIntervalRef.current);
                strategicQuestionPollIntervalRef.current = null;
              }
              logWarning(`[live] Stopped polling for strategic question after ${maxPolls} attempts`);
              return;
            }
            
            try {
              const retryResponse = await fetchWithAuthRetry(`/api/sessions/external/${activeSessionId}`, {
                credentials: "include",
              });
              
              if (retryResponse.ok) {
                const retryData = await retryResponse.json();
                if (retryData.strategic_question) {
                  setFetchedSessionData((prev) => ({
                    moderatorBrief: {
                      ...prev?.moderatorBrief,
                      strategicQuestion: retryData.strategic_question,
                      ...(retryData.topic_summary && { topicSummary: retryData.topic_summary }),
                    },
                    topic: retryData.topic || prev?.topic,
                  }));
                  
                  // Stop polling once we have it
                  if (strategicQuestionPollIntervalRef.current) {
                    clearInterval(strategicQuestionPollIntervalRef.current);
                    strategicQuestionPollIntervalRef.current = null;
                  }
                }
              } else if (retryResponse.status === 401) {
                // Authentication required - stop polling
                logWarning(`[live] Authentication required, stopping strategic question polling`);
                if (strategicQuestionPollIntervalRef.current) {
                  clearInterval(strategicQuestionPollIntervalRef.current);
                  strategicQuestionPollIntervalRef.current = null;
                }
              }
            } catch (retryError) {
              // Only log non-network errors
              if (!(retryError instanceof TypeError && retryError.message.includes("fetch")) && 
                  retryError instanceof Error && retryError.name !== "AbortError") {
                logWarning(`[live] Polling fetch failed: ${retryError.message}`);
              }
            }
          }, 2000); // Poll every 2 seconds
        }
      } catch (error) {
        // Ignore abort errors (expected when cancelling duplicate requests)
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        logError(error, "live: Failed to fetch session data");
        } finally {
          if (!abortController.signal.aborted) {
            setIsLoadingSessionData(false);
          }
        }
      };

      fetchSessionData();

      // Cleanup: abort request if component unmounts or dependencies change
      return () => {
        if (fetchRequestRef.current === abortController) {
          abortController.abort();
          fetchRequestRef.current = null;
        }
        // Also cleanup polling interval
        if (strategicQuestionPollIntervalRef.current) {
          clearInterval(strategicQuestionPollIntervalRef.current);
          strategicQuestionPollIntervalRef.current = null;
        }
      };
    }, [activeSessionId, handoff, fetchWithAuthRetry]); // Added fetchWithAuthRetry to dependencies

  // Restore session after successful re-authentication
  useEffect(() => {
    if (authStatus === "ready" && user && requiresAuth && activeSessionId) {
      // User just signed in, restore session
      setRequiresAuth(false);
      setSessionError(null);
      // Session will automatically restore via existing useEffect hooks
    }
  }, [authStatus, user, requiresAuth, activeSessionId]);

  // Detect reconnection: bulk loading of events (significant increase in event count)
  useEffect(() => {
    const currentEventCount = debateEvents.length;
    const previousEventCount = previousEventCountRef.current;
    const eventCountIncrease = currentEventCount - previousEventCount;
    
    // Consider it bulk loading (reconnection) if:
    // 1. Event count increased significantly (more than 3 events at once)
    // 2. Or went from 0 to any number (initial load)
    // 3. Or increased by more than 50% of previous count (if previous count > 0)
    const isBulkLoad = eventCountIncrease > 3 || 
                       (previousEventCount === 0 && currentEventCount > 0) ||
                       (previousEventCount > 0 && eventCountIncrease > previousEventCount * 0.5);
    
    if (isBulkLoad && currentEventCount > 0) {
      // Reconnection detected - force immediate state update
      // Derive stage from events immediately
      const inferredStage = inferStageFromEvents(debateEvents);
      if (inferredStage) {
        setSessionStage(inferredStage);
      }
      
      // Derive logs from events immediately
      const derivedLogs = deriveLogsFromEvents(debateEvents);
      setSessionLogs(derivedLogs);
    }
    
    // Update previous event count for next comparison
    previousEventCountRef.current = currentEventCount;
  }, [debateEvents]);

  // Derive state from events when SSE is active
  useEffect(() => {
    if (streamIsActive && debateEvents.length > 0) {
      // Derive stage from events
      const inferredStage = inferStageFromEvents(debateEvents);
      if (inferredStage) {
        setSessionStage((prev) => {
          if (!prev) {
            return inferredStage;
          }
          const previousIndex = STAGE_SEQUENCE.indexOf(prev);
          const nextIndex = STAGE_SEQUENCE.indexOf(inferredStage);
          // Only update if we've progressed to a later stage
          if (nextIndex > previousIndex) {
            return inferredStage;
          }
          return prev;
        });
      }
      
      // Derive logs from events
      const derivedLogs = deriveLogsFromEvents(debateEvents);
      setSessionLogs(derivedLogs);
    }
  }, [debateEvents, streamIsActive]);
  
  useEffect(() => {
    if (!activeSessionId) {
      return;
    }
    
    // Skip polling if session is completed (no need to poll)
    if (sessionIsComplete) {
      return;
    }
    
    // Skip polling if SSE is actively connected
    // If SSE is active, we get real-time updates via events, so polling is unnecessary
    if (streamIsActive) {
      return;
    }
    
    let cancelled = false;
    let interval: number | null = null;

    const poll = async () => {
      // Debounce guard: prevent rapid successive calls
      const now = Date.now();
      if (now - lastPollTimeRef.current < POLL_DEBOUNCE_MS) {
        return;
      }
      lastPollTimeRef.current = now;
      
      try {
        const response = await fetchWithAuthRetry(`/api/debate/session/${activeSessionId}`, {
          credentials: "include",
        });
        const raw = await response.text();
        if (!response.ok) {
          if (response.status === 401) {
            // Authentication error - already handled by fetchWithAuthRetry
            // Don't throw error, just return to avoid clearing state
            return;
          }
          const errorBody = parseJson<{ error?: string }>(raw);
          throw new Error(errorBody.error ?? "Unable to fetch debate session status.");
        }
        const payload = parseJson<{
          sessionId?: string;
          status?: DebateRunStatus;
          result?: DebateSessionApiResult;
          error?: string;
          logs?: string[];
          stage?: Stage;
        }>(raw);
        if (cancelled) {
          return;
        }
        
        // Verify the session ID matches (defensive check)
        if (payload.sessionId && payload.sessionId !== activeSessionId) {
          logWarning(`[live] Poll: Session ID mismatch: expected ${activeSessionId}, got ${payload.sessionId}`);
          return; // Don't use data from wrong session
        }
        
        // Only update state from polling if SSE is not active
        // When SSE is active, state is derived from events instead
        if (!streamIsActive) {
          if (payload.logs) {
            setSessionLogs(payload.logs);
          }
          const inferredStage = payload.stage ?? inferStageFromLogs(payload.logs ?? []);
          if (inferredStage) {
            setSessionStage((prev) => {
              if (!prev) {
                return inferredStage;
              }
              const previousIndex = STAGE_SEQUENCE.indexOf(prev);
              const nextIndex = STAGE_SEQUENCE.indexOf(inferredStage);
              if (nextIndex > previousIndex) {
                return inferredStage;
              }
              return prev;
            });
          }
        }
        const status = payload.status ?? "running";
        setSessionStatus(status);
        
        // If session is completed, mark it and stop polling
        if (status === "completed") {
          setSessionIsComplete(true);
          persistLiveSessionStatus(null);
          if (payload.result) {
            setRemoteResult(payload.result);
          }
          setSessionError(null);
          if (interval !== null) {
            window.clearInterval(interval);
            interval = null;
          }
          return;
        }
        
        persistLiveSessionStatus(status === "running" ? "running" : null);
        if (status === "error") {
          const errorMessage = payload.error ?? "Debate session failed.";
          const actionableError = getActionableErrorMessage(new Error(errorMessage));
          setSessionError(actionableError.message);
          if (interval !== null) {
            window.clearInterval(interval);
            interval = null;
          }
          return;
        }
        setSessionError(null);
      } catch (error) {
        if (cancelled) {
          return;
        }
        logError(error, "live: Poll error");
        setSessionStatus("error");
        persistLiveSessionStatus(null);
        setSessionError(getErrorMessage(error) || "Unable to reach debate runner.");
        if (interval !== null) {
          window.clearInterval(interval);
          interval = null;
        }
      }
    };

    let optimisticStatus: DebateRunStatus = "running";
    setSessionStatus((prev) => {
      const next = prev === "completed" ? prev : "running";
      optimisticStatus = next;
      return next;
    });
    persistLiveSessionStatus("running");
    
    // Do initial poll first, then start interval only if session is not completed
    poll().then(() => {
      if (cancelled) {
        return;
      }
      // Check if we should start polling - only if status is still running
      // We need to check the current status state, but since setState is async,
      // we'll start the interval and let the poll function handle stopping it
      if (interval === null) {
        interval = window.setInterval(poll, 5000);
      }
    });

    return () => {
      cancelled = true;
      if (interval !== null) {
        window.clearInterval(interval);
        interval = null;
      }
    };
  }, [activeSessionId, persistLiveSessionStatus, sessionIsComplete, streamIsActive]);

  // Use real session data
  const displayStatus = sessionStatus;
  const displayStage = sessionStage;
  const displayLogs = sessionLogs;
  const displayResult = remoteResult;

  // Note: eventBrief extraction removed to avoid duplicate SSE connection
  // DebateStream component handles event-based brief extraction internally

  const brief = useMemo(() => {
    // Priority: handoff > fetchedSessionData > eventBrief > displayResult > previewTransfer > DEFAULT_TRANSFER
    if (handoff?.moderatorBrief) {
      return handoff.moderatorBrief;
    }
    
    // Prioritize fetchedSessionData moderatorBrief, especially for payment redirects
    if (fetchedSessionData?.moderatorBrief) {
      const hasStrategicQuestion = !!fetchedSessionData.moderatorBrief.strategicQuestion;
      
      // If we have strategicQuestion, use it directly
      if (hasStrategicQuestion) {
        return fetchedSessionData.moderatorBrief;
      }
    }
    
    // Check if previewTransfer is the default (no real handoff)
    const isUsingDefault = previewTransfer === DEFAULT_TRANSFER;
    const base = previewTransfer.moderatorBrief ?? DEFAULT_TRANSFER.moderatorBrief!;
    
    if (!displayResult) {
      // Use fetched moderatorBrief topicSummary if available, otherwise fallback to topic
      // topicSummary should be a SHORT summary (1-2 sentences), not the full strategic question
      const topicSummary = fetchedSessionData?.moderatorBrief?.topicSummary 
        || fetchedSessionData?.topic 
        || localTopic
        || base.topicSummary;
      
      // For strategicQuestion, prioritize fetchedSessionData moderatorBrief first
      // This ensures payment redirects get the correct subtitle
      // strategicQuestion should be the actual question, not "Moderator brief in progress"
      // Fallback to topic if strategicQuestion is not available (important for paid sessions that haven't started)
      const strategicQuestion = fetchedSessionData?.moderatorBrief?.strategicQuestion
        || (fetchedSessionData as any)?.strategicQuestion  // Direct property fallback
        || fetchedSessionData?.topic  // Use topic as fallback for strategicQuestion
        || localTopic  // Also try localTopic as fallback
        || (!isUsingDefault ? base.strategicQuestion : null)
        || "Moderator brief in progress";
      
      // Debug logging to help diagnose data issues
      if (strategicQuestion === "Moderator brief in progress") {
        logWarning(`[live] Using default strategicQuestion. fetchedSessionData:`, {
          hasModeratorBrief: !!fetchedSessionData?.moderatorBrief,
          moderatorBriefKeys: fetchedSessionData?.moderatorBrief ? Object.keys(fetchedSessionData.moderatorBrief) : [],
          topicSummary: fetchedSessionData?.moderatorBrief?.topicSummary?.substring(0, 100),
          strategicQuestion: fetchedSessionData?.moderatorBrief?.strategicQuestion?.substring(0, 100),
          hasTopic: !!fetchedSessionData?.topic,
          topic: fetchedSessionData?.topic?.substring(0, 100),
        });
      }
      
      return {
        ...base,
        topicSummary: topicSummary,
        strategicQuestion: strategicQuestion,
      };
    }
    
    // When displayResult exists, prioritize moderatorBrief topicSummary, then displayResult topic, then fetched topic
    const topicSummary = fetchedSessionData?.moderatorBrief?.topicSummary
      ?? displayResult.audit_trail?.topic 
      ?? fetchedSessionData?.topic 
      ?? localTopic
      ?? base.topicSummary;
    
    // For strategicQuestion, prioritize fetchedSessionData moderatorBrief first
    // This ensures payment redirects get the correct subtitle even when displayResult exists
    // Fallback to topic if strategicQuestion is not available (important for paid sessions that haven't started)
    const strategicQuestion = fetchedSessionData?.moderatorBrief?.strategicQuestion
      || (fetchedSessionData as any)?.strategicQuestion  // Direct property fallback
      || fetchedSessionData?.topic  // Use topic as fallback for strategicQuestion
      || localTopic  // Also try localTopic as fallback
      || (!isUsingDefault ? base.strategicQuestion : null)
      || "Moderator brief in progress";
    
    return {
      ...base,
      topicSummary: topicSummary,
      strategicQuestion: strategicQuestion,
    };
  }, [handoff?.moderatorBrief, fetchedSessionData, previewTransfer, displayResult, localTopic]);

  const participants = useMemo(() => {
    if (displayResult?.participants?.length) {
      return displayResult.participants;
    }
    return buildParticipantsFromKnights(previewTransfer.knights);
  }, [displayResult?.participants, previewTransfer.knights]);

  // Fetch assigned models from database for this session
  const assignedModelsQuery = useQuery({
    queryKey: ["assigned-models", activeSessionId],
    queryFn: async () => {
      if (!activeSessionId) return {};
      const response = await fetchWithAuthRetry(`/api/debate/session/${activeSessionId}/assigned-models`, {
        credentials: "include",
      });
      if (!response.ok) {
        if (response.status === 404) {
          return {}; // Session not found or no assigned models
        }
        return {}; // Return empty on error
      }
      return (await response.json()) as Record<string, { model_id?: string; provider?: string; model_name?: string }>;
    },
    enabled: !!activeSessionId && authStatus === "ready" && !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: false,
  });

  // Also extract from trust_report as fallback (maps by role)
  const assignedModelsFromTrustReport = useMemo(() => {
    const map = new Map<string, { provider?: string; model?: string; role?: string }>();
    if (displayResult?.trust_report?.models?.participants) {
      displayResult.trust_report.models.participants.forEach((participant) => {
        // Use role as key (participants are identified by role in trust_report)
        if (participant.role) {
          map.set(participant.role, {
            provider: participant.provider,
            model: participant.model,
            role: participant.role,
          });
        }
      });
    }
    return map;
  }, [displayResult?.trust_report]);

  // Combine assigned models from database (by knight_id) and trust_report (by role)
  // Database takes priority, trust_report is fallback
  const assignedModelsMap = useMemo(() => {
    const map = new Map<string, { provider?: string; model?: string; role?: string }>();
    
    // First, add from database (by knight_id)
    if (assignedModelsQuery.data) {
      Object.entries(assignedModelsQuery.data).forEach(([knightId, modelInfo]) => {
        map.set(knightId, {
          provider: modelInfo.provider,
          model: modelInfo.model_name || modelInfo.model_id,
        });
      });
    }
    
    // Then add from trust_report (by role) for any knights not in database map
    // Match by participant role to knight role
    if (assignedModelsFromTrustReport.size > 0 && participants.length > 0) {
      participants.forEach((participant) => {
        // Check if we already have this knight's assigned model from database
        const knightId = participant.name; // Participants use name as identifier
        if (!map.has(knightId)) {
          // Try to match by role
          const trustModel = assignedModelsFromTrustReport.get(participant.role);
          if (trustModel) {
            map.set(knightId, trustModel);
          }
        }
      });
    }
    
    return map;
  }, [assignedModelsQuery.data, assignedModelsFromTrustReport, participants]);

  const evidenceUrls = useMemo(() => collectEvidenceUrls(displayResult), [displayResult]);
  const toolGate = displayResult?.gates?.tool_call_limit;
  const releaseOk = displayResult?.release_ok ?? displayResult?.audit_trail?.release_ready ?? false;

  const logsPreview = displayLogs.length > 0 ? displayLogs.slice(-MAX_LOG_LINES) : [];
  const logsPlaceholder =
    displayStatus === "running" ? "Streaming output from the debate runner..." : "No output captured yet.";

  const heroTitle = brief.topicSummary || previewTransfer.summary || "Live session";
  const heroQuestion = brief.strategicQuestion || "Moderator brief in progress";

  const handleClearTransfer = useCallback(() => {
    setIsClearing(true);
    removeSessionCache(LIVE_SESSION_TRANSFER_KEY);
    setHandoff(null);
    setTimeout(() => setIsClearing(false), 250);
  }, []);

  const currentStage = useMemo(
    () => determineCurrentStage(displayStatus, displayResult, displayStage, displayLogs, []),
    [displayStatus, displayResult, displayStage, displayLogs],
  );
  const stageMeta = useMemo(() => buildStageMeta(currentStage), [currentStage]);
  const activeStageMeta = stageMeta.find((stage) => stage.stage === currentStage);
  const stageLabel = activeStageMeta?.label ?? currentStage;


  // PDF generation fallback trigger - checks if artifact is ready but PDF doesn't exist
  // NOTE: Backend automatically generates PDF when ARTIFACT_READY phase completes.
  // This frontend trigger is only a fallback if backend generation fails or times out.
  // We wait longer (15 seconds) to give backend time to complete generation first.
  const [pdfGenerationTriggered, setPdfGenerationTriggered] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  
  useEffect(() => {
    // Only trigger if session is complete and we haven't already triggered
    if (displayStatus !== "completed" || !activeSessionId || pdfGenerationTriggered || isGeneratingPdf) {
      return;
    }

    const checkAndGeneratePdf = async () => {
      try {
        setIsGeneratingPdf(true);
        
        // Fetch session data to check if PDF exists
        const sessionRes = await fetchWithAuthRetry(`/api/sessions/external/${activeSessionId}`, {
          credentials: "include",
        });
        if (!sessionRes.ok) {
          if (sessionRes.status === 401) {
            // Auth error - don't try to generate PDF
            logWarning(`[live] Authentication failed for PDF check`);
          } else {
            logWarning(`[live] Failed to fetch session data for PDF check: ${sessionRes.status}`);
          }
          setIsGeneratingPdf(false);
          return;
        }
        
        const sessionData = await sessionRes.json();
        
        // Check if PDF already exists (artifact_uri ends with .pdf)
        const hasPdf = sessionData.artifact_uri && sessionData.artifact_uri.endsWith('.pdf');
        
        if (hasPdf) {
          setPdfGenerationTriggered(true); // Mark as triggered so we don't check again
          setIsGeneratingPdf(false);
          return;
        }

        // PDF doesn't exist after backend should have generated it
        // This is a fallback - backend generation may have failed or timed out
        const generateRes = await fetch(`/api/artifacts/${activeSessionId}/generate-pdf`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ useLLM: true }),
        });

        if (!generateRes.ok) {
          const errorText = await generateRes.text();
          logError(new Error(`PDF generation failed: ${generateRes.status} - ${errorText}`), 
                   `[live] Failed to trigger fallback PDF generation for session ${activeSessionId}`);
        }
        
        setPdfGenerationTriggered(true); // Mark as triggered regardless of success/failure
      } catch (error) {
        logError(error, `[live] Error checking/generating PDF for session ${activeSessionId}`);
      } finally {
        setIsGeneratingPdf(false);
      }
    };

    // Wait 15 seconds to give backend time to complete automatic PDF generation
    // Backend generates PDF automatically when ARTIFACT_READY phase completes
    // This frontend trigger is only a fallback if backend generation fails
    const timeoutId = setTimeout(checkAndGeneratePdf, 15000);
    
    return () => clearTimeout(timeoutId);
  }, [displayStatus, activeSessionId, pdfGenerationTriggered, isGeneratingPdf, fetchWithAuthRetry]);

  // Query sessions when there's no active session ID to show running sessions
  // MUST be called before any early returns to maintain hook order
  const isAuthenticated = authStatus === "ready" && Boolean(user);
  const sessionsQuery = useQuery({
    queryKey: ["sessions", token ?? "guest"],
    queryFn: () => apiGet<SessionListItem[]>("/sessions", { token }),
    enabled: isAuthenticated && !activeSessionId && !isValidatingSession,
    refetchInterval: false, // Don't poll - only fetch once when needed
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchOnMount: true,
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // Keep data in cache for 10 minutes
  });

  const sessions = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data]);
  
  // Mock data for testing the UI (dev mode only - add ?mock=true to URL)
  const mockRunningSessions: SessionListItem[] = useMemo(() => {
    if (!mockMode) return [];
    return [
      {
        id: "mock-1",
        session_id: "mock-session-1",
        question: "Should we expand into the European market in Q2 2024?",
        summary: "Strategic expansion decision",
        status: "running",
        created_at: new Date().toISOString(),
        knight_ids: [],
      },
    ];
  }, [mockMode]);
  
  // Community Edition: No payment_status check needed - all running sessions are valid
  const runningSessions = useMemo(() => {
    if (mockMode) return mockRunningSessions;
    return sessions.filter((s) => s.status === "running");
  }, [sessions, mockMode, mockRunningSessions]);

  // Now we can safely do conditional returns after all hooks
  if (authStatus === "loading") {
    return (
      <div className="container-box flex min-h-[60vh] items-center justify-center">
        <InlineLoading size="md" text="Verifying your workspace…" />
      </div>
    );
  }

  /*
  if (authStatus === "ready" && !user) {
    return (
      <div className="container-box py-16">
        <div className="mx-auto max-w-2xl rounded-3xl border border-base-divider bg-base-panel p-8 text-center shadow-soft">
          <p className="text-xs uppercase tracking-[0.32em] text-base-subtext">Authentication required</p>
          <h1 className="mt-3 text-2xl font-semibold text-base-text">Sign in to use Live Session</h1>
          <p className="mt-3 text-sm text-base-subtext">
            Launchpad handoffs need an authenticated workspace. Sign in with Google, LinkedIn, or Microsoft to continue.
          </p>
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => requireAuth({ reason: "Sign in to use Live Session" })}
              className="inline-flex items-center gap-2 rounded-full border border-navy-900/40 px-5 py-3 text-xs font-semibold uppercase tracking-[0.28em] text-base-text transition hover:border-navy-900"
            >
              Open sign-in
            </button>
          </div>
        </div>
      </div>
    );
  }
  */

  // Show empty state if no session ID
  // Only show waiting screen if we're validating localStorage session (not query param)
  // If we have a query param, we should proceed even if validation is in progress
  // IMPORTANT: Also check if we have running sessions to show - even if validation failed
  if (!activeSessionId) {
    console.log("[LiveSession] No activeSessionId, showing waiting screen", {
      handoff: handoff?.sessionId,
      querySessionId,
      validatedSessionId,
      isValidatingSession,
      runningSessionsCount: runningSessions.length,
    });
    return <WaitingForLiveSession runningSessions={runningSessions} isMockMode={mockMode} />;
  }
  
  // If we're validating localStorage session (no query param), show waiting screen
  if (isValidatingSession && !handoff?.sessionId && !querySessionId) {
    console.log("[LiveSession] Validating localStorage session, showing waiting screen");
    return <WaitingForLiveSession runningSessions={runningSessions} isMockMode={mockMode} />;
  }
  
  console.log("[LiveSession] Rendering debate stream with sessionId:", activeSessionId);


  // Show loading skeleton while fetching session data (only if authenticated)
  // Skip loading screen if we have a query param - we can start the stream immediately
  if (isLoadingSessionData && !handoff && !querySessionId && authStatus === "ready" && user) {
    console.log("[LiveSession] Showing loading screen while fetching session data");
    return (
      <div className="min-h-screen text-white" style={{ scrollBehavior: "smooth" }}>
        <LoadingScreen
          title="Loading session..."
          subtitle="Fetching your debate session data"
        />
      </div>
    );
  }
  
  // If we have a querySessionId, we can proceed even if loading (stream will handle connection)
  if (isLoadingSessionData && querySessionId) {
    console.log("[LiveSession] Has querySessionId, proceeding with stream connection despite loading state");
  }

  // Show re-authentication prompt if token refresh failed
  if (requiresAuth && activeSessionId) {
    return (
      <LoadingScreen
        title="Session Expired"
        subtitle="Your session expired. Please sign in to continue viewing your debate."
        actionButton={{
          label: "Sign In",
          onClick: () => requireAuth({ reason: "Sign in to continue viewing your debate" }),
          showAfterSeconds: 0,
        }}
      />
    );
  }


  return (
    <div 
      className="min-h-screen text-white" 
      style={{ 
        scrollBehavior: "smooth",
        minHeight: "100vh",
        position: "relative"
      }}
    >
      <div className="container-box mx-auto" style={{ minHeight: "100vh" }}>
        {/* Title and Stage at top (full width) */}
        <div className="mb-6 space-y-4">
          <LiveSessionHeader
            status={displayStatus}
            title={heroTitle}
            question={heroQuestion}
            currentStage={currentStage}
            stageLabel={stageLabel}
            error={null}
            isComplete={displayStatus === "completed"}
            sessionId={activeSessionId}
          />
          {sessionError && (
            <ErrorDisplay
              error={sessionError}
              onRetry={async () => {
                setSessionError(null);
                // Trigger a refetch by clearing and re-fetching session data
                if (activeSessionId) {
                  setIsLoadingSessionData(true);
                  // The useEffect will automatically refetch when isLoadingSessionData changes
                  setTimeout(() => setIsLoadingSessionData(false), 100);
                }
              }}
              onDismiss={() => setSessionError(null)}
              variant="inline"
              retryable={true}
            />
          )}
        </div>

        {/* Debate Stream - Full width */}
        <ErrorBoundary resetKeys={[activeSessionId]}>
          <DebateStream 
            sessionId={activeSessionId} 
            brief={brief}
            onAuthRequired={() => {
              setRequiresAuth(true);
              setSessionError("Your session has timed out. Please sign in again to continue.");
            }}
            onStreamStatusChange={(isActive) => {
              setStreamIsActive(isActive);
            }}
            onEventsChange={(events) => {
              setDebateEvents(events);
            }}
          />
        </ErrorBoundary>
      </div>
    </div>
  );
}

export default function LiveSessionPage() {
  return (
    <Suspense fallback={<LoadingScreen title="Loading..." />}>
      <LiveSessionContent />
    </Suspense>
  );
}

function WaitingForLiveSession({ 
  runningSessions = [],
  isMockMode = false 
}: { 
  runningSessions?: SessionListItem[];
  isMockMode?: boolean;
}) {
  const router = useRouter();
  const isDev = process.env.NODE_ENV === "development";
  
  const useCases = [
    { useCase: "Strategic decision-making", crucible: "✓ Best", alternatives: "Good" },
    { useCase: "Regulatory compliance questions", crucible: "✓ Best", alternatives: "Fair-Good" },
    { useCase: "Multi-month implementation projects", crucible: "✓ Hours", alternatives: "Months" },
    { useCase: "Quick answers / brainstorming", crucible: "Fair", alternatives: "✓ Best" },
  ];

  const handleViewLive = (sessionId: string) => {
    if (isMockMode) {
      // In mock mode, just show an alert
      alert(`Mock mode: Would navigate to session ${sessionId}`);
      return;
    }
    router.push(`/app/live?session=${sessionId}`);
  };

  return (
    <div className="flex min-h-screen items-start justify-center px-4 pt-8 pb-12">
      <div className="mx-auto w-full max-w-5xl space-y-12">
        {/* Dev Mode Indicator */}
        {isDev && isMockMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-2 text-center"
          >
            <p className="text-xs text-amber-300">
              🧪 <strong>Mock Mode Active</strong> - Showing test data. Remove <code className="bg-amber-500/20 px-1 rounded">?mock=true</code> from URL to see real data.
            </p>
          </motion.div>
        )}
        
        {/* Running Sessions Banner */}
        {runningSessions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="relative overflow-hidden rounded-[28px] border border-cyan-500/30 bg-gradient-to-br from-[rgba(6,24,35,0.95)] via-[rgba(6,24,35,0.85)] to-[rgba(6,24,35,0.95)] p-8 shadow-lg"
          >
            {/* Animated background gradient */}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-cyan-500/5 via-transparent to-cyan-500/5" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(6,182,212,0.1),transparent_50%)]" />
            
            <div className="relative space-y-4">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1">
                  <motion.div
                    animate={{
                      scale: [1, 1.1, 1],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-500/40 bg-gradient-to-br from-cyan-500/20 to-cyan-500/10 text-cyan-300 shadow-lg shadow-cyan-500/20"
                  >
                    <Zap className="h-7 w-7" aria-hidden="true" />
                  </motion.div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.35em] text-cyan-400">
                        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" aria-hidden="true" />
                        Live Now
                      </span>
                    </div>
                    <h3 className="text-2xl font-bold text-white mb-2">
                      {runningSessions.length > 1 
                        ? `${runningSessions.length} Active Debates`
                        : "Your Debate is Live"}
                    </h3>
                    {runningSessions.length === 1 && runningSessions[0].question ? (
                      <p className="text-base text-cyan-100/90 leading-relaxed line-clamp-2">
                        {runningSessions[0].question}
                      </p>
                    ) : (
                      <p className="text-sm text-base-subtext leading-relaxed">
                        {runningSessions.length > 1 
                          ? "Multiple AI agents are actively debating your strategic questions. Monitor their progress in real-time."
                          : "Your AI Council is actively debating. Watch the discussion unfold in real-time."}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="flex items-center gap-3 pt-2">
                {runningSessions.length > 1 ? (
                  <Link
                    href="/app/sessions"
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-cyan-600 px-6 py-3 text-sm font-semibold uppercase tracking-[0.28em] text-[#071225] transition-all hover:from-cyan-400 hover:to-cyan-500 hover:shadow-lg hover:shadow-cyan-500/30"
                  >
                    View All Sessions
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleViewLive(runningSessions[0].session_id)}
                    aria-label={`View live session: ${runningSessions[0].question || "Untitled Debate"}`}
                    className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-500 to-cyan-600 px-6 py-3 text-sm font-semibold uppercase tracking-[0.28em] text-[#071225] transition-all hover:from-cyan-400 hover:to-cyan-500 hover:shadow-lg hover:shadow-cyan-500/30"
                  >
                    <Play className="h-4 w-4" aria-hidden="true" />
                    Watch Live Debate
                  </button>
                )}
                <Link
                  href="/app/launchpad"
                  className="inline-flex items-center gap-2 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-5 py-3 text-sm font-semibold uppercase tracking-[0.28em] text-cyan-300 transition hover:bg-cyan-500/20 hover:border-cyan-500/60"
                >
                  Start New Session
                </Link>
              </div>
            </div>
          </motion.div>
        )}

        {/* Main Empty State - Only show when there are no running sessions */}
        {runningSessions.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="flex flex-col items-center justify-center gap-8 rounded-3xl border border-base-divider bg-base-panel/50 backdrop-blur-sm p-12 text-center shadow-soft"
          >
            <motion.div
              animate={{
                scale: [1, 1.05, 1],
              }}
              transition={{
                duration: 3,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="flex h-24 w-24 items-center justify-center rounded-2xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/10 via-transparent to-transparent"
            >
              <Users className="h-12 w-12 text-cyan-400/80" />
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.1, duration: 0.5 }}
              className="space-y-3"
            >
              <p className="text-xs uppercase tracking-[0.32em] text-base-subtext">Awaiting handoff</p>
              <h2 className="text-2xl font-semibold text-white">Agents are standing by</h2>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-base-subtext">
                Crucible is a decision-intelligence platform that convenes specialized AI agents to debate high-stakes questions. 
                Unlike single-AI systems, we force multiple perspectives to challenge, debate, and converge on defensible recommendations.
              </p>
            </motion.div>
            
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.2, duration: 0.5 }}
            >
              <Link
                href="/app/launchpad"
                className="inline-flex items-center gap-2 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-5 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-cyan-100 transition hover:bg-cyan-500/20 hover:border-cyan-500/60"
              >
                Open Launchpad
              </Link>
            </motion.div>
          </motion.div>
        )}

        {/* Use Case Decision Matrix - Only show when there are no running sessions */}
        {runningSessions.length === 0 && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5, ease: "easeOut" }}
          className="rounded-3xl border border-base-divider bg-base-panel/50 backdrop-blur-sm p-8 shadow-soft"
        >
          <div className="mb-6 text-center">
            <h3 className="text-xl font-semibold text-white">When to Use Crucible</h3>
            <p className="mt-2 text-sm text-base-subtext">
              Compare Crucible with alternatives for different use cases
            </p>
          </div>
          
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-base-divider">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.2em] text-base-subtext">
                    Use Case
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-cyan-400">
                    Crucible
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-[0.2em] text-base-subtext">
                    Alternatives
                  </th>
                </tr>
              </thead>
              <tbody>
                {useCases.map((item, index) => (
                  <motion.tr
                    key={item.useCase}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + index * 0.1, duration: 0.5 }}
                    className="border-b border-base-divider/50 transition hover:bg-base-panel/30"
                  >
                    <td className="px-4 py-4 text-white">{item.useCase}</td>
                    <td className="px-4 py-4 text-center">
                      <span className={item.crucible.includes("Best") || item.crucible.includes("Hours") ? "text-cyan-400 font-semibold" : "text-base-subtext"}>
                        {item.crucible}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center text-base-subtext">{item.alternatives}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
          
          <div className="mt-6 text-center">
            <Link
              href={process.env.NEXT_PUBLIC_DOCS_URL ? `${process.env.NEXT_PUBLIC_DOCS_URL}/guides/comparison` : "/docs/guides/comparison"}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-cyan-400/80 hover:text-cyan-300 transition underline underline-offset-4"
            >
              View full comparison guide →
            </Link>
          </div>
        </motion.div>
        )}
      </div>
    </div>
  );
}
