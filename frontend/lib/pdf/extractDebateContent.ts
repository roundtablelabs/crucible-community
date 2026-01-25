import type { SessionJsonData, ExtractedDebateContent } from "./types";

/**
 * Extract key content from debate session JSON for LLM processing.
 * Parses JSON directly (no text conversion like Python version).
 */
export function extractDebateContent(jsonData: SessionJsonData): ExtractedDebateContent {
  const question = jsonData.session_metadata?.topic || "Debate Session";
  const events = jsonData.events || [];

  // Extract confidence from convergence event
  let confidence = 0;
  const convergenceEvent = events.find(
    (e) => e.event_type === "convergence" || e.event_type === "Convergence"
  );
  if (convergenceEvent?.payload && typeof convergenceEvent.payload === "object" && !Array.isArray(convergenceEvent.payload)) {
    if (convergenceEvent.payload.confidence !== undefined) {
      const confValue = convergenceEvent.payload.confidence;
      // Handle both 0-1 and 0-100 scales
      if (typeof confValue === "number") {
        confidence = confValue <= 1 ? Math.round(confValue * 100) : Math.round(confValue);
      }
    }
  }

  // Extract final ruling from moderator ruling event
  let finalRuling = "";
  const rulingEvent = events.find(
    (e) => e.event_type === "moderator_ruling" || e.event_type === "Moderator Ruling"
  );
  if (rulingEvent?.payload && typeof rulingEvent.payload === "object" && !Array.isArray(rulingEvent.payload)) {
    if (rulingEvent.payload.ruling) {
      finalRuling = String(rulingEvent.payload.ruling);
    } else if (rulingEvent.payload.notes) {
      finalRuling = String(rulingEvent.payload.notes);
    }
  }

  // Extract convergence summary
  let convergence = "";
  if (convergenceEvent?.payload && typeof convergenceEvent.payload === "object" && !Array.isArray(convergenceEvent.payload)) {
    if (convergenceEvent.payload.summary) {
      convergence = String(convergenceEvent.payload.summary);
    }
  }

  // Extract positions (position_card events)
  const positions: string[] = [];
  const positionEvents = events.filter(
    (e) => e.event_type === "position_card" || e.event_type === "Position Card"
  );
  for (const event of positionEvents.slice(0, 3)) {
    const payload = event.payload;
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const knight = payload.knight_name || payload.knight_role || "Unknown";
      const headline = payload.headline || "";
      const body = payload.body || "";
      const bodyPreview = body.length > 300 ? body.substring(0, 300) + "..." : body;
      positions.push(`${knight}: ${headline}\n${bodyPreview}`);
    }
  }

  // Extract challenges (challenge events)
  const challenges: string[] = [];
  const challengeEvents = events.filter(
    (e) => e.event_type === "challenge" || e.event_type === "Challenge"
  );
  for (const event of challengeEvents.slice(0, 3)) {
    if (event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)) {
      const contestation = String(event.payload.contestation || "");
      const preview = contestation.length > 200 ? contestation.substring(0, 200) + "..." : contestation;
      if (preview) {
        challenges.push(preview);
      }
    }
  }

  // Extract red team critique
  let redTeam = "";
  const redTeamEvent = events.find(
    (e) => e.event_type === "red_team_critique" || e.event_type === "Red Team Critique"
  );
  if (redTeamEvent?.payload && typeof redTeamEvent.payload === "object" && !Array.isArray(redTeamEvent.payload)) {
    if (redTeamEvent.payload.critique) {
      redTeam = String(redTeamEvent.payload.critique);
    }
  }

  // Extract research results (evidence-based insights)
  const researchFindings: string[] = [];
  const researchEvents = events.filter(
    (e) => e.event_type === "research_result" || e.event_type === "Research Result"
  );
  for (const event of researchEvents.slice(0, 5)) {
    if (event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)) {
      const query = event.payload.query || "";
      const summary = event.payload.summary || "";
      const sources = event.payload.sources || [];
      const sourcesText = sources.length > 0 
        ? `\nSources: ${sources.map((s: any) => s.title || s.url || "").filter(Boolean).join(", ")}`
        : "";
      if (summary) {
        researchFindings.push(`Query: ${query}\nFinding: ${summary}${sourcesText}`);
      }
    }
  }

  // Extract rebuttals (counter-arguments)
  const rebuttals: string[] = [];
  const rebuttalEvents = events.filter(
    (e) => e.event_type === "rebuttal" || e.event_type === "Rebuttal"
  );
  for (const event of rebuttalEvents.slice(0, 3)) {
    if (event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)) {
      const knight = event.payload.knight_name || event.payload.knight_id || "Unknown";
      const content = event.payload.content || event.payload.body || "";
      const target = event.payload.target_knight_id || "";
      if (content) {
        const targetText = target ? ` (responding to ${target})` : "";
        rebuttals.push(`${knight}${targetText}: ${content.substring(0, 300)}${content.length > 300 ? "..." : ""}`);
      }
    }
  }

  // Extract fact checks (validation data)
  const factChecks: string[] = [];
  const factCheckEvents = events.filter(
    (e) => e.event_type === "fact_check" || e.event_type === "Fact Check"
  );
  for (const event of factCheckEvents.slice(0, 3)) {
    if (event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)) {
      const claim = event.payload.claim || "";
      const verdict = event.payload.verdict || event.payload.status || "";
      const sources = event.payload.sources || [];
      const sourcesText = sources.length > 0 
        ? `\nSources: ${sources.map((s: any) => s.title || s.url || "").filter(Boolean).join(", ")}`
        : "";
      if (claim && verdict) {
        factChecks.push(`Claim: ${claim}\nVerdict: ${verdict}${sourcesText}`);
      }
    }
  }

  // Extract citations (source credibility)
  const citations: string[] = [];
  const citationEvents = events.filter(
    (e) => e.event_type === "citation_added" || e.event_type === "Citation Added"
  );
  for (const event of citationEvents.slice(0, 5)) {
    if (event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)) {
      const title = event.payload.title || "";
      const url = event.payload.url || "";
      const snippet = event.payload.snippet || "";
      if (title || url) {
        citations.push(`${title || url}${snippet ? `\n${snippet.substring(0, 150)}...` : ""}`);
      }
    }
  }

  // Extract translator output (clarity/accessibility)
  let translatorOutput = "";
  const translatorEvent = events.find(
    (e) => e.event_type === "translator_output" || e.event_type === "Translator Output"
  );
  if (translatorEvent?.payload && typeof translatorEvent.payload === "object" && !Array.isArray(translatorEvent.payload)) {
    if (translatorEvent.payload.translated_content) {
      translatorOutput = String(translatorEvent.payload.translated_content);
    } else if (translatorEvent.payload.content) {
      translatorOutput = String(translatorEvent.payload.content);
    }
  }

  // Build comprehensive debate content
  const debate_content = `
FINAL JUDGMENT:
${finalRuling}

CONVERGENCE SUMMARY:
${convergence}

KEY POSITIONS:
${positions.join("\n\n")}

KEY CHALLENGES:
${challenges.join("\n\n")}

RED TEAM CRITIQUE:
${redTeam}

RESEARCH FINDINGS:
${researchFindings.join("\n\n")}

REBUTTALS:
${rebuttals.join("\n\n")}

FACT CHECKS:
${factChecks.join("\n\n")}

CITATIONS:
${citations.join("\n\n")}

TRANSLATOR OUTPUT:
${translatorOutput}
`.trim();

  return {
    question,
    debate_content,
    confidence,
    researchFindings: researchFindings.length > 0 ? researchFindings : undefined,
    rebuttals: rebuttals.length > 0 ? rebuttals : undefined,
    factChecks: factChecks.length > 0 ? factChecks : undefined,
    citations: citations.length > 0 ? citations : undefined,
    translatorOutput: translatorOutput || undefined,
  };
}

/**
 * Process question for cover page title formatting.
 * Ports Python logic from executive_brief.py lines 978-994
 */
export function formatCoverTitle(question: string): { title: string; subtitle?: string } {
  // Clean up common typos
  const questionClean = question.replace(/Knidgardand/gi, "Kindergarten").replace(/knidgardand/gi, "kindergarten");

  // Special handling for "Should we expand..." questions
  if (questionClean.toLowerCase().includes("should we expand") || questionClean.toLowerCase().includes("should we expand")) {
    const questionPart = questionClean.split("?")[0] || questionClean;
    
    if (questionPart.toLowerCase().includes(" to ")) {
      const parts = questionPart.split(" to ", 2);
      if (parts.length > 1) {
        let target = parts[1]
          .replace(/Australia /i, "")
          .replace(/children providing holiday program/i, "Holiday Programs");
        
        return {
          title: `Strategic Expansion Opportunity: ${target}`,
          subtitle: "Feasibility Analysis for Australian OSHC Operations",
        };
      }
    }
  }

  return {
    title: questionClean,
  };
}

