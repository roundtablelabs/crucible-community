import { extractDebateContent } from "./extractDebateContent";
import { generateStructuredBrief } from "./generateStructuredBrief";
import { renderBriefHtml } from "./renderBriefHtml";
import { htmlToPdf } from "./htmlToPdf";
import type { SessionJsonData } from "./types";

/**
 * Main orchestrator for PDF generation.
 * Uses two-stage LLM pipeline:
 * 1. Stage 1: Generate structured JSON from debate content
 * 2. Stage 2: Render structured JSON to HTML
 * 3. Convert HTML to PDF
 */
export async function generateExecutiveBrief(
  sessionId: string,
  sessionJson: SessionJsonData,
  options?: { useLLM?: boolean }
): Promise<Buffer> {
  // Note: useLLM option is kept for API compatibility but is now always true
  // since we always use LLM for HTML generation
  const useLLM = options?.useLLM ?? true;

  try {
    // Validate sessionJson
    if (!sessionJson || typeof sessionJson !== "object") {
      throw new Error("Invalid session JSON data");
    }

    console.log("[generateExecutiveBrief] Starting PDF generation for session:", sessionId);

    // Step 1: Extract comprehensive debate content
    console.log("[generateExecutiveBrief] Extracting debate content...");
    const debateContent = extractDebateContent(sessionJson);
    console.log("[generateExecutiveBrief] Extracted content:", {
      question: debateContent.question,
      confidence: debateContent.confidence,
      hasResearch: !!debateContent.researchFindings?.length,
      hasRebuttals: !!debateContent.rebuttals?.length,
      hasFactChecks: !!debateContent.factChecks?.length,
      hasCitations: !!debateContent.citations?.length,
    });

    // Step 2: Stage 1 - Generate structured brief (JSON)
    console.log("[generateExecutiveBrief] Stage 1: Generating structured brief...");
    const structuredBrief = await generateStructuredBrief(debateContent);
    console.log("[generateExecutiveBrief] Structured brief generated:", {
      recommendation: structuredBrief.recommendation.substring(0, 80) + "...",
      risksCount: structuredBrief.critical_risks.length,
      actionsCount: structuredBrief.immediate_actions.length,
    });

    // Step 3: Stage 2 - Render structured brief to HTML
    console.log("[generateExecutiveBrief] Stage 2: Rendering HTML from structured brief...");
    const html = await renderBriefHtml(structuredBrief, debateContent);
    
    if (!html || html.trim().length === 0) {
      throw new Error("Generated HTML is empty");
    }

    console.log("[generateExecutiveBrief] HTML generated, length:", html.length);

    // Step 4: Convert HTML to PDF using Playwright
    console.log("[generateExecutiveBrief] Converting HTML to PDF...");
    const pdfBuffer = await htmlToPdf(html);

    console.log("[generateExecutiveBrief] PDF generated successfully, size:", pdfBuffer.length);

    return pdfBuffer;
  } catch (error) {
    console.error("[generateExecutiveBrief] Error details:", {
      error,
      sessionId,
      hasSessionJson: !!sessionJson,
      useLLM,
    });
    
    if (error instanceof Error) {
      throw new Error(`PDF generation failed: ${error.message}`);
    }
    
    throw error;
  }
}
