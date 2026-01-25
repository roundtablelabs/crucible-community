/**
 * Boardroom feature types
 * Extracted from frontend/app/(app)/app/page.tsx
 */

export type SessionListItem = {
  id: string; // Database UUID
  session_id: string; // External session ID (used for /app/live?session=)
  question: string;
  summary: string | null;
  status: "draft" | "running" | "completed" | "failed" | "active";
  created_at: string;
  knight_ids: string[];
};

export type IntakeChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

export type IntakeAssistantResponse = {
  question: string;
  done: boolean;
  summary: string;
};

export type BoardroomIntakeCache = {
  messages: IntakeChatMessage[];
  summary: string | null;
};

export type LaunchpadTransferCache = {
  messages?: IntakeChatMessage[];
  summary?: string | null;
  moderatorBrief?: unknown;
  knights?: unknown;
  knightIds?: unknown;
  autoStart?: boolean;
  fromDocumentUpload?: boolean;
  autoConfirmSummary?: boolean;
};

export type LaunchpadIntakeCache = {
  messages?: IntakeChatMessage[];
  summary?: string | null;
  moderatorBrief?: unknown;
};

export type IntakeRateLimitError = {
  error: string;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter: number;
};

export type UploadRateLimitError = {
  error: string;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfter: number;
};

export type CacheRestoreInfo = {
  messageCount: number;
  hasSummary: boolean;
  timestamp: number;
};

export type PreviewData = {
  fileName: string;
  fileSize: number;
  extractedTextPreview: string;
};

