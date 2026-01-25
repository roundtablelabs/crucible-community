/**
 * Preprocesses markdown content to protect mathematical expressions and technical notation
 * from being incorrectly parsed as markdown syntax.
 * 
 * Uses a three-pass approach:
 * 1. Mark legitimate markdown links with placeholders
 * 2. Protect mathematical expressions by wrapping in code spans
 * 3. Restore legitimate links
 */
export function preprocessMarkdownContent(content: string): string {
  // Basic preprocessing
  let processed = content;

  // Normalize line breaks
  processed = processed.replace(/\r\n/g, "\n");

  // Remove excessive blank lines (more than 2 consecutive)
  processed = processed.replace(/\n{3,}/g, "\n\n");

  // Protect mathematical expressions from markdown parsing
  processed = protectMathematicalExpressions(processed);

  return processed;
}

/**
 * Protects mathematical expressions in parentheses from being parsed as markdown links.
 * Uses a three-pass approach to avoid JavaScript regex lookbehind limitations.
 * 
 * Patterns like (Sales / Invested Capital) should be protected, but [text](url) should remain.
 */
function protectMathematicalExpressions(text: string): string {
  // Pass 1: Mark legitimate markdown links with placeholders
  const linkPattern = /\[([^\]]+)\]\(([^)]+)\)/g;
  const linkPlaceholders: string[] = [];
  
  let processed = text.replace(linkPattern, (match) => {
    const placeholder = `__LINK_PLACEHOLDER_${linkPlaceholders.length}__`;
    linkPlaceholders.push(match);
    return placeholder;
  });

  // Pass 2: Protect mathematical expressions by wrapping in code spans
  // Pattern: (operand operator operand) or (operand operator operand operator operand)
  // Matches formulas like: (Sales / Invested Capital), (Revenue - Costs), (ROI * 100), etc.
  const formulaPattern = /\(([A-Za-z0-9\s]+)\s*([/+\-*×÷])\s*([A-Za-z0-9\s]+(?:\s*[/+\-*×÷]\s*[A-Za-z0-9\s]+)*)\)/g;
  
  processed = processed.replace(formulaPattern, (match, left, operator, right) => {
    // Exclude URLs - if it contains :// or www., it's likely a URL, not a formula
    if (match.includes('://') || match.includes('www.')) {
      return match;
    }
    // Wrap in code spans to prevent markdown parsing
    return `\`${match}\``;
  });

  // Pass 3: Restore legitimate links
  linkPlaceholders.forEach((link, index) => {
    processed = processed.replace(`__LINK_PLACEHOLDER_${index}__`, link);
  });

  return processed;
}
