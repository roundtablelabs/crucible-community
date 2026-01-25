import { getServerApiBaseUrl } from "@/lib/api/base";
import { auth } from "@/auth";
import type { ModeratorBrief } from "@/features/moderator/types";
import type { TransferKnight } from "@/features/rounds/liveSessionTransfer";

type SessionRecord = {
  id: string;
  question: string;
  summary: string | null;
  status: "draft" | "running" | "completed" | "failed" | "active";
  created_at: string;
  knight_ids: string[];
};

export type DebateSessionRecord = {
  id: string;
  status: "running" | "completed" | "error";
  topic: string | null;
  knightIds: string[];
  createdAt: Date | string;
  updatedAt: Date | string;
  completedAt: Date | string | null;
  artifactUri: string | null;
  auditLogUri: string | null;
};

// In-memory store for session records (used for local caching)
const sessionStore = new Map<string, {
  sessionId: string;
  topic: string;
  moderatorBrief: ModeratorBrief | null;
  knights: TransferKnight[];
  ownerId: string;
  ownerEmail: string | null;
  logs: string[];
  status: "draft" | "running" | "completed" | "error";
}>();

export function createSessionRecord(
  sessionId: string,
  topic: string,
  options: {
    moderatorBrief?: ModeratorBrief | null;
    knights: TransferKnight[];
    ownerId: string;
    ownerEmail: string | null;
  }
): void {
  // Store session record in memory (actual persistence happens via backend API)
  sessionStore.set(sessionId, {
    sessionId,
    topic,
    moderatorBrief: options.moderatorBrief ?? null,
    knights: options.knights,
    ownerId: options.ownerId,
    ownerEmail: options.ownerEmail,
    logs: [],
    status: "draft",
  });
  console.log(`[debateSessionStore] Created in-memory session record: ${sessionId}`);
}

export function appendSessionLog(sessionId: string, logEntry: string): void {
  const record = sessionStore.get(sessionId);
  if (record) {
    record.logs.push(logEntry);
  }
}

export function markSessionComplete(sessionId: string): void {
  const record = sessionStore.get(sessionId);
  if (record) {
    record.status = "completed";
  }
}

export function markSessionError(sessionId: string): void {
  const record = sessionStore.get(sessionId);
  if (record) {
    record.status = "error";
  }
}

export async function getSessionRecord(sessionId: string): Promise<SessionRecord | null> {
  try {
    const session = await auth();
    const token = session?.user?.token || session?.user?.id;
    
    if (!token) {
      return null;
    }

    const apiBaseUrl = getServerApiBaseUrl();
    // Use /sessions/external/ since sessionId is the external session ID (not database UUID)
    const response = await fetch(`${apiBaseUrl}/sessions/external/${encodeURIComponent(sessionId)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as SessionRecord;
  } catch (error) {
    console.error("[debateSessionStore] Error fetching session:", error);
    return null;
  }
}

export async function getSessionRecordForOwner(
  userId: string,
  sessionId: string
): Promise<DebateSessionRecord | null> {
  try {
    const session = await auth();
    const token = session?.user?.token || session?.user?.id;
    
    if (!token) {
      return null;
    }

    const apiBaseUrl = getServerApiBaseUrl();
    // Use /sessions/external/ since sessionId is the external session ID (not database UUID)
    const response = await fetch(`${apiBaseUrl}/sessions/external/${encodeURIComponent(sessionId)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as {
      id: string;
      session_id: string;
      knight_ids: string[];
      topic: string | null;
      artifact_uri: string | null;
      audit_log_uri: string | null;
      status: "running" | "completed" | "error";
      created_at: string;
      updated_at: string;
      completed_at: string | null;
    };

    return {
      id: data.session_id,
      status: data.status,
      topic: data.topic,
      knightIds: data.knight_ids,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      completedAt: data.completed_at,
      artifactUri: data.artifact_uri,
      auditLogUri: data.audit_log_uri,
    };
  } catch (error) {
    console.error("[debateSessionStore] Error fetching session:", error);
    return null;
  }
}
