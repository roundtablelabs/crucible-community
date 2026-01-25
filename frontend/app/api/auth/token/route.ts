import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/auth/token
 * Get authentication token from request.
 * Returns the token from request body or cookie as-is (accepts both JWT and session tokens).
 */
export async function POST(req: NextRequest) {
  try {
    // Get token from request body or cookie
    // Tokens are session tokens (or JWTs from old login)
    const body = await req.json().catch(() => ({}));
    const tokenFromBody = body.token;
    
    // Check cookies for auth_token
    const cookieToken = req.cookies.get("auth_token")?.value;
    
    // Check localStorage via request (if available)
    // Note: localStorage is not accessible from server-side, so we rely on cookies
    const token = tokenFromBody || cookieToken;
    
    // Accept both JWT tokens (backward compatibility) and session tokens
    // Session tokens are long random strings (43 chars, URL-safe base64), not JWTs
    if (token) {
      // Return the token as-is (could be JWT or session token)
      return NextResponse.json({
        access_token: token,
      });
    }
    
    // If no valid token, return error
    return NextResponse.json(
      { error: "No valid token found. Please log in again." },
      { status: 401 }
    );
  } catch (error) {
    console.error('[api/auth/token] Error:', error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}









