import { NextResponse } from "next/server";

import { getTokenFromRequest } from "@/lib/auth/get-token-from-request";
import { getServerApiBaseUrl } from "@/lib/api/base";

export async function GET(request: Request) {
  try {
    // Get token from cookie or Authorization header (accepts UUID session tokens and JWT tokens)
    const token = getTokenFromRequest(request);
    
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const API_BASE_URL = getServerApiBaseUrl();

    const response = await fetch(`${API_BASE_URL}/artifacts/files/list`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const body = await response.text();
      return NextResponse.json(
        { error: "Failed to list files", details: body },
        { status: response.status },
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[artifacts/files/list] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Internal server error" },
      { status: 500 }
    );
  }
}
