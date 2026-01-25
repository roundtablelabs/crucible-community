import { NextRequest, NextResponse } from "next/server";

import { getServerApiBaseUrl } from "@/lib/api/base";
import { getTokenFromRequest } from "@/lib/auth/get-token-from-request";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const { sessionId } = await params;
  // Get token from cookie or Authorization header (accepts UUID session tokens and JWT tokens)
  const token = getTokenFromRequest(request);
  
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const apiBase = getServerApiBaseUrl();
    const backendUrl = `${apiBase}/artifacts/${sessionId}/download-pdf-from-json`;
    
    const response = await fetch(backendUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to download PDF", details: errorText },
        { status: response.status }
      );
    }

    // Get PDF as blob
    const pdfBlob = await response.blob();
    
    // Return PDF with proper headers
    return new NextResponse(pdfBlob, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${sessionId}_debate_document.pdf"`,
        "Cache-Control": "no-cache",
      },
    });
  } catch (error) {
    console.error("[artifacts/download-pdf-from-json] Error:", error);
    return NextResponse.json(
      { error: "Failed to download PDF", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
