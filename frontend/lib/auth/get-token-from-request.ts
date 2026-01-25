/**
 * Crucible Community Edition
 * Copyright (C) 2025 Roundtable Labs Pty Ltd
 * 
 * Licensed under AGPL-3.0. See LICENSE file for details.
 */

/**
 * Extract authentication token from request (Community Edition).
 * 
 * Checks for token in:
 * 1. Cookie: `auth_token`
 * 2. Authorization header: `Bearer <token>`
 * 
 * Returns the token string or null if not found.
 * Accepts both UUID (session) tokens and JWT tokens.
 */
export function getTokenFromRequest(request: Request): string | null {
  // Try to get token from cookie first
  const cookieHeader = request.headers.get("cookie");
  if (cookieHeader) {
    const cookies = Object.fromEntries(
      cookieHeader.split("; ").map(c => {
        const [key, ...values] = c.split("=");
        return [key, values.join("=")];
      })
    );
    if (cookies.auth_token) {
      return cookies.auth_token;
    }
  }
  
  // If no cookie, try Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }
  
  return null;
}
