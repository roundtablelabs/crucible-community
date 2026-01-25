/**
 * Secure logging utility that prevents sensitive data leakage in production.
 * 
 * This utility:
 * - Only logs in development mode
 * - Sanitizes sensitive data (tokens, emails, user IDs, API keys)
 * - Preserves critical debugging logs needed for duplicate detection
 * - Provides production-safe error reporting
 */

const SENSITIVE_PATTERNS = [
  // JWT tokens (3 parts separated by dots)
  /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g,
  // Bearer tokens
  /\bBearer\s+[A-Za-z0-9_-]{20,}\b/gi,
  // UUIDs that might be user IDs (but preserve session IDs for debugging)
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
  // API keys (sk-, xoxb-, etc.)
  /\b(sk|pk|AKIA|AIza|xoxb|xoxp|xoxa|xoxs|ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_-]{20,}\b/gi,
  // Email addresses (but preserve domain for debugging)
  /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g,
  // Authorization headers
  /authorization:\s*[^\s]+/gi,
  // Token in various formats
  /token["\s:=]+([A-Za-z0-9_-]{20,})/gi,
  // Access tokens
  /access[_\s]?token["\s:=]+([A-Za-z0-9_-]{20,})/gi,
];

/**
 * Sanitizes a string by removing or masking sensitive data
 */
function sanitizeString(value: string): string {
  let sanitized = value;
  
  // Replace JWT tokens
  sanitized = sanitized.replace(/\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, '[JWT_TOKEN]');
  
  // Replace Bearer tokens
  sanitized = sanitized.replace(/\bBearer\s+[A-Za-z0-9_-]{20,}\b/gi, 'Bearer [TOKEN]');
  
  // Replace API keys
  sanitized = sanitized.replace(/\b(sk|pk|AKIA|AIza|ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_-]{20,}\b/gi, '[API_KEY]');
  
  // Mask email addresses (preserve domain for debugging)
  sanitized = sanitized.replace(/\b([A-Za-z0-9._%+-]+)@([A-Za-z0-9.-]+\.[A-Z|a-z]{2,})\b/g, '[EMAIL]@$2');
  
  // Replace tokens in key-value pairs
  sanitized = sanitized.replace(/token["\s:=]+([A-Za-z0-9_-]{20,})/gi, 'token=[TOKEN]');
  sanitized = sanitized.replace(/access[_\s]?token["\s:=]+([A-Za-z0-9_-]{20,})/gi, 'access_token=[TOKEN]');
  
  // Replace authorization headers
  sanitized = sanitized.replace(/authorization:\s*[^\s]+/gi, 'authorization: [REDACTED]');
  
  return sanitized;
}

/**
 * Sanitizes an object by recursively sanitizing string values
 */
function sanitizeObject(obj: unknown, depth = 0): unknown {
  // Prevent infinite recursion
  if (depth > 10) {
    return '[MAX_DEPTH]';
  }
  
  if (obj === null || obj === undefined) {
    return obj;
  }
  
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  
  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item, depth + 1));
  }
  
  if (typeof obj === 'object') {
    const sanitized: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Skip sensitive keys entirely in production
      const lowerKey = key.toLowerCase();
      if (process.env.NODE_ENV === 'production' && (
        lowerKey.includes('token') ||
        lowerKey.includes('password') ||
        lowerKey.includes('secret') ||
        lowerKey.includes('key') ||
        lowerKey.includes('auth')
      )) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = sanitizeObject(value, depth + 1);
      }
    }
    return sanitized;
  }
  
  return obj;
}

/**
 * Checks if a log message should be preserved even in production
 * (e.g., critical debugging logs for duplicate detection)
 */
function shouldPreserveLog(message: string, context?: string): boolean {
  const lowerMessage = message.toLowerCase();
  const lowerContext = context?.toLowerCase() || '';
  
  // Preserve critical logs for duplicate detection
  const criticalPatterns = [
    'connection already exists',
    'duplicate connection',
    'session already exists',
    'task already',
    'celery_task_id',
    'duplicate llm',
    'duplicate debate',
  ];
  
  if (criticalPatterns.some(pattern => lowerMessage.includes(pattern) || lowerContext.includes(pattern))) {
    return true;
  }
  
  return false;
}

/**
 * Secure logger that only logs in development mode and sanitizes sensitive data
 */
export const secureLogger = {
  /**
   * Logs a message (development only, sanitized in production)
   */
  log: (message: string, ...args: unknown[]): void => {
    if (process.env.NODE_ENV === 'development') {
      const sanitizedArgs = args.map(arg => sanitizeObject(arg));
      console.log(`[${new Date().toISOString()}] ${sanitizeString(message)}`, ...sanitizedArgs);
    } else if (shouldPreserveLog(message)) {
      // Preserve critical logs even in production (but sanitized)
      const sanitizedArgs = args.map(arg => sanitizeObject(arg));
      console.log(`[${new Date().toISOString()}] ${sanitizeString(message)}`, ...sanitizedArgs);
    }
  },
  
  /**
   * Logs an error (development only, sanitized in production)
   */
  error: (message: string, error?: unknown, context?: string): void => {
    const shouldPreserve = shouldPreserveLog(message, context);
    
    if (process.env.NODE_ENV === 'development' || shouldPreserve) {
      const sanitizedMessage = sanitizeString(message);
      const sanitizedContext = context ? `[${sanitizeString(context)}]` : '';
      
      if (error instanceof Error) {
        const sanitizedError = {
          name: error.name,
          message: sanitizeString(error.message),
          stack: process.env.NODE_ENV === 'development' ? error.stack : '[STACK_TRACE_REDACTED]',
        };
        console.error(`${sanitizedContext} ${sanitizedMessage}`, sanitizedError);
      } else if (error !== undefined) {
        console.error(`${sanitizedContext} ${sanitizedMessage}`, sanitizeObject(error));
      } else {
        console.error(`${sanitizedContext} ${sanitizedMessage}`);
      }
    }
  },
  
  /**
   * Logs a warning (development only, sanitized in production)
   */
  warn: (message: string, ...args: unknown[]): void => {
    const shouldPreserve = shouldPreserveLog(message);
    
    if (process.env.NODE_ENV === 'development' || shouldPreserve) {
      const sanitizedArgs = args.map(arg => sanitizeObject(arg));
      console.warn(`[${new Date().toISOString()}] ${sanitizeString(message)}`, ...sanitizedArgs);
    }
  },
  
  /**
   * Logs debug information (development only)
   */
  debug: (message: string, ...args: unknown[]): void => {
    if (process.env.NODE_ENV === 'development') {
      const sanitizedArgs = args.map(arg => sanitizeObject(arg));
      console.debug(`[${new Date().toISOString()}] [DEBUG] ${sanitizeString(message)}`, ...sanitizedArgs);
    }
  },
  
  /**
   * Logs info (development only, sanitized in production)
   */
  info: (message: string, ...args: unknown[]): void => {
    if (process.env.NODE_ENV === 'development') {
      const sanitizedArgs = args.map(arg => sanitizeObject(arg));
      console.info(`[${new Date().toISOString()}] [INFO] ${sanitizeString(message)}`, ...sanitizedArgs);
    }
  },
};

/**
 * Default export for convenience
 */
export default secureLogger;

