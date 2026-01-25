import type { ExtractedDebateContent } from "./types";
import { validateStructuredBrief, retryWithBackoff, type RetryConfig } from "./validation";
import type { ExecutiveBriefResponse } from "./types";

/**
 * Generate structured executive brief JSON from debate content (Stage 1).
 * Uses LLM to extract and synthesize key information into structured format.
 */
export async function generateStructuredBrief(
  debateContent: ExtractedDebateContent,
  retryConfig?: RetryConfig
): Promise<ExecutiveBriefResponse> {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const model = process.env.PDF_STAGE1_MODEL ?? process.env.OPENAI_MODEL ?? "google/gemini-2.5-pro";
  const temperature = Number.parseFloat(process.env.PDF_STAGE1_TEMPERATURE ?? "0.3");
  const baseUrl = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";

  // Format date for context
  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  // Build comprehensive prompt for structured JSON generation
  const prompt = `You are a Senior McKinsey Engagement Manager specializing in board-level decision briefs. Your task is to synthesize a complex debate into a structured executive brief.

## FRAMEWORK: The Pyramid Principle (Bottom-Line Up Front)
- Start with the answer (recommendation)
- Support with key drivers (3-4 strongest arguments)
- Provide evidence and rationale

## TONE & STYLE
- Authoritative, sparse, data-driven
- Avoid "fluff" words and hedging language
- Clear and decisive
- Suitable for C-suite presentation

## DEBATE QUESTION
${debateContent.question}

## CONFIDENCE LEVEL
${debateContent.confidence}%

## DEBATE CONTENT
${debateContent.debate_content}

## YOUR TASK
Extract and synthesize the following structured information:

1. **bottom_line** (1-2 sentences): The absolute bottom-line decision - what should we do?

2. **opportunity** (1-2 sentences): The strategic opportunity or business case - what makes this worth pursuing?

3. **recommendation** (2-3 sentences): Clear, actionable recommendation - the primary path forward, justified by the confidence level.

4. **requirement** (1-2 sentences): What must be done or what conditions must be met for success.

5. **executive_summary** (2-3 paragraphs): High-level synthesis using SCQA framework:
   - **Situation**: Current state
   - **Complication**: Key challenge or problem
   - **Question**: The decision to be made
   - **Answer**: Your recommendation

6. **rationale** (3-5 bullet points): WHY this recommendation makes sense - distinct reasoning points, not just restating what it is.

7. **critical_risks** (3-10 risks): Each risk must include:
   - **description**: Specific risk description
   - **impact**: 1-5 scale (1=low, 5=high)
   - **probability**: 1-5 scale (1=low, 5=high)
   - **mitigation**: How to address this risk

8. **immediate_actions** (3-10 actions): Prioritized concrete next steps - what to do Monday morning. Each should be specific and actionable.

9. **critical_conditions** (0-5 items): Prerequisites or dependencies that must be met for success.

10. **confidence_level** (number 0-100): Overall confidence in the recommendation, should match or be close to the provided confidence level.

11. **quotable_insights** (2-5 items): Key insights or quotes that capture the essence of the debate.

12. **swot** (optional): SWOT analysis with 2-3 items per quadrant:
   - **strengths**: Internal advantages
   - **weaknesses**: Internal disadvantages
   - **opportunities**: External opportunities
   - **threats**: External threats

13. **risk_matrix** (optional): Categorize the critical_risks into a 2x2 matrix by impact and probability:
   - **high_impact_high_prob**: Critical risks requiring immediate attention
   - **high_impact_low_prob**: Contingency planning needed
   - **low_impact_high_prob**: Monitor closely
   - **low_impact_low_prob**: Accept and track
   
   Each risk in critical_risks must appear exactly once in the risk_matrix. Use short titles (3-5 words) that correspond to the risk descriptions.

14. **timeline** (optional): Implementation roadmap with phases:
   - **phase**: Phase name
   - **duration**: Time frame (e.g., "Weeks 1-4")
   - **activities**: List of activities
   - **deliverables**: Expected deliverables
   - **dependencies**: Prerequisites

## OUTPUT FORMAT
You MUST respond with valid JSON only. Do not include markdown code blocks or any other text. The JSON must match this exact structure:

{
  "bottom_line": "...",
  "opportunity": "...",
  "recommendation": "...",
  "requirement": "...",
  "executive_summary": "...",
  "rationale": ["...", "..."],
  "critical_risks": [
    {
      "description": "...",
      "impact": 3,
      "probability": 4,
      "mitigation": "..."
    }
  ],
  "immediate_actions": ["...", "..."],
  "critical_conditions": ["..."],
  "confidence_level": ${debateContent.confidence},
  "quotable_insights": ["...", "..."],
  "swot": {
    "strengths": ["..."],
    "weaknesses": ["..."],
    "opportunities": ["..."],
    "threats": ["..."]
  },
  "risk_matrix": {
    "high_impact_high_prob": ["..."],
    "high_impact_low_prob": ["..."],
    "low_impact_high_prob": ["..."],
    "low_impact_low_prob": ["..."]
  },
  "timeline": [
    {
      "phase": "...",
      "duration": "...",
      "activities": ["..."],
      "deliverables": ["..."],
      "dependencies": ["..."]
    }
  ]
}

## CRITICAL INSTRUCTIONS
- Ensure risk_matrix contains exactly the same number of risks as critical_risks
- Each risk in risk_matrix must correspond to a risk in critical_risks
- Be specific and actionable - avoid vague language
- Use the confidence level provided to calibrate your recommendation strength
- If confidence is low (<60%), emphasize risks and conditions more heavily`;

  const systemMessage = `You are an expert at synthesizing complex debates into structured executive briefs. Always respond with valid JSON that matches the exact schema provided. Never include markdown code blocks or explanatory text - only the JSON object.`;

  return retryWithBackoff(
    async () => {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      };
      if (process.env.OPENROUTER_SITE_URL) {
        headers["HTTP-Referer"] = process.env.OPENROUTER_SITE_URL;
      }
      if (process.env.OPENROUTER_APP_TITLE) {
        headers["X-Title"] = process.env.OPENROUTER_APP_TITLE;
      }

      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemMessage },
            { role: "user", content: prompt },
          ],
          temperature,
          response_format: { type: "json_object" }, // Force JSON mode
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[generateStructuredBrief] OpenRouter API error:", errorText);
        throw new Error(`OpenRouter API request failed: ${response.status} ${errorText}`);
      }

      const payload = await response.json();
      const jsonContent = payload?.choices?.[0]?.message?.content;

      if (!jsonContent) {
        throw new Error("No JSON content in LLM response");
      }

      // Clean up the JSON - remove markdown code blocks if present
      let jsonStr = String(jsonContent).trim();
      if (jsonStr.startsWith("```json")) {
        jsonStr = jsonStr.slice(7).trim();
      } else if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.slice(3).trim();
      }
      if (jsonStr.endsWith("```")) {
        jsonStr = jsonStr.slice(0, -3).trim();
      }

      // Parse JSON
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(jsonStr);
      } catch (parseError) {
        throw new Error(`Failed to parse JSON: ${parseError instanceof Error ? parseError.message : "Unknown error"}`);
      }

      // Validate against schema
      const validation = validateStructuredBrief(parsedJson);
      if (!validation.valid) {
        throw new Error(`JSON validation failed: ${validation.errors.join("; ")}`);
      }

      if (!validation.data) {
        throw new Error("Validation passed but no data returned");
      }

      return validation.data;
    },
    retryConfig,
    (attempt, error) => {
      console.warn(`[generateStructuredBrief] Attempt ${attempt} failed, retrying...`, error.message);
    }
  );
}

