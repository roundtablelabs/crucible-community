export type DecisionLogSession = {
  /** External session identifier shared with the CLI + audit artifacts */
  id: string;
  /** Database primary key */
  dbId: string;
  status: "running" | "completed" | "error";
  topic: string | null;
  knightIds: string[];
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  artifactUri: string | null;
  auditLogUri: string | null;
  qualityScore: number | null;
  qualityTier: string | null;
  qualityBreakdown: Record<string, number> | null;
};
