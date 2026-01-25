import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getServerApiBaseUrl } from "@/lib/api/base";
import { getTokenFromRequest } from "@/lib/auth/get-token-from-request";
import {
  getSessionRecordForOwner,
  type DebateSessionRecord,
} from "@/lib/server/debateSessionStore";

type SessionDetail = DebateSessionRecord & {
  createdAtIso: string;
  completedAtIso: string | null;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Get token from cookie or Authorization header (accepts UUID session tokens and JWT tokens)
  const token = getTokenFromRequest(request);
  
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  
  // Use a default user ID for Community Edition
  const userId = "community-user";

  const { id } = await params;
  
  // Fetch directly from backend API
  if (token) {
    const apiBaseUrl = getServerApiBaseUrl();
    const response = await fetch(`${apiBaseUrl}/sessions/external/${encodeURIComponent(id)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });
    
    if (!response.ok) {
      if (response.status === 404) {
        return NextResponse.json({ error: "Session not found" }, { status: 404 });
      }
      return NextResponse.json({ error: "Unauthorized" }, { status: response.status });
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
    
    const payload: SessionDetail = {
      id: data.session_id,
      status: data.status,
      topic: data.topic,
      knightIds: data.knight_ids,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
      completedAt: data.completed_at ? new Date(data.completed_at) : null,
      artifactUri: data.artifact_uri,
      auditLogUri: data.audit_log_uri,
      createdAtIso: data.created_at,
      completedAtIso: data.completed_at,
    };
    
    return NextResponse.json(payload);
  }
  
  // Fallback: Use existing function if backend fetch fails
  const record = await getSessionRecordForOwner(userId, id);
  if (!record) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const payload: SessionDetail = {
    ...record,
    createdAtIso: new Date(record.createdAt).toISOString(),
    completedAtIso: record.completedAt ? new Date(record.completedAt).toISOString() : null,
  };

  return NextResponse.json(payload);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  // Get token from cookie or Authorization header (accepts UUID session tokens and JWT tokens)
  const token = getTokenFromRequest(request);
  
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  // First, fetch the session by external ID to get the database UUID
  // The id parameter could be either external session ID or database UUID
  const apiBaseUrl = getServerApiBaseUrl();
  let dbId: string | null = null;
  
  // Try to fetch by external ID first
  const getResponse = await fetch(`${apiBaseUrl}/sessions/external/${encodeURIComponent(id)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });
  
  if (getResponse.ok) {
    const sessionData = await getResponse.json() as { id: string };
    dbId = sessionData.id; // This is the database UUID
  } else {
    // If not found by external ID, assume id is already a database UUID
    dbId = id;
  }

  // Delete using the database UUID
  const response = await fetch(`${apiBaseUrl}/sessions/${dbId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    return NextResponse.json(
      { error: "Failed to delete session", details: body },
      { status: response.status },
    );
  }

  return new NextResponse(null, { status: 204 });
}