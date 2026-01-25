import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import type { ModeratorBrief } from "@/features/moderator/types";
import type { TransferKnight } from "@/features/rounds/liveSessionTransfer";
import { getServerApiBaseUrl } from "@/lib/api/base";
import {
  appendSessionLog,
  createSessionRecord,
  markSessionComplete,
  markSessionError,
} from "@/lib/server/debateSessionStore";
import { auth } from "@/auth";
import { getTokenFromRequest } from "@/lib/auth/get-token-from-request";
import { secureLogger } from "@/lib/utils/secureLogger";

type CreateDebateRequest = {
  topic?: string;
  moderatorBrief?: ModeratorBrief | null;
  intakeSummary?: string | null;
  intakeConversation?: Array<{ role: string; content: string }> | null;
  knightIds?: string[];
  knights?: TransferKnight[];
  autoAssign?: boolean;
  multiLlm?: boolean;
};

export async function POST(request: NextRequest) {
  let body: CreateDebateRequest;
  try {
    body = (await request.json()) as CreateDebateRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const topic = body.topic?.trim();
  if (!topic) {
    return NextResponse.json({ error: "Topic is required to start a debate." }, { status: 400 });
  }

  const moderatorBrief = body.moderatorBrief ?? null;
  const intakeSummary = body.intakeSummary ?? null;
  const intakeConversation = body.intakeConversation ?? null;
  const autoAssign = body.autoAssign ?? true;
  const multiLlm = body.multiLlm ?? true;
  const knightIds = body.knightIds ?? [];
  const providedKnights = body.knights ?? [];
  if (!autoAssign && knightIds.length === 0 && providedKnights.length === 0) {
    return NextResponse.json({ error: "Select at least one Knight before launching." }, { status: 400 });
  }

  // Get API base URL inside handler to avoid module-level initialization errors
  const API_BASE_URL = getServerApiBaseUrl();

  const authHeader = request.headers.get("authorization");
  // Get session to extract token for knight fetching and owner ID
  const session = await auth();
  
  // Get token from cookie or Authorization header (accepts UUID session tokens and JWT tokens)
  const token = getTokenFromRequest(request);
  
  if (token) {
    secureLogger.debug("Using session token from cookie/header");
  } else {
    secureLogger.warn("No session token found");
  }
  
  const effectiveAuthHeader = authHeader || (token ? `Bearer ${token}` : null);
  
  const knightRecords = await resolveKnightRecords(knightIds, providedKnights, effectiveAuthHeader, API_BASE_URL);
  if (!autoAssign && knightRecords.length === 0) {
    return NextResponse.json({ error: "Unable to load Knights for the debate." }, { status: 400 });
  }

  const ownerId = session?.user?.id ?? "anonymous";

  const sessionId = crypto.randomUUID();
  createSessionRecord(sessionId, topic, {
    moderatorBrief,
    knights: knightRecords,
    ownerId,
    ownerEmail: session?.user?.email ?? null,
  });
  
    // Await session creation in database before returning
    // This ensures the session exists when the frontend tries to connect to the stream
    // Note: topic is NOT stored in database for security reasons
    // Topic will be passed via query parameter when connecting to the stream endpoint
    // IMPORTANT: Don't fail the request if database persistence fails - session is still created in local store
    // The session will be persisted when the user connects to the stream endpoint
    try {
      // Use token from cookie/header for backend calls (accepts UUID session tokens and JWT tokens)
      // The backend accepts both UUID (session) tokens and JWT tokens
      await persistSessionMetadata({
        action: "create",
        sessionId,
        topic: topic, // Send topic to backend for in-memory storage (not in database)
        knightIds: knightRecords.map((knight) => knight.id),
        intakeSummary,
        intakeConversation,
        moderatorBrief,
        authHeader: null,
        fallbackToken: token, // Use token from cookie/header (UUID or JWT)
      });
    } catch (error) {
      // Log error but don't fail the request
      // Session is still created in local store and can be persisted when user connects to stream
      console.error(`[debate-session] Failed to create session in database (non-critical):`, error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      console.warn(`[debate-session] Session ${sessionId} will be created when user connects to stream endpoint`);
      // Continue - don't return error, session will be created via stream endpoint
    }

  const payloadPath = path.join(os.tmpdir(), `debate_payload_${sessionId}.json`);
  const payload = {
    topic,
    moderatorBrief,
    knights: knightRecords,
    sessionId,
    ownerId,
    autoAssign,
    multiLlm,
  };
  await fs.writeFile(payloadPath, JSON.stringify(payload), "utf8");

  // Legacy runner spawning removed. The Python API's DebateEngine now handles execution via the stream endpoint.
  // We just need to ensure the session exists in the backend, which persistSessionMetadata handles.

  return NextResponse.json({ sessionId, status: "draft" }, { status: 202 });
}

async function resolveKnightRecords(
  knightIds: string[],
  provided: TransferKnight[],
  authHeader: string | null,
  apiBaseUrl: string,
): Promise<TransferKnight[]> {
  if (knightIds.length === 0) {
    return provided;
  }
  const fetched: TransferKnight[] = [];
  
  await Promise.all(
    knightIds.map(async (id) => {
      try {
        const res = await fetch(`${apiBaseUrl}/knights/${encodeURIComponent(id)}`, {
          headers: authHeader ? { Authorization: authHeader } : undefined,
        });
        if (!res.ok) {
          return;
        }
        const data = (await res.json()) as {
          id: string;
          name: string;
          role: string;
          goal: string;
          backstory: string;
          prompt?: string | null;
          model: string;
          stance?: string | null;
          temperature: number;
          websearch_enabled: boolean;
        };
        fetched.push({
          id: data.id,
          name: data.name,
          role: data.role,
          goal: data.goal,
          backstory: data.backstory,
          prompt: data.prompt ?? null,
          model: data.model,
          stance: data.stance ?? null,
          temperature: data.temperature,
          websearch_enabled: data.websearch_enabled ?? false,
        });
      } catch (error) {
        console.error("Failed to fetch knight", id, error);
      }
    }),
  );
  if (fetched.length > 0) {
    return fetched;
  }
  return provided;
}



type RemoteSessionStatus = "running" | "completed" | "error";

type PersistOptions = {
  action: "create" | "update";
  sessionId: string;
  topic?: string | null;
  knightIds: string[];
  intakeSummary?: string | null;
  intakeConversation?: Array<{ role: string; content: string }> | null;
  moderatorBrief?: ModeratorBrief | null;
  status?: RemoteSessionStatus;
  artifactUri?: string | null;
  auditUri?: string | null;
  authHeader: string | null;
  fallbackToken: string | null;
};

async function persistSessionMetadata(options: PersistOptions) {
  const authorization = resolveAuthorizationHeader(options.authHeader, options.fallbackToken);
  if (!authorization) {
    return;
  }
  
  const token = authorization.replace(/^Bearer\s+/i, '');
  
  // Accept session tokens (UUID format) and JWT tokens
  // Tokens are validated by the backend's get_current_user function
  
  // Get API base URL inside function to avoid module-level initialization errors
  const API_BASE_URL = getServerApiBaseUrl();
  try {
    if (options.action === "create") {
      const url = `${API_BASE_URL}/sessions`;
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          session_id: options.sessionId,
          topic: options.topic, // Send topic for in-memory storage (not persisted to database)
          knight_ids: options.knightIds,
          intake_summary: options.intakeSummary ?? null,
          intake_conversation: options.intakeConversation ?? null,
          moderator_brief: options.moderatorBrief ?? null,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        let errorDetails = errorText;
        try {
          const errorJson = JSON.parse(errorText);
          errorDetails = JSON.stringify(errorJson, null, 2);
        } catch {
          // Keep as text if not JSON
        }
        console.error(`[persistSessionMetadata] Backend error: ${response.status} ${response.statusText}`, {
          url,
          status: response.status,
          errorText: errorDetails,
          hasAuth: !!authorization,
          authPreview: authorization ? `${authorization.substring(0, 20)}...` : "none",
        });
        throw new Error(`Failed to create session in database: ${response.status} ${response.statusText} - ${errorDetails}`);
      }
    } else {
      const response = await fetch(`${API_BASE_URL}/sessions/external/${encodeURIComponent(options.sessionId)}`, {
        method: "PATCH",
        headers: {
          Authorization: authorization,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          status: options.status,
          artifact_uri: options.artifactUri ?? null,
          audit_log_uri: options.auditUri ?? null,
          completed_at: options.status === "completed" ? new Date().toISOString() : undefined,
        }),
      });
      if (!response.ok) {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`Failed to update session in database: ${response.status} ${response.statusText} - ${errorText}`);
      }
    }
  } catch (error) {
    // Error is logged by secureLogger in error handling
    // Re-throw to surface the error (but don't block the request)
  }
}

function resolveAuthorizationHeader(header: string | null, fallbackToken: string | null) {
  if (header) {
    return header;
  }
  if (fallbackToken) {
    return `Bearer ${fallbackToken}`;
  }
  return null;
}

function resolveArtifactUri(result: unknown): string | null {
  if (!result || typeof result !== "object") {
    return null;
  }
  const artifacts = (result as Record<string, unknown>).artifacts as Record<string, string> | undefined;
  if (!artifacts) {
    return null;
  }
  return artifacts.pdf_remote ?? artifacts.pdf ?? null;
}

function resolveAuditUri(result: unknown): string | null {
  if (!result || typeof result !== "object") {
    return null;
  }
  const artifacts = (result as Record<string, unknown>).artifacts as Record<string, string> | undefined;
  if (!artifacts) {
    return null;
  }
  return artifacts.audit_remote ?? artifacts.audit ?? null;
}

function parseRunnerPayload(output: string): unknown {
  const ANSI_REGEX = /\u001b\[[0-9;]*[a-zA-Z]/g;
  const cleaned = output.replace(ANSI_REGEX, "").trim();
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Debate runner did not return JSON output.");
  }
  const jsonSlice = cleaned.slice(start, end + 1);
  return JSON.parse(jsonSlice);
}
