import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth/get-token-from-request";
import { getServerApiBaseUrl } from "@/lib/api/base";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  
  // Get token from cookie or Authorization header (accepts UUID session tokens and JWT tokens)
  const token = getTokenFromRequest(request);
  
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const apiBase = getServerApiBaseUrl();
    const backendUrl = `${apiBase}/sessions/external/${id}/assigned-models`;
    
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
        { error: "Failed to load assigned models", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[debate/session/[id]/assigned-models] Error fetching assigned models:", error);
    return NextResponse.json(
      { error: "Failed to load assigned models", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
