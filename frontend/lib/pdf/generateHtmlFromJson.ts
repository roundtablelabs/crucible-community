import { extractDebateContent } from "./extractDebateContent";
import type { SessionJsonData } from "./types";

/**
 * Generate HTML for executive brief using LLM via OpenRouter.
 * Takes session JSON and generates a complete, self-contained HTML document.
 */
export async function generateHtmlFromJson(sessionJson: SessionJsonData): Promise<string> {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  // Extract debate content for the prompt
  const debateContent = extractDebateContent(sessionJson);
  
  // Format date as YYYY.M.D
  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).replace(/\//g, ".");

  // Create comprehensive prompt with design guidelines
  const prompt = `You are a dual-expert: a Senior McKinsey Engagement Manager and a Senior Frontend Developer. Your goal is to synthesize the provided debate content into a high-end executive brief.

### ROLE 1: THE STRATEGIST (Content Generation)
- **Framework:** Use the "Pyramid Principle" (Bottom-Line Up Front).
- **Tone:** Authoritative, sparse, data-driven. Avoid "fluff" words.
- **Structure:**
  1. **Executive Summary (SCQA):** Briefly state the Situation, Complication, and the Answer (your core recommendation).
  2. **Strategic Recommendation:** The primary path forward, justified by the "Confidence Level."
  3. **Key Drivers:** The 3-4 strongest arguments from the debate that support this decision.
  4. **Risks & Mitigation:** A 2x2 table logic of the biggest risks identified.
  5. **Immediate Actions:** A prioritized checklist for Monday morning.

### ROLE 2: THE DEVELOPER (HTML/CSS Construction)
- **Output:** A single, self-contained HTML5 file.
- **Page Layout:** A4 dimensions (210mm x 297mm) with 20mm margins.
- **Typography:** Use distinct serif for headers (e.g., 'Georgia', 'Times New Roman') and clean sans-serif for body (e.g., 'Arial', 'Helvetica') to mimic premium reports.
- **PDF Safety:** You MUST use CSS \`page-break-inside: avoid;\` on all major sections and cards to ensure the PDF converter does not slice text in half between pages.
- **Styling:**
  - **Background:** White (#ffffff).
  - **Accent Background:** #c5bea1 (Use for subtle section backgrounds or callout boxes).
  - **Primary Text:** #000000.
  - **Accent Text:** #324154 (Use for H1, H2, and important metrics).

### SPECIFIC HEADER INSTRUCTIONS
Render the header exactly as follows (using Flexbox):
- Left side: A logo spanning text where "CRU" is black and "CIBLE" is #324154. Font-weight: 800. Letter-spacing: 2px.
- Right side: "EXECUTIVE BRIEF | ${date}" in small caps, color #888.

### INPUT DATA
- **Question:** "${debateContent.question}"
- **Confidence:** ${debateContent.confidence}%
- **Raw Context:**
${debateContent.debate_content}

### FINAL INSTRUCTION
Generate ONLY the raw HTML code. Do not include markdown code blocks (like \`\`\`html). Start immediately with \`<!DOCTYPE html>\`.`;

  const model = process.env.OPENAI_MODEL ?? "openai/gpt-5.1-codex";
  const temperature = Number.parseFloat(process.env.PDF_TEMPERATURE ?? "1.0");
  const baseUrl = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";

  const messages = [
    {
      role: "system",
      content: "You are an expert at creating professional HTML documents for PDF conversion. Always respond with complete, valid HTML that includes all necessary styling inline.",
    },
    {
      role: "user",
      content: prompt,
    },
  ];

  try {
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
        messages,
        temperature,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      if (process.env.NODE_ENV === "development") {
        console.error("[generateHtmlFromJson] OpenRouter API error:", errorText);
      }
      throw new Error(`OpenRouter API request failed: ${response.status} ${errorText}`);
    }

    const payload = await response.json();
    const htmlContent = payload?.choices?.[0]?.message?.content;

    if (!htmlContent) {
      throw new Error("No HTML content in LLM response");
    }

    // Clean up the HTML - remove markdown code blocks if present
    let html = String(htmlContent).trim();
    
    // Remove markdown code blocks
    if (html.startsWith("```html")) {
      html = html.slice(7).trim();
    } else if (html.startsWith("```")) {
      html = html.slice(3).trim();
    }
    if (html.endsWith("```")) {
      html = html.slice(0, -3).trim();
    }

    // Ensure it's valid HTML - add DOCTYPE if missing
    if (!html.toLowerCase().includes("<!doctype") && !html.toLowerCase().startsWith("<html")) {
      // If LLM didn't include full HTML structure, wrap it
      if (!html.includes("<html")) {
        html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Executive Brief</title>
</head>
<body>
${html}
</body>
</html>`;
      } else {
        // Add DOCTYPE if HTML tag exists but no DOCTYPE
        html = `<!DOCTYPE html>\n${html}`;
      }
    }

    return html;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[generateHtmlFromJson] Error calling OpenRouter:", error);
    }
    
    if (error instanceof Error) {
      throw new Error(`LLM HTML generation failed: ${error.message}`);
    }
    
    throw new Error("LLM HTML generation failed with unknown error");
  }
}
