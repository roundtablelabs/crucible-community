import { NextResponse } from "next/server";
import { getServerApiBaseUrl } from "@/lib/api/base";

/**
 * Proxy endpoint for /version
 * Fetches version information from the backend API
 * This endpoint doesn't require authentication
 */
export async function GET() {
  try {
    const apiBase = getServerApiBaseUrl();
    // Remove /api suffix if present since backend route is /api/version
    const baseUrl = apiBase.replace(/\/api\/?$/, "");
    const backendUrl = `${baseUrl}/api/version`;

    console.log("[version] Fetching version from backend:", backendUrl);

    const response = await fetch(backendUrl, {
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("[version] Backend error:", response.status, body, "URL:", backendUrl);
      return NextResponse.json(
        { error: "Failed to fetch version", details: body },
        { status: response.status },
      );
    }

    const versionInfo = await response.json();
    return NextResponse.json(versionInfo);
  } catch (error) {
    console.error("[version] Error fetching version:", error);
    return NextResponse.json(
      { error: "Failed to fetch version", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
