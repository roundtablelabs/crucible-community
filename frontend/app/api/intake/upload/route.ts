import { NextRequest, NextResponse } from "next/server";
import { getUserFriendlyError } from "@/lib/utils/errorSanitizer";
import { getServerApiBaseUrl } from "@/lib/api/base";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = [".pdf", ".docx"];

type IntakeUploadResponse = {
  summary: string;
  done: boolean;
  extracted_text_preview?: string;
};


/**
 * Validates file extension.
 * 
 * @param filename - File name to validate
 * @returns True if valid, false otherwise
 */
function validateFileExtension(filename: string): boolean {
  if (!filename) {
    return false;
  }
  const filenameLower = filename.toLowerCase();
  return ALLOWED_EXTENSIONS.some((ext) => filenameLower.endsWith(ext));
}

export async function POST(request: NextRequest) {
  // 1. Check request size to prevent DoS attacks
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number.parseInt(contentLength, 10) > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
      { status: 413 }
    );
  }

  // 2. Parse form data
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    if (process.env.NODE_ENV === "development") {
      console.error("[intake-upload] Form data parse error:", errorMessage);
    }
    return NextResponse.json(
      { error: `Invalid form data: ${errorMessage}` },
      { status: 400 }
    );
  }

  // 3. Get file from form data
  const file = formData.get("file") as File | null;
  if (!file) {
    return NextResponse.json(
      { error: "No file provided" },
      { status: 400 }
    );
  }

  // 4. Validate file size
  if (file.size > MAX_FILE_SIZE) {
    return NextResponse.json(
      { error: `File size exceeds maximum allowed size of ${MAX_FILE_SIZE / (1024 * 1024)}MB` },
      { status: 413 }
    );
  }

  // 5. Validate file extension
  if (!validateFileExtension(file.name)) {
    return NextResponse.json(
      { error: "Only PDF and DOCX files are supported" },
      { status: 400 }
    );
  }

  // 6. Get auth token from client's Authorization header (Community Edition)
  // In Community Edition, the client sends the session token in the Authorization header
  const authHeader = request.headers.get("authorization");
  
  // Debug logging in development
  if (process.env.NODE_ENV === "development") {
    console.log("[intake-upload] Auth header present:", !!authHeader);
    if (authHeader) {
      console.log("[intake-upload] Auth header starts with Bearer:", authHeader.startsWith("Bearer "));
    }
  }
  
  // 7. Rate limiting is disabled in community edition
  // Forward to backend API as multipart/form-data
  const apiBase = getServerApiBaseUrl();
  const fileBuffer = await file.arrayBuffer();
  
  try {
    // Create FormData for backend (FastAPI expects multipart/form-data)
    const backendFormData = new FormData();
    const blob = new Blob([fileBuffer], { type: file.type || "application/octet-stream" });
    backendFormData.append("file", blob, file.name);

    const headers: HeadersInit = {};
    
    // Forward client's Authorization header to backend
    if (authHeader) {
      headers.Authorization = authHeader;
    }

    const backendResponse = await fetch(`${apiBase}/intake/upload`, {
      method: "POST",
      headers,
      body: backendFormData,
    });

    if (!backendResponse.ok) {
      const errorBody = (await backendResponse.json().catch(() => ({}))) as { detail?: string; error?: string };
      const rawErrorMessage = errorBody.detail || errorBody.error || "Failed to process document";
      
      // Log 401 errors with more detail (development only)
      if (backendResponse.status === 401) {
        if (process.env.NODE_ENV === "development") {
          console.error("[intake-upload] 401 Unauthorized - Token may be expired or invalid");
          console.error("[intake-upload] Error details:", rawErrorMessage);
          console.error("[intake-upload] Auth header was present:", !!authHeader);
        }
      } else if (process.env.NODE_ENV === "development") {
        console.error("[intake-upload] Backend error:", rawErrorMessage);
      }
      
      // Sanitize error message before returning to client
      const sanitizedError = getUserFriendlyError(new Error(rawErrorMessage));
      
      return NextResponse.json(
        { error: sanitizedError },
        { status: backendResponse.status }
      );
    }

    const result = (await backendResponse.json()) as IntakeUploadResponse;
    return NextResponse.json(result);
  } catch (error) {
    const rawErrorMessage = error instanceof Error ? error.message : "Unknown error";
    if (process.env.NODE_ENV === "development") {
      console.error(`[intake-upload] Upload request error: ${rawErrorMessage}`, error);
    }
    // Sanitize error message before returning to client
    const sanitizedError = getUserFriendlyError(error);
    return NextResponse.json(
      { error: `Failed to upload document: ${sanitizedError}` },
      { status: 500 }
    );
  }
}

