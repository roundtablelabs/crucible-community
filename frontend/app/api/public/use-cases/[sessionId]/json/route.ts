import { NextResponse } from "next/server";

import { getServerApiBaseUrl } from "@/lib/api/base";

// Only allow access to specific use case sessions
const ALLOWED_SESSION_IDS = new Set([
  "2e580fb4-2305-479e-aa00-960f0478c0ce", // Product Strategy use case (old)
  "4703a989-41df-4a10-9b20-ffa0c3f61be3", // Product Strategy use case (new) - Also used for interactive demo
  "b2bca702-8b0f-49bd-8d9e-c49c329e2d1c", // Enterprise Deal Strategy use case (old)
  "d280db5e-4c89-4e00-97bd-1e10437fb8e0", // Enterprise Deal Strategy use case (new)
]);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  
  // Only allow the specific use case sessions
  if (!ALLOWED_SESSION_IDS.has(sessionId)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  
  // Get API base URL
  const apiBaseUrl = getServerApiBaseUrl();
  const backendUrl = `${apiBaseUrl}/artifacts/public/${sessionId}/json`;
  
  // Log for debugging (remove in production if needed)
  console.log(`[use-cases] Fetching from backend: ${backendUrl}`);
  
  try {
    // Fetch from backend public endpoint (no auth required)
    const response = await fetch(backendUrl, {
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
      },
    });
    
    if (!response.ok) {
      const body = await response.text();
      console.error(`[use-cases] Backend error (${response.status}):`, body);
      return NextResponse.json(
        { 
          error: "Failed to load session JSON", 
          details: body,
          backendUrl, // Include in error for debugging
        },
        { status: response.status },
      );
    }
    
    const payload = await response.json();
    return NextResponse.json(payload);
  } catch (error) {
    console.error("[use-cases] Fetch error:", error);
    return NextResponse.json(
      { 
        error: "Failed to connect to backend API",
        details: error instanceof Error ? error.message : "Unknown error",
        backendUrl, // Include in error for debugging
      },
      { status: 500 },
    );
  }
}

