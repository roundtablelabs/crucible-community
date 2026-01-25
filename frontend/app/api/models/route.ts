import { NextResponse } from "next/server";
import { getServerApiBaseUrl } from "@/lib/api/base";

/**
 * Proxy endpoint for /models
 * Fetches the model catalog from the backend API
 * This endpoint doesn't require authentication (backend /models/ is public)
 */
export async function GET() {
  try {
    const apiBase = getServerApiBaseUrl();
    // Add trailing slash to avoid 307 redirect
    const backendUrl = `${apiBase}/models/`;

    console.log("[models] Fetching model catalog from backend:", backendUrl);

    const response = await fetch(backendUrl, {
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("[models] Backend error:", response.status, body, "URL:", backendUrl);
      return NextResponse.json(
        { error: "Failed to fetch models", details: body },
        { status: response.status },
      );
    }

    const models = await response.json();
    return NextResponse.json(models);
  } catch (error) {
    console.error("[models] Error fetching models:", error);
    return NextResponse.json(
      { error: "Failed to fetch models", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
