import { ExecutiveBriefResponseSchema, type ExecutiveBriefResponse } from "./types";

/**
 * Validation result for JSON structure
 */
export interface JsonValidationResult {
  valid: boolean;
  errors: string[];
  data?: ExecutiveBriefResponse;
}

/**
 * Validation result for HTML structure
 */
export interface HtmlValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validate structured brief JSON against schema
 */
export function validateStructuredBrief(json: unknown): JsonValidationResult {
  const errors: string[] = [];

  try {
    const result = ExecutiveBriefResponseSchema.safeParse(json);
    
    if (!result.success) {
      result.error.errors.forEach((err) => {
        errors.push(`${err.path.join(".")}: ${err.message}`);
      });
      return { valid: false, errors };
    }

    const data = result.data;

    // Additional business logic validations
    if (data.critical_risks.length < 3) {
      errors.push("critical_risks: Must have at least 3 risks");
    }
    if (data.critical_risks.length > 10) {
      errors.push("critical_risks: Should have at most 10 risks");
    }
    if (data.immediate_actions.length < 3) {
      errors.push("immediate_actions: Must have at least 3 actions");
    }
    if (data.immediate_actions.length > 10) {
      errors.push("immediate_actions: Should have at most 10 actions");
    }
    if (data.rationale.length < 2) {
      errors.push("rationale: Must have at least 2 rationale points");
    }
    if (data.rationale.length > 5) {
      errors.push("rationale: Should have at most 5 rationale points");
    }

    // Validate executive summary is not empty
    if (!data.executive_summary || data.executive_summary.trim().length < 50) {
      errors.push("executive_summary: Must be at least 50 characters");
    }

    // Validate recommendation is not empty
    if (!data.recommendation || data.recommendation.trim().length < 20) {
      errors.push("recommendation: Must be at least 20 characters");
    }

    // Validate risk matrix if present
    if (data.risk_matrix) {
      const allMatrixRisks = [
        ...(data.risk_matrix.high_impact_high_prob || []),
        ...(data.risk_matrix.high_impact_low_prob || []),
        ...(data.risk_matrix.low_impact_high_prob || []),
        ...(data.risk_matrix.low_impact_low_prob || []),
      ];
      
      if (allMatrixRisks.length !== data.critical_risks.length) {
        errors.push(
          `risk_matrix: Must contain exactly ${data.critical_risks.length} risks (one for each critical_risk), found ${allMatrixRisks.length}`
        );
      }
    }

    if (errors.length > 0) {
      return { valid: false, errors, data };
    }

    return { valid: true, errors: [], data };
  } catch (error) {
    return {
      valid: false,
      errors: [`Parse error: ${error instanceof Error ? error.message : "Unknown error"}`],
    };
  }
}

/**
 * Validate HTML structure for PDF generation
 */
export function validateHtmlStructure(html: string): HtmlValidationResult {
  const errors: string[] = [];
  const htmlLower = html.toLowerCase();

  // Check for DOCTYPE
  if (!htmlLower.includes("<!doctype html>") && !htmlLower.includes("<!doctype")) {
    errors.push("Missing DOCTYPE declaration");
  }

  // Check for required HTML structure
  if (!htmlLower.includes("<html")) {
    errors.push("Missing <html> tag");
  }
  if (!htmlLower.includes("<head")) {
    errors.push("Missing <head> tag");
  }
  if (!htmlLower.includes("<body")) {
    errors.push("Missing <body> tag");
  }

  // Check for page-break CSS (critical for PDF)
  if (!html.includes("page-break-inside") && !html.includes("page-break-inside")) {
    errors.push("Missing page-break CSS (required for PDF generation)");
  }

  // Check for required sections (case-insensitive)
  const requiredSections = [
    "executive",
    "summary",
    "recommendation",
  ];
  
  const hasRequiredContent = requiredSections.some((section) =>
    htmlLower.includes(section)
  );
  
  if (!hasRequiredContent) {
    errors.push("Missing required content sections (executive summary, recommendation)");
  }

  // Check for proper CSS styling
  if (!htmlLower.includes("<style") && !htmlLower.includes("style=")) {
    errors.push("Missing CSS styling (inline or <style> tag)");
  }

  // Check for valid HTML structure (basic check)
  const openBodyTags = (html.match(/<body[^>]*>/gi) || []).length;
  const closeBodyTags = (html.match(/<\/body>/gi) || []).length;
  if (openBodyTags !== closeBodyTags) {
    errors.push("Mismatched <body> tags");
  }

  const openHtmlTags = (html.match(/<html[^>]*>/gi) || []).length;
  const closeHtmlTags = (html.match(/<\/html>/gi) || []).length;
  if (openHtmlTags !== closeHtmlTags) {
    errors.push("Mismatched <html> tags");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Retry configuration
 */
export interface RetryConfig {
  maxRetries: number;
  retryDelayMs: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 2,
  retryDelayMs: 1000,
};

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig = DEFAULT_RETRY_CONFIG,
  onRetry?: (attempt: number, error: Error) => void
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      
      if (attempt < config.maxRetries) {
        if (onRetry) {
          onRetry(attempt + 1, lastError);
        }
        
        // Exponential backoff: 1s, 2s, 4s
        const delay = config.retryDelayMs * Math.pow(2, attempt);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error("Retry failed");
}

