import { NextResponse } from "next/server";

import { getTokenFromRequest } from "@/lib/auth/get-token-from-request";
import { getServerApiBaseUrl } from "@/lib/api/base";
import { secureLogger } from "@/lib/utils/secureLogger";

/**
 * Generate PDF by proxying to the backend.
 * The backend runs on Railway where Playwright is properly installed.
 * 
 * Flow:
 * 1. Frontend receives request from client (live page, sessions page, etc.)
 * 2. Frontend proxies to backend /artifacts/{sessionId}/generate-pdf
 * 3. Backend generates PDF using Playwright + LLM
 * 4. Backend uploads PDF to S3 and returns success
 * 5. Frontend returns the response to client
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  // Get token from cookie or Authorization header (accepts UUID session tokens and JWT tokens)
  // The backend accepts both UUID (session) tokens and JWT tokens
  const token = getTokenFromRequest(request);
  
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // Proxy to backend - backend handles PDF generation with Playwright
    // This avoids running Playwright in the frontend container
    const apiBaseUrl = getServerApiBaseUrl();
    
    const backendResponse = await fetch(
      `${apiBaseUrl}/artifacts/${sessionId}/generate-pdf`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
      }
    );

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text();
      secureLogger.error(`[generate-pdf] Backend error: ${backendResponse.status} - ${errorText}`);
      
      // Try to parse as JSON for more detailed error
      try {
        const errorJson = JSON.parse(errorText);
        // Backend returns errors in format: { detail: { code, message, details } }
        // Extract the actual error message from the nested structure
        let errorMessage = errorText; // fallback to full text
        if (errorJson.detail) {
          if (typeof errorJson.detail === 'string') {
            errorMessage = errorJson.detail;
          } else if (errorJson.detail.message) {
            errorMessage = errorJson.detail.message;
          } else if (errorJson.detail.error) {
            errorMessage = errorJson.detail.error;
          }
        } else if (errorJson.message) {
          errorMessage = errorJson.message;
        } else if (errorJson.error) {
          errorMessage = errorJson.error;
        }
        return NextResponse.json(
          { error: "Failed to generate PDF", details: errorMessage },
          { status: backendResponse.status }
        );
      } catch {
        return NextResponse.json(
          { error: "Failed to generate PDF", details: errorText },
          { status: backendResponse.status }
        );
      }
    }

    // Return success response from backend
    const result = await backendResponse.json();
    
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    secureLogger.error("[generate-pdf] Error generating PDF:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to generate PDF", details: errorMessage },
      { status: 500 }
    );
  }
}

