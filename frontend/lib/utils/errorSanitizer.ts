/**
 * Error sanitization utility that removes sensitive data from error messages
 * before displaying them to users or logging them.
 * 
 * This utility:
 * - Removes tokens, API keys, user IDs from error messages
 * - Removes stack traces in production
 * - Provides generic error messages to users
 * - Logs detailed errors server-side only
 */

/**
 * Patterns that indicate sensitive information
 */
const SENSITIVE_PATTERNS = [
  // JWT tokens
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g,
  // Bearer tokens
  /\bBearer\s+[A-Za-z0-9_-]{20,}\b/gi,
  // API keys
  /\b(sk|pk|AKIA|AIza|ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_-]{20,}\b/gi,
  // Email addresses (mask username, preserve domain)
  /\b([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Z|a-z]{2,})\b/g,
  // Authorization headers
  /authorization:\s*[^\s]+/gi,
  // Database URLs with credentials
  /(postgresql|mysql|mongodb):\/\/[^@]+@/gi,
  // AWS/cloud service URLs with keys
  /[?&](key|token|secret|api_key|access_token)=[A-Za-z0-9_-]{10,}/gi,
];

/**
 * Sanitizes a string by removing sensitive information
 */
function sanitizeString(value: string): string {
  let sanitized = value;
  
  // Replace JWT tokens
  sanitized = sanitized.replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, '[JWT_TOKEN]');
  
  // Replace Bearer tokens
  sanitized = sanitized.replace(/\bBearer\s+[A-Za-z0-9_-]{20,}\b/gi, 'Bearer [TOKEN]');
  
  // Replace API keys
  sanitized = sanitized.replace(/\b(sk|pk|AKIA|AIza|ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_-]{20,}\b/gi, '[API_KEY]');
  
  // Mask email addresses
  sanitized = sanitized.replace(/\b([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Z|a-z]{2,})\b/g, '[EMAIL]@$2');
  
  // Replace database URLs
  sanitized = sanitized.replace(/(postgresql|mysql|mongodb):\/\/[^@]+@/gi, '$1://[REDACTED]@');
  
  // Replace query parameters with sensitive data
  sanitized = sanitized.replace(/[?&](key|token|secret|api_key|access_token)=[A-Za-z0-9_-]{10,}/gi, '$1=[REDACTED]');
  
  // Replace authorization headers
  sanitized = sanitized.replace(/authorization:\s*[^\s]+/gi, 'authorization: [REDACTED]');
  
  return sanitized;
}

/**
 * Sanitizes an error object, removing sensitive data
 */
export function sanitizeError(error: unknown): {
  message: string;
  sanitized: unknown;
  hasStack: boolean;
} {
  if (error instanceof Error) {
    const sanitizedMessage = sanitizeString(error.message);
    const sanitizedStack = process.env.NODE_ENV === 'production' 
      ? '[STACK_TRACE_REDACTED]' 
      : error.stack ? sanitizeString(error.stack) : undefined;
    
    return {
      message: sanitizedMessage,
      sanitized: {
        name: error.name,
        message: sanitizedMessage,
        stack: sanitizedStack,
        ...(error as any).status && { status: (error as any).status },
        ...(error as any).code && { code: (error as any).code },
      },
      hasStack: !!error.stack,
    };
  }
  
  if (typeof error === 'string') {
    return {
      message: sanitizeString(error),
      sanitized: sanitizeString(error),
      hasStack: false,
    };
  }
  
  if (error && typeof error === 'object') {
    try {
      const errorString = JSON.stringify(error);
      const sanitized = sanitizeString(errorString);
      return {
        message: sanitized.length > 200 ? sanitized.substring(0, 200) + '...' : sanitized,
        sanitized: JSON.parse(sanitized),
        hasStack: false,
      };
    } catch {
      return {
        message: 'An error occurred',
        sanitized: { error: 'An error occurred' },
        hasStack: false,
      };
    }
  }
  
  return {
    message: 'An unexpected error occurred',
    sanitized: { error: 'An unexpected error occurred' },
    hasStack: false,
  };
}

/**
 * Creates a user-friendly error message from an error, removing sensitive data
 */
export function getUserFriendlyError(error: unknown): string {
  const { message } = sanitizeError(error);
  
  // Remove technical details in production
  if (process.env.NODE_ENV === 'production') {
    // Remove file paths
    let userMessage = message.replace(/\/[^\s]+/g, '[FILE]');
    
    // Remove stack trace indicators
    userMessage = userMessage.replace(/at\s+[^\s]+/g, '');
    userMessage = userMessage.replace(/Error:\s*/g, '');
    
    // Remove common technical prefixes
    userMessage = userMessage.replace(/\[.*?\]/g, '');
    
    // Clean up whitespace
    userMessage = userMessage.replace(/\s+/g, ' ').trim();
    
    // If message is too technical or empty, provide generic message
    if (userMessage.length < 10 || userMessage.includes('at ') || userMessage.includes('Error:')) {
      return 'An error occurred. Please try again or contact support if the problem persists.';
    }
    
    return userMessage;
  }
  
  return message;
}

/**
 * Sanitizes error details for logging (preserves structure but removes sensitive data)
 */
export function sanitizeErrorForLogging(error: unknown): Record<string, unknown> {
  const { sanitized, hasStack } = sanitizeError(error);
  
  return {
    error: sanitized,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    hasStack,
  };
}

/**
 * Checks if an error message contains sensitive information
 */
export function containsSensitiveData(message: string): boolean {
  return SENSITIVE_PATTERNS.some(pattern => pattern.test(message));
}

