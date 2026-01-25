import { NextResponse } from "next/server";
import { getServerApiBaseUrl } from "@/lib/api/base";

/**
 * Proxy endpoint for /license/current
 * Fetches the license content from the backend API
 * This endpoint doesn't require authentication
 */
export async function GET() {
  try {
    const apiBase = getServerApiBaseUrl();
    // Remove /api suffix if present since backend route is /api/license/current
    const baseUrl = apiBase.replace(/\/api\/?$/, "");
    const backendUrl = `${baseUrl}/api/license/current`;

    console.log("[license] Fetching license from backend:", backendUrl);

    const response = await fetch(backendUrl, {
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      console.error("[license] Backend error:", response.status, body, "URL:", backendUrl);
      return NextResponse.json(
        { error: "Failed to fetch license", details: body },
        { status: response.status },
      );
    }

    const licenseInfo = await response.json();
    return NextResponse.json(licenseInfo);
  } catch (error) {
    console.error("[license] Error fetching license:", error);
    return NextResponse.json(
      { error: "Failed to fetch license", details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
