/**
 * Crucible Community Edition
 * Copyright (C) 2025 Roundtable Labs Pty Ltd
 * 
 * Licensed under AGPL-3.0. See LICENSE file for details.
 */

"use client";

import { useState, useCallback, useRef } from "react";
import { Key, ExternalLink, LogOut, Loader2, CheckCircle2, AlertCircle, ArrowLeft, ChevronRight, XCircle, RefreshCw } from "lucide-react";
import * as Dialog from "@radix-ui/react-dialog";
import { GlassCard } from "@/components/ui/glass-card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/components/providers/AuthProvider";
import { OpenRouterIcon } from "@/components/common/OpenRouterIcon";
import { motion, AnimatePresence } from "framer-motion";
import { apiPut, apiGet } from "@/lib/api/client";
import { useQueryClient } from "@tanstack/react-query";
import { logError, getActionableErrorMessage, isErrorRetryable } from "@/lib/utils/errorHandler";
import { retryWithBackoff } from "@/lib/utils/retry";

interface ApiKeyRequiredModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type ViewType = "main" | "option1" | "option2";

interface UserSettings {
  providerApiKeys?: {
    openrouter?: string;
    openai?: string;
    anthropic?: string;
  };
}

// Animation variants for page transitions
const pageVariants = {
  enter: (direction: number) => ({
    x: direction > 0 ? "100%" : "-100%",
    opacity: 0,
  }),
  center: {
    x: 0,
    opacity: 1,
  },
  exit: (direction: number) => ({
    x: direction < 0 ? "100%" : "-100%",
    opacity: 0,
  }),
};

const pageTransition = {
  type: "tween" as const,
  duration: 0.25,
  ease: "easeInOut" as const,
};

export function ApiKeyRequiredModal({ open, onOpenChange }: ApiKeyRequiredModalProps) {
  const { signOut, token } = useAuth();
  const queryClient = useQueryClient();
  const [currentView, setCurrentView] = useState<ViewType>("main");
  const [direction, setDirection] = useState(0);
  const [openRouterKey, setOpenRouterKey] = useState("");
  const [openAIKey, setOpenAIKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ type: "success" | "error"; text: string; retryable?: boolean } | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  
  // Use ref instead of state for shouldAllowClose to ensure synchronous updates
  const shouldAllowCloseRef = useRef(false);
  
  // Validation states: null = not validated, true = valid, false = invalid, "validating" = in progress
  const [openRouterValid, setOpenRouterValid] = useState<boolean | null | "validating">(null);
  const [openAIValid, setOpenAIValid] = useState<boolean | null | "validating">(null);
  const [anthropicValid, setAnthropicValid] = useState<boolean | null | "validating">(null);

  // Helper to get auth token
  const getAuthToken = useCallback(() => {
    // Try localStorage if token from useAuth is not available
    if (typeof window !== "undefined") {
      return token || localStorage.getItem("auth_token");
    }
    return token;
  }, [token]);

  // Test API key via backend endpoint with timeout
  const testApiKey = useCallback(async (provider: "openrouter" | "openai" | "anthropic", key: string): Promise<{ valid: boolean; error?: string; networkError?: boolean }> => {
    const authToken = getAuthToken();
    const TEST_TIMEOUT_MS = 10000; // 10 seconds
    
    try {
      // Create abort controller for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), TEST_TIMEOUT_MS);

      try {
        const response = await fetch("/api/user/test-api-key", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(authToken ? { "Authorization": `Bearer ${authToken}` } : {}),
          },
          credentials: "include",
          signal: controller.signal,
          body: JSON.stringify({
            provider,
            apiKey: key,
          }),
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const errorMessage = errorData.error || `HTTP ${response.status}`;
          
          // Check if it's a network/backend error
          const isNetworkError = response.status === 0 || response.status >= 500;
          
          return {
            valid: false,
            error: errorMessage,
            networkError: isNetworkError,
          };
        }

        const data = await response.json();
        return {
          valid: data.valid || false,
          error: data.error,
          networkError: false,
        };
      } catch (fetchError) {
        clearTimeout(timeoutId);
        
        // Check if it's a timeout or network error
        if (fetchError instanceof Error && (fetchError.name === "AbortError" || fetchError.message.includes("fetch"))) {
          return {
            valid: false,
            error: "Request timed out. The backend server may be unavailable. You can still save the key without testing.",
            networkError: true,
          };
        }
        
        return {
          valid: false,
          error: fetchError instanceof Error ? fetchError.message : "Failed to test API key",
          networkError: true,
        };
      }
    } catch (error) {
      const actionableError = getActionableErrorMessage(error);
      return {
        valid: false,
        error: actionableError.message,
        networkError: actionableError.retryable,
      };
    }
  }, [getAuthToken]);

  // Test OpenRouter API key
  const testOpenRouterKey = useCallback(async (key: string): Promise<boolean> => {
    const result = await testApiKey("openrouter", key);
    return result.valid;
  }, [testApiKey]);

  // Test OpenAI API key
  const testOpenAIKey = useCallback(async (key: string): Promise<boolean> => {
    const result = await testApiKey("openai", key);
    return result.valid;
  }, [testApiKey]);

  // Test Anthropic API key
  const testAnthropicKey = useCallback(async (key: string): Promise<boolean> => {
    const result = await testApiKey("anthropic", key);
    return result.valid;
  }, [testApiKey]);

  // Manual test handlers
  const handleTestOpenRouter = useCallback(async () => {
    if (!openRouterKey.trim()) {
      setSaveMessage({ type: "error", text: "Please enter an API key first" });
      return;
    }
    if (!openRouterKey.trim().startsWith("sk-or-")) {
      setSaveMessage({ type: "error", text: "Invalid API key format. OpenRouter keys should start with 'sk-or-'" });
      setOpenRouterValid(false);
      return;
    }
    setOpenRouterValid("validating");
    setSaveMessage(null);
    try {
      const result = await testApiKey("openrouter", openRouterKey);
      setOpenRouterValid(result.valid);
      if (!result.valid) {
        const actionableError = getActionableErrorMessage(new Error(result.error || "API key test failed"));
        setSaveMessage({ 
          type: "error", 
          text: result.error || actionableError.message,
          retryable: result.networkError || actionableError.retryable,
        });
      } else {
        setSaveMessage({ type: "success", text: "API key validated successfully!" });
        // Clear success message after 2 seconds
        setTimeout(() => setSaveMessage(null), 2000);
      }
    } catch (error) {
      setOpenRouterValid(false);
      const actionableError = getActionableErrorMessage(error);
      setSaveMessage({ 
        type: "error", 
        text: `Failed to test API key: ${actionableError.message}`,
        retryable: actionableError.retryable,
      });
    }
  }, [openRouterKey, testApiKey]);

  const handleTestOpenAI = useCallback(async () => {
    if (!openAIKey.trim()) {
      setSaveMessage({ type: "error", text: "Please enter an API key first" });
      return;
    }
    if (!openAIKey.trim().startsWith("sk-") || openAIKey.trim().startsWith("sk-or-")) {
      setSaveMessage({ type: "error", text: "Invalid API key format. OpenAI keys should start with 'sk-' (not 'sk-or-')" });
      setOpenAIValid(false);
      return;
    }
    setOpenAIValid("validating");
    setSaveMessage(null);
    try {
      const result = await testApiKey("openai", openAIKey);
      setOpenAIValid(result.valid);
      if (!result.valid) {
        const actionableError = getActionableErrorMessage(new Error(result.error || "API key test failed"));
        setSaveMessage({ 
          type: "error", 
          text: result.error || actionableError.message,
          retryable: result.networkError || actionableError.retryable,
        });
      } else {
        setSaveMessage({ type: "success", text: "API key validated successfully!" });
        // Clear success message after 2 seconds
        setTimeout(() => setSaveMessage(null), 2000);
      }
    } catch (error) {
      setOpenAIValid(false);
      const actionableError = getActionableErrorMessage(error);
      setSaveMessage({ 
        type: "error", 
        text: `Failed to test API key: ${actionableError.message}`,
        retryable: actionableError.retryable,
      });
    }
  }, [openAIKey, testApiKey]);

  const handleTestAnthropic = useCallback(async () => {
    if (!anthropicKey.trim()) {
      setSaveMessage({ type: "error", text: "Please enter an API key first" });
      return;
    }
    if (!anthropicKey.trim().startsWith("sk-ant-")) {
      setSaveMessage({ type: "error", text: "Invalid API key format. Anthropic keys should start with 'sk-ant-'" });
      setAnthropicValid(false);
      return;
    }
    setAnthropicValid("validating");
    setSaveMessage(null);
    try {
      const result = await testApiKey("anthropic", anthropicKey);
      setAnthropicValid(result.valid);
      if (!result.valid) {
        const actionableError = getActionableErrorMessage(new Error(result.error || "API key test failed"));
        setSaveMessage({ 
          type: "error", 
          text: result.error || actionableError.message,
          retryable: result.networkError || actionableError.retryable,
        });
      } else {
        setSaveMessage({ type: "success", text: "API key validated successfully!" });
        // Clear success message after 2 seconds
        setTimeout(() => setSaveMessage(null), 2000);
      }
    } catch (error) {
      setAnthropicValid(false);
      const actionableError = getActionableErrorMessage(error);
      setSaveMessage({ 
        type: "error", 
        text: `Failed to test API key: ${actionableError.message}`,
        retryable: actionableError.retryable,
      });
    }
  }, [anthropicKey, testApiKey]);

  // Reset validation when keys change
  const handleOpenRouterKeyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setOpenRouterKey(e.target.value);
    setOpenRouterValid(null);
  }, []);

  const handleOpenAIKeyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setOpenAIKey(e.target.value);
    setOpenAIValid(null);
  }, []);

  const handleAnthropicKeyChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setAnthropicKey(e.target.value);
    setAnthropicValid(null);
  }, []);

  const navigateTo = (view: ViewType) => {
    setDirection(view === "main" ? -1 : 1);
    setSaveMessage(null);
    setCurrentView(view);
  };

  const handleBack = () => {
    setDirection(-1);
    setSaveMessage(null);
    setOpenRouterKey("");
    setOpenAIKey("");
    setAnthropicKey("");
    setOpenRouterValid(null);
    setOpenAIValid(null);
    setAnthropicValid(null);
    setCurrentView("main");
  };

  const handleSaveOption1 = async () => {
    if (!openRouterKey.trim()) {
      setSaveMessage({ type: "error", text: "Please enter your OpenRouter API key" });
      return;
    }

    // Allow saving even if test failed due to network issues
    // Only require test if it was explicitly invalid (not a network error)
    if (openRouterValid === false && !saveMessage?.retryable) {
      setSaveMessage({ type: "error", text: "Please test your API key connection first." });
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);
    setRetryCount(0);

    // Close modal immediately for instant feedback
    shouldAllowCloseRef.current = true;
    onOpenChange(false);
    
    // Clear input immediately
    const keyToSave = openRouterKey.trim();
    setOpenRouterKey("");

    // Continue save operation in the background
    const saveWithRetry = async (): Promise<void> => {
      const authToken = getAuthToken();
      
      // Get current settings first
      const currentSettings = await apiGet<UserSettings>("/api/user/settings", {
        token: authToken ?? undefined,
      });

      // Update with OpenRouter key
      const updatedKeys = {
        ...(currentSettings.providerApiKeys || {}),
        openrouter: keyToSave,
      };

      await apiPut<UserSettings>("/api/user/settings", {
        body: { providerApiKeys: updatedKeys },
        token: authToken ?? undefined,
        credentials: "include",
      });
    };

    // Perform save in background (don't await - let it complete asynchronously)
    retryWithBackoff(saveWithRetry, {
      maxRetries: 3,
      initialDelayMs: 1000,
      retryableErrors: (error) => {
        return isErrorRetryable(error);
      },
    })
      .then(() => {
        // Success - invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ["userSettings"] });
        console.log("[ApiKeyRequiredModal] API key saved successfully");
      })
      .catch((error) => {
        // Error - log but don't reopen modal (user already closed it)
        logError(error, "Failed to save OpenRouter API key");
        // Invalidate anyway to ensure UI is in sync
        queryClient.invalidateQueries({ queryKey: ["userSettings"] });
      })
      .finally(() => {
        setIsSaving(false);
      });
  };

  const handleSaveOption2 = async () => {
    if (!openAIKey.trim() || !anthropicKey.trim()) {
      setSaveMessage({ type: "error", text: "Please provide both API keys (OpenAI and Anthropic)" });
      return;
    }

    // Allow saving even if test failed due to network issues
    // Only require test if it was explicitly invalid (not a network error)
    const hasNetworkError = saveMessage?.retryable;
    if ((openAIValid !== true || anthropicValid !== true) && !hasNetworkError) {
      if (openAIValid !== true && anthropicValid !== true) {
        setSaveMessage({ type: "error", text: "Both API keys must pass the test before saving." });
      } else if (openAIValid !== true) {
        setSaveMessage({ type: "error", text: "Please test your OpenAI API key connection first." });
      } else {
        setSaveMessage({ type: "error", text: "Please test your Anthropic API key connection first." });
      }
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);
    setRetryCount(0);

    // Close modal immediately for instant feedback
    shouldAllowCloseRef.current = true;
    onOpenChange(false);
    
    // Clear inputs immediately and save values for background save
    const openAIKeyToSave = openAIKey.trim();
    const anthropicKeyToSave = anthropicKey.trim();
    setOpenAIKey("");
    setAnthropicKey("");

    // Continue save operation in the background
    const saveWithRetry = async (): Promise<void> => {
      const authToken = getAuthToken();
      
      // Get current settings first
      const currentSettings = await apiGet<UserSettings>("/api/user/settings", {
        token: authToken ?? undefined,
      });

      // Update with OpenAI and/or Anthropic keys
      const updatedKeys = {
        ...(currentSettings.providerApiKeys || {}),
      };
      
      if (openAIKeyToSave) {
        updatedKeys.openai = openAIKeyToSave;
      }
      
      if (anthropicKeyToSave) {
        updatedKeys.anthropic = anthropicKeyToSave;
      }

      await apiPut<UserSettings>("/api/user/settings", {
        body: { providerApiKeys: updatedKeys },
        token: authToken ?? undefined,
        credentials: "include",
      });
    };

    // Perform save in background (don't await - let it complete asynchronously)
    retryWithBackoff(saveWithRetry, {
      maxRetries: 3,
      initialDelayMs: 1000,
      retryableErrors: (error) => {
        return isErrorRetryable(error);
      },
    })
      .then(() => {
        // Success - invalidate queries to refresh data
        queryClient.invalidateQueries({ queryKey: ["userSettings"] });
        console.log("[ApiKeyRequiredModal] API keys saved successfully");
      })
      .catch((error) => {
        // Error - log but don't reopen modal (user already closed it)
        logError(error, "Failed to save API keys");
        // Invalidate anyway to ensure UI is in sync
        queryClient.invalidateQueries({ queryKey: ["userSettings"] });
      })
      .finally(() => {
        setIsSaving(false);
      });
  };

  const handleSignOut = () => {
    signOut("/auth/login");
  };

  // Prevent closing the modal by clicking outside or pressing ESC
  // But allow closing after successful API key save
  const handleOpenChange = (newOpen: boolean) => {
    if (!newOpen) {
      // Allow closing if we've successfully saved API keys
      if (shouldAllowCloseRef.current) {
        shouldAllowCloseRef.current = false; // Reset flag
        onOpenChange(false);
        return;
      }
      // Modal is mandatory - don't allow closing otherwise
      return;
    }
    onOpenChange(newOpen);
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange} modal={true}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9998] bg-navy-900/90 backdrop-blur-sm" />
        <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4 py-10">
          <Dialog.Content
            className={cn(
              "relative w-full max-w-2xl rounded-2xl border bg-base-panel shadow-soft focus:outline-none overflow-hidden",
              "border-gold-500/30"
            )}
            onOpenAutoFocus={(e) => e.preventDefault()}
            onEscapeKeyDown={(e) => {
              // Prevent closing with ESC key
              e.preventDefault();
            }}
            onInteractOutside={(e) => {
              // Prevent closing by clicking outside
              e.preventDefault();
            }}
          >
            <div className="relative overflow-hidden" style={{ minHeight: "520px" }}>
              <AnimatePresence initial={false} custom={direction} mode="wait">
                {/* Main View */}
                {currentView === "main" && (
                  <motion.div
                    key="main"
                    custom={direction}
                    variants={pageVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={pageTransition}
                    className="p-8"
                  >
                    <GlassCard variant="elevated" className="h-full border-0">
                      {/* Header */}
                      <div className="mb-6">
                        <div className="flex items-center gap-3 mb-4">
                          <div className="p-3 rounded-xl bg-gold-500/10 border border-gold-500/20">
                            <Key className="h-6 w-6 text-gold-400" />
                          </div>
                          <h2 className="text-2xl font-bold text-base-text">
                            API Keys Required
                          </h2>
                        </div>
                        <p className="text-base-subtext text-sm leading-relaxed mb-2">
                          <strong className="text-gold-400">API keys are mandatory</strong> to use Crucible Community Edition. 
                          Without API keys, the application cannot function.
                        </p>
                        <p className="text-base-subtext text-sm leading-relaxed">
                          Please provide at least one API key. You can use:
                        </p>
                      </div>

                      {/* Options as clickable cards */}
                      <div className="space-y-4 mb-6">
                        {/* Option 1: OpenRouter */}
                        <button
                          type="button"
                          onClick={() => navigateTo("option1")}
                          className="w-full p-4 rounded-lg border border-gold-500/20 hover:bg-gold-500/10 hover:border-gold-500/40 transition-all text-left group"
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5">
                              <div className="w-2 h-2 rounded-full bg-gold-400" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-base-text mb-1">
                                  Option 1: OpenRouter (Recommended)
                                </h3>
                                <ChevronRight className="h-5 w-5 text-gold-400 group-hover:translate-x-1 transition-transform" />
                              </div>
                              <p className="text-sm text-base-subtext mb-2">
                                Provides access to all major models (OpenAI, Anthropic, Google, etc.) through a single API key.
                              </p>
                              <a
                                href="https://openrouter.ai/keys"
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-sm text-gold-400 hover:text-gold-300 transition-colors underline"
                              >
                                Get OpenRouter API Key
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          </div>
                        </button>

                        {/* Option 2: OpenAI + Anthropic */}
                        <button
                          type="button"
                          onClick={() => navigateTo("option2")}
                          className="w-full p-4 rounded-lg border border-gold-500/20 hover:bg-gold-500/10 hover:border-gold-500/40 transition-all text-left group"
                        >
                          <div className="flex items-start gap-3">
                            <div className="mt-0.5">
                              <div className="w-2 h-2 rounded-full bg-gold-400" />
                            </div>
                            <div className="flex-1">
                              <div className="flex items-center justify-between">
                                <h3 className="font-semibold text-base-text mb-1">
                                  Option 2: OpenAI + Anthropic
                                </h3>
                                <ChevronRight className="h-5 w-5 text-gold-400 group-hover:translate-x-1 transition-transform" />
                              </div>
                              <p className="text-sm text-base-subtext mb-2">
                                Use native API keys for OpenAI and Anthropic models.
                              </p>
                              <div className="flex flex-wrap gap-2 items-center">
                                <a
                                  href="https://platform.openai.com/account/api-keys"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-sm text-gold-400 hover:text-gold-300 transition-colors underline"
                                >
                                  Get OpenAI Key
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                                <span className="text-base-subtext">•</span>
                                <a
                                  href="https://console.anthropic.com/settings/keys"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 text-sm text-gold-400 hover:text-gold-300 transition-colors underline"
                                >
                                  Get Anthropic Key
                                  <ExternalLink className="h-3 w-3" />
                                </a>
                              </div>
                            </div>
                          </div>
                        </button>
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-3">
                        <button
                          type="button"
                          onClick={handleSignOut}
                          className="w-full px-6 py-3 rounded-lg border border-base-divider hover:bg-base-bg text-base-text transition-colors flex items-center justify-center gap-2"
                        >
                          <LogOut className="h-4 w-4" />
                          Sign Out
                        </button>
                      </div>
                    </GlassCard>
                  </motion.div>
                )}

                {/* Option 1: OpenRouter View */}
                {currentView === "option1" && (
                  <motion.div
                    key="option1"
                    custom={direction}
                    variants={pageVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={pageTransition}
                    className="p-8"
                  >
                    <GlassCard variant="elevated" className="h-full flex flex-col border-0">
                      {/* Header with back button */}
                      <div className="mb-6">
                        <button
                          type="button"
                          onClick={handleBack}
                          disabled={isSaving}
                          className="flex items-center gap-2 text-base-subtext hover:text-base-text transition-colors mb-4 group"
                        >
                          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                          <span className="text-sm">Back to options</span>
                        </button>
                        <div className="flex items-center gap-3">
                          <div className="p-3 rounded-xl bg-gold-500/10 border border-gold-500/20">
                            <OpenRouterIcon className="h-6 w-6 text-gold-400" size={24} />
                          </div>
                          <h2 className="text-2xl font-bold text-base-text">
                            OpenRouter API Key
                          </h2>
                        </div>
                      </div>

                      {/* Form */}
                      <div className="flex-1 space-y-4">
                        <div className="p-4 rounded-lg bg-gold-500/5 border border-gold-500/20">
                          <p className="text-sm text-base-subtext mb-4">
                            Enter your OpenRouter API key. If you don't have one,{" "}
                            <a
                              href="https://openrouter.ai/keys"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gold-400 hover:text-gold-300 underline"
                            >
                              get it here
                            </a>
                            .
                          </p>
                          <div className="space-y-3">
                            <div>
                              <label className="block text-sm font-medium text-base-text mb-2">
                                OpenRouter API Key
                              </label>
                              <div className="flex gap-2">
                                <div className="relative flex-1">
                                  <input
                                    type="text"
                                    value={openRouterKey}
                                    onChange={handleOpenRouterKeyChange}
                                    placeholder="sk-or-v1-..."
                                    className={cn(
                                      "w-full px-4 py-3 pr-10 bg-base-bg border rounded-lg text-base-text focus:outline-none focus:ring-2 transition-all",
                                      openRouterValid === true
                                        ? "border-success-700/50 focus:ring-success-500/50 focus:border-success-500/50"
                                        : openRouterValid === false
                                        ? "border-danger-700/50 focus:ring-danger-500/50 focus:border-danger-500/50"
                                        : "border-base-divider focus:ring-gold-500/50 focus:border-gold-500/50"
                                    )}
                                    disabled={isSaving || openRouterValid === "validating"}
                                    autoFocus
                                  />
                                  {openRouterValid !== null && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                      {openRouterValid === "validating" ? (
                                        <Loader2 className="h-5 w-5 text-base-subtext animate-spin" />
                                      ) : openRouterValid === true ? (
                                        <CheckCircle2 className="h-5 w-5 text-success-700" />
                                      ) : (
                                        <XCircle className="h-5 w-5 text-danger-700" />
                                      )}
                                    </div>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={handleTestOpenRouter}
                                  disabled={!openRouterKey.trim() || isSaving || openRouterValid === "validating"}
                                  className="px-4 py-3 rounded-lg border border-gold-500/30 bg-gold-500/10 hover:bg-gold-500/20 text-gold-400 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                >
                                  {openRouterValid === "validating" ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    "Test"
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Save Message */}
                        <AnimatePresence>
                          {saveMessage && (
                            <motion.div
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              className={cn(
                                "p-3 rounded-lg",
                                saveMessage.type === "success"
                                  ? "bg-success-100/10 border border-success-700/30 text-success-700"
                                  : "bg-danger-100/10 border border-danger-700/30 text-danger-700"
                              )}
                            >
                              <div className="flex items-center gap-2">
                                {saveMessage.type === "success" ? (
                                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                                ) : (
                                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                )}
                                <span className="text-sm flex-1">{saveMessage.text}</span>
                              </div>
                              {saveMessage.type === "error" && saveMessage.retryable && (
                                <div className="mt-2 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={handleSaveOption1}
                                    disabled={isSaving}
                                    className="text-sm px-3 py-1.5 rounded border border-gold-500/30 bg-gold-500/10 hover:bg-gold-500/20 text-gold-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                                  >
                                    <RefreshCw className={cn("h-3.5 w-3.5", isSaving && "animate-spin")} />
                                    Retry
                                  </button>
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-3 pt-6 mt-auto">
                        <button
                          type="button"
                          onClick={handleSaveOption1}
                          disabled={(() => {
                            if (isSaving) return true;
                            if (!openRouterKey.trim()) return true;
                            // Allow saving if network error occurred (test failed but retryable)
                            const hasNetworkError = saveMessage?.retryable;
                            if (hasNetworkError) return false;
                            // Otherwise require valid test
                            return openRouterValid !== true;
                          })()}
                          className="w-full px-6 py-3 rounded-lg bg-gold-500 hover:bg-gold-600 text-navy-900 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {isSaving ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            "Save API Key"
                          )}
                        </button>
                      </div>
                    </GlassCard>
                  </motion.div>
                )}

                {/* Option 2: OpenAI + Anthropic View */}
                {currentView === "option2" && (
                  <motion.div
                    key="option2"
                    custom={direction}
                    variants={pageVariants}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    transition={pageTransition}
                    className="p-8"
                  >
                    <GlassCard variant="elevated" className="h-full flex flex-col border-0">
                      {/* Header with back button */}
                      <div className="mb-6">
                        <button
                          type="button"
                          onClick={handleBack}
                          disabled={isSaving}
                          className="flex items-center gap-2 text-base-subtext hover:text-base-text transition-colors mb-4 group"
                        >
                          <ArrowLeft className="h-4 w-4 group-hover:-translate-x-1 transition-transform" />
                          <span className="text-sm">Back to options</span>
                        </button>
                        <div className="flex items-center gap-3">
                          <div className="p-3 rounded-xl bg-gold-500/10 border border-gold-500/20">
                            <Key className="h-6 w-6 text-gold-400" />
                          </div>
                          <h2 className="text-2xl font-bold text-base-text">
                            OpenAI & Anthropic Keys
                          </h2>
                        </div>
                      </div>

                      {/* Form */}
                      <div className="flex-1 space-y-4">
                        <div className="p-4 rounded-lg bg-base-bg/50 border border-base-divider">
                          <p className="text-sm text-base-subtext mb-4">
                            You need to provide both API keys. Both keys must pass the test before saving. Get your keys from{" "}
                            <a
                              href="https://platform.openai.com/account/api-keys"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gold-400 hover:text-gold-300 underline"
                            >
                              OpenAI
                            </a>
                            {" "}and{" "}
                            <a
                              href="https://console.anthropic.com/settings/keys"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-gold-400 hover:text-gold-300 underline"
                            >
                              Anthropic
                            </a>
                            .
                          </p>
                          <div className="space-y-4">
                            <div>
                              <label className="block text-sm font-medium text-base-text mb-2">
                                OpenAI API Key
                              </label>
                              <div className="flex gap-2">
                                <div className="relative flex-1">
                                  <input
                                    type="text"
                                    value={openAIKey}
                                    onChange={handleOpenAIKeyChange}
                                    placeholder="sk-..."
                                    className={cn(
                                      "w-full px-4 py-3 pr-10 bg-base-bg border rounded-lg text-base-text focus:outline-none focus:ring-2 transition-all",
                                      openAIValid === true
                                        ? "border-success-700/50 focus:ring-success-500/50 focus:border-success-500/50"
                                        : openAIValid === false
                                        ? "border-danger-700/50 focus:ring-danger-500/50 focus:border-danger-500/50"
                                        : "border-base-divider focus:ring-gold-500/50 focus:border-gold-500/50"
                                    )}
                                    disabled={isSaving || openAIValid === "validating"}
                                    autoFocus
                                  />
                                  {openAIValid !== null && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                      {openAIValid === "validating" ? (
                                        <Loader2 className="h-5 w-5 text-base-subtext animate-spin" />
                                      ) : openAIValid === true ? (
                                        <CheckCircle2 className="h-5 w-5 text-success-700" />
                                      ) : (
                                        <XCircle className="h-5 w-5 text-danger-700" />
                                      )}
                                    </div>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={handleTestOpenAI}
                                  disabled={!openAIKey.trim() || isSaving || openAIValid === "validating"}
                                  className="px-4 py-3 rounded-lg border border-gold-500/30 bg-gold-500/10 hover:bg-gold-500/20 text-gold-400 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                >
                                  {openAIValid === "validating" ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    "Test"
                                  )}
                                </button>
                              </div>
                            </div>
                            <div>
                              <label className="block text-sm font-medium text-base-text mb-2">
                                Anthropic API Key
                              </label>
                              <div className="flex gap-2">
                                <div className="relative flex-1">
                                  <input
                                    type="text"
                                    value={anthropicKey}
                                    onChange={handleAnthropicKeyChange}
                                    placeholder="sk-ant-..."
                                    className={cn(
                                      "w-full px-4 py-3 pr-10 bg-base-bg border rounded-lg text-base-text focus:outline-none focus:ring-2 transition-all",
                                      anthropicValid === true
                                        ? "border-success-700/50 focus:ring-success-500/50 focus:border-success-500/50"
                                        : anthropicValid === false
                                        ? "border-danger-700/50 focus:ring-danger-500/50 focus:border-danger-500/50"
                                        : "border-base-divider focus:ring-gold-500/50 focus:border-gold-500/50"
                                    )}
                                    disabled={isSaving || anthropicValid === "validating"}
                                  />
                                  {anthropicValid !== null && (
                                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                                      {anthropicValid === "validating" ? (
                                        <Loader2 className="h-5 w-5 text-base-subtext animate-spin" />
                                      ) : anthropicValid === true ? (
                                        <CheckCircle2 className="h-5 w-5 text-success-700" />
                                      ) : (
                                        <XCircle className="h-5 w-5 text-danger-700" />
                                      )}
                                    </div>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={handleTestAnthropic}
                                  disabled={!anthropicKey.trim() || isSaving || anthropicValid === "validating"}
                                  className="px-4 py-3 rounded-lg border border-gold-500/30 bg-gold-500/10 hover:bg-gold-500/20 text-gold-400 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                >
                                  {anthropicValid === "validating" ? (
                                    <Loader2 className="h-4 w-4 animate-spin" />
                                  ) : (
                                    "Test"
                                  )}
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Save Message */}
                        <AnimatePresence>
                          {saveMessage && (
                            <motion.div
                              initial={{ opacity: 0, y: -10 }}
                              animate={{ opacity: 1, y: 0 }}
                              exit={{ opacity: 0, y: -10 }}
                              className={cn(
                                "p-3 rounded-lg",
                                saveMessage.type === "success"
                                  ? "bg-success-100/10 border border-success-700/30 text-success-700"
                                  : "bg-danger-100/10 border border-danger-700/30 text-danger-700"
                              )}
                            >
                              <div className="flex items-center gap-2">
                                {saveMessage.type === "success" ? (
                                  <CheckCircle2 className="h-4 w-4 flex-shrink-0" />
                                ) : (
                                  <AlertCircle className="h-4 w-4 flex-shrink-0" />
                                )}
                                <span className="text-sm flex-1">{saveMessage.text}</span>
                              </div>
                              {saveMessage.type === "error" && saveMessage.retryable && (
                                <div className="mt-2 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={handleSaveOption2}
                                    disabled={isSaving}
                                    className="text-sm px-3 py-1.5 rounded border border-gold-500/30 bg-gold-500/10 hover:bg-gold-500/20 text-gold-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                                  >
                                    <RefreshCw className={cn("h-3.5 w-3.5", isSaving && "animate-spin")} />
                                    Retry
                                  </button>
                                </div>
                              )}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>

                      {/* Action Buttons */}
                      <div className="flex gap-3 pt-6 mt-auto">
                        <button
                          type="button"
                          onClick={handleSaveOption2}
                          disabled={(() => {
                            const hasOpenAI = !!openAIKey.trim();
                            const hasAnthropic = !!anthropicKey.trim();
                            
                            if (isSaving) return true;
                            // Both keys are required
                            if (!hasOpenAI || !hasAnthropic) return true;
                            // Allow saving if network error occurred (test failed but retryable)
                            const hasNetworkError = saveMessage?.retryable;
                            if (hasNetworkError) return false;
                            // Both keys must be valid otherwise
                            return openAIValid !== true || anthropicValid !== true;
                          })()}
                          className="w-full px-6 py-3 rounded-lg bg-gold-500 hover:bg-gold-600 text-navy-900 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                        >
                          {isSaving ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Saving...
                            </>
                          ) : (
                            "Save API Keys"
                          )}
                        </button>
                      </div>
                    </GlassCard>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
