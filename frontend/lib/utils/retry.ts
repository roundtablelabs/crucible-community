/**
 * Retry utility with exponential backoff
 */

export interface RetryConfig {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: (error: unknown) => boolean;
}

const DEFAULT_CONFIG: Required<Omit<RetryConfig, "retryableErrors">> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  backoffMultiplier: 2,
};

/**
 * Determines if an error should be retried
 */
function shouldRetry(error: unknown, retryableErrors?: (error: unknown) => boolean): boolean {
  if (retryableErrors) {
    return retryableErrors(error);
  }

  // Default: retry on network errors and 5xx errors
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.includes("network") || message.includes("fetch")) {
      return true;
    }
    if (message.includes("500") || message.includes("502") || message.includes("503") || message.includes("504")) {
      return true;
    }
    // Retry on rate limit errors (429)
    if (message.includes("429") || message.includes("rate limit")) {
      return true;
    }
  }

  return false;
}

/**
 * Retry a function with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  config: RetryConfig = {}
): Promise<T> {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  let lastError: unknown;

  for (let attempt = 0; attempt <= finalConfig.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry if this was the last attempt
      if (attempt >= finalConfig.maxRetries) {
        break;
      }

      // Don't retry if error is not retryable
      if (!shouldRetry(error, finalConfig.retryableErrors)) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        finalConfig.initialDelayMs * Math.pow(finalConfig.backoffMultiplier, attempt),
        finalConfig.maxDelayMs
      );

      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  // All retries exhausted
  throw lastError;
}

/**
 * Retry a function with a simple delay (no exponential backoff)
 */
export async function retryWithDelay<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
  }

  throw lastError;
}

