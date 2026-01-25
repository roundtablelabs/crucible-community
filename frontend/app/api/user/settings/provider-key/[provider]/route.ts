/**
 * Crucible Community Edition
 * Copyright (C) 2025 Roundtable Labs Pty Ltd
 * 
 * Licensed under AGPL-3.0. See LICENSE file for details.
 */

import { NextRequest, NextResponse } from "next/server";
import { getServerApiBaseUrl } from "@/lib/api/base";
import { getTokenFromRequest } from "@/lib/auth/get-token-from-request";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ provider: string }> }
) {
  try {
    const token = getTokenFromRequest(request);
    const { provider } = await params;
    
    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const apiBaseUrl = getServerApiBaseUrl();
    const response = await fetch(`${apiBaseUrl}/user/settings/provider-key/${provider}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      cache: "no-store",
      credentials: "include",
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[user/settings/provider-key/${provider}] Backend error: status=${response.status} body=${errorText}`);
      return NextResponse.json(
        { error: "Failed to fetch API key" },
        { status: response.status }
      );
    }

    const data = await response.json();
    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    // Try to get provider for logging, but don't fail if params can't be awaited
    let providerName = "unknown";
    try {
      const resolvedParams = await params;
      providerName = resolvedParams.provider;
    } catch {
      // If params can't be resolved, use "unknown"
    }
    console.error(`[user/settings/provider-key/${providerName}] Error: ${msg}`);
    if (stack) console.error(`[user/settings/provider-key/${providerName}] Stack: ${stack}`);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
