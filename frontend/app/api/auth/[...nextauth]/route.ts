import { NextRequest, NextResponse } from "next/server";
import { GET as nextAuthGET, POST as nextAuthPOST } from "@/auth";

// Intercept NextAuth requests/responses to redirect errors to our custom error page
async function handleWithErrorRedirect(
  handler: (req: NextRequest, context: { params: Promise<{ nextauth: string[] }> }) => Promise<Response>,
  req: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> }
): Promise<Response> {
  // 1. Check incoming request for errors (direct navigation case)
  const url = new URL(req.url);
  const reqError = url.searchParams.get("error");
  if (reqError) {
    const callbackUrl = url.searchParams.get("callbackUrl");
    const errorParams = new URLSearchParams();
    errorParams.set("error", reqError);
    if (callbackUrl) {
      errorParams.set("callbackUrl", callbackUrl);
    }
    return NextResponse.redirect(new URL(`/auth/error?${errorParams.toString()}`, req.url));
  }

  // 2. Execute NextAuth handler
  const response = await handler(req, context);

  // 3. Check response for error redirects (OAuth callback case)
  // NextAuth might return a redirect to its default error page (e.g. /api/auth/signin?error=...)
  // This happens when OAuthAccountNotLinked or other errors occur during callback processing
  const location = response.headers.get("Location");
  if (location && (response.status === 302 || response.status === 307 || response.status === 303)) {
    try {
      // Resolve relative URLs against the request URL
      const locationUrl = new URL(location, req.url);
      const error = locationUrl.searchParams.get("error");

      // If redirecting with an error parameter, force it to our custom error page
      // Check if it's going to NextAuth's default error page or our custom one
      const isNextAuthErrorPage = locationUrl.pathname.includes("/api/auth/signin") || 
                                  locationUrl.pathname.includes("/api/auth/error");
      const isCustomErrorPage = locationUrl.pathname.endsWith("/auth/error");

      if (error && !isCustomErrorPage) {
        // Redirect to our custom error page instead of NextAuth's default
        const customErrorUrl = new URL("/auth/error", req.url);
        // Copy all params (error, callbackUrl, etc.)
        locationUrl.searchParams.forEach((value, key) => {
          customErrorUrl.searchParams.set(key, value);
        });
        console.log(`[NextAuth] Intercepting error redirect: ${location} -> ${customErrorUrl.toString()}`);
        return NextResponse.redirect(customErrorUrl);
      }
    } catch (e) {
      // Ignore URL parsing errors, let the original response through
      console.warn("[NextAuth] Failed to parse redirect location:", e);
    }
  }

  return response;
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> }
): Promise<Response> {
  return handleWithErrorRedirect(nextAuthGET, req, context);
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> }
): Promise<Response> {
  return handleWithErrorRedirect(nextAuthPOST, req, context);
}
