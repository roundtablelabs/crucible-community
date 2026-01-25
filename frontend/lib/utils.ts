import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

export function formatCurrency(amount: number, currency: string = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(amount);
}

/**
 * Get the app URL with the correct subdomain.
 * Uses environment variable or falls back to relative paths.
 */
export function getAppUrl(path: string = "/app"): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  
  if (typeof window === "undefined") {
    // Server-side: use env var or relative path
    return appUrl ? `${appUrl}${path}` : path;
  }
  
  // Client-side: check current domain
  const hostname = window.location.hostname;
  
  // If already on app subdomain or localhost, use relative path
  if (hostname.includes("localhost") || hostname.includes("127.0.0.1")) {
    return path;
  }
  
  // If env var is set, use it; otherwise use relative path
  return appUrl ? `${appUrl}${path}` : path;
}

/**
 * Get the documentation URL.
 * Uses environment variable if set, otherwise defaults to relative /docs path.
 */
export function getDocsUrl(path: string = ""): string {
  const baseUrl = process.env.NEXT_PUBLIC_DOCS_URL || "/docs";
  const cleanPath = path.startsWith("/") ? path : path ? `/${path}` : "";
  return `${baseUrl}${cleanPath}`;
}

/**
 * Get the main marketing domain URL.
 * Uses environment variable or falls back to relative paths.
 * Used for legal pages and other main domain content.
 */
export function getMarketingUrl(path: string = ""): string {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || "";
  const cleanPath = path.startsWith("/") ? path : path ? `/${path}` : "";
  return baseUrl ? `${baseUrl}${cleanPath}` : cleanPath || "/";
}
