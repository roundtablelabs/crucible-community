import { NextResponse } from "next/server";
import { getServerApiBaseUrl } from "@/lib/api/base";
import { getTokenFromRequest } from "@/lib/auth/get-token-from-request";

type UserModel = {
  id: string;
  provider: string;
  api_identifier: string;
  display_name: string;
  description: string | null;
  enabled: boolean;
  metadata: Record<string, unknown> | null;
};

export async function GET(request: Request) {
  try {
    const token = getTokenFromRequest(request);
    
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const provider = searchParams.get("provider");

    const apiBaseUrl = getServerApiBaseUrl();
    let url = `${apiBaseUrl}/user/models/`;
    if (provider) {
      url += `?provider=${encodeURIComponent(provider)}`;
    }

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      return NextResponse.json(
        { error: "Failed to fetch user models", details: errorText },
        { status: response.status }
      );
    }

    const data = await response.json() as UserModel[];
    return NextResponse.json(data);
  } catch (error) {
    console.error("[user/models] Error fetching user models:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const token = getTokenFromRequest(request);

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json() as { provider: string; api_identifier: string; display_name: string; description?: string };

    const apiBaseUrl = getServerApiBaseUrl();
    const response = await fetch(`${apiBaseUrl}/user/models/`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    });

    if (!response.ok) {
      const errorText = await response.text();
      let detail: string | undefined;
      try {
        const err = JSON.parse(errorText) as { detail?: string };
        detail = typeof err.detail === "string" ? err.detail : undefined;
      } catch {
        detail = errorText || undefined;
      }
      return NextResponse.json(
        { error: "Failed to add model", ...(detail ? { details: detail } : {}) },
        { status: response.status }
      );
    }

    const data = await response.json() as UserModel;
    return NextResponse.json(data, { status: 201 });
  } catch (error) {
    console.error("[user/models] Error creating model:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
