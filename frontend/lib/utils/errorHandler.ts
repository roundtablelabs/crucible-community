/**
 * Centralized error handling utilities
 * Provides consistent error logging and user-friendly error messages
 */

import { sanitizeError, getUserFriendlyError } from "./errorSanitizer";
import { secureLogger } from "./secureLogger";

/**
 * Safely extracts an error message from unknown error types
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return "An unexpected error occurred";
}

/**
 * Logs errors in development mode only
 * In production, errors should be sent to a logging service
 * All errors are sanitized to prevent sensitive data leakage
 */
export function logError(error: unknown, context?: string): void {
  const { sanitized } = sanitizeError(error);
  secureLogger.error(
    getErrorMessage(error),
    sanitized,
    context
  );
  // In production, you might want to send to an error tracking service
  // e.g., Sentry, LogRocket, etc.
}

/**
 * Error information structure for actionable error handling
 */
export interface ActionableError {
  message: string;
  action?: string;
  retryable: boolean;
}

/**
 * Determines if an error is retryable based on error type and status
 */
export function isErrorRetryable(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    const status = (error as any).status;
    
    // Network errors are retryable
    if (message.includes("network") || message.includes("fetch") || message.includes("failed to fetch")) {
      return true;
    }
    
    // Timeout errors are retryable
    if (message.includes("timeout") || message.includes("timed out")) {
      return true;
    }
    
    // 5xx server errors are retryable
    if (status && status >= 500 && status < 600) {
      return true;
    }
    
    // Rate limiting (429) is retryable
    if (status === 429 || message.includes("rate limit") || message.includes("too many requests")) {
      return true;
    }
    
    // Service unavailable (503) is retryable
    if (status === 503 || message.includes("service unavailable")) {
      return true;
    }
    
    // Gateway errors (502, 504) are retryable
    if (status === 502 || status === 504) {
      return true;
    }
  }
  
  // Validation errors, authentication errors, and not found errors are not retryable
  return false;
}

/**
 * Converts API errors to user-friendly messages with actionable information
 * Returns both the message and suggested action
 * All error messages are sanitized to prevent sensitive data leakage
 */
export function getActionableErrorMessage(error: unknown): ActionableError {
  logError(error, "API Error");
  
  // Use sanitized error message
  const message = getUserFriendlyError(error);
  const status = (error instanceof Error && (error as any).status) ? (error as any).status : null;
  const retryable = isErrorRetryable(error);
  
  // Handle network errors
  if (message.includes("Network") || message.includes("fetch") || message.includes("Failed to fetch") || 
      (error instanceof TypeError && error.message === "Failed to fetch")) {
    return {
      message: "Unable to connect to the server. Check your internet connection and try again.",
      action: "Check your connection",
      retryable: true,
    };
  }
  
  // Handle timeout errors
  if (message.includes("timeout") || message.includes("timed out") || message.includes("Request timeout")) {
    return {
      message: "Request timed out. The server may be busy. Please try again.",
      action: "Try again",
      retryable: true,
    };
  }
  
  // Handle rate limiting
  if (status === 429 || message.includes("rate limit") || message.includes("too many requests")) {
    return {
      message: "Too many requests. Please wait a moment and try again.",
      action: "Wait and retry",
      retryable: true,
    };
  }
  
  // Handle standardized error codes from API
  if (message.includes("UNAUTHORIZED") || message.includes("Authentication required")) {
    return {
      message: "Please sign in to continue.",
      action: "Sign in",
      retryable: false,
    };
  }
  if (message.includes("FORBIDDEN") || message.includes("Access denied")) {
    return {
      message: "You don't have permission to perform this action.",
      action: undefined,
      retryable: false,
    };
  }
  if (message.includes("NOT_FOUND") || message.includes("not found")) {
    return {
      message: "The requested resource was not found.",
      action: undefined,
      retryable: false,
    };
  }
  if (message.includes("VALIDATION_ERROR") || message.includes("Invalid")) {
    // Validation errors are usually user-friendly, preserve the message
    return {
      message: message.length < 200 ? message : "Invalid input. Please check your information and try again.",
      action: "Check your input",
      retryable: false,
    };
  }
  if (message.includes("CONFLICT")) {
    return {
      message: "A conflict occurred. The resource may already exist.",
      action: "Check if it already exists",
      retryable: false,
    };
  }
  if (message.includes("INTERNAL_ERROR") || message.includes("Internal server error")) {
    return {
      message: "A server error occurred. Please try again later.",
      action: "Try again",
      retryable: true,
    };
  }
  if (message.includes("SERVICE_UNAVAILABLE")) {
    return {
      message: "The service is temporarily unavailable. Please try again later.",
      action: "Try again later",
      retryable: true,
    };
  }
  
  // Handle common HTTP error messages (legacy support)
  if (message.includes("401") || message.includes("Unauthorized")) {
    return {
      message: "Please sign in to continue.",
      action: "Sign in",
      retryable: false,
    };
  }
  if (message.includes("403") || message.includes("Forbidden")) {
    return {
      message: "You don't have permission to perform this action.",
      action: undefined,
      retryable: false,
    };
  }
  if (message.includes("404") || message.includes("Not found")) {
    return {
      message: "The requested resource was not found.",
      action: undefined,
      retryable: false,
    };
  }
  if (message.includes("500") || message.includes("Internal server error")) {
    return {
      message: "A server error occurred. Please try again later.",
      action: "Try again",
      retryable: true,
    };
  }
  if (status === 502 || message.includes("Bad Gateway")) {
    return {
      message: "Server is temporarily unavailable. Please try again in a moment.",
      action: "Try again",
      retryable: true,
    };
  }
  if (status === 503 || message.includes("Service Unavailable")) {
    return {
      message: "Service is temporarily unavailable. Please try again later.",
      action: "Try again later",
      retryable: true,
    };
  }
  if (status === 504 || message.includes("Gateway Timeout")) {
    return {
      message: "Request timed out. The server may be busy. Please try again.",
      action: "Try again",
      retryable: true,
    };
  }
  
  // Return the error message if it's already user-friendly
  // Otherwise return a generic message
  if (message.length < 100 && !message.includes("Error:") && !message.includes("Exception")) {
    return {
      message,
      action: retryable ? "Try again" : undefined,
      retryable,
    };
  }
  
  return {
    message: "An error occurred. Please try again.",
    action: "Try again",
    retryable: true,
  };
}

/**
 * Converts API errors to user-friendly messages
 * Handles both standardized error format {code, message, details} and legacy format
 * @deprecated Use getActionableErrorMessage() for better error handling with retry information
 */
export function handleApiError(error: unknown): string {
  return getActionableErrorMessage(error).message;
}

/**
 * Logs debug information in development mode only
 */
export function logDebug(message: string, ...args: unknown[]): void {
  if (process.env.NODE_ENV === "development") {
    console.log(`[Debug] ${message}`, ...args);
  }
}

/**
 * Logs warnings in development mode only
 */
export function logWarning(message: string, ...args: unknown[]): void {
  if (process.env.NODE_ENV === "development") {
    console.warn(`[Warning] ${message}`, ...args);
  }
}

