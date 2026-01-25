import { NextResponse } from "next/server";

import { getTokenFromRequest } from "@/lib/auth/get-token-from-request";
import { getServerApiBaseUrl } from "@/lib/api/base";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ filename: string }> }
) {
  try {
    const { filename } = await params;
    
    // Security: Prevent path traversal
    if (filename.includes("..") || filename.includes("/") || filename.includes("\\")) {
      return NextResponse.json({ error: "Invalid filename" }, { status: 400 });
    }
    
    // Get token from cookie or Authorization header (accepts UUID session tokens and JWT tokens)
    const token = getTokenFromRequest(request);
    
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const API_BASE_URL = getServerApiBaseUrl();

    const response = await fetch(`${API_BASE_URL}/artifacts/files/${encodeURIComponent(filename)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      return NextResponse.json(
        { error: "Failed to fetch file", details: body },
        { status: response.status },
      );
    }

    // Get the file content and content type
    const blob = await response.blob();
    const contentType = response.headers.get("content-type") || "application/octet-stream";
    const contentDisposition = response.headers.get("content-disposition");

    return new NextResponse(blob, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        ...(contentDisposition ? { "Content-Disposition": contentDisposition } : {}),
      },
    });
  } catch (error) {
    console.error("[artifacts/files] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
