export type ModeratorPhase = "brief" | "synthesis";

export type ModeratorExpert = {
  id: string;
  name: string;
  role: string;
};

export type ModeratorBrief = {
  topicSummary: string;
  strategicQuestion: string;
  keyAssumptions: string[];
  recommendedExperts: ModeratorExpert[];
  missionStatement: string;
};

export type ModeratorSynthesis = {
  decision: string;
  rationale: string[];
  risks: string[];
  actions: Array<{ item: string; owner: string; due: string }>;
  confidence: number;
};
