/**
 * Server-side getAuthToken export.
 * 
 * This is the default export for server components and API routes.
 * Client components should import from "./get-token.client" instead
 * to prevent bundling pg and other server-only dependencies.
 */
export { getAuthToken } from "./get-token.server";
