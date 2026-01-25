"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { clearAllSessionCache } from "@/lib/storage/sessionCache";

// Simple auth using localStorage tokens

export type AuthProviderType = "google" | "linkedin" | "microsoft";

export type ProviderIdentity = {
  email?: string | null;
  accountId?: string | null;
};

export type AuthUser = {
  id: string;
  email: string;
  name?: string;
  provider: AuthProviderType;
  token: string;
  connections: AuthProviderType[];
  identities: Partial<Record<AuthProviderType, ProviderIdentity>>;
  professionalProfileVerified: boolean;
  password_change_required?: boolean;
};

type RequireIntent =
  | {
    reason?: string;
  }
  | undefined;

type AuthContextValue = {
  user: AuthUser | null;
  token: string | null;
  status: "loading" | "ready";
  openAuth: (intent?: RequireIntent) => void;
  closeAuth: () => void;
  signOut: (callbackUrl?: string) => void;
  signInWithProvider: (provider: AuthProviderType) => Promise<void>;
  requireAuth: (intent?: RequireIntent) => Promise<AuthUser>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // Check for stored JWT token
  // Read token synchronously on initial render to avoid race conditions
  const getStoredToken = useCallback(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("auth_token");
    }
    return null;
  }, []);
  
  const [storedToken, setStoredToken] = useState<string | null>(() => getStoredToken());

  useEffect(() => {
    if (typeof window !== "undefined") {
      // Check localStorage to catch changes from same window
      // (storage event only fires for changes from other windows)
      const checkToken = () => {
        const token = localStorage.getItem("auth_token");
        if (token !== storedToken) {
          setStoredToken(token);
        }
      };
      
      // Check immediately
      checkToken();
      
      // Listen for storage changes from other windows/tabs
      const handleStorageChange = (e: StorageEvent) => {
        if (e.key === "auth_token") {
          setStoredToken(e.newValue);
        }
      };
      
      window.addEventListener("storage", handleStorageChange);
      
      // Listen for custom event that can be dispatched after login
      // This is the primary way to detect same-window token updates
      const handleTokenUpdate = () => {
        const token = localStorage.getItem("auth_token");
        setStoredToken(token);
      };
      
      window.addEventListener("auth-token-updated", handleTokenUpdate);
      
      return () => {
        window.removeEventListener("storage", handleStorageChange);
        window.removeEventListener("auth-token-updated", handleTokenUpdate);
      };
    }
  }, [storedToken]);

  // Create user with stored token
  const authUser: AuthUser | null = useMemo(
    () => {
      if (!storedToken) return null;
      return {
        id: "community-user",
        email: "admin@community.local",
        name: "Community Edition User",
        provider: "google", // Fallback provider
        token: storedToken,
        connections: ["google"],
        identities: {},
        professionalProfileVerified: false,
      };
    },
    [storedToken]
  );

  const authStatus: "loading" | "ready" = "ready";

  const resolversRef = useRef<Array<(user: AuthUser) => void>>([]);
  const rejectorsRef = useRef<Array<(reason?: unknown) => void>>([]);

  const resolvePending = useCallback(
    (user: AuthUser) => {
      resolversRef.current.forEach((resolve) => resolve(user));
      resolversRef.current = [];
      rejectorsRef.current = [];
    },
    [],
  );

  useEffect(() => {
    if (authStatus === "ready" && authUser) {
      resolvePending(authUser);
    }
  }, [authStatus, authUser, resolvePending]);

  const openAuth = useCallback((intent?: RequireIntent) => {
    // Redirect to login page instead of showing modal
    if (typeof window !== "undefined") {
      window.location.href = "/auth/login";
    }
  }, []);

  const closeAuth = useCallback(() => {
    // No-op (no modal to close)
  }, []);

  const signInWithProvider = useCallback(async (provider: AuthProviderType) => {
    // Redirect to login page
    if (typeof window !== "undefined") {
      window.location.href = "/auth/login";
    }
  }, []);

  const signOut = useCallback((callbackUrl?: string) => {
    // Clear all session cache (intake conversations, moderator briefs, etc.) on sign out
    clearAllSessionCache();
    
    // Community Edition: Clear localStorage tokens and redirect to login
    if (typeof window !== "undefined") {
      localStorage.removeItem("auth_token");
      localStorage.removeItem("refresh_token");
      // Clear auth cookie
      document.cookie = "auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
      // Use window.location.href for hard redirect to force full page reload and reset all state
      window.location.href = callbackUrl ?? "/auth/login";
    }
  }, []);

  const requireAuth = useCallback(
    (intent?: RequireIntent) => {
      // Check if user is authenticated
      // Check if authUser exists (from token in localStorage)
      if (authUser) return Promise.resolve(authUser);
      
      // Also check if token exists in localStorage (in case authUser is null during hydration)
      // This prevents redirect loops when token exists but authUser hasn't been set yet
      if (typeof window !== "undefined") {
        const token = localStorage.getItem("auth_token");
        if (token) {
          // Token exists but authUser is null - this can happen during hydration
          // Create a temporary user object from the token to avoid redirect
          const tempUser: AuthUser = {
            id: "community-user",
            email: "admin@community.local",
            name: "Community Edition User",
            provider: "google",
            token: token,
            connections: ["google"],
            identities: {},
            professionalProfileVerified: false,
          };
          return Promise.resolve(tempUser);
        }
      }

      // No token found - redirect to login page
      if (typeof window !== "undefined") {
        window.location.href = "/auth/login";
      }
      return new Promise<AuthUser>(() => { }); // Never resolves as we redirect
    },
    [authUser],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user: authUser,
      token: authUser?.token ?? null,
      status: authStatus,
      openAuth,
      closeAuth,
      signOut,
      signInWithProvider,
      requireAuth,
    }),
    [authStatus, authUser, closeAuth, openAuth, requireAuth, signInWithProvider, signOut],
  );

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
