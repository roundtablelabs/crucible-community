import { z } from "zod";

// Debate event structure from session JSON
export interface DebateEvent {
  id: string;
  sequence_id: number;
  phase: string;
  event_type: string;
  payload: Record<string, any>;
  created_at: string;
}

export interface SessionJsonData {
  session_metadata: {
    topic?: string;
    participants?: string[] | Array<{ name?: string; knight_name?: string; role?: string; id?: string }>;
  };
  events: DebateEvent[];
}

// Extracted debate content for LLM
export interface ExtractedDebateContent {
  question: string;
  debate_content: string;
  confidence: number;
  // Additional extracted data for richer context
  researchFindings?: string[];
  rebuttals?: string[];
  factChecks?: string[];
  citations?: string[];
  translatorOutput?: string;
}

// LLM Response Schema
const CriticalRiskSchema = z.object({
  description: z.string(),
  impact: z.number().min(1).max(5),
  probability: z.number().min(1).max(5),
  mitigation: z.string(),
});

const SWOTSchema = z.object({
  strengths: z.array(z.string()),
  weaknesses: z.array(z.string()),
  opportunities: z.array(z.string()),
  threats: z.array(z.string()),
});

const RiskMatrixSchema = z.object({
  high_impact_high_prob: z.array(z.string()),
  high_impact_low_prob: z.array(z.string()),
  low_impact_high_prob: z.array(z.string()),
  low_impact_low_prob: z.array(z.string()),
});

const TimelinePhaseSchema = z.object({
  phase: z.string(),
  duration: z.string(),
  activities: z.array(z.string()),
  deliverables: z.array(z.string()),
  dependencies: z.array(z.string()),
});

export const ExecutiveBriefResponseSchema = z.object({
  bottom_line: z.string(),
  opportunity: z.string(),
  recommendation: z.string(),
  requirement: z.string(),
  executive_summary: z.string(),
  rationale: z.array(z.string()),
  critical_risks: z.array(CriticalRiskSchema),
  immediate_actions: z.array(z.string()),
  critical_conditions: z.array(z.string()),
  confidence_level: z.number().optional(),
  quotable_insights: z.array(z.string()),
  swot: SWOTSchema.optional(),
  risk_matrix: RiskMatrixSchema.optional(),
  timeline: z.array(TimelinePhaseSchema).optional(),
});

export type ExecutiveBriefResponse = z.infer<typeof ExecutiveBriefResponseSchema>;
export type CriticalRisk = z.infer<typeof CriticalRiskSchema>;

// PDF Generation Props
export interface ExecutiveBriefProps {
  question: string;
  coverTitle?: string;
  coverSubtitle?: string;
  date: string;
  confidence: number;
  bottomLine?: string;
  opportunity?: string;
  recommendation?: string;
  requirement?: string;
  executiveSummary?: string;
  rationale?: string[];
  criticalRisks?: CriticalRisk[];
  immediateActions?: string[];
  criticalConditions?: string[];
  quotableInsights?: string[];
}

