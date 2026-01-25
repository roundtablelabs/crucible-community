"use client";

import { useEffect, useState, useRef } from "react";
import type { DebateEvent } from "./useDebateEvents";
import { mapPayloadToEvent } from "./useDebateEvents";

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
  events: Array<{
    id: string;
    sequence_id: number;
    phase: string;
    event_type: string;
    payload: Record<string, any>;
    created_at: string;
  }>;
};

// Delay between events in milliseconds (5 seconds)
const EVENT_REVEAL_DELAY = 5000;

export function useDemoDebateEvents(sessionId: string) {
  const [events, setEvents] = useState<DebateEvent[]>([]);
  const [isComplete, setIsComplete] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const allEventsRef = useRef<DebateEvent[]>([]);
  const currentIndexRef = useRef<number>(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!sessionId) {
      setIsLoading(false);
      return;
    }

    const fetchDemoData = async () => {
      setIsLoading(true);
      setError(null);
      setEvents([]);
      currentIndexRef.current = 0;
      
      try {
        const response = await fetch(`/api/public/use-cases/${sessionId}/json`, {
          credentials: "include",
        });
        
        if (!response.ok) {
          if (response.status === 404) {
            throw new Error("Demo session not found");
          }
          if (response.status === 403) {
            throw new Error("Access denied");
          }
          throw new Error(`Failed to load demo session: ${response.status}`);
        }
        
        const data = (await response.json()) as SessionJsonData;
        
        if (data.events) {
          // Convert JSON export events to DebateEvent format
          const convertedEvents: DebateEvent[] = data.events
            .sort((a, b) => a.sequence_id - b.sequence_id)
            .map((event) => {
              const payload = event.payload || {};
              
              // Ensure payload has sequence_id for mapPayloadToEvent
              if (!payload.sequence_id && event.sequence_id) {
                payload.sequence_id = event.sequence_id;
              }
              
              // Ensure payload has type from event_type if missing
              if (!payload.type && event.event_type) {
                payload.type = event.event_type;
              }
              
              // Map the payload to DebateEvent format
              const mapped = mapPayloadToEvent(payload, event.phase);
              
              // Override with database event data, preserving phase
              return {
                ...mapped,
                id: event.id || mapped.id,
                timestamp: new Date(event.created_at).toLocaleTimeString([], { 
                  hour: '2-digit', 
                  minute: '2-digit' 
                }),
                phase: event.phase || mapped.phase,
                event_type: event.event_type || mapped.event_type,
              };
            });
          
          // Store all events for progressive reveal
          allEventsRef.current = convertedEvents;
          
          // Start progressive reveal
          setIsLoading(false); // Initial load is complete
          
          // Show first event immediately
          if (convertedEvents.length > 0) {
            setEvents([convertedEvents[0]]);
            currentIndexRef.current = 1;
            
            // Then reveal remaining events progressively
            if (convertedEvents.length > 1) {
              intervalRef.current = setInterval(() => {
                const nextIndex = currentIndexRef.current;
                if (nextIndex < convertedEvents.length) {
                  setEvents((prev) => [...prev, convertedEvents[nextIndex]]);
                  currentIndexRef.current = nextIndex + 1;
                  
                  // Check if we've shown all events
                  if (nextIndex + 1 >= convertedEvents.length) {
                    if (intervalRef.current) {
                      clearInterval(intervalRef.current);
                      intervalRef.current = null;
                    }
                    setIsComplete(true);
                  }
                } else {
                  // All events revealed
                  if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                  }
                  setIsComplete(true);
                }
              }, EVENT_REVEAL_DELAY);
            } else {
              // Only one event, mark as complete immediately
              setIsComplete(true);
            }
          } else {
            setError("No events found in demo session");
            setIsLoading(false);
          }
        } else {
          setError("No events found in demo session");
          setIsLoading(false);
        }
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to load demo session";
        setError(errorMessage);
        setIsLoading(false);
        if (process.env.NODE_ENV === "development") {
          console.error("[useDemoDebateEvents] Error fetching demo data:", err);
        }
      }
    };

    fetchDemoData();

    // Cleanup interval on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [sessionId]);

  // Extract initialization event (sequence 0) for intake and moderator brief
  // Check both current events and all events ref to get init event immediately
  const initEventFromEvents = events.find(
    (e) => e.headline === "Session Initialized" || (e.phase === "idle" && (e.intake_summary || e.moderator_brief))
  );
  const initEventFromAll = allEventsRef.current.find(
    (e) => e.headline === "Session Initialized" || (e.phase === "idle" && (e.intake_summary || e.moderator_brief))
  );
  const initEvent = initEventFromEvents || initEventFromAll || null;

  return {
    events,
    isComplete,
    isLoading,
    error,
    streamStatus: null, // Demo doesn't use streaming
    initEvent, // SESSION_INITIALIZATION event with intake_summary and moderator_brief
    reset: () => {
      setEvents([]);
      currentIndexRef.current = 0;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    },
  };
}

