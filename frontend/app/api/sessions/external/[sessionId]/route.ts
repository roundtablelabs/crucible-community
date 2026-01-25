import { NextRequest, NextResponse } from "next/server";
import { getServerApiBaseUrl } from "@/lib/api/base";
import { getTokenFromRequest } from "@/lib/auth/get-token-from-request";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;

    if (!sessionId) {
      return NextResponse.json({ error: "Session ID is required" }, { status: 400 });
    }

    // Get token from cookie or Authorization header (accepts UUID session tokens and JWT tokens)
    const token = getTokenFromRequest(request);
    
    const authHeader = token ? `Bearer ${token}` : null;

    if (!authHeader) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    // Get API base URL inside handler to avoid module-level initialization errors
    const API_BASE_URL = getServerApiBaseUrl();

    // Call backend API to get session by external ID
    const response = await fetch(`${API_BASE_URL}/sessions/external/${encodeURIComponent(sessionId)}`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: authHeader,
      },
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({ error: "Unknown error" }));
      return NextResponse.json(
        { error: errorBody.detail || errorBody.error || "Failed to fetch session" },
        { status: response.status }
      );
    }

    const sessionData = await response.json();
    
    // Filter out phase_started and phase_complete events from any events in the response
    if (sessionData.events && Array.isArray(sessionData.events)) {
      sessionData.events = sessionData.events.filter((event: any) => {
        const eventType = (event.event_type || event.type || "").toLowerCase();
        return eventType !== "phase_started" && eventType !== "phase_complete";
      });
    }
    
    // Also filter from any nested event arrays (e.g., in timeline, phases, etc.)
    if (sessionData.timeline && Array.isArray(sessionData.timeline)) {
      sessionData.timeline = sessionData.timeline.filter((event: any) => {
        const eventType = (event.event_type || event.type || "").toLowerCase();
        return eventType !== "phase_started" && eventType !== "phase_complete";
      });
    }
    
    return NextResponse.json(sessionData);
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[sessions/external] Error:", error);
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

