import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getServerApiBaseUrl } from "@/lib/api/base";

// DELETE /api/user/account - Delete user account
export async function DELETE(request: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session?.user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Call backend API - use getServerApiBaseUrl() which handles HTTP to HTTPS conversion
    const apiBaseUrl = getServerApiBaseUrl();
    const backendUrl = `${apiBaseUrl}/user/account`;
    
    // Get token from session
    const token = session.user?.token || session.user?.id;
    
    try {
      const backendResponse = await fetch(backendUrl, {
        method: "DELETE",
        headers: {
          "Authorization": token ? `Bearer ${token}` : "",
          "Cookie": request.headers.get("cookie") || "",
        },
        credentials: "include",
      });

      if (backendResponse.status === 204) {
        // 204 No Content - successful deletion
        return NextResponse.json(
          { message: "Account deleted successfully" },
          { status: 200 }
        );
      }
      
      // Log the error for debugging
      const errorText = await backendResponse.text();
      if (process.env.NODE_ENV === "development") {
        console.error("Backend API error:", backendResponse.status, errorText);
      }
      
      const errorData = (() => {
        try {
          return JSON.parse(errorText);
        } catch {
          return { error: errorText || "Failed to delete account" };
        }
      })();
      
      return NextResponse.json(
        { error: errorData.error || "Failed to delete account" },
        { status: backendResponse.status }
      );
    } catch (error) {
      if (process.env.NODE_ENV === "development") {
        console.error("Error calling backend API:", error);
      }
      return NextResponse.json(
        { error: "Failed to connect to backend" },
        { status: 500 }
      );
    }
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("Error deleting account:", error);
    }
    return NextResponse.json(
      { error: "Failed to delete account" },
      { status: 500 }
    );
  }
}

