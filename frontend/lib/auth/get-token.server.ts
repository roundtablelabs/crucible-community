/**
 * Server-side version of getAuthToken.
 * This file can safely import auth.ts and use pg.
 */

import { auth } from "@/auth";
import { getServerApiBaseUrl } from "@/lib/api/base";
import { cacheJWTToken, getCachedJWTToken } from "./token-cache";

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

/**
 * Exchange UUID token for JWT token via backend API.
 */
async function exchangeUUIDForJWT(uuidToken: string, userEmail: string): Promise<string | null> {
  try {
    const apiBase = getServerApiBaseUrl();
    const response = await fetch(`${apiBase}/auth/token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${uuidToken}`, // UUID token for token exchange
      },
      body: JSON.stringify({ email: userEmail }),
      cache: 'no-store', // Don't cache token exchange requests
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[getAuthToken] Token exchange failed:', response.status, errorText);
      return null;
    }

    const data = await response.json() as { access_token: string; refresh_token?: string };
    
    if (!data.access_token) {
      console.error('[getAuthToken] Token exchange response missing access_token');
      return null;
    }

    return data.access_token;
  } catch (error) {
    console.error('[getAuthToken] Error during token exchange:', error);
    return null;
  }
}

/**
 * Get the authentication token from the session (server-side only).
 * 
 * This function:
 * 1. Uses auth() to get session and exchange UUID for JWT
 * 2. Returns JWT token for API authentication
 * 
 * @returns The JWT token or null if not authenticated
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    const session = await auth();
    
    if (!session?.user) {
      console.warn("[getAuthToken] No session or user found");
      return null;
    }

    // Check if we already have a JWT token stored in session
    const existingToken = session.user.token;
    if (existingToken && isJWT(existingToken)) {
      // Already have JWT token - return it
      if (process.env.NODE_ENV === "development") {
        console.log("[getAuthToken] Returning JWT token from session");
      }
      return existingToken;
    }

    // Need to exchange UUID for JWT
    const userId = session.user.id;
    const userEmail = session.user.email;
    
    if (!userId || !userEmail) {
      console.warn("[getAuthToken] Missing user ID or email for token exchange", {
        userId: session.user.id,
        email: session.user.email,
      });
      return null;
    }

    // Validate userId is a UUID (required for token exchange)
    if (!isUUID(userId)) {
      console.error("[getAuthToken] User ID is not a valid UUID format:", userId);
      return null;
    }

    // Check in-memory cache first
    const cachedToken = getCachedJWTToken(userId);
    if (cachedToken) {
      if (process.env.NODE_ENV === "development") {
        console.log("[getAuthToken] Returning JWT token from cache");
      }
      return cachedToken;
    }

    if (process.env.NODE_ENV === "development") {
      console.log("[getAuthToken] Exchanging UUID token for JWT token");
    }

    // Exchange UUID for JWT
    const jwtToken = await exchangeUUIDForJWT(userId, userEmail);
    
    if (!jwtToken) {
      console.error("[getAuthToken] Failed to exchange UUID for JWT token");
      return null;
    }

    // Cache the JWT token for future use
    cacheJWTToken(userId, jwtToken);
    
    if (process.env.NODE_ENV === "development") {
      console.log("[getAuthToken] Successfully exchanged UUID for JWT token and cached it");
    }

    return jwtToken;
  } catch (error) {
    console.error("[getAuthToken] Error getting auth token:", error);
    return null;
  }
}

