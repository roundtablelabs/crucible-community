import { NextResponse } from "next/server";
import { getServerApiBaseUrl } from "@/lib/api/base";
import { getTokenFromRequest } from "@/lib/auth/get-token-from-request";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const token = getTokenFromRequest(request);
    
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { provider } = await params;

    const apiBaseUrl = getServerApiBaseUrl();
    const response = await fetch(`${apiBaseUrl}/user/models/fetch/${encodeURIComponent(provider)}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to fetch models", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("[user/models/fetch] Error fetching models:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
