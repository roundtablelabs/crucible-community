/**
 * Crucible Community Edition
 * Copyright (C) 2025 Roundtable Labs Pty Ltd
 * 
 * Licensed under AGPL-3.0. See LICENSE file for details.
 */

"use client";

import { useState, useEffect, type FormEvent, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock, User, AlertTriangle, CheckCircle2, Wifi, WifiOff } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { apiPost, getApiBaseUrl, getApiErrorInfo } from "@/lib/api/client";
import { GlassCard } from "@/components/ui/glass-card";
import { logError, getActionableErrorMessage } from "@/lib/utils/errorHandler";
import { useAuth } from "@/components/providers/AuthProvider";
import { cn } from "@/lib/utils";

type LoginResponse = {
  access_token: string;
  refresh_token: string;
  token_type: string;
};

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isCheckingConnection, setIsCheckingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<"checking" | "online" | "offline" | null>(null);
  
  // Check for warning from license decline
  const licenseWarning = searchParams.get("warning") === "license_required";

  // Check backend connection on mount
  useEffect(() => {
    const checkBackendConnection = async () => {
      setIsCheckingConnection(true);
      setConnectionStatus("checking");
      
      try {
        const apiBaseUrl = getApiBaseUrl();
        // Try to ping health endpoint or just check if we can reach the base URL
        const healthUrl = apiBaseUrl.replace(/\/api$/, "") + "/health";
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout
        
        try {
          const response = await fetch(healthUrl, {
            method: "GET",
            signal: controller.signal,
            cache: "no-store",
          });
          clearTimeout(timeoutId);
          
          if (response.ok || response.status === 404) {
            // 404 is OK - means server is reachable, just no health endpoint
            setConnectionStatus("online");
          } else {
            setConnectionStatus("offline");
          }
        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError instanceof Error && fetchError.name === "AbortError") {
            setConnectionStatus("offline");
          } else {
            // Try to determine if it's CORS or network error
            const isCorsError = fetchError instanceof TypeError && 
              (fetchError.message.includes("CORS") || fetchError.message.includes("Failed to fetch"));
            setConnectionStatus(isCorsError ? "offline" : "offline");
          }
        }
      } catch (error) {
        setConnectionStatus("offline");
      } finally {
        setIsCheckingConnection(false);
      }
    };

    // Check connection after a short delay
    const timeoutId = setTimeout(checkBackendConnection, 500);
    return () => clearTimeout(timeoutId);
  }, []);

  // Redirect to app if already authenticated (but not if we just logged in and showing success)
  useEffect(() => {
    if (user && !isSuccess) {
      router.replace("/app");
    }
  }, [user, router, isSuccess]);

  // Don't render login form if already authenticated (will redirect)
  // But allow success message to show even if user is set
  if (user && !isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy-900 via-navy-800 to-navy-900">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-gold-500 mx-auto mb-4" />
          <p className="text-base-text">Redirecting...</p>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await apiPost<LoginResponse>("/auth/login", {
        body: {
          username,
          password,
        },
      });

      // Store tokens in localStorage
      localStorage.setItem("auth_token", response.access_token);
      localStorage.setItem("refresh_token", response.refresh_token);
      
      // Dispatch custom event to notify AuthProvider of token update
      // (storage event only fires for changes from other windows)
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("auth-token-updated"));
      }
      
      // Also set cookie for middleware authentication check
      document.cookie = `auth_token=${response.access_token}; path=/; max-age=${60 * 60 * 24 * 7}`; // 7 days

      // Show success animation before redirecting
      setIsSuccess(true);
      setIsLoading(false);
      setConnectionStatus("online");
      
      // Wait for animation to complete, then redirect
      // Use replace to avoid adding to history stack
      setTimeout(() => {
        router.replace("/app");
      }, 1500); // 1.5 seconds for animation
    } catch (err) {
      logError(err, "Login failed");
      const errorInfo = getApiErrorInfo(err);
      const actionableError = getActionableErrorMessage(err);
      
      // Determine specific error type
      let errorMessage = actionableError.message;
      
      // Check for CORS errors
      if (err instanceof TypeError && err.message.includes("Failed to fetch")) {
        const apiBaseUrl = getApiBaseUrl();
        errorMessage = `Cannot connect to backend server at ${apiBaseUrl}. This may be a CORS configuration issue. Please check:\n\n1. Backend server is running\n2. CORS is configured to allow requests from this origin\n3. NEXT_PUBLIC_API_URL is set correctly`;
      } else if (errorInfo.status === 401) {
        // Authentication error - likely wrong password
        errorMessage = "Invalid username or password. Please check your credentials and try again.";
      } else if (errorInfo.status === 0 || errorInfo.status === undefined) {
        // Network error
        errorMessage = `Cannot connect to backend server. Please check:\n\n1. Backend server is running\n2. NEXT_PUBLIC_API_URL is configured correctly\n3. Your network connection is working`;
      } else if (errorInfo.status >= 500) {
        // Server error
        errorMessage = "Backend server error. Please try again in a moment.";
      }
      
      setError(errorMessage);
      setConnectionStatus("offline");
    } finally {
      setIsLoading(false);
    }
  };

  // Show success animation overlay
  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy-900 via-navy-800 to-navy-900 p-4">
        <motion.div
          className="text-center"
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
        >
          <div className="mb-6 flex justify-center">
            <div className="relative">
              <motion.div
                className="absolute inset-0 bg-gold-500/20 rounded-full"
                animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
                transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
              />
              <motion.div
                className="relative bg-gold-500/10 rounded-full p-4 border-2 border-gold-500/50"
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
              >
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ duration: 0.5, ease: "backOut", delay: 0.2 }}
                >
                  <CheckCircle2 className="h-12 w-12 text-gold-500" />
                </motion.div>
              </motion.div>
            </div>
          </div>
          <motion.h2
            className="text-2xl font-bold text-white mb-2"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.3 }}
          >
            Welcome back!
          </motion.h2>
          <motion.p
            className="text-base-text-secondary"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.4 }}
          >
            Redirecting to your workspace...
          </motion.p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy-900 via-navy-800 to-navy-900 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">
            Crucible Community Edition
          </h1>
          <p className="text-base-text-secondary">
            Sign in to continue
          </p>
        </div>

        <motion.div
          initial={{ opacity: 1, scale: 1 }}
          animate={{ opacity: isSuccess ? 0 : 1, scale: isSuccess ? 0.95 : 1 }}
          transition={{ duration: 0.3 }}
        >
          <GlassCard className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Connection Status Indicator */}
            {connectionStatus && (
              <div className={cn(
                "p-2 rounded-lg flex items-center gap-2 text-xs mb-2",
                connectionStatus === "online" 
                  ? "bg-success-100/10 border border-success-700/30 text-success-700"
                  : connectionStatus === "offline"
                  ? "bg-danger-100/10 border border-danger-700/30 text-danger-700"
                  : "bg-base-bg border border-base-divider text-base-subtext"
              )}>
                {connectionStatus === "checking" ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    <span>Checking connection...</span>
                  </>
                ) : connectionStatus === "online" ? (
                  <>
                    <Wifi className="h-3.5 w-3.5" />
                    <span>Backend server is reachable</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="h-3.5 w-3.5" />
                    <span>Cannot reach backend server</span>
                  </>
                )}
              </div>
            )}
            
            {licenseWarning && (
              <div className="p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 mb-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="font-semibold mb-1">License Agreement Required</p>
                    <p className="text-sm text-yellow-300/90">
                      You must accept the license agreement to use this software. Please log in again and accept the terms when prompted.
                    </p>
                  </div>
                </div>
              </div>
            )}
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm whitespace-pre-line">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-base-text mb-2">
                Username
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-base-text-secondary" />
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="admin@community.local"
                  required
                  className="w-full pl-10 pr-4 py-2 bg-base-bg border border-base-divider rounded-lg text-base-text focus:outline-none focus:ring-2 focus:ring-gold-500/50"
                  disabled={isLoading}
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-base-text mb-2">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-base-text-secondary" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  className="w-full pl-10 pr-4 py-2 bg-base-bg border border-base-divider rounded-lg text-base-text focus:outline-none focus:ring-2 focus:ring-gold-500/50"
                  disabled={isLoading}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full px-6 py-2 bg-gold-500 hover:bg-gold-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </button>
          </form>

          <div className="mt-6 pt-6 border-t border-base-divider">
            <p className="text-xs text-base-text-secondary text-center">
              Default username: admin@community.local
              <br />
              Password is set in the <code className="text-yellow-400">ROUNDTABLE_COMMUNITY_AUTH_PASSWORD</code> environment variable
              <br />
              <span className="text-yellow-400">
                ⚠️ Please change the default password in production!
              </span>
            </p>
          </div>
        </GlassCard>
        </motion.div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy-900 via-navy-800 to-navy-900">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-gold-500 mx-auto mb-4" />
          <p className="text-base-text">Loading...</p>
        </div>
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}
