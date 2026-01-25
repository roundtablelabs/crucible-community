/**
 * Configuration validation utilities
 * Validates required environment variables and provides helpful error messages
 */

import { secureLogger } from "@/lib/utils/secureLogger";

export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Validates required environment variables for Community Edition
 */
export function validateCommunityEditionConfig(): ConfigValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduction = process.env.NODE_ENV === "production";
  const isDevelopment = process.env.NODE_ENV === "development";

  // Check NEXT_PUBLIC_API_URL
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    if (isProduction) {
      errors.push(
        "NEXT_PUBLIC_API_URL is not set. This is required in production. " +
        "Please set it in your environment variables to point to your backend API."
      );
    } else {
      warnings.push(
        "NEXT_PUBLIC_API_URL is not set. Defaulting to http://localhost:8000/api for local development. " +
        "Set this variable for production deployment."
      );
    }
  } else {
    // Validate URL format
    try {
      // Allow relative URLs (starting with /)
      if (!apiUrl.startsWith("/")) {
        new URL(apiUrl);
      }
    } catch (error) {
      errors.push(
        `NEXT_PUBLIC_API_URL has invalid format: ${apiUrl}. ` +
        "It must be a valid URL (e.g., http://localhost:8000/api or https://api.example.com/api)"
      );
    }

    // Warn about HTTP in production
    if (isProduction && apiUrl.startsWith("http://") && 
        !apiUrl.includes("localhost") && !apiUrl.includes("127.0.0.1")) {
      warnings.push(
        "NEXT_PUBLIC_API_URL uses HTTP in production. This may cause security and CORS issues. " +
        "Consider using HTTPS."
      );
    }
  }

  // Log warnings and errors
  if (warnings.length > 0) {
    warnings.forEach(warning => secureLogger.warn("[Config Validation]", warning));
  }

  if (errors.length > 0) {
    errors.forEach(error => secureLogger.error("[Config Validation]", error));
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Gets user-friendly error message for configuration issues
 */
export function getConfigErrorMessage(result: ConfigValidationResult): string | null {
  if (result.valid) {
    return null;
  }

  if (result.errors.length === 1) {
    return result.errors[0];
  }

  return `Configuration errors:\n${result.errors.map(e => `• ${e}`).join("\n")}`;
}

/**
 * Gets user-friendly warning message for configuration issues
 */
export function getConfigWarningMessage(result: ConfigValidationResult): string | null {
  if (result.warnings.length === 0) {
    return null;
  }

  if (result.warnings.length === 1) {
    return result.warnings[0];
  }

  return `Configuration warnings:\n${result.warnings.map(w => `• ${w}`).join("\n")}`;
}
