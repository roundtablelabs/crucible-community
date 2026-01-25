/**
 * Rate limit status check utility for frontend components.
 * 
 * This utility allows frontend components to check rate limit status
 * before making requests, enabling conditional CAPTCHA execution.
 * 
 * NOTE: This is a CLIENT-SIDE utility. Token must be provided from useAuth() hook.
 */

import { getServerApiBaseUrl } from "@/lib/api/base";

export type EndpointType = "intake" | "moderator" | "upload";

export interface RateLimitStatus {
  remaining: number;
  limit: number;
  reset_at: number;
  allowed: boolean;
}

/**
 * Check rate limit status for a given endpoint type.
 * 
 * This function calls the backend rate limit check endpoint with increment=false
 * to get the current status without consuming a rate limit slot.
 * 
 * NOTE: Rate limiting is disabled. This function always returns null.
 * 
 * @param endpointType - The endpoint type to check ("intake", "moderator", or "upload")
 * @param token - Auth token from useAuth() hook. Required for authenticated requests.
 * @returns Rate limit status or null if check fails (fail open)
 */
export async function checkRateLimitStatus(
  endpointType: EndpointType,
  token: string | null
): Promise<RateLimitStatus | null> {
  // Rate limiting is disabled
  return null;
  
  const API_BASE_URL = getServerApiBaseUrl();
  
  try {
    const rateLimitResponse = await fetch(
      `${API_BASE_URL}/rate-limit/check/${endpointType}?increment=false`,
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        // Add timeout to prevent hanging
        signal: AbortSignal.timeout(5000), // 5 second timeout
      }
    );
    
    if (rateLimitResponse.ok) {
      const data = await rateLimitResponse.json();
      return {
        remaining: data.remaining ?? 0,
        limit: data.limit ?? 0,
        reset_at: data.reset_at ?? 0,
        allowed: data.allowed ?? false,
      };
    }
    
    // If check endpoint fails, fail open (allow request, backend will enforce)
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[rate-limit] Check endpoint returned ${rateLimitResponse.status} for ${endpointType}`
      );
    }
  } catch (error) {
    // Check endpoint unavailable - fail open (allow request)
    if (process.env.NODE_ENV === "development") {
      console.warn(
        `[rate-limit] Check endpoint unavailable for ${endpointType}, allowing request:`,
        error
      );
    }
  }
  
  return null;
}

