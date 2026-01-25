import type { ExpertClaim, InsightItem } from "@/features/rounds/types";
import type { LiveSessionTransfer, TransferKnight } from "@/features/rounds/liveSessionTransfer";

import type { DebateParticipant, DebateSessionApiResult, DebateTranscriptEntry } from "./types";

export const MAX_LOG_LINES = 18;

export function parseJson<T>(payload: string): T {
  if (!payload) {
    return {} as T;
  }
  try {
    return JSON.parse(payload) as T;
  } catch {
    return {} as T;
  }
}

export function formatTimestamp(value?: string | null): string {
  if (!value) {
    return "-";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export function snippet(text: string | null | undefined, limit = 280): string {
  if (!text) {
    return "";
  }
  const trimmed = text.trim();
  if (trimmed.length <= limit) {
    return trimmed;
  }
  return `${trimmed.slice(0, limit - 3).trim()}...`;
}

export function buildParticipantsFromKnights(knights?: TransferKnight[]): DebateParticipant[] {
  if (!Array.isArray(knights)) {
    return [];
  }
  return knights.map((knight) => ({
    name: knight.name,
    role: knight.role,
    stance: knight.stance ?? null,
    goal: knight.goal ?? knight.backstory ?? null,
    tools: knight.websearch_enabled ? ["web_search"] : knight.prompt ? ["custom-brief"] : null,
  }));
}

export function collectEvidenceUrls(result: DebateSessionApiResult | null): string[] {
  if (!result) {
    return [];
  }
  const pools = [
    result.evidence?.all_urls ?? [],
    result.audit_trail?.references?.all_urls ?? [],
    result.trust_report?.evidence?.all_urls ?? [],
  ];
  const urls = new Set<string>();
  pools.forEach((list) => {
    list?.forEach((url) => {
      if (url) {
        urls.add(url);
      }
    });
  });
  return Array.from(urls);
}

export function deriveInsightItems(
  result: DebateSessionApiResult | null,
  brief: LiveSessionTransfer["moderatorBrief"] | null,
): InsightItem[] {
  const items: InsightItem[] = [];
  const summary = result?.final_summary;
  if (summary?.summary) {
    items.push({
      id: "insight_summary",
      title: "Moderator summary",
      description: summary.summary,
      kind: "summary",
      pinned: true,
    });
  }
  if (Array.isArray(summary?.round1_highlights)) {
    summary?.round1_highlights?.forEach((text, index) => {
      if (!text) return;
      items.push({
        id: `highlight_${index}`,
        title: `Claim ${index + 1}`,
        description: text,
        kind: "summary",
      });
    });
  }
  if (Array.isArray(summary?.round2_insights)) {
    summary?.round2_insights?.forEach((text, index) => {
      if (!text) return;
      items.push({
        id: `insight_${index}`,
        title: `Insight ${index + 1}`,
        description: text,
        kind: "note",
      });
    });
  }
  if (Array.isArray(summary?.recommended_actions)) {
    summary?.recommended_actions?.forEach((text, index) => {
      if (!text) return;
      items.push({
        id: `action_${index}`,
        title: `Action ${index + 1}`,
        description: text,
        kind: "decision",
      });
    });
  }
  if (!items.length && Array.isArray(brief?.keyAssumptions) && brief.keyAssumptions.length > 0) {
    brief.keyAssumptions.forEach((assumption, index) => {
      items.push({
        id: `assumption_${index}`,
        title: `Assumption ${index + 1}`,
        description: assumption,
        kind: "risk",
      });
    });
  }
  if (!items.length) {
    items.push({
      id: "insight_placeholder",
      title: "Awaiting debate output",
      description: "Insights will populate once the moderator completes the synthesis.",
      kind: "note",
    });
  }
  return items.slice(0, 6);
}

export function deriveExpertClaimsFromTranscript(
  transcript: DebateTranscriptEntry[],
  participants: DebateParticipant[],
  transfer: LiveSessionTransfer | null,
  brief: LiveSessionTransfer["moderatorBrief"] | null,
): ExpertClaim[] {
  const claims: ExpertClaim[] = [];
  transcript.forEach((entry, index) => {
    if (!entry.output) {
      return;
    }
    if (!/statement|claim/i.test(entry.task ?? "")) {
      return;
    }
    claims.push({
      id: `claim_${index}`,
      speaker: entry.role ?? entry.task,
      claim: snippet(entry.output, 360),
      evidence: entry.output.match(/\[(\d+)\]/)?.join(", "),
    });
  });
  if (claims.length === 0) {
    const fallbacks: Array<{ speaker: string; claim: string }> = [];
    participants.forEach((participant) => {
      if (participant.goal) {
        fallbacks.push({ speaker: participant.name, claim: participant.goal });
      }
    });
    if (!fallbacks.length && transfer?.knights?.length) {
      transfer.knights.forEach((knight) => {
        fallbacks.push({
          speaker: knight.name,
          claim: knight.goal || knight.backstory || "Standing by for the moderator brief.",
        });
      });
    }
    if (!fallbacks.length && brief?.keyAssumptions?.length) {
      brief.keyAssumptions.forEach((assumption, index) => {
        fallbacks.push({ speaker: `Assumption ${index + 1}`, claim: assumption });
      });
    }
    fallbacks.slice(0, 4).forEach((item, index) => {
      claims.push({
        id: `fallback_claim_${index}`,
        speaker: item.speaker,
        claim: item.claim,
      });
    });
  }
  if (!claims.length) {
    claims.push({
      id: "claim_placeholder",
      speaker: "Moderator",
      claim: "Claims will display here once the debate begins.",
    });
  }
  return claims.slice(0, 6);
}
