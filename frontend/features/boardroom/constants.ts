/**
 * Boardroom feature constants
 * Extracted from frontend/app/(app)/app/page.tsx
 */

// Utility function
export const generateId = () => Math.random().toString(36).slice(2, 10);

// Cache keys
export const CHAT_CACHE_KEY = "boardroom-intake-state";
export const LAUNCHPAD_TRANSFER_KEY = "launchpad-intake-transfer";
export const LAUNCHPAD_CACHE_KEY = "launchpad-intake-state";

// Session status timing constants
export const LIVE_STATUS_STALE_AFTER_MS = 2 * 60_000; // expire stale "running" flags after two minutes
export const LIVE_STATUS_MIN_GRACE_MS = 15_000; // allow server a short grace window before force-clearing

// Storage keys
export const AUTH_ERROR_STORAGE_KEY = "auth-error-code";

// Auth error messages
export const AUTH_ERROR_MESSAGES: Record<string, string> = {
  OAuthSignin:
    "We couldn't open the Microsoft sign-in window. Verify the Azure AD app is configured for this domain and try again.",
  OAuthCallback: "The provider didn't send the expected details back. Please retry.",
  default: "We couldn't connect to your provider. Please try again.",
};

