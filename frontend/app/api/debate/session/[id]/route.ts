import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth/get-token-from-request";
import { getServerApiBaseUrl } from "@/lib/api/base";

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  
  // Get token from cookie or Authorization header (accepts UUID session tokens and JWT tokens)
  const token = getTokenFromRequest(request);
  
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const apiBase = getServerApiBaseUrl();
    // Use external session endpoint which handles Redis/DB logic for knights
    const backendUrl = `${apiBase}/sessions/external/${id}`;
    
    const response = await fetch(backendUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ error: "Session not found." }, { status: 404 });
      }
      const errorText = await response.text().catch(() => "Unknown error");
      return NextResponse.json(
        { error: "Failed to load session", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    
    return NextResponse.json({
      sessionId: data.session_id,
      session_id: data.session_id,
      status: data.status,
      topic: data.topic,
      createdAt: data.created_at,
      knightIds: data.knight_ids || [],
      knight_ids: data.knight_ids || [],
      knight_count: data.knight_ids?.length || 0,
    });
  } catch (error) {
    console.error("[debate/session/[id]] Error fetching session:", error);
    return NextResponse.json(
      { error: "Failed to load session", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
