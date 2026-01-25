import { secureLogger } from "@/lib/utils/secureLogger";

export function getServerApiBaseUrl(): string {
  // In server-side code, use the environment variable
  const apiUrl = process.env.NEXT_PUBLIC_API_URL;
  
  // Check if we're running in Docker (server-side code can use Docker service names)
  // If NEXT_PUBLIC_API_URL points to localhost:8000, replace with Docker service name
  // In Docker, server-side API routes need to use the service name 'api' instead of 'localhost'
  const isDocker = process.env.DOCKER_ENV === "true";
  
  if (!apiUrl) {
    // Only throw at runtime, not during build
    // During build, return a fallback to allow the build to complete
    const isBuildTime = process.env.NEXT_PHASE === "phase-production-build";
    if (isBuildTime) {
      return "https://api.example.com";
    }
    
    // In Docker, use service name; otherwise default to localhost
    if (isDocker) {
      secureLogger.warn(
        "NEXT_PUBLIC_API_URL not set. Defaulting to http://api:8000/api for Docker environment."
      );
      return "http://api:8000/api";
    }
    
    // In development mode, default to localhost API
    const isDevelopment = process.env.NODE_ENV === "development";
    if (isDevelopment) {
      secureLogger.warn(
        "NEXT_PUBLIC_API_URL not set. Defaulting to http://localhost:8000/api for local development."
      );
      return "http://localhost:8000/api";
    }
    
    // In production, throw an error if not set
    throw new Error(
      "NEXT_PUBLIC_API_URL is not set. Please configure it in your environment variables."
    );
  }

  // Remove trailing slash if present
  let url = apiUrl.replace(/\/$/, "");
  
  // In Docker environment, replace localhost:8000 with api:8000 for server-side requests
  // This allows server-side API routes to connect to the API container
  if (isDocker && url.includes("localhost:8000")) {
    url = url.replace("localhost:8000", "api:8000");
  }
  
  // Always force HTTPS for production URLs (not localhost) to prevent mixed content errors
  // Browsers block HTTP requests from HTTPS pages, so we must use HTTPS
  // This also handles cases where NEXT_PUBLIC_API_URL was set to HTTP at build time
  if (url.startsWith("http://") && !url.includes("localhost") && !url.includes("127.0.0.1") && !url.includes("api:8000")) {
    secureLogger.warn("Converting HTTP to HTTPS", url);
    url = url.replace(/^http:\/\//, "https://");
  }
  
  return url;
}
