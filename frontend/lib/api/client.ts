import { secureLogger } from "@/lib/utils/secureLogger";

/**
 * Validates API URL format
 */
function validateApiUrl(url: string): { valid: boolean; error?: string } {
  // Check if it's a valid URL format
  try {
    const urlObj = new URL(url);
    
    // Must be http or https
    if (urlObj.protocol !== "http:" && urlObj.protocol !== "https:") {
      return {
        valid: false,
        error: `Invalid protocol: ${urlObj.protocol}. Must be http:// or https://`,
      };
    }
    
    // Must have a hostname
    if (!urlObj.hostname) {
      return {
        valid: false,
        error: "URL must include a hostname",
      };
    }
    
    return { valid: true };
  } catch (error) {
    // If it's a relative URL (starts with /), that's OK
    if (url.startsWith("/")) {
      return { valid: true };
    }
    
    return {
      valid: false,
      error: `Invalid URL format: ${url}`,
    };
  }
}

export function getApiBaseUrl(): string {
  if (typeof window === "undefined") {
    // Server-side: use environment variable
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      // In development mode, default to localhost API
      const isDevelopment = process.env.NODE_ENV === "development";
      if (isDevelopment) {
        secureLogger.warn(
          "NEXT_PUBLIC_API_URL not set. Defaulting to http://localhost:8000/api for local development."
        );
        return "http://localhost:8000/api";
      }
      throw new Error(
        "NEXT_PUBLIC_API_URL is not set. This is required in production. " +
        "Please set it in your environment variables."
      );
    }
    
    // Validate URL format
    const validation = validateApiUrl(apiUrl);
    if (!validation.valid) {
      throw new Error(
        `Invalid NEXT_PUBLIC_API_URL: ${validation.error}. ` +
        `Current value: ${apiUrl}`
      );
    }
    
    let url = apiUrl.replace(/\/$/, "");
    const isProduction = process.env.NODE_ENV === "production";
    const isLocalhost = url.includes("localhost") || url.includes("127.0.0.1");
    
    // Warn (don't error) for HTTP URLs in production
    if (url.startsWith("http://") && !isLocalhost) {
      if (isProduction) {
        secureLogger.warn(
          "NEXT_PUBLIC_API_URL uses HTTP in production. This may cause security issues. " +
          "Consider using HTTPS. URL: " + url
        );
      } else {
        secureLogger.warn("Converting HTTP to HTTPS for non-localhost URL", url);
        url = url.replace(/^http:\/\//, "https://");
      }
    }
    
    return url;
  }
  
  // Client-side: use the public environment variable
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  if (!apiUrl) {
    // In development, try to use localhost API if we're on localhost
    const isDevelopment = process.env.NODE_ENV === "development";
    if (isDevelopment && typeof window !== "undefined" && window.location.hostname === "localhost") {
      secureLogger.warn(
        "NEXT_PUBLIC_API_URL not set. Defaulting to http://localhost:8000/api for local development."
      );
      return "http://localhost:8000/api";
    }
    // Fallback to relative URL if not set (for production or unknown environments)
    secureLogger.warn(
      "NEXT_PUBLIC_API_URL not set. Using relative URL /api. " +
      "This may not work if the backend is on a different domain."
    );
    return "/api";
  }
  
  // Validate URL format
  const validation = validateApiUrl(apiUrl);
  if (!validation.valid) {
    const errorMessage = `Invalid NEXT_PUBLIC_API_URL: ${validation.error}. Current value: ${apiUrl}`;
    secureLogger.error(errorMessage);
    // In production, throw error; in development, warn and use fallback
    if (process.env.NODE_ENV === "production") {
      throw new Error(errorMessage);
    } else {
      secureLogger.warn(errorMessage + ". Using fallback /api");
      return "/api";
    }
  }
  
  let url = apiUrl.replace(/\/$/, "");
  const isProduction = process.env.NODE_ENV === "production";
  const isLocalhost = url.includes("localhost") || url.includes("127.0.0.1");
  
  // Always force HTTPS for production URLs (not localhost) to prevent mixed content errors
  // Browsers block HTTP requests from HTTPS pages, so we must use HTTPS
  // This also handles cases where NEXT_PUBLIC_API_URL was set to HTTP at build time
  if (url.startsWith("http://") && !isLocalhost) {
    if (isProduction) {
      secureLogger.warn(
        "NEXT_PUBLIC_API_URL uses HTTP in production. This may cause security and CORS issues. " +
        "Consider using HTTPS. Converting to HTTPS automatically. Original URL: " + url
      );
    } else {
      secureLogger.warn("Converting HTTP to HTTPS for production URL", url);
    }
    url = url.replace(/^http:\/\//, "https://");
  }
  
  return url;
}

type ApiOptions = {
  token?: string | null;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  body?: unknown;
  headers?: Record<string, string>;
  credentials?: RequestCredentials;
};

async function apiRequest<T>(
  endpoint: string,
  options: ApiOptions = {}
): Promise<T> {
  let { token, method = "GET", body, headers = {}, credentials } = options;
  
  // On client-side, ensure we have a valid token (JWT or session token)
  if (typeof window !== "undefined" && token) {
    const { ensureJWTToken } = await import("@/lib/auth/client-token");
    const validatedToken = await ensureJWTToken(token);
    if (validatedToken) {
      token = validatedToken;
    } else {
      // Token validation failed - force re-login
      throw new Error("Invalid authentication token. Please log in again.");
    }
  }
  
  const baseUrl = getApiBaseUrl();
  // If endpoint starts with /api, treat it as a Next.js API route (relative URL)
  // Otherwise, prepend the baseUrl (backend API)
  const url = endpoint.startsWith("http") 
    ? endpoint 
    : endpoint.startsWith("/api")
    ? endpoint
    : `${baseUrl}${endpoint}`;

  // Log the URL being called in development for debugging
  if (typeof window !== "undefined") {
    secureLogger.debug(`${method} ${url}`);
  }

  // Check if body is FormData - if so, skip Content-Type header and JSON serialization
  const isFormData = body instanceof FormData;

  const requestHeaders: HeadersInit = {
    ...headers,
  };

  // Only set Content-Type for non-FormData requests
  // FormData requests need the browser to set Content-Type with boundary
  if (!isFormData) {
    requestHeaders["Content-Type"] = "application/json";
  }

  if (token) {
    requestHeaders.Authorization = `Bearer ${token}`;
  }

  const config: RequestInit = {
    method,
    headers: requestHeaders,
  };

  if (credentials) {
    config.credentials = credentials;
  }

  if (body && method !== "GET") {
    // FormData should be passed directly, not stringified
    config.body = isFormData ? body : JSON.stringify(body);
  }

  // Use retry for transient failures (network errors, 5xx, 429)
  const makeRequest = async (): Promise<T> => {
    let response: Response;
    try {
      response = await fetch(url, config);
    } catch (error) {
      // Handle network errors (connection refused, timeout, etc.)
      if (error instanceof TypeError && error.message === "Failed to fetch") {
        const isLocalhost = url.includes("localhost") || url.includes("127.0.0.1");
        if (isLocalhost && process.env.NODE_ENV === "development") {
          throw new Error(
            `Cannot connect to API server at ${url}. Make sure the backend server is running on port 8000. ` +
            `Start it with: cd api && uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
          );
        }
        throw new Error(`Network error: Cannot connect to ${url}. Please check if the server is running.`);
      }
      throw error;
    }

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({
        error: `HTTP ${response.status}: ${response.statusText}`,
      }));
      
      // Handle 401 Unauthorized - redirect to login
      if (response.status === 401) {
        if (typeof window !== "undefined") {
          // Clear invalid token
          localStorage.removeItem("auth_token");
          localStorage.removeItem("refresh_token");
          document.cookie = "auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
          // Redirect to login
          window.location.href = "/auth/login";
          // Return a promise that never resolves to prevent further execution
          return new Promise<T>(() => {});
        }
      }
      
      // Log detailed error (sanitized)
      secureLogger.error(
        `Error ${response.status} for ${method} ${url}`,
        errorBody,
        "apiRequest"
      );
      
      // Create error with status code for retry logic
      // Sanitize error message to prevent token leakage
      const { getUserFriendlyError } = await import("@/lib/utils/errorSanitizer");
      const errorMessage = errorBody.detail || errorBody.error || errorBody.message || "Request failed";
      const sanitizedMessage = getUserFriendlyError(errorMessage);
      const error = new Error(sanitizedMessage);
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
  };

  // Only retry for GET requests (not mutations)
  const shouldRetry = method === "GET";
  
  if (shouldRetry) {
    const { retryWithBackoff } = await import("@/lib/utils/retry");
    return retryWithBackoff(makeRequest, {
      maxRetries: 2,
      initialDelayMs: 1000,
      retryableErrors: (error) => {
        // Retry on network errors
        if (error instanceof TypeError) {
          return true;
        }
        // Retry on 5xx errors and 429 (rate limit)
        if (error instanceof Error && (error as any).status) {
          const status = (error as any).status;
          return status >= 500 || status === 429;
        }
        return false;
      },
    });
  }

  return makeRequest();
}

export async function apiGet<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  return apiRequest<T>(endpoint, { ...options, method: "GET" });
}

export async function apiPost<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  return apiRequest<T>(endpoint, { ...options, method: "POST" });
}

export async function apiPut<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  return apiRequest<T>(endpoint, { ...options, method: "PUT" });
}

export async function apiDelete<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  return apiRequest<T>(endpoint, { ...options, method: "DELETE" });
}

export async function apiPatch<T>(endpoint: string, options: ApiOptions = {}): Promise<T> {
  return apiRequest<T>(endpoint, { ...options, method: "PATCH" });
}

export async function apiFetch<T>(
  endpoint: string,
  options: ApiOptions = {}
): Promise<T> {
  return apiRequest<T>(endpoint, options);
}

/**
 * Error information structure for better error handling
 */
export interface ApiErrorInfo {
  status?: number;
  code?: string;
  message: string;
  retryable: boolean;
}

/**
 * Extracts error information from an error object
 */
export function getApiErrorInfo(error: unknown): ApiErrorInfo {
  const message = error instanceof Error ? error.message : String(error);
  const status = (error as any)?.status;
  const code = (error as any)?.code;

  // Determine if error is retryable
  let retryable = false;
  if (error instanceof TypeError && message.includes("fetch")) {
    retryable = true; // Network errors
  } else if (status) {
    // 5xx errors and 429 are retryable
    retryable = status >= 500 || status === 429 || status === 503;
  } else if (message.toLowerCase().includes("timeout") || message.toLowerCase().includes("network")) {
    retryable = true;
  }

  return {
    status,
    code,
    message,
    retryable,
  };
}

/**
 * Determines if an error is retryable
 */
export function isApiErrorRetryable(error: unknown): boolean {
  return getApiErrorInfo(error).retryable;
}

/**
 * Creates a retryable API call wrapper
 * Returns both the promise and a retry function
 */
export function createRetryableApiCall<T>(
  endpoint: string,
  options: ApiOptions = {}
): {
  promise: Promise<T>;
  retry: () => Promise<T>;
} {
  let lastOptions = options;

  const makeCall = (): Promise<T> => {
    return apiRequest<T>(endpoint, lastOptions);
  };

  return {
    promise: makeCall(),
    retry: makeCall,
  };
}
