export type ConversationData = {
  topic: string;
  goal: string;
  constraints: string;
  artifacts: string[];
  summary: string;
};

export type KnightRecommendation = {
  id: string;
  name: string;
  role: string;
  reason: string;
};
