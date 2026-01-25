/**
 * Client-side version of getAuthToken.
 * This file never imports auth.ts or pg, so it's safe for client components.
 */

import { secureLogger } from "@/lib/utils/secureLogger";

/**
 * Get the authentication token from the session (client-side only).
 * Uses the /api/auth/token API route to exchange UUID for JWT.
 * 
 * @returns The JWT token or null if not authenticated
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    const response = await fetch('/api/auth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include', // Include cookies for session
      cache: 'no-store',
    });

    if (!response.ok) {
      if (response.status === 401) {
        secureLogger.warn("Unauthorized - no session found");
        return null;
      }
      const errorText = await response.text();
      secureLogger.error('Token exchange failed', { status: response.status, error: errorText }, 'getAuthToken');
      return null;
    }

    const data = await response.json() as { access_token: string; refresh_token?: string };
    
    if (!data.access_token) {
      secureLogger.error('Token exchange response missing access_token', undefined, 'getAuthToken');
      return null;
    }

    return data.access_token;
  } catch (error) {
    secureLogger.error('Error calling API route', error, 'getAuthToken');
    return null;
  }
}

