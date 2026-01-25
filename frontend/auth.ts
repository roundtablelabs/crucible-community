import NextAuth, { type NextAuthOptions, getServerSession } from "next-auth";
import type { AdapterUser } from "next-auth/adapters";
import Google from "next-auth/providers/google";
import LinkedIn from "next-auth/providers/linkedin";
import AzureAD from "next-auth/providers/azure-ad";
import { Pool } from "pg";
import type { NextRequest } from "next/server";

import { createRoundtableAuthAdapter } from "@/lib/auth/adapter";

export const runtime = "nodejs";

type AuthProviderSlug = "google" | "linkedin" | "microsoft";

const PROVIDER_MAP: Record<string, AuthProviderSlug> = {
  google: "google",
  linkedin: "linkedin",
  microsoft: "microsoft",
  "azure-ad": "microsoft",
};

declare global {
  // eslint-disable-next-line no-var
  var __rtAuthPool: Pool | undefined;
}

// Check if we're in a build context (during static analysis/build time)
// During build, we want to avoid throwing errors for missing env vars
function isBuildTime(): boolean {
  // Check for Next.js build phase
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return true;
  }
  
  // During build, these are typically not set yet
  // But we can't rely on this alone, so we'll be more permissive
  // and only throw errors when we're definitely at runtime
  return false;
}

// Check if we're at runtime (not during build)
function isRuntime(): boolean {
  // We're at runtime if we're in a request context
  // This is a best-effort check - we'll be conservative and assume runtime
  // unless we're explicitly in a build phase
  return !isBuildTime();
}

// Lazy getter for database URL with build-time safety
function getDatabaseUrl(): string {
  // Return a dummy URL - it won't be used since NextAuth is bypassed
  return "postgresql://dummy:dummy@dummy:5432/dummy";
}

// Lazy getter for auth pool
function getAuthPool(): Pool {
  // Return a dummy pool that won't be used
  // We'll create a minimal pool that won't actually connect
  if (!globalThis.__rtAuthPool) {
    globalThis.__rtAuthPool = new Pool({
      connectionString: "postgresql://dummy:dummy@dummy:5432/dummy",
      max: 0, // No connections
      min: 0,
    });
  }
  return globalThis.__rtAuthPool;
}

function normalizeProvider(provider?: string | null): AuthProviderSlug {
  if (!provider) {
    return "google";
  }
  return PROVIDER_MAP[provider] ?? "google";
}

async function mergeAccounts(pool: Pool, sourceUserId: string, targetUserId: string) {
  // Transfer all accounts from source user to target user
  await pool.query(
    `UPDATE user_accounts 
     SET user_id = $1, last_used_at = NOW()
     WHERE user_id = $2`,
    [targetUserId, sourceUserId]
  );
  
  // Transfer any other user data if needed (sessions, settings, etc.)
  // For now, we'll just transfer accounts as that's the main concern
  
  // Note: We don't delete the source user here as it may have other data
  // The source user account will remain but without any OAuth accounts
}

async function loadProviderIdentities(pool: Pool, userId: string) {
  if (!userId) {
    return {
      connections: [] as AuthProviderSlug[],
      identityMap: {} as Partial<Record<AuthProviderSlug, { email?: string | null; accountId?: string }>>,
      professionalProfileVerified: false,
    };
  }

  const [accountsResult, linkedinResult] = await Promise.all([
    pool.query<{ provider: string; provider_account_id: string; email: string | null }>(
      `
        SELECT provider, provider_account_id, email
        FROM user_accounts
        WHERE user_id = $1
        ORDER BY linked_at DESC
      `,
      [userId],
    ),
    pool.query<{ professional_profile_verified: boolean }>(
      `SELECT professional_profile_verified FROM users WHERE id = $1 LIMIT 1`,
      [userId],
    ),
  ]);

  const identityMap: Partial<Record<AuthProviderSlug, { email?: string | null; accountId?: string }>> = {};
  const seen = new Set<AuthProviderSlug>();
  const connections: AuthProviderSlug[] = [];

  for (const row of accountsResult.rows) {
    const provider = normalizeProvider(row.provider);
    identityMap[provider] = {
      email: row.email ?? undefined,
      accountId: row.provider_account_id,
    };
    if (!seen.has(provider)) {
      seen.add(provider);
      connections.push(provider);
    }
  }

  return {
    connections,
    identityMap,
    professionalProfileVerified: Boolean(linkedinResult.rows[0]?.professional_profile_verified),
  };
}

// Lazy getter for providers
function getProviders(): NextAuthOptions["providers"] {
  const providers: NextAuthOptions["providers"] = [];

  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.push(
      Google({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      }),
    );
  }

  if (process.env.LINKEDIN_CLIENT_ID && process.env.LINKEDIN_CLIENT_SECRET) {
    providers.push(
      LinkedIn({
        clientId: process.env.LINKEDIN_CLIENT_ID,
        clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
        issuer: "https://www.linkedin.com/oauth",
        wellKnown: "https://www.linkedin.com/oauth/.well-known/openid-configuration",
        async profile(profile, tokens) {
          let enrichedProfile: Record<string, unknown> | null = null;
          let emailData: Record<string, unknown> | null = null;
          if (tokens?.access_token) {
            try {
              const [basicResponse, emailResponse] = await Promise.all([
                fetch(
                  "https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName,vanityName,profilePicture(displayImage~digitalmediaAsset:playableStreams))",
                  {
                    headers: {
                      Authorization: `Bearer ${tokens.access_token}`,
                    },
                  },
                ),
                fetch(
                  "https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))",
                  {
                    headers: {
                      Authorization: `Bearer ${tokens.access_token}`,
                    },
                  },
                ),
              ]);
              if (basicResponse.ok) {
                enrichedProfile = await basicResponse.json();
              }
              if (emailResponse.ok) {
                emailData = await emailResponse.json();
              }
            } catch (error) {
              if (process.env.NODE_ENV === "development") {
                console.warn("[LinkedIn] Unable to enrich profile", error);
              }
            }
          }

          const resolvedProfile = enrichedProfile ?? profile ?? {};
          const firstName =
            (resolvedProfile as { localizedFirstName?: string }).localizedFirstName ??
            (profile as { given_name?: string }).given_name ??
            "";
          const lastName =
            (resolvedProfile as { localizedLastName?: string }).localizedLastName ??
            (profile as { family_name?: string }).family_name ??
            "";
          const identifier =
            (resolvedProfile as { id?: string }).id ??
            (profile as { sub?: string }).sub ??
            (profile as { id?: string }).id ??
            (profile as { email?: string }).email ??
            (profile as { email_verified?: string }).email_verified ??
            "linkedin-user";

          const picture =
            ((resolvedProfile as { profilePicture?: Record<string, any> }).profilePicture as Record<string, any> | undefined)?.[
              "displayImage~"
            ]?.elements?.[0]?.identifiers?.[0]?.identifier;
          const email =
            (emailData as Record<string, any> | undefined)?.elements?.[0]?.["handle~"]?.emailAddress ??
            (profile as { email?: string }).email ??
            undefined;
          const vanityName =
            (resolvedProfile as { vanityName?: string | null | undefined }).vanityName ??
            (profile as { vanityName?: string | null | undefined }).vanityName;
          return {
            id: identifier,
            name: [firstName, lastName].filter(Boolean).join(" ") || "LinkedIn User",
            email,
            image: picture,
          };
        },
      }),
    );
  }

  if (process.env.MICROSOFT_CLIENT_ID && process.env.MICROSOFT_CLIENT_SECRET && process.env.MICROSOFT_TENANT_ID) {
    providers.push(
      AzureAD({
        clientId: process.env.MICROSOFT_CLIENT_ID,
        clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
        tenantId: process.env.MICROSOFT_TENANT_ID,
      }),
    );
  }

  return providers;
}

// Lazy getter for NextAuth secret
function getNextAuthSecret(): string {
  // Return a dummy secret - it won't be used since NextAuth is bypassed
  return "community-edition-dummy-secret";
}

// Lazy getter for auth options
let _authOptions: NextAuthOptions | null = null;

function getAuthOptions(): NextAuthOptions {
  if (!_authOptions) {
    const pool = getAuthPool();
    const adapter = createRoundtableAuthAdapter(pool);
    const providers = getProviders();
    const secret = getNextAuthSecret();

    // Allow NextAuth to work from any subdomain (crucible, marketplace, main domain)
    // This is safe because all subdomains point to the same deployment
    // trustHost is configured via AUTH_TRUST_HOST environment variable
    // NextAuth v4 reads AUTH_TRUST_HOST=true to enable multi-subdomain support
    _authOptions = {
      secret,
      adapter,
      // debug: process.env.NODE_ENV === "development", // Enable debug mode in development
      debug: false,
      session: {
        strategy: "jwt",
      },
      providers,
      pages: {
        error: "/auth/error",
        signIn: "/auth/signin",
      },
      callbacks: {
        async jwt({ token, account, user }) {
          try {
            if (account?.provider) {
              token.provider = normalizeProvider(account.provider);
            }
            // JWT callback is called in multiple scenarios:
            // 1. Initial sign-in: has user and account - set token.sub and load provider identities
            // 2. Token refresh: user and account are undefined - preserve existing token data
            // 3. Session check: user and account are undefined - preserve existing token data
            
            // Only update token.sub and load provider identities on initial sign-in (when user is provided)
            if (user?.id && account) {
              // Account merging: Check if account exists with different user but same email
              // This handles edge cases where NextAuth might create separate users
              if (user.email && adapter && "getUserByEmail" in adapter && "getUserByAccount" in adapter) {
                try {
                  const existingUserByEmail = await (adapter.getUserByEmail as (email: string) => Promise<AdapterUser | null>)(user.email);
                  const existingUserByAccount = await (adapter.getUserByAccount as (params: { provider: string; providerAccountId: string }) => Promise<AdapterUser | null>)({
                    provider: account.provider,
                    providerAccountId: account.providerAccountId,
                  });
                  
                  // If we have an existing user by email that's different from current user
                  // and the account is linked to a different user, merge them
                  if (existingUserByEmail && existingUserByEmail.id !== user.id) {
                    if (existingUserByAccount && existingUserByAccount.id !== existingUserByEmail.id) {
                      // Account is linked to different user than email user - merge accounts
                      await mergeAccounts(pool, existingUserByAccount.id, existingUserByEmail.id);
                      user.id = existingUserByEmail.id;
                    } else if (!existingUserByAccount) {
                      // Account not linked yet, but email user exists - use email user
                      user.id = existingUserByEmail.id;
                    }
                  }
                } catch (error) {
                  if (process.env.NODE_ENV === "development") {
                    console.error("[NextAuth] JWT callback: Error during account merge check:", error);
                  }
                  // Continue with current user if merge fails
                }
              }
              
              // Auto-verify email since OAuth providers (Google/LinkedIn/Microsoft) already verify emails
              if (user.email && adapter && "updateUser" in adapter) {
                const userWithEmailVerified = user as AdapterUser;
                if (!userWithEmailVerified.emailVerified) {
                  try {
                    await (adapter.updateUser as (user: Partial<AdapterUser> & { id: string }) => Promise<AdapterUser>)({ 
                      id: user.id, 
                      emailVerified: new Date() 
                    });
                    userWithEmailVerified.emailVerified = new Date();
                  } catch (error) {
                    if (process.env.NODE_ENV === "development") {
                      console.error("[NextAuth] JWT callback: Failed to auto-verify email:", error);
                    }
                  }
                }
              }
              
              // Update email in user_accounts if it changed (handle stale email data)
              if (account && user.email) {
                try {
                  await pool.query(
                    `UPDATE user_accounts 
                     SET email = $1, last_used_at = NOW()
                     WHERE provider = $2 AND provider_account_id = $3`,
                    [user.email, account.provider, account.providerAccountId]
                  );
                } catch (error) {
                  if (process.env.NODE_ENV === "development") {
                    console.error("[NextAuth] JWT callback: Failed to update email in user_accounts:", error);
                  }
                  // Non-critical, continue
                }
              }
              
              // Validate it's a UUID format (database IDs are UUIDs)
              const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
              if (uuidRegex.test(user.id)) {
                token.sub = user.id;
              } else {
                if (process.env.NODE_ENV === "development") {
                  console.error("[NextAuth] JWT callback: user.id is not a UUID:", user.id, "This should not happen - adapter should return database UUID");
                }
                // Still set it, but log the error
                token.sub = user.id;
              }
              // Also capture email for potential recovery scenarios
              if (user.email) {
                token.email = user.email;
              }
              
              // Load and cache provider identities in token to avoid DB queries on every session check
              // This significantly reduces database load and improves performance
              try {
                const enrichment = await loadProviderIdentities(pool, user.id);
                token.connections = enrichment.connections;
                token.identities = enrichment.identityMap;
                token.professionalProfileVerified = enrichment.professionalProfileVerified;
                token.identitiesCachedAt = Math.floor(Date.now() / 1000); // Unix timestamp
              } catch (error) {
                if (process.env.NODE_ENV === "development") {
                  console.error("[NextAuth] JWT callback: Failed to load provider identities:", error);
                }
                // Set defaults if loading fails
                token.connections = [];
                token.identities = {};
                token.professionalProfileVerified = false;
              }
            } else if (user?.id && !account) {
              // User provided but no account (shouldn't happen in normal flow, but handle gracefully)
              const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
              if (uuidRegex.test(user.id)) {
                token.sub = user.id;
              } else {
                token.sub = user.id;
              }
              if (user.email) {
                token.email = user.email;
              }
            } else if (user && !user.id) {
              // User object exists but no ID - this is an error
              if (process.env.NODE_ENV === "development") {
                console.error("[NextAuth] JWT callback: user object exists but user.id is missing", { user });
              }
            } else if (!user && !account) {
              // This is a token refresh or session check - user and account are undefined (normal)
              // We should preserve existing token.sub and cached identities
              if (!token.sub) {
                // This is a problem - token.sub is missing during refresh
                // This usually means the initial sign-in didn't set token.sub properly
                // Try to recover using email lookup (this persists the fix to the token)
                const tokenEmail = token.email as string | undefined;
                if (tokenEmail) {
                  try {
                    if (process.env.NODE_ENV === "development") {
                      console.warn("[NextAuth] JWT callback: token.sub missing, attempting recovery via email lookup", {
                        email: tokenEmail,
                      });
                    }
                    const recoveryPool = getAuthPool();
                    const recoveryAdapter = createRoundtableAuthAdapter(recoveryPool);
                    const userByEmail = recoveryAdapter.getUserByEmail 
                      ? await recoveryAdapter.getUserByEmail(tokenEmail)
                      : null;
                    if (userByEmail?.id) {
                      token.sub = userByEmail.id;
                    } else {
                      if (process.env.NODE_ENV === "development") {
                        console.error("[NextAuth] JWT callback: Email lookup failed - user not found", {
                          email: tokenEmail,
                        });
                      }
                    }
                  } catch (error) {
                    if (process.env.NODE_ENV === "development") {
                      console.error("[NextAuth] JWT callback: Error during email lookup recovery:", error);
                    }
                  }
                } else {
                  if (process.env.NODE_ENV === "development") {
                    console.error("[NextAuth] JWT callback: user.id not available and no email for recovery", { 
                    user: undefined, 
                    account: undefined,
                    tokenSub: token.sub,
                    tokenEmail: token.email,
                      tokenKeys: Object.keys(token),
                      hasProvider: !!token.provider,
                    });
                  }
                }
              }
              
              // Refresh cached identities if they're older than 1 hour (3600 seconds)
              const identitiesCachedAt = (token.identitiesCachedAt as number) || 0;
              const now = Math.floor(Date.now() / 1000);
              const cacheAge = now - identitiesCachedAt;
              const CACHE_TTL_SECONDS = 3600; // 1 hour
              
              if (cacheAge > CACHE_TTL_SECONDS && token.sub) {
                // Cache expired, refresh from database
                try {
                  const enrichment = await loadProviderIdentities(pool, token.sub as string);
                  token.connections = enrichment.connections;
                  token.identities = enrichment.identityMap;
                  token.professionalProfileVerified = enrichment.professionalProfileVerified;
                  token.identitiesCachedAt = now;
                } catch (error) {
                  if (process.env.NODE_ENV === "development") {
                    console.error("[NextAuth] JWT callback: Failed to refresh provider identities:", error);
                  }
                  // Keep existing cached values if refresh fails
                }
              }
              // else: Normal refresh scenario - token.sub exists and cache is still valid, preserve everything
            }
          } catch (error) {
            if (process.env.NODE_ENV === "development") {
              console.error("[NextAuth] JWT callback error:", error);
            }
            throw error;
          }
          return token;
        },
        async session({ session, token }) {
          try {
            if (!session.user) {
              return session;
            }

            // Get user ID from token.sub (set during JWT callback on sign-in)
            // If token.sub doesn't exist, this means the JWT callback didn't run properly during sign-in
            let userId = (token.sub as string) ?? session.user.id ?? "";
            
            // Recovery fallback: If token.sub is still missing (JWT callback recovery failed),
            // try one more time using session.user.email
            // Note: This only fixes the current session; the JWT callback is the proper place
            // for recovery since changes there persist to the token
            if (!userId && session.user.email) {
              try {
                if (process.env.NODE_ENV === "development") {
                  console.warn("[NextAuth] Session callback: token.sub still missing after JWT callback, attempting fallback recovery", {
                    email: session.user.email,
                  });
                }
                const recoveryPool = getAuthPool();
                const recoveryAdapter = createRoundtableAuthAdapter(recoveryPool);
                const userByEmail = recoveryAdapter.getUserByEmail 
                  ? await recoveryAdapter.getUserByEmail(session.user.email)
                  : null;
                if (userByEmail?.id) {
                  userId = userByEmail.id;
                } else {
                  if (process.env.NODE_ENV === "development") {
                    console.error("[NextAuth] Session callback: Email lookup failed - user not found", {
                      email: session.user.email,
                    });
                  }
                }
              } catch (error) {
                if (process.env.NODE_ENV === "development") {
                  console.error("[NextAuth] Session callback: Error during email lookup recovery:", error);
                }
              }
            }
            
            // Ensure we always have a valid user ID (must be UUID from database)
            if (!userId) {
              if (process.env.NODE_ENV === "development") {
                console.error("[NextAuth] Session callback: No user ID found in token.sub and recovery failed", { 
                tokenSub: token.sub, 
                sessionUserId: session.user.id,
                sessionUserEmail: session.user.email,
                tokenKeys: Object.keys(token),
                  tokenProvider: token.provider,
                });
              }
              // Return session without token - this will cause auth to fail, which is correct
              // This usually means the JWT callback didn't set token.sub during initial sign-in
              return session;
            }
            
            // Validate it's a UUID format
            const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
            if (!uuidRegex.test(userId)) {
              if (process.env.NODE_ENV === "development") {
                console.error("[NextAuth] Session callback: userId is not a UUID format:", userId, {
                  tokenSub: token.sub,
                  sessionUserId: session.user.id,
                });
              }
              // Still set it, but this will likely cause 401 errors from backend
              // Backend will mark user as guest (is_guest=True) and _require_member_user will reject
            }
            
            session.user.id = userId;
            
            // Try to get JWT token from cache (set during token exchange in getAuthToken)
            // Import token cache to check for cached JWT
            let jwtToken: string | undefined;
            try {
              const { getCachedJWTToken } = await import("@/lib/auth/token-cache");
              jwtToken = getCachedJWTToken(userId) || undefined;
            } catch (error) {
              // If import fails, continue without cached token
              if (process.env.NODE_ENV === "development") {
                console.warn("[NextAuth] Session callback: Failed to import token cache:", error);
              }
            }
            
            // Store JWT token if available, otherwise use userId (will be exchanged on first API call)
            session.user.token = jwtToken || userId;
            
            session.user.provider = normalizeProvider(
              (token.provider as string | undefined) ?? session.user.provider ?? "google",
            );

            // Use cached provider identities from token instead of querying database every time
            // This significantly reduces database load and improves performance
            // The JWT callback handles loading and refreshing the cache
            const cachedConnections = (token.connections as AuthProviderSlug[] | undefined) ?? [];
            const cachedIdentities = (token.identities as Partial<Record<AuthProviderSlug, { email?: string | null; accountId?: string }>> | undefined) ?? {};
            const cachedProfessionalProfileVerified = (token.professionalProfileVerified as boolean | undefined) ?? false;

            session.user.connections = cachedConnections;
            session.user.identities = cachedIdentities;
            session.user.professionalProfileVerified = cachedProfessionalProfileVerified;
          } catch (error) {
            if (process.env.NODE_ENV === "development") {
              console.error("[NextAuth] Session callback error:", error);
            }
            // Return session even if enrichment fails to prevent auth errors
          }

          return session;
        },
      },
    };
  }
  
  // TypeScript assertion: _authOptions is guaranteed to be non-null here
  // because we initialize it in the if block above
  return _authOptions as NextAuthOptions;
}

// Export authOptions - using lazy initialization
// The getAuthOptions() function is build-safe and will return dummy values during build
// Real initialization happens at runtime when actually needed
let _cachedAuthOptions: NextAuthOptions | null = null;

function getCachedAuthOptions(): NextAuthOptions {
  if (!_cachedAuthOptions) {
    _cachedAuthOptions = getAuthOptions();
  }
  return _cachedAuthOptions;
}

// Export as a getter to ensure it's only accessed when needed
// However, for TypeScript compatibility, we'll export it as a constant
// that's initialized lazily on first module access
// This is safe because getAuthOptions() is build-safe
export const authOptions: NextAuthOptions = (() => {
  // Only initialize if we're not in build phase
  // During build, we'll initialize with dummy values to allow the build to complete
  return getAuthOptions();
})();

// Create NextAuth handler - NextAuth v4 handles App Router requests automatically
const handler = NextAuth(getAuthOptions());

// Export handlers for App Router
// Next.js 16: params is now a Promise, so we need to await it
export async function GET(
  req: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> }
) {
  const params = await context.params;
  return handler(req, { params });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ nextauth: string[] }> }
) {
  const params = await context.params;
  return handler(req, { params });
}

// Lazy auth function
export const auth = () => getServerSession(getAuthOptions());

// Export getAuthPool for use in API routes
export { getAuthPool };

