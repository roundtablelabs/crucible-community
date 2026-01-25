import { NextRequest, NextResponse } from "next/server";
import { getServerApiBaseUrl } from "@/lib/api/base";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = [".pdf", ".docx"];

type IntakeUploadPreviewResponse = {
  extracted_text_preview: string;
  file_name: string;
  file_size: number;
  word_count: number;
  character_count: number;
};

function validateFileExtension(filename: string): boolean {
  if (!filename) {
    return false;
  }
  const filenameLower = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => filenameLower.endsWith(ext));
}

export async function POST(request: NextRequest) {
  // Check request size
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
      { status: 413 }
    );
  }

  // Parse form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Invalid form data: ${errorMessage}` },
      { status: 400 }
    );
  }

  // Get file
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json(
      { error: "No file provided" },
      { status: 400 }
    );
  }

  // Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
      { status: 413 }
    );
  }

  // Validate file extension
  if (!validateFileExtension(file.name)) {
    return NextResponse.json(
      { error: "Only PDF and DOCX files are supported" },
      { status: 400 }
    );
  }

  // Forward to backend preview endpoint
  // Use getServerApiBaseUrl() which handles Docker service names correctly
  const apiBase = getServerApiBaseUrl();
  const fileBuffer = await file.arrayBuffer();
  const authHeader = request.headers.get("authorization");
  
  // Debug logging in development
  if (process.env.NODE_ENV === "development") {
    console.log("[intake-upload-preview] Auth header present:", !!authHeader);
    if (authHeader) {
      console.log("[intake-upload-preview] Auth header starts with Bearer:", authHeader.startsWith("Bearer "));
    }
  }
  
  try {
    const backendFormData = new FormData();
    const blob = new Blob([fileBuffer], { type: file.type || "application/octet-stream" });
    backendFormData.append("file", blob, file.name);

    const headers: HeadersInit = {};
    // Only send auth header if it exists and looks valid (starts with "Bearer ")
    if (authHeader && authHeader.startsWith("Bearer ")) {
      headers.Authorization = authHeader;
    } else if (authHeader) {
      // If auth header exists but doesn't start with "Bearer ", log it for debugging
      if (process.env.NODE_ENV === "development") {
        console.warn("[intake-upload-preview] Auth header doesn't start with 'Bearer ':", authHeader.substring(0, 20) + "...");
      }
    } else {
      // No auth header - this will cause 401
      if (process.env.NODE_ENV === "development") {
        console.warn("[intake-upload-preview] No authorization header found in request");
      }
    }

    const backendResponse = await fetch(`${apiBase}/intake/upload/preview`, {
      method: "POST",
      headers,
      body: backendFormData,
    });

    if (!backendResponse.ok) {
      const errorBody = (await backendResponse.json().catch(() => ({}))) as { detail?: string; error?: string };
      const errorMessage = errorBody.detail || errorBody.error || "Failed to preview document";
      
      // Log 401 errors with more detail
      if (backendResponse.status === 401) {
        if (process.env.NODE_ENV === "development") {
          console.error("[intake-upload-preview] 401 Unauthorized - Token may be expired or invalid");
          console.error("[intake-upload-preview] Error details:", errorMessage);
          console.error("[intake-upload-preview] Auth header was present:", !!authHeader);
        }
      }
      
      return NextResponse.json(
        { error: errorMessage },
        { status: backendResponse.status }
      );
    }

    const result = (await backendResponse.json()) as IntakeUploadPreviewResponse;
    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Check for connection errors (ECONNREFUSED, fetch failed, etc.)
    const isConnectionError = 
      errorMessage.includes("ECONNREFUSED") || 
      errorMessage.includes("fetch failed") ||
      (error as any).cause?.code === "ECONNREFUSED" ||
      (error as any).cause instanceof AggregateError;
    
    if (isConnectionError) {
      console.error("[intake-upload-preview] Backend API not reachable", error);
      return NextResponse.json(
        { 
          error: "Cannot connect to backend API. Please ensure the backend server is running.",
          details: "Backend API is not reachable. Check if the API server is running on port 8000."
        },
        { status: 503 }
      );
    }
    
    // Other errors
    console.error(`[intake-upload-preview] Preview request error: ${errorMessage}`, error);
    return NextResponse.json(
      { error: `Failed to preview document: ${errorMessage}` },
      { status: 500 }
    );
  }
}

