import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { secureLogger } from "@/lib/utils/secureLogger";

// Set to false to disable middleware debug logging
// Can be enabled via NEXT_PUBLIC_MIDDLEWARE_DEBUG=true environment variable
const MIDDLEWARE_DEBUG = process.env.NEXT_PUBLIC_MIDDLEWARE_DEBUG === "true";

export function middleware(request: NextRequest) {
  const url = request.nextUrl.clone();
  const hostname = request.headers.get("host") || "";
  const pathname = url.pathname;
  
  if (MIDDLEWARE_DEBUG) {
    secureLogger.debug("Request", {
      hostname,
      pathname,
      searchParams: url.searchParams.toString(),
    });
  }
  
  // Extract subdomain (e.g., "crucible" from configured domain)
  // Handle both configured subdomain and localhost/dev
  // Remove port number if present (e.g., "localhost:3000" -> "localhost")
  const hostnameWithoutPort = hostname.split(":")[0];
  const parts = hostnameWithoutPort.split(".");
  const subdomain = parts.length > 2 ? parts[0] : (parts[0] === "localhost" || parts[0] === "127.0.0.1") ? null : parts[0];
  
  if (MIDDLEWARE_DEBUG) {
    secureLogger.debug("Subdomain detection", {
      parts,
      subdomain,
      hostname,
    });
  }
  
  // Handle subdomain routing
  // Exclude auth routes, API routes, and static assets from subdomain redirects
  const isAuthRoute = pathname.startsWith("/auth");
  const isApiRoute = pathname.startsWith("/api");
  
  if (MIDDLEWARE_DEBUG) {
    secureLogger.debug("Route checks", {
      isAuthRoute,
      isApiRoute,
      pathname,
    });
  }
  
  if (subdomain === "crucible") {
    // If on crucible subdomain and not already on /app, redirect to /app
    // But allow auth and API routes to pass through
    const isAppRoute = pathname.startsWith("/app");
    if (!isAppRoute && !isAuthRoute && !isApiRoute) {
      url.pathname = `/app${pathname === "/" ? "" : pathname}`;
      if (MIDDLEWARE_DEBUG) {
        secureLogger.debug("Redirecting crucible subdomain", {
          from: pathname,
          to: url.pathname,
        });
      }
      return NextResponse.redirect(url);
    }
    if (MIDDLEWARE_DEBUG) {
      secureLogger.debug("Allowing crucible route to pass through", pathname);
    }
  }
  
  // Community Edition: Marketplace subdomain removed
  
  if (subdomain === "admin") {
    // If on admin subdomain, allow /admin routes and /login
    // But allow auth and API routes to pass through
    const isAdminRoute = pathname.startsWith("/admin") || pathname === "/login";
    if (!isAdminRoute && !isAuthRoute && !isApiRoute) {
      // Redirect root to /admin/dashboard if authenticated, otherwise /admin/login
      url.pathname = "/admin/login";
      if (MIDDLEWARE_DEBUG) {
        secureLogger.debug("Redirecting admin subdomain", {
          from: pathname,
          to: url.pathname,
        });
      }
      return NextResponse.redirect(url);
    }
    if (MIDDLEWARE_DEBUG) {
      secureLogger.debug("Allowing admin route to pass through", pathname);
    }
  }
  
  // Check authentication requirement
  // Check for auth token in cookies (set by login page)
  const authToken = request.cookies.get("auth_token")?.value;
  
  // Routes that require authentication
  const isProtectedRoute = pathname.startsWith("/app");
  
  if (isProtectedRoute && !authToken) {
    // No auth token, redirect to login
    url.pathname = "/auth/login";
    if (MIDDLEWARE_DEBUG) {
      secureLogger.debug("Redirecting to login (no auth token)", {
        from: pathname,
        to: url.pathname,
      });
    }
    return NextResponse.redirect(url);
  }
  
  // Redirect root to /auth/login if not authenticated, otherwise /app
  if (pathname === "/" && !isAuthRoute && !isApiRoute) {
    const authToken = request.cookies.get("auth_token")?.value;
    url.pathname = authToken ? "/app" : "/auth/login";
    if (MIDDLEWARE_DEBUG) {
      secureLogger.debug("Redirecting root", {
        from: pathname,
        to: url.pathname,
        hasToken: !!authToken,
      });
    }
    return NextResponse.redirect(url);
  }
  
  // For main domain, serve app routes
  if (MIDDLEWARE_DEBUG) {
    secureLogger.debug("Passing through to Next.js", {
      pathname,
      hostname,
      subdomain,
    });
  }
  
  // Add security headers to response
  const response = NextResponse.next();
  
  // Security headers
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-XSS-Protection', '1; mode=block');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - icon.svg (app icon)
     * - logos, images, assets, animations (public assets)
     */
    "/((?!api|_next/static|_next/image|favicon.ico|icon.svg|logos|images|assets|animations).*)",
  ],
};
