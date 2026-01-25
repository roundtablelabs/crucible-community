export type Stage =
  | "PREP"
  | "RESEARCH"
  | "OPENING"
  | "CLAIMS"
  | "CROSS_EXAMINATION"
  | "RED_TEAM"
  | "CONVERGENCE"
  | "TRANSLATOR"
  | "ARTIFACT_READY"
  | "WRAP";

export type StageStatus = "done" | "current" | "now" | "up-next" | "later" | "locked";

export type DecisionConfidence = "low" | "medium" | "high";

export type DecisionStatus = "PROPOSED" | "AGREED" | "COMMITTED" | "VERIFIED" | "REVISIT";

export type DecisionType = "CONSENT" | "VOTE";

export interface StageMeta {
  stage: Stage;
  label: string;
  summary?: string;
  exitCriteria: string[];
  status: StageStatus;
  startedAt?: string;
  endedAt?: string;
  ownerId?: string;
  exitCriteriaMet?: boolean;
}

export interface ParticipantPresence {
  id: string;
  name: string;
  role: "host" | "scribe" | "decider" | "contributor" | "observer" | "bot";
  presence: "online" | "offline";
  avatarUrl?: string;
  speakingMs?: number;
  isSpeaking?: boolean;
  isDominant?: boolean;
}

export interface DecisionLedgerEntry {
  id: string;
  statement: string;
  status: DecisionStatus;
  owner: string;
  dueDate?: string;
  confidence?: DecisionConfidence;
  needsAttention?: boolean;
}

export interface InsightItem {
  id: string;
  title: string;
  description: string;
  kind: "summary" | "risk" | "decision" | "note";
  source?: string;
  confidence?: DecisionConfidence;
  pinned?: boolean;
}

export interface ExpertClaim {
  id: string;
  speaker: string;
  claim: string;
  evidence?: string;
  confidence?: DecisionConfidence;
  pinned?: boolean;
}

export interface HealthSnapshot {
  timeDriftMin: number;
  speakingBalance: number;
  decisionConfidence: number;
  riskCount: number;
}
