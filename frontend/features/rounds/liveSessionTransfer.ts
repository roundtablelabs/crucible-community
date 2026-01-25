import type { ModeratorBrief } from "@/features/moderator/types";

export type TransferKnight = {
  id: string;
  name: string;
  role: string;
  goal: string;
  backstory: string;
  prompt?: string | null;
  model: string;
  stance?: string | null;
  temperature: number;
  websearch_enabled?: boolean;
};

export type LiveSessionTransfer = {
  id: string;
  createdAt: string;
  summary: string | null;
  conversationTranscript: string;
  moderatorBrief: ModeratorBrief | null;
  sessionId?: string;
  knightIds?: string[];
  knights?: TransferKnight[];
};

export const LIVE_SESSION_TRANSFER_KEY = "live-session-transfer";
export const LIVE_SESSION_STATUS_KEY = "live-session-status";
