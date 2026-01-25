import { NextResponse } from "next/server";
import { getServerApiBaseUrl } from "@/lib/api/base";
import { getTokenFromRequest } from "@/lib/auth/get-token-from-request";

type ProviderApiKeys = {
  [provider: string]: string;
};

type UserSettings = {
  artifactRetention: boolean;
  retentionDays: number;
  excludedModelProviders: string[];
  providerApiKeys: ProviderApiKeys;
  defaultProvider: string;
};

export async function GET(request: Request) {
  try {
    const token = getTokenFromRequest(request);
    
    if (!token) {
      return NextResponse.json(
        { error: "Authentication required. Please log in again." },
        { status: 401 }
      );
    }

    const apiBaseUrl = getServerApiBaseUrl();
    
    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}/user/settings/`, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        cache: "no-store",
        credentials: "include",
      });
    } catch (fetchError) {
      // Network error - backend is not reachable
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      console.error("[user/settings] GET Network error connecting to backend:", errorMessage);
      return NextResponse.json(
        {
          error: "Cannot connect to backend server",
          details: `Failed to reach backend at ${apiBaseUrl}. Please check if the backend server is running.`,
        },
        { status: 503 }
      );
    }

    if (!response.ok) {
      if (response.status === 404) {
        // Return default settings if not found
        return NextResponse.json({
          artifactRetention: true,
          retentionDays: 30,
          excludedModelProviders: [],
          providerApiKeys: {},
          defaultProvider: "openrouter",
        } as UserSettings);
      }
      
      const errorText = await response.text().catch(() => "Unknown error");
      console.error("[user/settings] GET Backend error: status=%s body=%s", response.status, errorText);
      
      let errorMessage = "Failed to fetch settings";
      let errorDetails: string | undefined;
      
      // Provide specific error messages based on status code
      if (response.status === 401) {
        errorMessage = "Authentication failed. Please log in again.";
      } else if (response.status === 403) {
        errorMessage = "You don't have permission to access these settings.";
      } else if (response.status >= 500) {
        errorMessage = "Backend server error. Please try again in a moment.";
        errorDetails = "The backend server encountered an error while processing your request.";
      } else {
        errorMessage = "Failed to fetch user settings.";
        errorDetails = errorText;
      }
      
      // Try to parse error details from response
      try {
        const errJson = JSON.parse(errorText) as { detail?: string; message?: string; error?: string };
        errorDetails = errJson.detail ?? errJson.message ?? errJson.error ?? errorDetails;
      } catch {
        // Not JSON, use errorText as details
        if (errorText && errorText !== "Unknown error") {
          errorDetails = errorText;
        }
      }
      
      return NextResponse.json(
        { error: errorMessage, ...(errorDetails ? { details: errorDetails } : {}) },
        { status: response.status }
      );
    }

    const data = await response.json() as UserSettings;
    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[user/settings] GET Error fetching settings: %s", msg);
    if (stack) console.error("[user/settings] GET Stack: %s", stack);
    
    // Determine if it's a network error
    const isNetworkError = msg.includes("fetch") || msg.includes("network") || msg.includes("ECONNREFUSED");
    
    return NextResponse.json(
      {
        error: isNetworkError
          ? "Cannot connect to backend server. Please check if the backend is running."
          : "An unexpected error occurred while fetching settings.",
        details: isNetworkError ? `Network error: ${msg}` : undefined,
      },
      { status: isNetworkError ? 503 : 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const token = getTokenFromRequest(request);
    
    if (!token) {
      return NextResponse.json(
        { error: "Authentication required. Please log in again." },
        { status: 401 }
      );
    }

    let body: Partial<UserSettings>;
    try {
      body = await request.json() as Partial<UserSettings>;
    } catch (parseError) {
      return NextResponse.json(
        { error: "Invalid request body. Please check your input." },
        { status: 400 }
      );
    }

    const apiBaseUrl = getServerApiBaseUrl();
    
    let response: Response;
    try {
      response = await fetch(`${apiBaseUrl}/user/settings/`, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        credentials: "include",
      });
    } catch (fetchError) {
      // Network error - backend is not reachable
      const errorMessage = fetchError instanceof Error ? fetchError.message : String(fetchError);
      console.error("[user/settings] PUT Network error connecting to backend:", errorMessage);
      return NextResponse.json(
        {
          error: "Cannot connect to backend server",
          details: `Failed to reach backend at ${apiBaseUrl}. Please check if the backend server is running.`,
        },
        { status: 503 }
      );
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      console.error("[user/settings] PUT Backend error: status=%s url=%s", response.status, `${apiBaseUrl}/user/settings/`);
      console.error("[user/settings] PUT Backend response body: %s", errorText);
      
      let errorMessage = "Failed to save settings";
      let errorDetails: string | undefined;
      
      // Provide specific error messages based on status code
      if (response.status === 401) {
        errorMessage = "Authentication failed. Please log in again.";
      } else if (response.status === 403) {
        errorMessage = "You don't have permission to modify these settings.";
      } else if (response.status === 400) {
        errorMessage = "Invalid settings data. Please check your input.";
        errorDetails = "The settings you're trying to save contain invalid data.";
      } else if (response.status >= 500) {
        errorMessage = "Backend server error. Please try again in a moment.";
        errorDetails = "The backend server encountered an error while saving your settings.";
      } else {
        errorMessage = "Failed to save settings.";
      }
      
      // Try to parse error details from response
      try {
        const errJson = JSON.parse(errorText) as { detail?: string; message?: string; error?: string };
        errorDetails = errJson.detail ?? errJson.message ?? errJson.error ?? errorDetails;
        if (errorDetails) console.error("[user/settings] PUT Backend detail: %s", errorDetails);
      } catch {
        // Not JSON, use errorText as details if available
        if (errorText && errorText !== "Unknown error") {
          errorDetails = errorText;
        }
      }
      
      return NextResponse.json(
        { error: errorMessage, ...(errorDetails ? { details: errorDetails } : {}) },
        { status: response.status }
      );
    }

    const data = await response.json() as UserSettings;
    return NextResponse.json(data);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const stack = error instanceof Error ? error.stack : undefined;
    console.error("[user/settings] PUT Error saving settings: %s", msg);
    if (stack) console.error("[user/settings] PUT Stack: %s", stack);
    
    // Determine if it's a network error
    const isNetworkError = msg.includes("fetch") || msg.includes("network") || msg.includes("ECONNREFUSED");
    
    return NextResponse.json(
      {
        error: isNetworkError
          ? "Cannot connect to backend server. Please check if the backend is running."
          : "An unexpected error occurred while saving settings.",
        details: isNetworkError ? `Network error: ${msg}` : undefined,
      },
      { status: isNetworkError ? 503 : 500 }
    );
  }
}
