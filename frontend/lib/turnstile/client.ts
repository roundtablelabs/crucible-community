/**
 * Turnstile client utilities for executing CAPTCHA and determining requirements.
 */

import { useTurnstile } from "@/components/providers/TurnstileProvider";
import { checkRateLimitStatus, type EndpointType } from "@/lib/api/rate-limit";
import { TURNSTILE_ERRORS } from "./constants";

/**
 * Determine if CAPTCHA is needed based on user authentication and rate limit status.
 * 
 * @param user - Current user (null if unauthenticated)
 * @param rateLimitStatus - Current rate limit status
 * @returns true if CAPTCHA is required
 */
export function needsCaptcha(
  user: { id: string } | null,
  rateLimitStatus: { remaining: number } | null
): boolean {
  // Always require for unauthenticated users (shouldn't happen after Phase 1 fix, but good defense)
  if (!user) {
    return true;
  }
  
  // Require if remaining < 3 AND remaining > 0
  // If remaining = 0, no point in requiring CAPTCHA (will hit rate limit anyway)
  const remaining = rateLimitStatus?.remaining ?? 0;
  return remaining > 0 && remaining < 3;
}

/**
 * Execute Turnstile widget and get token.
 * 
 * This is a hook that must be used within a component that has access to TurnstileProvider.
 * For use outside components, use the executeTurnstile function directly from useTurnstile hook.
 * 
 * @param action - Action name for the CAPTCHA (e.g., "intake", "moderator", "upload")
 * @returns Promise resolving to token string or null if failed
 */
export async function executeTurnstileAction(
  executeFn: (action: string) => Promise<string | null>,
  action: string
): Promise<string | null> {
  try {
    const token = await executeFn(action);
    
    if (!token) {
      if (process.env.NODE_ENV === "development") {
        console.warn(`[turnstile] Failed to get token for action: ${action}`);
      }
      return null;
    }
    
    return token;
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.error(`[turnstile] Error executing for action ${action}:`, error);
    }
    return null;
  }
}

/**
 * Check rate limit status and determine if CAPTCHA is needed, then execute if required.
 * 
 * This is a convenience function that combines rate limit check and CAPTCHA execution.
 * 
 * @param endpointType - The endpoint type to check
 * @param user - Current user (null if unauthenticated)
 * @param token - Auth token (optional, will be fetched if not provided)
 * @param executeFn - Turnstile execute function from useTurnstile hook
 * @returns Object with needsCaptcha flag and token (if needed)
 */
export async function checkAndExecuteCaptcha(
  endpointType: EndpointType,
  user: { id: string } | null,
  token: string | null,
  executeFn: (action: string) => Promise<string | null>
): Promise<{ needsCaptcha: boolean; token: string | null }> {
  // Check rate limit status
  const rateLimitStatus = await checkRateLimitStatus(endpointType, token);
  
  // Determine if CAPTCHA is needed
  const captchaNeeded = needsCaptcha(user, rateLimitStatus);
  
  if (!captchaNeeded) {
    return { needsCaptcha: false, token: null };
  }
  
  // Execute Turnstile
  const turnstileToken = await executeTurnstileAction(executeFn, endpointType);
  
  if (!turnstileToken) {
    throw new Error(TURNSTILE_ERRORS.WIDGET_ERROR);
  }
  
  return { needsCaptcha: true, token: turnstileToken };
}

