import { NextRequest, NextResponse } from "next/server";
import { getServerApiBaseUrl } from "@/lib/api/base";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; token: string }> }
) {
  try {
    const { sessionId, token } = await params;

    if (!sessionId || !token) {
      return NextResponse.json(
        { error: "Session ID and token are required" },
        { status: 400 }
      );
    }

    const API_BASE_URL = getServerApiBaseUrl();

    // Call backend API to get shared session data
    const response = await fetch(
      `${API_BASE_URL}/sessions/${sessionId}/shared/${token}`,
      {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({
        error: "Unknown error",
      }));
      return NextResponse.json(
        { error: errorBody.detail || errorBody.error || "Failed to fetch shared session" },
        { status: response.status }
      );
    }

    const sessionData = await response.json();
    return NextResponse.json(sessionData);
  } catch (error) {
    console.error("Error fetching shared session:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

