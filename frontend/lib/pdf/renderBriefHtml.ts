import type { ExecutiveBriefResponse, ExtractedDebateContent } from "./types";
import { validateHtmlStructure, retryWithBackoff, type RetryConfig } from "./validation";

/**
 * Render structured brief JSON to HTML (Stage 2).
 * Takes the structured brief and converts it to a complete, styled HTML document.
 */
export async function renderBriefHtml(
  structuredBrief: ExecutiveBriefResponse,
  debateContent: ExtractedDebateContent,
  retryConfig?: RetryConfig
): Promise<string> {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const model = process.env.PDF_STAGE2_MODEL ?? process.env.OPENAI_MODEL ?? "anthropic/claude-sonnet-4.5";
  const temperature = Number.parseFloat(process.env.PDF_STAGE2_TEMPERATURE ?? "0.3");
  const baseUrl = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";

  // Format date as YYYY.M.D
  const date = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).replace(/\//g, ".");

  // Build comprehensive prompt for HTML rendering
  const prompt = `You are a Senior Frontend Developer specializing in creating professional HTML documents for PDF conversion. Your task is to convert structured executive brief data into a beautiful, print-ready HTML document.

## DESIGN SYSTEM

### Typography (COMPACT DESIGN)
- **Headers**: Use serif fonts ('Georgia', 'Times New Roman') for H1, H2, H3
- **Body**: Use sans-serif fonts ('Arial', 'Helvetica', 'Inter') for body text
- **Font sizes** (SMALLER for compact layout): 
  - H1: 24px (reduced from 32px)
  - H2: 18px (reduced from 24px)
  - H3: 14px (reduced from 18px)
  - Body: 11px (reduced from 14px)
  - Small text: 9px for labels and metadata

### Color Palette
- **Background**: White (#ffffff)
- **Primary Text**: Black (#000000)
- **Accent Text**: #324154 (for H1, H2, important metrics)
- **Accent Background**: #c5bea1 (for subtle section backgrounds or callout boxes)
- **Borders**: #e2e8f0 (light gray)

### Layout (COMPACT - Target 2-3 pages)
- **Page Size**: A4 (210mm x 297mm)
- **Margins**: 15mm on all sides (reduced from 20mm)
- **Line Height**: 1.5 for body text (reduced from 1.7), 1.2 for headers (reduced from 1.3)
- **Spacing**: Reduce margins and padding throughout - use 12-16px instead of 24-32px
- **Multi-column**: Use 2-column layout for sections where appropriate (e.g., rationale + risks side by side)
- **Footer**: Footer will be added automatically during PDF generation (do not include in HTML)
- **Goal**: Fit all content in 2-3 pages maximum

## CRITICAL PDF REQUIREMENTS

1. **Page Breaks**: You MUST use \`page-break-inside: avoid;\` on ALL major sections, cards, and boxes to prevent content from being split across pages.

2. **Complete HTML Structure**: Include <!DOCTYPE html>, <html>, <head>, and <body> tags.

3. **Inline CSS**: All styles must be inline or in a <style> tag in the <head>. No external stylesheets.

4. **Print-Friendly**: Use CSS that works well for print/PDF conversion.

5. **Footer**: Do NOT include a footer in the HTML. The footer will be added automatically during PDF conversion.

## STRUCTURED DATA TO RENDER

\`\`\`json
${JSON.stringify(structuredBrief, null, 2)}
\`\`\`

## ADDITIONAL CONTEXT
- **Question**: ${debateContent.question}
- **Confidence**: ${debateContent.confidence}%
- **Date**: ${date}

## HTML STRUCTURE REQUIREMENTS

1. **Header Section** (at top of first page):
   - Left side: Logo text "CRUCIBLE" where "CRU" is black and "CIBLE" is #fec76f
   - Font-weight: 800, Letter-spacing: 2px
   - Right side: "EXECUTIVE BRIEF | ${date}" in small caps, color #888

2. **Executive Summary Section** (COMPACT):
   - Smaller heading (H2 size: 18px)
   - Render the executive_summary as 2-3 concise paragraphs (max 4-5 sentences total)
   - Use page-break-inside: avoid
   - Keep it to 1/3 page or less

3. **Recommendation Box** (COMPACT):
   - Highlighted callout box with border-left: 3px solid #D9A441 (reduced from 4px)
   - Background: #F5F6F7
   - Display the recommendation prominently but concisely (2-3 sentences max)
   - Use smaller padding (16px instead of 24px)
   - Keep it to 1/4 page or less

4. **Key Sections** (COMPACT LAYOUT - use multi-column where possible):
   - The Opportunity (1-2 sentences, compact)
   - The Requirement (1-2 sentences, compact)
   - Key Rationale: Use 2-column layout with compact bulleted list (3-4 bullets max, 1 line each)
   - Critical Risks: Use compact list format with impact/probability as inline badges (e.g., "Risk: [H/L Impact] [H/L Prob]")
   - Immediate Actions: Use compact numbered list (3-5 items, 1 line each)
   - Critical Conditions: Use compact bulleted list (2-3 items, 1 line each)
   - Consider placing Opportunity, Requirement, and Conditions in a 2-column grid to save space

5. **SWOT Analysis** (REQUIRED - if present in data):
   - Render as compact 2x2 grid (smaller font, tighter spacing)
   - Each quadrant with distinct background color
   - Use smaller font (10px) and compact padding (8-12px)
   - Limit to 2-3 items per quadrant (most important only)
   - Use page-break-inside: avoid on the entire grid
   - Make it fit in half a page or less

6. **Risk Matrix** (REQUIRED - if present in data):
   - Render as compact 2x2 grid (smaller font, tighter spacing)
   - Label axes: Impact (High/Low) and Probability (High/Low)
   - Use smaller font (10px) and compact padding (8-12px)
   - Use short risk titles (3-5 words max per risk)
   - Use page-break-inside: avoid on the entire grid
   - Make it fit in half a page or less

7. **Timeline** (REQUIRED - if present in data):
   - Render as compact horizontal or vertical timeline
   - Use smaller font (10-11px) and tighter spacing
   - Each phase with minimal visual separation (thin border, compact padding)
   - Limit activities to 2-3 most important per phase
   - Use page-break-inside: avoid on each phase
   - Consider horizontal layout to save vertical space

8. **Footer Note**: Do NOT include a footer in the HTML. The footer (with date and page numbers) will be added automatically during PDF generation.

## EXAMPLE HTML STRUCTURE

\`\`\`html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Executive Brief</title>
  <style>
    @page {
      size: A4;
      margin: 20mm 20mm 30mm 20mm;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      font-family: 'Arial', 'Helvetica', sans-serif;
      font-size: 11px;
      line-height: 1.5;
      color: #000000;
      background: #ffffff;
    }
    .section {
      page-break-inside: avoid;
      margin-bottom: 16px;
    }
    h1 {
      font-family: 'Georgia', 'Times New Roman', serif;
      color: #324154;
      font-size: 24px;
      margin-bottom: 12px;
    }
    h2 {
      font-family: 'Georgia', 'Times New Roman', serif;
      color: #324154;
      font-size: 18px;
      margin-bottom: 10px;
    }
    h3 {
      font-family: 'Georgia', 'Times New Roman', serif;
      color: #324154;
      font-size: 14px;
      margin-bottom: 8px;
    }
    .two-column {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 16px;
    }
    .recommendation-box {
      background: #F5F6F7;
      border-left: 3px solid #D9A441;
      padding: 16px;
      margin: 16px 0;
      page-break-inside: avoid;
      font-size: 11px;
    }
    .compact-list {
      margin: 8px 0;
      padding-left: 16px;
    }
    .compact-list li {
      margin-bottom: 4px;
      line-height: 1.4;
    }
  </style>
</head>
<body>
  <!-- Your rendered content here -->
</body>
</html>
\`\`\`

## FINAL INSTRUCTIONS (CRITICAL - COMPACT DESIGN)

1. Generate ONLY the raw HTML code
2. Do NOT include markdown code blocks (like \`\`\`html)
3. Start immediately with \`<!DOCTYPE html>\`
4. **TARGET: 2-3 pages maximum** - Be extremely concise with all content
5. Use multi-column layouts (2-column grid) for sections like:
   - Opportunity + Requirement side by side
   - Rationale + Risks side by side
   - Actions + Conditions side by side
6. Keep all text brief - use bullet points, avoid long paragraphs
7. **MUST INCLUDE**: Risk Matrix, SWOT Analysis, and Timeline (if present in data) - make them compact but visible
8. Use smaller fonts (11px body, 18px H2, 24px H1)
9. Reduce all spacing (16px margins instead of 32px)
10. Ensure ALL sections have \`page-break-inside: avoid;\` in their CSS
11. Make it visually appealing and professional despite compact size
12. Use semantic HTML5 elements where appropriate
13. Ensure the document is self-contained (all CSS inline or in <style> tag)`;

  const systemMessage = `You are an expert at creating professional HTML documents for PDF conversion. Always respond with complete, valid HTML that includes all necessary styling. Never include markdown code blocks or explanatory text - only the HTML code starting with <!DOCTYPE html>.`;

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
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error("[renderBriefHtml] OpenRouter API error:", errorText);
        throw new Error(`OpenRouter API request failed: ${response.status} ${errorText}`);
      }

      const payload = await response.json();
      const htmlContent = payload?.choices?.[0]?.message?.content;

      if (!htmlContent) {
        throw new Error("No HTML content in LLM response");
      }

      // Clean up the HTML - remove markdown code blocks if present
      let html = String(htmlContent).trim();
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
          html = `<!DOCTYPE html>\n${html}`;
        }
      }

      // Validate HTML structure
      const validation = validateHtmlStructure(html);
      if (!validation.valid) {
        throw new Error(`HTML validation failed: ${validation.errors.join("; ")}`);
      }

      return html;
    },
    retryConfig,
    (attempt, error) => {
      console.warn(`[renderBriefHtml] Attempt ${attempt} failed, retrying...`, error.message);
    }
  );
}

