import type { Stage } from "@/features/rounds/types";

export type DebateRunStatus = "idle" | "running" | "completed" | "error";

export type DebateParticipant = {
  name: string;
  role: string;
  stance?: string | null;
  goal?: string | null;
  tools?: string[] | null;
};

export type DebateTranscriptEntry = {
  task: string;
  role?: string;
  agent?: string;
  output?: string;
};

export type EvidenceIndex = {
  by_task?: Record<string, { markers?: string[]; urls?: string[] }>;
  all_urls?: string[];
};

export type AuditTimelineEntry = {
  task: string;
  agent_role?: string;
  agent_goal?: string;
  headline?: string;
  why?: string[];
  citations?: { markers?: string[]; urls?: string[] };
  linked_tool_calls?: number[];
  excerpt?: string;
};

export type AuditTrail = {
  topic?: string;
  timeline?: AuditTimelineEntry[];
  decisions?: {
    final_judge?: {
      present?: boolean;
      summary?: string;
      round1_highlights?: string[];
      round2_insights?: string[];
      alignment?: { consensus?: string[]; contention?: string[] };
      recommended_actions?: string[];
      confidence?: number;
    };
  };
  references?: {
    all_urls?: string[];
    tool_calls?: Array<{
      id: number;
      tool?: string;
      urls?: string[];
      ok?: boolean;
      duration_ms?: number;
    }>;
  };
  release_ready?: boolean;
};

export type TrustReport = {
  schema_version?: string;
  topic?: string;
  evidence?: EvidenceIndex;
  models?: {
    moderator?: { provider?: string; model?: string };
    participants?: Array<{ role?: string; provider?: string; model?: string }>;
    final_judge?: { provider?: string; model?: string };
  };
  release?: {
    ok?: boolean;
    tool_budget_ok?: boolean;
    tool_limit?: number;
  };
};

export type FinalJudgeSummary = {
  summary?: string;
  round1_highlights?: string[];
  round2_insights?: string[];
  recommended_actions?: string[];
  alignment?: { consensus?: string[]; contention?: string[] };
  confidence?: number;
};

export type DebateSessionApiResult = {
  topic?: string;
  rounds?: number;
  participants?: DebateParticipant[];
  transcript?: DebateTranscriptEntry[];
  final_summary?: FinalJudgeSummary | null;
  evidence?: EvidenceIndex | null;
  trust_report?: TrustReport | null;
  audit_trail?: AuditTrail | null;
  release_ok?: boolean;
  gates?: {
    final_summary_present?: boolean;
    tool_call_limit?: {
      limit?: number;
      actual?: number;
      ok?: boolean;
    };
  };
  stage?: Stage;
};
