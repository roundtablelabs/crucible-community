/**
 * Rate limiter for server-side API routes.
 * 
 * NOTE: In-memory rate limiting does NOT work in serverless environments
 * because each function invocation has separate memory. In production, rate limiting
 * should be handled at the infrastructure level (reverse proxy, Cloudflare, etc.)
 * or via a shared Redis instance.
 * 
 * This implementation is kept for local development and will be a no-op in production.
 */
const requests = new Map<string, number[]>();

export function rateLimit(options: { interval: number; uniqueTokenPerInterval: number }) {
  // In production/serverless environments, return a no-op rate limiter
  // Rate limiting should be handled at infrastructure level (reverse proxy, Cloudflare, etc.)
  const isProduction = process.env.NODE_ENV === "production";
  
  if (isProduction) {
    return {
      async check(_limit: number, _identifier: string): Promise<void> {
        // No-op in production - rate limiting handled at infrastructure level
        // Configure rate limiting in your reverse proxy or infrastructure layer
        return Promise.resolve();
      }
    };
  }

  // Local development: use in-memory rate limiting
  return {
    async check(limit: number, identifier: string): Promise<void> {
      const now = Date.now();
      const windowStart = now - options.interval;
      
      const userRequests = requests.get(identifier) || [];
      const recentRequests = userRequests.filter(time => time > windowStart);
      
      if (recentRequests.length >= limit) {
        const error = new Error("RateLimitExceeded");
        (error as any).statusCode = 429;
        throw error;
      }
      
      recentRequests.push(now);
      requests.set(identifier, recentRequests);
      
      // Clean up old entries periodically (every 1000 requests to avoid overhead)
      if (requests.size > options.uniqueTokenPerInterval) {
        // Remove entries that are outside the window
        for (const [key, times] of requests.entries()) {
          const validTimes = times.filter(time => time > windowStart);
          if (validTimes.length === 0) {
            requests.delete(key);
          } else {
            requests.set(key, validTimes);
          }
        }
      }
    }
  };
}
