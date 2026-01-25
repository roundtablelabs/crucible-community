/**
 * Client-side token utilities for exchanging UUID tokens for JWT tokens.
 */

import { secureLogger } from "@/lib/utils/secureLogger";

/**
 * Check if a string is a UUID format.
 */
function isUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * Check if a string is a JWT token format.
 * JWT tokens have three parts separated by dots: header.payload.signature
 */
function isJWT(token: string): boolean {
  const parts = token.split('.');
  return parts.length === 3 && parts.every(part => part.length > 0);
}

// In-memory cache for JWT tokens (client-side only)
const jwtTokenCache = new Map<string, { token: string; expiresAt: number }>();

// Token refresh threshold: refresh if token expires within 5 minutes
const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Decode JWT token to get expiry time (without verification)
 * Returns expiry timestamp in milliseconds, or null if invalid
 */
function getTokenExpiry(token: string): number | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }
    
    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp) {
      // JWT exp is in seconds, convert to milliseconds
      return payload.exp * 1000;
    }
    
    return null;
  } catch {
    return null;
  }
}

/**
 * Check if token needs refresh (expires within threshold)
 */
function needsRefresh(token: string): boolean {
  const expiry = getTokenExpiry(token);
  if (!expiry) {
    // Can't determine expiry, assume it needs refresh
    return true;
  }
  
  const timeUntilExpiry = expiry - Date.now();
  return timeUntilExpiry < TOKEN_REFRESH_THRESHOLD_MS;
}

/**
 * Exchange UUID token for JWT token via Next.js API route.
 */
async function exchangeUUIDForJWT(uuidToken: string): Promise<string | null> {
  try {
    // Send token in request body
    const body = { token: uuidToken };
    
    const response = await fetch('/api/auth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      credentials: 'include', // Include cookies for session
      cache: 'no-store',
    });

    if (!response.ok) {
      const errorText = await response.text();
      secureLogger.error('Token exchange failed', { status: response.status, error: errorText }, 'client-token');
      return null;
    }

    const data = await response.json() as { access_token: string; refresh_token?: string };
    
    if (!data.access_token) {
      secureLogger.error('Token exchange response missing access_token', undefined, 'client-token');
      return null;
    }

    // Cache the JWT token for 1 hour
    const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour
    jwtTokenCache.set(uuidToken, { token: data.access_token, expiresAt });

    return data.access_token;
  } catch (error) {
    secureLogger.error('Error during token exchange', error, 'client-token');
    return null;
  }
}

/**
 * Get a valid authentication token (session token).
 * Session tokens are used instead of JWT.
 * 
 * @param token - The token to check (can be JWT or session token)
 * @returns The authentication token or null if invalid
 */
export async function ensureJWTToken(token: string | null | undefined): Promise<string | null> {
  if (!token) {
    return null;
  }

  // Session tokens are used instead of JWT
  // Session tokens are long random strings (43 chars, URL-safe base64)
  // They don't have dots like JWTs, so isJWT() will return false
  // If it's a JWT (from old login), return it (backward compatibility)
  if (isJWT(token)) {
    return token;
  }
  // If it's a UUID, it's invalid (no NextAuth)
  if (isUUID(token)) {
    secureLogger.warn('UUID token found. Please log in again.');
    return null;
  }
  // Otherwise, assume it's a session token and return as-is
  // Session tokens are already valid and don't need exchange
  return token;
}









