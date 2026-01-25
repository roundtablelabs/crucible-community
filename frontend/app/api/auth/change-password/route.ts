import { NextRequest, NextResponse } from "next/server";
import { getServerApiBaseUrl } from "@/lib/api/base";
import { getTokenFromRequest } from "@/lib/auth/get-token-from-request";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { currentPassword, newPassword } = body;

    if (!currentPassword || !newPassword) {
      return NextResponse.json(
        { error: "Current password and new password are required" },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { error: "New password must be at least 8 characters long" },
        { status: 400 }
      );
    }

    const API_BASE_URL = getServerApiBaseUrl();
    const token = getTokenFromRequest(request);

    const response = await fetch(`${API_BASE_URL}/auth/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        currentPassword,
        newPassword,
      }),
      credentials: "include",
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      let errorMessage = "Failed to change password";
      
      try {
        const errorJson = JSON.parse(errorText) as { detail?: string; message?: string };
        errorMessage = errorJson.detail || errorJson.message || errorMessage;
      } catch {
        if (errorText && errorText !== "Unknown error") {
          errorMessage = errorText;
        }
      }

      return NextResponse.json(
        { error: errorMessage },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[auth/change-password] Error:", msg);
    
    const isNetworkError = msg.includes("fetch") || msg.includes("network") || msg.includes("ECONNREFUSED");
    
    return NextResponse.json(
      {
        error: isNetworkError
          ? "Cannot connect to backend server. Please check if the backend is running."
          : "An unexpected error occurred while changing password.",
      },
      { status: isNetworkError ? 503 : 500 }
    );
  }
}
