"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { getApiBaseUrl } from "@/lib/api/client";
// Import client-only version to prevent bundling pg
import { getAuthToken } from "@/lib/auth/get-token.client";
import { secureLogger } from "@/lib/utils/secureLogger";

// Global connection registry to prevent duplicate connections across component instances
const globalActiveConnections = new Map<string, EventSource>();

export type DebateEvent = {
    id: string;
    sequence_id?: number; // Sequence ID from backend for deduplication
    round: "position" | "challenge" | "convergence" | "research" | "red_team" | "translator" | "artifact" | "closed" | "rebuttals";
    phase?: string; // Phase from StreamEnvelope (e.g., "research", "opening", "convergence", "closed")
    knight: string;
    headline: string;
    detail: string;
    confidence: number;
    timestamp: string;
    event_type?: string; // Preserve original event type for filtering
    // Additional fields
    sources?: { title: string; url: string; snippet: string }[];
    critique?: string;
    flaws?: string[];
    severity?: string;
    translated_content?: string;
    artifact_url?: string;
    // Session initialization fields
    intake_summary?: string | null;
    moderator_brief?: Record<string, any> | null;
    // Closed phase fields
    ruling?: string | null;
    notes?: string | null;
    // Challenge/Cross-examination fields
    target_knight_id?: string | null;
    // PDF generation status fields
    pdf_generation_status?: string;
    pdf_uri?: string | null;
    pdf_error_message?: string | null;
};

export function useDebateEvents(sessionId: string, skipSSE?: boolean) {
    const { token: authToken } = useAuth();
    const [events, setEvents] = useState<DebateEvent[]>([]);
    const [isComplete, setIsComplete] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [streamStatus, setStreamStatus] = useState<{ taskRunning?: boolean; taskDispatchFailed?: boolean; message?: string } | null>(null);
    // Use ref to track current EventSource to prevent duplicate connections
    const eventSourceRef = useRef<EventSource | null>(null);
    const currentSessionIdRef = useRef<string | null>(null);
    // Use ref to track token to avoid reconnection when token changes
    // Token changes should NOT trigger reconnection (per PREVENT_DUPLICATE_LLM_CALLS.md)
    const tokenRef = useRef<string | undefined>(undefined);
    // Cleanup guard to prevent connections during cleanup window (React Strict Mode)
    const isCleaningUpRef = useRef(false);

    // Extract token to separate variable and update ref
    // Use authToken from useAuth() which works for both Community Edition and OAuth modes
    const token = authToken || undefined;
    
    // Initialize tokenAvailable based on current token (not just on change)
    // This ensures tokenAvailable is set correctly on initial mount when navigating
    const [tokenAvailable, setTokenAvailable] = useState(!!token);
    
    // Initialize tokenRef immediately (not just in useEffect) to ensure it's available
    // when the main SSE effect runs on initial mount
    if (tokenRef.current !== token) {
        tokenRef.current = token;
    }
    
    // Update token ref whenever token changes (but don't trigger main SSE effect re-run)
    // This allows us to access latest token value without reconnecting on token change
    useEffect(() => {
        tokenRef.current = token;
        // Update tokenAvailable state to trigger re-check when token becomes available
        // This allows connection when token becomes available after sessionId is set
        // But the main effect will check for existing connections to prevent duplicates
        setTokenAvailable(!!token);
    }, [token]);

    // Fetch from database if skipSSE is true (for completed sessions)
    useEffect(() => {
        if (!sessionId || !skipSSE) {
            return;
        }

        const fetchFromDatabase = async () => {
            setIsLoading(true);
            try {
                const response = await fetch(`/api/artifacts/${sessionId}/json`, {
                    credentials: "include",
                });
                if (!response.ok) {
                    // Silently fail if 401 (unauthorized) - this is expected for demo/public sessions
                    // Only log other errors
                    if (response.status !== 401 && process.env.NODE_ENV === "development") {
                        console.error("[useDebateEvents] Failed to fetch from database:", response.status);
                    }
                    setIsLoading(false);
                    return;
                }
                const data = await response.json() as { events?: Array<{
                    id: string;
                    sequence_id: number;
                    phase: string;
                    event_type: string;
                    payload: Record<string, any>;
                    created_at: string;
                }> };
                
                if (data.events) {
                    // Convert database events to DebateEvent format
                    // Filter out PHASE_STARTED and PHASE_COMPLETE events - these are internal tracking events, not user-facing
                    const convertedEvents: DebateEvent[] = data.events
                        .filter((event) => {
                            const eventTypeLower = (event.event_type || "").toLowerCase();
                            return eventTypeLower !== "phase_started" && eventTypeLower !== "phase_complete";
                        })
                        .sort((a, b) => a.sequence_id - b.sequence_id)
                        .map((event) => {
                            const payload = event.payload || {};
                            // Ensure payload has sequence_id for mapPayloadToEvent
                            if (!payload.sequence_id && event.sequence_id) {
                                payload.sequence_id = event.sequence_id;
                            }
                            // Ensure payload has type from event_type if missing (critical for MODERATOR_RULING)
                            if (!payload.type && event.event_type) {
                                payload.type = event.event_type;
                            }
                            const mapped = mapPayloadToEvent(payload, event.phase);
                            // Override with database event data, but preserve phase if it was set correctly
                            return {
                                ...mapped,
                                id: event.id || mapped.id,
                                sequence_id: event.sequence_id || mapped.sequence_id,
                                timestamp: new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                phase: event.phase || mapped.phase, // Preserve phase from database
                            };
                        });
                    // Merge with existing events instead of replacing to avoid duplicates when SSE is also active
                    setEvents((prev) => {
                        // Create a map of existing events by sequence_id (if available) or id
                        const existingMap = new Map<string | number, DebateEvent>();
                        prev.forEach(e => {
                            if (e.sequence_id !== undefined) {
                                existingMap.set(e.sequence_id, e);
                            } else {
                                existingMap.set(e.id, e);
                            }
                        });
                        
                        // Add new events, skipping duplicates
                        const merged = [...prev];
                        convertedEvents.forEach(newEvent => {
                            const key = newEvent.sequence_id !== undefined ? newEvent.sequence_id : newEvent.id;
                            if (!existingMap.has(key)) {
                                merged.push(newEvent);
                                existingMap.set(key, newEvent);
                            }
                        });
                        
                        // Sort by sequence_id if available, otherwise by insertion order
                        return merged.sort((a, b) => {
                            if (a.sequence_id !== undefined && b.sequence_id !== undefined) {
                                return a.sequence_id - b.sequence_id;
                            }
                            return 0; // Keep original order if sequence_id not available
                        });
                    });
                    setIsComplete(true);
                }
            } catch (error) {
                if (process.env.NODE_ENV === "development") {
                    console.error("[useDebateEvents] Error fetching from database:", error);
                }
            } finally {
                setIsLoading(false);
            }
        };

        fetchFromDatabase();
    }, [sessionId, skipSSE]);

    // Track if SSE has failed and we should fall back to database fetch
    const [sseFailed, setSseFailed] = useState(false);
    // Track if authentication is required
    const [authError, setAuthError] = useState(false);
    // Track if SSE connection is currently active (EventSource.OPEN)
    const [streamIsActive, setStreamIsActive] = useState(false);

    // Fallback to database fetch when SSE fails
    useEffect(() => {
        if (!sessionId || !sseFailed || skipSSE) {
            return;
        }

        const fetchFromDatabase = async () => {
            setIsLoading(true);
            try {
                const response = await fetch(`/api/artifacts/${sessionId}/json`, {
                    credentials: "include",
                });
                if (!response.ok) {
                    // Silently fail if 401 (unauthorized) - this is expected for demo/public sessions
                    // Only log other errors
                    if (response.status !== 401 && process.env.NODE_ENV === "development") {
                        console.error("[useDebateEvents] Failed to fetch from database:", response.status);
                    }
                    setIsLoading(false);
                    return;
                }
                const data = await response.json() as { events?: Array<{
                    id: string;
                    sequence_id: number;
                    phase: string;
                    event_type: string;
                    payload: Record<string, any>;
                    created_at: string;
                }> };
                
                if (data.events) {
                    // Convert database events to DebateEvent format
                    // Filter out PHASE_STARTED and PHASE_COMPLETE events - these are internal tracking events, not user-facing
                    const convertedEvents: DebateEvent[] = data.events
                        .filter((event) => {
                            const eventTypeLower = (event.event_type || "").toLowerCase();
                            return eventTypeLower !== "phase_started" && eventTypeLower !== "phase_complete";
                        })
                        .sort((a, b) => a.sequence_id - b.sequence_id)
                        .map((event) => {
                            const payload = event.payload || {};
                            // Ensure payload has sequence_id for mapPayloadToEvent
                            if (!payload.sequence_id && event.sequence_id) {
                                payload.sequence_id = event.sequence_id;
                            }
                            // Ensure payload has type from event_type if missing (critical for MODERATOR_RULING)
                            if (!payload.type && event.event_type) {
                                payload.type = event.event_type;
                            }
                            const mapped = mapPayloadToEvent(payload, event.phase);
                            // Override with database event data, but preserve phase if it was set correctly
                            return {
                                ...mapped,
                                id: event.id || mapped.id,
                                sequence_id: event.sequence_id || mapped.sequence_id,
                                timestamp: new Date(event.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                                phase: event.phase || mapped.phase, // Preserve phase from database
                            };
                        });
                    // Merge with existing events instead of replacing to avoid duplicates when SSE is also active
                    setEvents((prev) => {
                        // Create a map of existing events by sequence_id (if available) or id
                        const existingMap = new Map<string | number, DebateEvent>();
                        prev.forEach(e => {
                            if (e.sequence_id !== undefined) {
                                existingMap.set(e.sequence_id, e);
                            } else {
                                existingMap.set(e.id, e);
                            }
                        });
                        
                        // Add new events, skipping duplicates
                        const merged = [...prev];
                        convertedEvents.forEach(newEvent => {
                            const key = newEvent.sequence_id !== undefined ? newEvent.sequence_id : newEvent.id;
                            if (!existingMap.has(key)) {
                                merged.push(newEvent);
                                existingMap.set(key, newEvent);
                            }
                        });
                        
                        // Sort by sequence_id if available, otherwise by insertion order
                        return merged.sort((a, b) => {
                            if (a.sequence_id !== undefined && b.sequence_id !== undefined) {
                                return a.sequence_id - b.sequence_id;
                            }
                            return 0; // Keep original order if sequence_id not available
                        });
                    });
                    setIsComplete(true);
                }
            } catch (error) {
                if (process.env.NODE_ENV === "development") {
                    console.error("[useDebateEvents] Error fetching from database:", error);
                }
            } finally {
                setIsLoading(false);
            }
        };

        fetchFromDatabase();
    }, [sessionId, sseFailed, skipSSE]);

    useEffect(() => {
        if (!sessionId || skipSSE || sseFailed) {
            // Skip SSE if explicitly requested, if we're fetching from database, or if SSE failed
            return;
        }

        // Check cleanup guard to prevent connections during cleanup window (React Strict Mode)
        if (isCleaningUpRef.current) {
            return;
        }

        // CRITICAL: Wait for token before connecting to prevent duplicate debate starts
        // The backend requires authentication, so connecting without a token will fail.
        // More importantly, if we connect without a token first and then with a token,
        // both connections might trigger separate debate runs, doubling LLM costs.
        // Use tokenRef to get latest token value without triggering effect re-run on token change
        const currentToken = tokenRef.current;
        if (!currentToken) {
            return;
        }

        // Prevent duplicate connections for the same sessionId
        // IMPORTANT: Only use sessionId for deduplication, NOT token
        // Token changes should NOT trigger reconnection because the backend
        // tracks the debate by session_id, not by connection
        const connectionKey = sessionId;
        
        // Check global registry first to prevent duplicate connections across component instances
        if (globalActiveConnections.has(connectionKey)) {
            const existingConnection = globalActiveConnections.get(connectionKey);
            if (existingConnection && existingConnection.readyState === EventSource.OPEN) {
                if (process.env.NODE_ENV === "development") {
                    console.warn(`[useDebateEvents] Global connection already exists for ${connectionKey}, reusing`);
                }
                // Reuse existing connection
                eventSourceRef.current = existingConnection;
                currentSessionIdRef.current = connectionKey;
                setStreamIsActive(true);
                return;
            } else {
                // Clean up stale connection (CLOSED or CONNECTING but not OPEN)
                if (existingConnection) {
                    existingConnection.close();
                }
                globalActiveConnections.delete(connectionKey);
            }
        }
        
        // If we already have an active connection for this session, check if it's actually active
        // This prevents duplicate debate starts when token changes (e.g., after payment redirect)
        if (currentSessionIdRef.current === connectionKey && eventSourceRef.current) {
            const readyState = eventSourceRef.current.readyState;
            if (readyState === EventSource.OPEN) {
                return;
            } else if (readyState === EventSource.CONNECTING) {
                // Still connecting, wait a bit but don't create duplicate
                return;
            } else {
                // Connection is CLOSED, clean it up and create a new one
                eventSourceRef.current.close();
                eventSourceRef.current = null;
                if (currentSessionIdRef.current) {
                    globalActiveConnections.delete(currentSessionIdRef.current);
                }
            }
        }

        // Only clean up previous connection if sessionId changed (NOT for token changes)
        // This prevents the backend from receiving multiple stream requests for the same session
        if (currentSessionIdRef.current !== connectionKey && eventSourceRef.current) {
            eventSourceRef.current.close();
            // Remove from global registry
            if (currentSessionIdRef.current) {
                globalActiveConnections.delete(currentSessionIdRef.current);
            }
            eventSourceRef.current = null;
        }

        currentSessionIdRef.current = connectionKey;
        
        // Validate token before connecting SSE
        const validateAndConnect = async () => {
            // Use tokenRef to get latest token value
            let validatedToken = tokenRef.current;
            
            // If we have a token, validate it first
            if (validatedToken) {
                try {
                    // Test token by making a simple API call
                    const baseUrl = getApiBaseUrl();
                    const testResponse = await fetch(`${baseUrl}/sessions/external/${sessionId}`, {
                        headers: {
                            Authorization: `Bearer ${token}`,
                        },
                        credentials: "include",
                    });
                    
                    if (testResponse.status === 401) {
                        // Token expired, try to refresh it
                        const newToken = await getAuthToken();
                        if (newToken) {
                            validatedToken = newToken;
                        } else {
                            // Token refresh failed, need re-authentication
                            if (process.env.NODE_ENV === "development") {
                                console.warn("[useDebateEvents] Token refresh failed, requiring re-authentication");
                            }
                            setAuthError(true);
                            setSseFailed(true);
                            setIsLoading(false);
                            return; // Don't connect SSE
                        }
                    } else if (!testResponse.ok && testResponse.status !== 404) {
                        // Other error (not 401 or 404)
                        if (process.env.NODE_ENV === "development") {
                            console.warn(`[useDebateEvents] Token validation failed with status ${testResponse.status}`);
                        }
                    }
                } catch (error) {
                    // Network error during validation - proceed with connection attempt
                    // The SSE connection will fail if token is invalid
                    if (process.env.NODE_ENV === "development") {
                        console.warn("[useDebateEvents] Token validation error (network), proceeding with connection:", error);
                    }
                }
            }
            
            // Use validated token (or original if validation skipped)
            const finalToken = validatedToken || tokenRef.current;
            
            if (!finalToken) {
                if (process.env.NODE_ENV === "development") {
                    console.warn("[useDebateEvents] No authentication token available, stream may fail");
                }
            }
            
            // Use getApiBaseUrl() which handles HTTP to HTTPS conversion for secure contexts
            const baseUrl = getApiBaseUrl();
            // Get topic from sessionStorage (backend has Redis/DB fallbacks for persistence)
            // For paid sessions, the backend will use the topic from the database, so this is just a fallback
            const topicFromStorage = typeof window !== "undefined" 
                ? sessionStorage.getItem(`session_topic_${sessionId}`)
                : null;
            // Only include topic parameter if we have it - backend will use database topic for paid sessions
            const topicParam = topicFromStorage ? `&topic=${encodeURIComponent(topicFromStorage)}` : "";
            const url = finalToken 
                ? `${baseUrl}/sessions/${sessionId}/stream?token=${finalToken}${topicParam}`
                : `${baseUrl}/sessions/${sessionId}/stream${topicParam ? `?${topicParam.substring(1)}` : ""}`;

            let retryCount = 0;
            const maxRetries = 3;
            const retryDelays = [1000, 2000, 5000]; // Exponential backoff: 1s, 2s, 5s

            const connectStream = () => {
            // Close existing connection before creating new one
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                // Remove from global registry if it exists
                if (currentSessionIdRef.current) {
                    globalActiveConnections.delete(currentSessionIdRef.current);
                }
                eventSourceRef.current = null;
            }
            
            const newEventSource = new EventSource(url);
            eventSourceRef.current = newEventSource;
            // Register in global registry
            globalActiveConnections.set(connectionKey, newEventSource);

            newEventSource.onopen = () => {
                retryCount = 0; // Reset retry count on successful connection
                setStreamIsActive(true); // Mark SSE as active
            };

            newEventSource.onmessage = (event) => {
            try {
                const envelope = JSON.parse(event.data);
                
                // Handle stream control events (STREAM_STARTED, STREAM_COMPLETE, STREAM_ERROR)
                if (envelope.type === "STREAM_STARTED" || envelope.type === "STREAM_COMPLETE" || envelope.type === "STREAM_ERROR") {
                    if (envelope.type === "STREAM_STARTED") {
                        // Store stream status for debugging
                        setStreamStatus({
                            taskRunning: envelope.debate_task_running || false,
                            taskDispatchFailed: envelope.task_dispatch_failed || false,
                            message: envelope.message || "Stream started"
                        });
                        setIsLoading(false); // Stream is connected, stop loading
                        if (envelope.task_dispatch_failed) {
                            if (process.env.NODE_ENV === "development") {
                                console.warn("[useDebateEvents] ⚠️ Debate task dispatch failed - debate may not start");
                            }
                        }
                    } else if (envelope.type === "STREAM_COMPLETE") {
                        setIsComplete(true);
                        if (eventSourceRef.current) {
                            eventSourceRef.current.close();
                            // Remove from global registry
                            if (currentSessionIdRef.current) {
                                globalActiveConnections.delete(currentSessionIdRef.current);
                            }
                            eventSourceRef.current = null;
                        }
                    } else if (envelope.type === "STREAM_ERROR") {
                        if (process.env.NODE_ENV === "development") {
                            console.error("[useDebateEvents] Stream error:", envelope.error);
                        }
                        setStreamStatus({
                            message: `Stream error: ${envelope.error || "Unknown error"}`
                        });
                    }
                    return; // Don't add these as debate events
                }
                
                // Extract payload and phase from StreamEnvelope
                // The envelope structure is: { payload: {...}, phase: "research", ... }
                const payload = envelope.payload || envelope; // Fallback if not wrapped
                const phase = envelope.phase || null;
                
                // Only process if payload has a type (actual debate events)
                if (!payload.type) {
                    if (process.env.NODE_ENV === "development") {
                        console.warn("[useDebateEvents] Event missing type field, skipping:", envelope);
                    }
                    return;
                }
                
                // Filter out PHASE_STARTED and PHASE_COMPLETE events - these are internal tracking events, not user-facing
                const eventTypeLower = (payload.type || "").toLowerCase();
                if (eventTypeLower === "phase_started" || eventTypeLower === "phase_complete") {
                    return;
                }
                
                const newEvent = mapPayloadToEvent(payload, phase);
                setEvents((prev) => {
                    // Primary deduplication: Check by sequence_id first (most reliable)
                    if (newEvent.sequence_id !== undefined) {
                        const duplicateBySequence = prev.find(e => e.sequence_id === newEvent.sequence_id);
                        if (duplicateBySequence) {
                            return prev;
                        }
                    }
                    
                    // Secondary deduplication: Check by ID
                    if (prev.find(e => e.id === newEvent.id)) {
                        return prev;
                    }
                    
                    // Tertiary deduplication: Check logical duplicates (same knight, phase, round, and content)
                    // This handles cases where the same event might have different IDs from different sources
                    const isLogicalDuplicate = prev.some(e => {
                        // Must match on key identifying fields
                        if (e.knight !== newEvent.knight || e.round !== newEvent.round) {
                            return false;
                        }
                        // For research events, check headline (query) and detail (summary)
                        if (newEvent.round === "research") {
                            return e.headline === newEvent.headline && e.detail === newEvent.detail;
                        }
                        // For other events, check headline or detail match
                        return e.headline === newEvent.headline || e.detail === newEvent.detail;
                    });
                    
                    if (isLogicalDuplicate) {
                        return prev;
                    }

                    // Add new event and sort by sequence_id to maintain order
                    const updated = [...prev, newEvent];
                    return updated.sort((a, b) => {
                        if (a.sequence_id !== undefined && b.sequence_id !== undefined) {
                            return a.sequence_id - b.sequence_id;
                        }
                        // If sequence_id not available, maintain insertion order
                        return 0;
                    });
                });

                // Check for completion using uppercase to match backend enum values
                const eventTypeUpper = (payload.type || "").toUpperCase();
                // Don't close stream on ARTIFACT_READY - wait for MODERATOR_RULING (closed phase) or STREAM_COMPLETE
                if (eventTypeUpper === "MODERATOR_RULING") {
                    setIsComplete(true);
                    // Don't close stream yet - wait for STREAM_COMPLETE from backend
                }
                // Note: Stream will be closed by STREAM_COMPLETE event handler above
            } catch (e) {
                if (process.env.NODE_ENV === "development") {
                    console.error("[useDebateEvents] Failed to parse event:", e, event.data);
                }
            }
            };

            newEventSource.onerror = (err) => {
                const state = newEventSource.readyState;
                const stateNames = ["CONNECTING", "OPEN", "CLOSED"];
                if (process.env.NODE_ENV === "development") {
                    console.error("[useDebateEvents] EventSource error:", {
                        error: err,
                        readyState: state,
                        readyStateName: stateNames[state],
                        url: url.replace(finalToken || "", "[TOKEN]"),
                        retryCount
                    });
                }
                
                // EventSource.readyState: 0 = CONNECTING, 1 = OPEN, 2 = CLOSED
                if (state === EventSource.CLOSED) {
                    setStreamIsActive(false); // Mark SSE as inactive
                    if (retryCount < maxRetries) {
                        const delay = retryDelays[retryCount] || retryDelays[retryDelays.length - 1];
                        retryCount++;
                        if (process.env.NODE_ENV === "development") {
                            console.warn(`[useDebateEvents] Stream closed, retrying in ${delay}ms (attempt ${retryCount}/${maxRetries})`);
                        }
                        setTimeout(() => {
                            connectStream();
                        }, delay);
                    } else {
                        if (process.env.NODE_ENV === "development") {
                            console.error("[useDebateEvents] Stream closed unexpectedly after all retries. Falling back to database fetch.");
                            console.error("Possible causes:");
                            console.error("  - Authentication failed (check token)");
                            console.error("  - Session not found in database");
                            console.error("  - Debate engine error");
                            console.error("  - Network connection issue");
                            console.error("  - Session may be completed (will fetch from database)");
                        }
                        // Remove from global registry
                        if (currentSessionIdRef.current) {
                            globalActiveConnections.delete(currentSessionIdRef.current);
                        }
                        // Trigger fallback to database fetch
                        setSseFailed(true);
                    }
                } else if (state === EventSource.OPEN) {
                    setStreamIsActive(true); // Ensure it's marked as active when OPEN
                } else if (state === EventSource.CONNECTING) {
                    setStreamIsActive(false); // Not active while connecting
                    if (process.env.NODE_ENV === "development") {
                        console.warn("[useDebateEvents] Still connecting, this may be normal during initial connection");
                    }
                }
            };
        };

            // Initial connection
            connectStream();
        };
        
        // Start validation and connection
        validateAndConnect();

        return () => {
            isCleaningUpRef.current = true;
            setStreamIsActive(false); // Mark SSE as inactive on cleanup
            if (eventSourceRef.current) {
                eventSourceRef.current.close();
                // Remove from global registry
                if (currentSessionIdRef.current) {
                    globalActiveConnections.delete(currentSessionIdRef.current);
                }
                eventSourceRef.current = null;
            }
            currentSessionIdRef.current = null;
            // Reset cleanup guard after short delay
            setTimeout(() => {
                isCleaningUpRef.current = false;
            }, 100);
        };
        // IMPORTANT: token is NOT in dependency array per PREVENT_DUPLICATE_LLM_CALLS.md
        // Token changes should NOT trigger reconnection - we use tokenRef to access latest token
        // tokenAvailable is included to allow connection when token becomes available after sessionId is set
        // But duplicate connection check (lines 295-302) prevents reconnection if already connected
    }, [sessionId, skipSSE, tokenAvailable]);

    return {
        events,
        isComplete,
        isLoading,
        streamStatus,
        authError, // Expose auth error so parent can show re-auth prompt
        streamIsActive, // Expose SSE connection status
        reset: () => setEvents([]),
    };
}

export function mapPayloadToEvent(payload: any, phase?: string | null): DebateEvent {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const base = {
        id: `evt-${payload.sequence_id}`,
        sequence_id: payload.sequence_id,
        timestamp,
        confidence: payload.confidence || 0,
        knight: payload.knight_id || "System",
        headline: "",
        detail: "",
        phase: phase || undefined,
    };

    // Convert event type to uppercase to handle backend's lowercase enum values
    const eventType = (payload.type || "").toUpperCase();

    switch (eventType) {
        case "SESSION_INITIALIZATION":
            return {
                ...base,
                round: "position", // Fallback round
                headline: "Session Initialized",
                detail: payload.intake_summary || "Session initialization complete.",
                intake_summary: payload.intake_summary || null,
                moderator_brief: payload.moderator_brief || null,
                event_type: "SESSION_INITIALIZATION"
            };
        case "RESEARCH_RESULT":
            return {
                ...base,
                round: "research",
                headline: `Finding: ${payload.query}`,
                detail: payload.summary,
                sources: payload.sources,
                event_type: "RESEARCH_RESULT"
            };
        case "POSITION_CARD":
            return {
                ...base,
                round: "position",
                headline: payload.headline,
                detail: payload.body,
                confidence: payload.confidence,
                event_type: "POSITION_CARD"
            };
        case "CHALLENGE":
            const challengerId = payload.knight_id || base.knight;
            const targetId = payload.target_knight_id || "Unknown";
            return {
                ...base,
                round: "challenge",
                headline: `Cross-Examination: ${challengerId} <-> ${targetId}`,
                detail: payload.contestation,
                target_knight_id: payload.target_knight_id || null,
                event_type: "CHALLENGE"
            };
        case "REBUTTAL":
            const rebuttingKnight = payload.knight_id || base.knight;
            return {
                ...base,
                round: "rebuttals",
                headline: `Counter-Argument: ${rebuttingKnight}`,
                detail: payload.body || "",
                event_type: "REBUTTAL"
            };
        case "RED_TEAM_CRITIQUE":
            return {
                ...base,
                round: "red_team",
                headline: "Red Team Critique",
                detail: payload.critique,
                critique: payload.critique,
                flaws: payload.flaws_identified,
                severity: payload.severity,
                event_type: "RED_TEAM_CRITIQUE"
            };
        case "TRANSLATOR_OUTPUT":
            return {
                ...base,
                round: "translator",
                headline: "Executive Translation",
                detail: payload.translated_content,
                translated_content: payload.translated_content,
                event_type: "TRANSLATOR_OUTPUT"
            };
        case "CONVERGENCE":
            return {
                ...base,
                round: "convergence",
                headline: "Convergence Reached",
                detail: payload.summary,
                confidence: payload.confidence,
                event_type: "CONVERGENCE"
            };
        case "ARTIFACT_READY":
            return {
                ...base,
                round: "artifact",
                headline: "Decision Brief Generated",
                detail: "Click to view the final report.",
                artifact_url: payload.artifact_url,
                event_type: "ARTIFACT_READY"
            };
        case "PDF_GENERATION_STATUS":
            const status = payload.status || "pending";
            const statusMessage = status === "success" 
                ? "PDF generated successfully" 
                : status === "failed"
                ? `PDF generation failed: ${payload.error_message || "Unknown error"}`
                : "PDF generation in progress";
            return {
                ...base,
                round: "artifact",
                headline: `PDF Generation: ${status}`,
                detail: statusMessage,
                event_type: "PDF_GENERATION_STATUS",
                pdf_generation_status: status,
                pdf_uri: payload.pdf_uri || null,
                pdf_error_message: payload.error_message || null,
            };
        case "MODERATOR_RULING":
            return {
                ...base,
                round: "closed",
                headline: "Session Closed",
                detail: payload.ruling || "Session closed.",
                phase: phase || "closed", // Ensure phase is set to closed
                ruling: payload.ruling || null,
                notes: payload.notes || null,
                event_type: "MODERATOR_RULING"
            };
        default:
            // For unknown event types, show a user-friendly message instead of raw JSON
            const eventType = payload.type || "Unknown";
            const eventSummary = payload.summary || payload.message || payload.body || "Event received";
            return {
                ...base,
                round: "position", // Fallback
                headline: `Event: ${eventType.replace(/_/g, " ")}`,
                detail: typeof eventSummary === "string" 
                    ? eventSummary 
                    : `Received ${eventType} event. ${Object.keys(payload).length} fields available.`,
                event_type: eventType.toUpperCase()
            };
    }
}
