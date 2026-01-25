/**
 * Admin API client for admin portal.
 * Uses admin session tokens (not JWT tokens).
 * Tokens are stored in HttpOnly cookies to prevent JavaScript access.
 */

import { getApiBaseUrl } from "./client";
import { secureLogger } from "@/lib/utils/secureLogger";

type AdminApiOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
};

/**
 * Get admin token from HttpOnly cookie via API route.
 * This prevents token from being accessible via JavaScript/console.
 */
async function getAdminToken(): Promise<string | null> {
  if (typeof window === "undefined") {
    return null;
  }
  
  try {
    const response = await fetch("/api/admin/token", {
      method: "GET",
      credentials: "include", // Include cookies
      cache: "no-store",
    });
    
    if (!response.ok) {
      if (response.status === 401) {
        // No token found
        return null;
      }
      secureLogger.error("Failed to get admin token", { status: response.status }, "admin-client");
      return null;
    }
    
    const data = await response.json() as { token?: string };
    return data.token || null;
  } catch (error) {
    secureLogger.error("Error getting admin token", error, "admin-client");
    return null;
  }
}

async function adminApiRequest<T>(
  endpoint: string,
  options: AdminApiOptions = {}
): Promise<T> {
  const { method = "GET", body, headers = {} } = options;
  
  const token = await getAdminToken();
  if (!token) {
    // Redirect to login if no token
    if (typeof window !== "undefined") {
      window.location.href = "/admin/login";
    }
    throw new Error("Admin session token not found");
  }

  const baseUrl = getApiBaseUrl();
  const url = endpoint.startsWith("http")
    ? endpoint
    : endpoint.startsWith("/api")
    ? endpoint
    : `${baseUrl}${endpoint}`;

  const requestHeaders: HeadersInit = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    ...headers,
  };

  const config: RequestInit = {
    method,
    headers: requestHeaders,
  };

  if (body && method !== "GET") {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(url, config);

  // Handle 401 - token expired or invalid
  if (response.status === 401) {
    // Clear token cookie and redirect to login
    if (typeof window !== "undefined") {
      try {
        await fetch("/api/admin/token", {
          method: "DELETE",
          credentials: "include",
        });
      } catch (error) {
        secureLogger.error("Failed to clear admin token", error, "admin-client");
      }
      window.location.href = "/admin/login";
    }
    throw new Error("Session expired. Please log in again.");
  }

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({
      error: `HTTP ${response.status}: ${response.statusText}`,
    }));
    const error = new Error(
      errorBody.detail || errorBody.error || errorBody.message || "Request failed"
    );
    (error as any).status = response.status;
    (error as any).code = errorBody.code;
    throw error;
  }

  // Handle empty responses
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    return response.json();
  }

  return response.text() as unknown as T;
}

export async function apiAdminGet<T>(
  endpoint: string,
  options: Omit<AdminApiOptions, "method"> = {}
): Promise<T> {
  return adminApiRequest<T>(endpoint, { ...options, method: "GET" });
}

export async function apiAdminPost<T>(
  endpoint: string,
  options: Omit<AdminApiOptions, "method"> = {}
): Promise<T> {
  return adminApiRequest<T>(endpoint, { ...options, method: "POST" });
}

export async function apiAdminPut<T>(
  endpoint: string,
  options: Omit<AdminApiOptions, "method"> = {}
): Promise<T> {
  return adminApiRequest<T>(endpoint, { ...options, method: "PUT" });
}

export async function apiAdminDelete<T>(
  endpoint: string,
  options: Omit<AdminApiOptions, "method"> = {}
): Promise<T> {
  return adminApiRequest<T>(endpoint, { ...options, method: "DELETE" });
}

