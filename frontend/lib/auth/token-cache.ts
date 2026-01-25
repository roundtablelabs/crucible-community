/**
 * In-memory cache for JWT tokens.
 * 
 * This cache stores JWT tokens temporarily between token exchange and session update.
 * Tokens are keyed by user ID (UUID).
 * 
 * Note: This is a temporary solution. In production, consider using Redis or
 * storing tokens in the NextAuth token object via JWT callback.
 */

interface CachedToken {
  jwtToken: string;
  expiresAt: number; // Unix timestamp in milliseconds
}

// In-memory cache: userId -> CachedToken
const tokenCache = new Map<string, CachedToken>();

// Cache TTL: 25 minutes (tokens expire in 30 minutes, so refresh before expiration)
const CACHE_TTL_MS = 25 * 60 * 1000;

/**
 * Store a JWT token in the cache.
 */
export function cacheJWTToken(userId: string, jwtToken: string): void {
  const expiresAt = Date.now() + CACHE_TTL_MS;
  tokenCache.set(userId, { jwtToken, expiresAt });
  
  if (process.env.NODE_ENV === "development") {
    console.log(`[token-cache] Cached JWT token for user ${userId.substring(0, 8)}...`);
  }
}

/**
 * Get a JWT token from the cache.
 * Returns null if not found or expired.
 */
export function getCachedJWTToken(userId: string): string | null {
  const cached = tokenCache.get(userId);
  
  if (!cached) {
    return null;
  }
  
  // Check if expired
  if (Date.now() >= cached.expiresAt) {
    tokenCache.delete(userId);
    if (process.env.NODE_ENV === "development") {
      console.log(`[token-cache] Cached token expired for user ${userId.substring(0, 8)}...`);
    }
    return null;
  }
  
  return cached.jwtToken;
}

/**
 * Clear a cached token (e.g., on logout).
 */
export function clearCachedToken(userId: string): void {
  tokenCache.delete(userId);
}

/**
 * Clear all cached tokens (e.g., on server restart).
 */
export function clearAllTokens(): void {
  tokenCache.clear();
}









