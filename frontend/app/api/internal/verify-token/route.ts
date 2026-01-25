import { NextResponse } from "next/server";

/**
 * Diagnostic endpoint to verify INTERNAL_API_TOKEN is configured correctly.
 * This endpoint helps debug authentication issues.
 * 
 * Usage: GET /api/internal/verify-token?token=<your-token>
 * 
 * Returns diagnostic information about token configuration.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const providedToken = searchParams.get("token");
  // Store original untrimmed value to detect whitespace issues
  const expectedTokenRaw = process.env.INTERNAL_API_TOKEN;
  const expectedToken = expectedTokenRaw?.trim();

  const diagnostics: Record<string, any> = {
    tokenConfigured: !!expectedToken,
    tokenLength: expectedToken?.length || 0,
    providedTokenLength: providedToken?.length || 0,
    tokensMatch: false,
    hasWhitespace: false,
    issues: [] as string[],
  };

  if (!expectedToken) {
    diagnostics.issues.push("INTERNAL_API_TOKEN is not set in frontend environment");
    return NextResponse.json(diagnostics, { status: 500 });
  }

  if (!providedToken) {
    diagnostics.issues.push("No token provided in query parameter");
    return NextResponse.json(diagnostics, { status: 400 });
  }

  const trimmedProvided = providedToken.trim();
  // expectedToken is already trimmed, so no need to trim again
  const trimmedExpected = expectedToken;

  diagnostics.tokensMatch = trimmedProvided === trimmedExpected;
  // Compare original untrimmed values to detect whitespace in environment variable
  diagnostics.hasWhitespace = providedToken !== trimmedProvided || (expectedTokenRaw !== undefined && expectedTokenRaw !== expectedToken);

  if (trimmedProvided.length !== trimmedExpected.length) {
    diagnostics.issues.push(`Token length mismatch: provided=${trimmedProvided.length}, expected=${trimmedExpected.length}`);
  }

  if (trimmedProvided !== trimmedExpected) {
    // Find first differing character
    const minLen = Math.min(trimmedProvided.length, trimmedExpected.length);
    for (let i = 0; i < minLen; i++) {
      if (trimmedProvided[i] !== trimmedExpected[i]) {
        diagnostics.issues.push(`First difference at position ${i}: provided='${trimmedProvided[i]}' (char code ${trimmedProvided.charCodeAt(i)}), expected='${trimmedExpected[i]}' (char code ${trimmedExpected.charCodeAt(i)})`);
        break;
      }
    }
    if (trimmedProvided.length !== trimmedExpected.length) {
      diagnostics.issues.push(`Length difference: provided has ${trimmedProvided.length} chars, expected has ${trimmedExpected.length} chars`);
    }
  }

  // Check for common issues
  if (providedToken.includes("\n") || providedToken.includes("\r")) {
    diagnostics.issues.push("Provided token contains newline characters");
  }
  // Check the original untrimmed value for newlines (expectedToken is already trimmed)
  if (expectedTokenRaw && (expectedTokenRaw.includes("\n") || expectedTokenRaw.includes("\r"))) {
    diagnostics.issues.push("Expected token contains newline characters in environment variable");
  }

  return NextResponse.json(diagnostics, { 
    status: diagnostics.tokensMatch ? 200 : 401 
  });
}

