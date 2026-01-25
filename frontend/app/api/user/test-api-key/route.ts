/**
 * Crucible Community Edition
 * Copyright (C) 2025 Roundtable Labs Pty Ltd
 * 
 * Licensed under AGPL-3.0. See LICENSE file for details.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTokenFromRequest } from "@/lib/auth/get-token-from-request";

export async function POST(request: NextRequest) {
  try {
    const token = getTokenFromRequest(request);
    if (!token) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await request.json();
    const { provider, apiKey } = body;

    if (!provider || !apiKey) {
      return NextResponse.json(
        { error: "Provider and API key are required" },
        { status: 400 }
      );
    }

    let isValid = false;
    let errorMessage: string | null = null;

    try {
      switch (provider) {
        case "openrouter": {
          if (!apiKey.trim().startsWith("sk-or-")) {
            return NextResponse.json(
              { error: "Invalid OpenRouter API key format. Keys should start with 'sk-or-'" },
              { status: 400 }
            );
          }
          const response = await fetch("https://openrouter.ai/api/v1/models", {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${apiKey.trim()}`,
              "Content-Type": "application/json",
            },
          });
          isValid = response.ok;
          if (!isValid) {
            const errorData = await response.json().catch(() => ({}));
            errorMessage = errorData.error?.message || `HTTP ${response.status}`;
          }
          break;
        }

        case "openai": {
          if (!apiKey.trim().startsWith("sk-") || apiKey.trim().startsWith("sk-or-")) {
            return NextResponse.json(
              { error: "Invalid OpenAI API key format. Keys should start with 'sk-' (not 'sk-or-')" },
              { status: 400 }
            );
          }
          const response = await fetch("https://api.openai.com/v1/models", {
            method: "GET",
            headers: {
              "Authorization": `Bearer ${apiKey.trim()}`,
              "Content-Type": "application/json",
            },
          });
          isValid = response.ok;
          if (!isValid) {
            const errorData = await response.json().catch(() => ({}));
            errorMessage = errorData.error?.message || `HTTP ${response.status}`;
          }
          break;
        }

        case "anthropic": {
          if (!apiKey.trim().startsWith("sk-ant-")) {
            return NextResponse.json(
              { error: "Invalid Anthropic API key format. Keys should start with 'sk-ant-'" },
              { status: 400 }
            );
          }
          const response = await fetch("https://api.anthropic.com/v1/messages", {
            method: "POST",
            headers: {
              "x-api-key": apiKey.trim(),
              "anthropic-version": "2023-06-01",
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "claude-3-haiku-20240307",
              max_tokens: 10,
              messages: [{ role: "user", content: "Hi" }],
            }),
          });

          const status = response.status;
          
          if (status >= 200 && status < 300) {
            isValid = true;
          } else if (status === 400) {
            // Try to parse error to see if it's a key issue or request issue
            try {
              const errorData = await response.json();
              // If error mentions authentication, key is invalid
              const errorMsg = errorData.error?.message?.toLowerCase() || "";
              if (errorMsg.includes("authentication") ||
                  errorMsg.includes("api key") ||
                  errorMsg.includes("invalid") ||
                  errorMsg.includes("unauthorized")) {
                isValid = false;
                errorMessage = errorData.error?.message || "Invalid API key";
              } else {
                // Otherwise, key is likely valid but request format might be wrong
                isValid = true;
              }
            } catch {
              // Can't parse error, assume key might be valid
              isValid = true;
            }
          } else if (status === 401) {
            isValid = false;
            errorMessage = "Invalid API key";
          } else if (status === 403 || status === 429) {
            isValid = true; // Key is valid but access denied or rate limited
          } else {
            isValid = false;
            errorMessage = `HTTP ${status}`;
          }
          break;
        }

        default:
          return NextResponse.json(
            { error: `Unsupported provider: ${provider}` },
            { status: 400 }
          );
      }

      return NextResponse.json({
        valid: isValid,
        error: errorMessage,
      });
    } catch (error) {
      return NextResponse.json(
        {
          valid: false,
          error: error instanceof Error ? error.message : "Failed to test API key",
        },
        { status: 500 }
      );
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: "Invalid request",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 400 }
    );
  }
}
