import { NextResponse } from "next/server";

import { getServerApiBaseUrl } from "@/lib/api/base";
import { generateExecutiveBrief } from "@/lib/pdf/generateExecutiveBrief";
import type { SessionJsonData } from "@/lib/pdf/types";

/**
 * Internal API endpoint for PDF generation.
 * Called by backend to automatically generate PDFs after debate completion.
 * Requires INTERNAL_API_TOKEN for authentication.
 * 
 * Note: PDF generation can take several minutes (LLM calls + Playwright),
 * so we set maxDuration to 5 minutes (300 seconds).
 */
export const maxDuration = 300; // 5 minutes

export async function POST(
  request: Request,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;

  // Verify internal API token
  const authHeader = request.headers.get("Authorization");
  // Trim whitespace from token (common issue when copy-pasting env vars)
  const expectedToken = process.env.INTERNAL_API_TOKEN?.trim();

  if (!expectedToken) {
    console.error("[internal/generate-pdf] INTERNAL_API_TOKEN not configured in frontend environment");
    return NextResponse.json(
      { 
        error: "Internal API not configured",
        details: "INTERNAL_API_TOKEN environment variable is not set in the frontend. Please configure it in your environment variables."
      },
      { status: 500 }
    );
  }

  if (!authHeader) {
    console.error("[internal/generate-pdf] Missing Authorization header");
    return NextResponse.json(
      { 
        error: "Unauthorized",
        details: "Missing Authorization header. Backend must send 'Authorization: Bearer <token>' header."
      },
      { status: 401 }
    );
  }

  // Extract token from "Bearer <token>" format
  const authParts = authHeader.trim().split(/\s+/);
  if (authParts.length !== 2 || authParts[0] !== "Bearer") {
    console.error("[internal/generate-pdf] Invalid Authorization header format", {
      headerLength: authHeader.length,
      headerPrefix: authHeader.substring(0, Math.min(30, authHeader.length)),
      partsCount: authParts.length,
    });
    return NextResponse.json(
      { 
        error: "Unauthorized",
        details: "Invalid Authorization header format. Expected 'Bearer <token>'."
      },
      { status: 401 }
    );
  }

  const receivedToken = authParts[1].trim();
  const trimmedExpectedToken = expectedToken.trim();

  // Compare tokens (with detailed logging for debugging)
  if (receivedToken !== trimmedExpectedToken) {
    // Log diagnostic info (without exposing the actual token values)
    const hasWhitespace = receivedToken !== receivedToken.trim() || trimmedExpectedToken !== expectedToken;
    const charDiff = receivedToken.length !== trimmedExpectedToken.length;
    
    console.error("[internal/generate-pdf] Authorization token mismatch", {
      receivedTokenLength: receivedToken.length,
      expectedTokenLength: trimmedExpectedToken.length,
      lengthMatch: !charDiff,
      hasWhitespace: hasWhitespace,
      receivedFirstChars: receivedToken.substring(0, Math.min(10, receivedToken.length)),
      expectedFirstChars: trimmedExpectedToken.substring(0, Math.min(10, trimmedExpectedToken.length)),
      receivedLastChars: receivedToken.substring(Math.max(0, receivedToken.length - 10)),
      expectedLastChars: trimmedExpectedToken.substring(Math.max(0, trimmedExpectedToken.length - 10)),
      // Check for common issues
      receivedHasNewline: receivedToken.includes("\n") || receivedToken.includes("\r"),
      expectedHasNewline: trimmedExpectedToken.includes("\n") || trimmedExpectedToken.includes("\r"),
    });
    
    return NextResponse.json(
      { 
        error: "Unauthorized",
        details: `Invalid authorization token. Token lengths: received=${receivedToken.length}, expected=${trimmedExpectedToken.length}. Please verify that INTERNAL_API_TOKEN matches exactly in both backend and frontend environment variables (check for extra spaces, newlines, or typos).`
      },
      { status: 401 }
    );
  }

  try {
    // Parse request body - backend should send session JSON directly
    let sessionJson: SessionJsonData;
    try {
      const contentType = request.headers.get("content-type");
      if (contentType?.includes("application/json")) {
        const body = await request.json();
        if (body.sessionJson) {
          sessionJson = body.sessionJson as SessionJsonData;
        } else {
          // If no sessionJson in body, try to fetch from backend
          const apiBaseUrl = getServerApiBaseUrl();
          const jsonResponse = await fetch(
            `${apiBaseUrl}/artifacts/${sessionId}/json`,
            {
              headers: {
                Authorization: authHeader,
              },
              cache: "no-store",
            }
          );

          if (!jsonResponse.ok) {
            const errorText = await jsonResponse.text();
            return NextResponse.json(
              { error: "Failed to load session JSON", details: errorText },
              { status: jsonResponse.status }
            );
          }

          sessionJson = (await jsonResponse.json()) as SessionJsonData;
        }
      } else {
        return NextResponse.json(
          { error: "Content-Type must be application/json" },
          { status: 400 }
        );
      }
    } catch (parseError) {
      return NextResponse.json(
        { error: "Failed to parse request body", details: parseError instanceof Error ? parseError.message : "Unknown error" },
        { status: 400 }
      );
    }

    // Generate PDF using TypeScript implementation
    const pdfBuffer = await generateExecutiveBrief(sessionId, sessionJson, { useLLM: true });

    // Convert Buffer to Uint8Array for NextResponse
    const uint8Array = new Uint8Array(pdfBuffer);

    // Return PDF (no attachment header - backend will handle that)
    return new NextResponse(uint8Array, {
      headers: {
        "Content-Type": "application/pdf",
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("[internal/generate-pdf] Error generating PDF:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const errorStack = error instanceof Error ? error.stack : undefined;
    
    // Log full error details for debugging
    console.error("[internal/generate-pdf] Error details:", {
      message: errorMessage,
      stack: errorStack,
      sessionId,
    });
    
    return NextResponse.json(
      { 
        error: "Failed to generate PDF", 
        details: errorMessage,
        // Include stack trace in development only
        ...(process.env.NODE_ENV === "development" && errorStack ? { stack: errorStack } : {}),
      },
      { status: 500 }
    );
  }
}

