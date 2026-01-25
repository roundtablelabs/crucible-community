import { NextResponse } from "next/server";

import { getServerApiBaseUrl } from "@/lib/api/base";
import { secureLogger } from "@/lib/utils/secureLogger";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  try {
    const { sessionId } = await params;
    
    // Check for share token in query params
    const url = new URL(request.url);
    const shareToken = url.searchParams.get("token");
    
    // If share token is provided, use it instead of auth token
    if (shareToken) {
      const API_BASE_URL = getServerApiBaseUrl();
      
      // Verify share token first
      const verifyResponse = await fetch(
        `${API_BASE_URL}/sessions/${sessionId}/shared/${shareToken}`,
        {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );
      
      if (!verifyResponse.ok) {
        return NextResponse.json(
          { error: "Invalid or expired share token" },
          { status: verifyResponse.status }
        );
      }
      
      // Token is valid, fetch artifacts using the share token
      // Note: You may need to create a backend endpoint that accepts share tokens for artifacts
      // For now, we'll use the regular endpoint but this should be updated
      const response = await fetch(`${API_BASE_URL}/artifacts/${sessionId}/json`, {
        headers: {
          "Content-Type": "application/json",
          "X-Share-Token": shareToken, // Pass token as header
        },
        cache: "no-store",
      });
      
      if (!response.ok) {
        const body = await response.text();
        return NextResponse.json(
          { error: "Failed to load session JSON", details: body },
          { status: response.status },
        );
      }
      
      const payload = await response.json();
      
      // Filter events (same as below)
      if (payload.events && Array.isArray(payload.events)) {
        payload.events = payload.events.filter((event: any) => {
          const eventType = (event.event_type || event.type || "").toLowerCase();
          return eventType !== "phase_started" && eventType !== "phase_complete" && eventType !== "artifact_ready";
        });
      }
      
      if (payload.timeline && Array.isArray(payload.timeline)) {
        payload.timeline = payload.timeline.filter((event: any) => {
          const eventType = (event.event_type || event.type || "").toLowerCase();
          return eventType !== "phase_started" && eventType !== "phase_complete" && eventType !== "artifact_ready";
        });
      }
      
      return NextResponse.json(payload);
    }
    
    // Regular authenticated flow
    // Get token from cookie or Authorization header (accepts UUID session tokens and JWT tokens)
    const { getTokenFromRequest } = await import("@/lib/auth/get-token-from-request");
    const token = getTokenFromRequest(request);
    
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get API base URL inside handler to avoid module-level initialization errors
    const API_BASE_URL = getServerApiBaseUrl();

    const response = await fetch(`${API_BASE_URL}/artifacts/${sessionId}/json`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      secureLogger.error(`[artifacts/json] Backend returned ${response.status}: ${body}`);
      return NextResponse.json(
        { error: "Failed to load session JSON", details: body },
        { status: response.status },
      );
    }

    const payload = await response.json();
    
    // Filter out phase_started and phase_complete events from timeline and other elements
    if (payload.events && Array.isArray(payload.events)) {
      payload.events = payload.events.filter((event: any) => {
        const eventType = (event.event_type || event.type || "").toLowerCase();
        return eventType !== "phase_started" && eventType !== "phase_complete" && eventType !== "artifact_ready";
      });
    }
    
    // Also filter from any nested event arrays (e.g., in timeline, phases, etc.)
    if (payload.timeline && Array.isArray(payload.timeline)) {
      payload.timeline = payload.timeline.filter((event: any) => {
        const eventType = (event.event_type || event.type || "").toLowerCase();
        return eventType !== "phase_started" && eventType !== "phase_complete" && eventType !== "artifact_ready";
      });
    }
    
    return NextResponse.json(payload);
  } catch (error) {
    secureLogger.error("[artifacts/json] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}

