import { NextResponse } from "next/server";

import { auth } from "@/auth";
import { getServerApiBaseUrl } from "@/lib/api/base";
import type { DecisionLogSession } from "@/types/decision-log";

type ApiSessionRecord = {
  id: string;
  session_id: string;
  knight_ids: string[];
  topic: string | null;
  artifact_uri: string | null;
  audit_log_uri: string | null;
  status: "running" | "completed" | "error";
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  quality_score: number | null;
  quality_tier: string | null;
  quality_breakdown: Record<string, number> | null;
};

function mapRecord(record: ApiSessionRecord): DecisionLogSession {
  return {
    id: record.session_id,
    dbId: record.id,
    status: record.status,
    topic: record.topic,
    knightIds: record.knight_ids,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
    completedAt: record.completed_at,
    artifactUri: record.artifact_uri,
    auditLogUri: record.audit_log_uri,
    qualityScore: record.quality_score ?? null,
    qualityTier: record.quality_tier ?? null,
    qualityBreakdown: record.quality_breakdown ?? null,
  };
}

export async function GET(request: Request) {
  // Get token from cookie or Authorization header (accepts UUID session tokens and JWT tokens)
  const { getTokenFromRequest } = await import("@/lib/auth/get-token-from-request");
  const token = getTokenFromRequest(request);
  
  if (!token) {
    if (process.env.NODE_ENV === "development") {
      console.error("[internal/sessions] No token found", {
        hasCookie: !!request.headers.get("cookie"),
        hasAuthHeader: !!request.headers.get("authorization"),
      });
    }
    return NextResponse.json({ 
      error: "Unauthorized",
      details: "No authentication token found in session"
    }, { status: 401 });
  }

  const apiBase = getServerApiBaseUrl();
  // Backend has redirect_slashes=False, so route must match exactly (no trailing slash)
  // The route is defined as @router.get("") which maps to /api/sessions (not /api/sessions/)
  const backendUrl = `${apiBase}/sessions`;
  
  // Validate token before sending
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isValidUUID = uuidRegex.test(token);
  
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const response = await fetch(backendUrl, {
    headers,
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    if (process.env.NODE_ENV === "development") {
      console.error("[internal/sessions] Backend error:", response.status, body, "URL:", backendUrl);
    }
    // Sanitize error response - don't expose internal backend details to client
    const sanitizedError = response.status === 401 
      ? "Authentication required"
      : response.status === 403
      ? "Access denied"
      : response.status >= 500
      ? "Server error occurred"
      : "Failed to load sessions";
    
    return NextResponse.json(
      { error: sanitizedError },
      { status: response.status },
    );
  }

  const payload = (await response.json()) as ApiSessionRecord[];
  return NextResponse.json(payload.map(mapRecord));
}
