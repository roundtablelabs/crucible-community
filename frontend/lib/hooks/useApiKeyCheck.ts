/**
 * Crucible Community Edition
 * Copyright (C) 2025 Roundtable Labs Pty Ltd
 * 
 * Licensed under AGPL-3.0. See LICENSE file for details.
 */

"use client";

import { useEffect, useState, useRef } from "react";
import { useAuth } from "@/components/providers/AuthProvider";
import { apiGet, getApiErrorInfo } from "@/lib/api/client";
import { useQueryClient } from "@tanstack/react-query";
import { getActionableErrorMessage } from "@/lib/utils/errorHandler";
import { retryWithBackoff } from "@/lib/utils/retry";

interface ApiKeyCheckResponse {
  hasApiKeys: boolean;
  hasOpenAI: boolean;
  hasAnthropic: boolean;
  hasOpenRouter: boolean;
  availableProviders: string[];
}

/**
 * Hook to check if user has API keys configured and show modal if needed.
 * 
 * This hook:
 * - Checks API key status after user logs in
 * - Shows modal if no required API keys are found
 * - Only checks once per session (unless user explicitly dismisses)
 */
export function useApiKeyCheck() {
  const { user, token } = useAuth();
  const queryClient = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [hasApiKeys, setHasApiKeys] = useState<boolean | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [backendAvailable, setBackendAvailable] = useState<boolean | null>(null);
  const hasCheckedRef = useRef(false);
  const checkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const licensePollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Helper to get auth token
  const getAuthToken = () => {
    // Try localStorage if token from useAuth is not available
    if (typeof window !== "undefined") {
      return token || localStorage.getItem("auth_token");
    }
    return token;
  };

  useEffect(() => {
    // Only check for authenticated users
    if (!user || !getAuthToken()) {
      return;
    }

    // Don't check if already checked or in progress
    // Note: dismissedRef is no longer used since modal is mandatory
    if (hasCheckedRef.current || isChecking) {
      return;
    }

    // Check API keys with retry logic
    const checkApiKeys = async () => {
      setIsChecking(true);
      hasCheckedRef.current = true;

      const performCheck = async (): Promise<ApiKeyCheckResponse> => {
        const authToken = getAuthToken();
        
        return await apiGet<ApiKeyCheckResponse>("/api/user/settings/check-api-keys", {
          token: authToken ?? undefined,
        });
      };

      try {
        // Retry with exponential backoff for transient failures
        const response = await retryWithBackoff(performCheck, {
          maxRetries: 2,
          initialDelayMs: 1000,
          retryableErrors: (error) => {
            const errorInfo = getApiErrorInfo(error);
            return errorInfo.retryable;
          },
        });

        setHasApiKeys(response.hasApiKeys);
        setBackendAvailable(true);

        // Show modal if no API keys found
        if (!response.hasApiKeys) {
          // Small delay to ensure UI is ready
          setTimeout(() => {
            setShowModal(true);
          }, 500);
        }
      } catch (error) {
        // Log error for debugging
        console.error("[useApiKeyCheck] Failed to check API keys:", error);
        if (error instanceof Error) {
          console.error("[useApiKeyCheck] Error message:", error.message);
          console.error("[useApiKeyCheck] Error stack:", error.stack);
        }
        
        // Determine if backend is available based on error type
        const errorInfo = getApiErrorInfo(error);
        const actionableError = getActionableErrorMessage(error);
        
        // Check if it's a network/backend error
        const isNetworkError = errorInfo.retryable || 
          actionableError.message.toLowerCase().includes("network") ||
          actionableError.message.toLowerCase().includes("connect") ||
          actionableError.message.toLowerCase().includes("unavailable");
        
        setBackendAvailable(!isNetworkError);
        
        // On error, assume no API keys and show modal (fail open)
        // This ensures users can still configure API keys even if backend check fails
        setTimeout(() => {
          setShowModal(true);
        }, 500);
      } finally {
        setIsChecking(false);
      }
    };

    // Check license status first - only proceed with API key check if license is accepted
    const checkLicenseAndApiKeys = async () => {
      const authToken = getAuthToken();
      
      try {
        // First, check if license needs acceptance
        interface LicenseStatus {
          needs_acceptance: boolean;
        }
        
        const licenseStatus = await apiGet<LicenseStatus>("/license/status", {
          token: authToken ?? undefined,
        });
        
        // If license needs acceptance, wait and check again later
        // The LicenseAgreementModal will handle showing the license modal
        if (licenseStatus.needs_acceptance) {
          // Clear any existing poll interval
          if (licensePollIntervalRef.current) {
            clearInterval(licensePollIntervalRef.current);
          }
          
          // Set up polling to check when license is accepted
          // Note: License modal reloads page after acceptance, so this will naturally stop
          licensePollIntervalRef.current = setInterval(async () => {
            try {
              const currentLicenseStatus = await apiGet<LicenseStatus>("/license/status", {
                token: authToken ?? undefined,
              });
              
              if (!currentLicenseStatus.needs_acceptance) {
                if (licensePollIntervalRef.current) {
                  clearInterval(licensePollIntervalRef.current);
                  licensePollIntervalRef.current = null;
                }
                hasCheckedRef.current = false; // Reset so we can check API keys
                await checkApiKeys();
              }
            } catch (error) {
              console.error("[useApiKeyCheck] Error polling license status:", error);
            }
          }, 2000); // Check every 2 seconds
          return;
        }
        
        // License is accepted, proceed with API key check
        await checkApiKeys();
      } catch (error) {
        console.error("[useApiKeyCheck] Error checking license status:", error);
        // If license check fails, still proceed with API key check (fail open)
        // This handles cases where license endpoint might not be available
        await checkApiKeys();
      }
    };

    // Small delay to avoid race conditions with user creation/login
    const timeoutId = setTimeout(() => {
      void checkLicenseAndApiKeys();
    }, 1500);

    return () => {
      clearTimeout(timeoutId);
      if (licensePollIntervalRef.current) {
        clearInterval(licensePollIntervalRef.current);
        licensePollIntervalRef.current = null;
      }
    };
  }, [user, token]);

  // Re-check API keys when userSettings query is invalidated (e.g., after saving keys)
  useEffect(() => {
    if (!showModal || !user || !getAuthToken()) return;

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      // When userSettings is invalidated, check API keys after a short delay
      if (event?.query?.queryKey?.[0] === "userSettings" && event.type === "updated") {
        // Clear any existing timeout
        if (checkTimeoutRef.current) {
          clearTimeout(checkTimeoutRef.current);
        }
        
        // Check after a short delay to allow the save to complete
        checkTimeoutRef.current = setTimeout(async () => {
          try {
            const authToken = getAuthToken();
            
            const performCheck = async (): Promise<ApiKeyCheckResponse> => {
              return await apiGet<ApiKeyCheckResponse>("/api/user/settings/check-api-keys", {
                token: authToken ?? undefined,
              });
            };

            // Retry with exponential backoff for transient failures
            const response = await retryWithBackoff(performCheck, {
              maxRetries: 2,
              initialDelayMs: 1000,
              retryableErrors: (error) => {
                const errorInfo = getApiErrorInfo(error);
                return errorInfo.retryable;
              },
            });

            if (response.hasApiKeys) {
              setShowModal(false);
              setHasApiKeys(true);
              setBackendAvailable(true);
              hasCheckedRef.current = true; // Mark as checked
            }
          } catch (error) {
            // Log but don't show error to user (they're already in the modal)
            console.error("[useApiKeyCheck] Error checking API keys:", error);
            const errorInfo = getApiErrorInfo(error);
            setBackendAvailable(!errorInfo.retryable);
          }
        }, 1000); // 1 second delay after query update
      }
    });

    // Fallback: Still check periodically but much less frequently (every 30 seconds)
    const fallbackInterval = setInterval(async () => {
      try {
        const authToken = getAuthToken();
        
        const performCheck = async (): Promise<ApiKeyCheckResponse> => {
          return await apiGet<ApiKeyCheckResponse>("/api/user/settings/check-api-keys", {
            token: authToken ?? undefined,
          });
        };

        // Retry with exponential backoff for transient failures
        const response = await retryWithBackoff(performCheck, {
          maxRetries: 1,
          initialDelayMs: 1000,
          retryableErrors: (error) => {
            const errorInfo = getApiErrorInfo(error);
            return errorInfo.retryable;
          },
        });

        if (response.hasApiKeys) {
          setShowModal(false);
          setHasApiKeys(true);
          setBackendAvailable(true);
          hasCheckedRef.current = true;
        }
      } catch (error) {
        console.error("[useApiKeyCheck] Error checking API keys:", error);
        const errorInfo = getApiErrorInfo(error);
        setBackendAvailable(!errorInfo.retryable);
      }
    }, 30000); // Check every 30 seconds as fallback

    return () => {
      unsubscribe();
      clearInterval(fallbackInterval);
      if (checkTimeoutRef.current) {
        clearTimeout(checkTimeoutRef.current);
      }
    };
  }, [showModal, user, token, queryClient]);

  const handleDismiss = () => {
    // Only allow dismissing if API keys are present
    if (hasApiKeys) {
      setShowModal(false);
    }
  };

  const handleModalClose = (open: boolean) => {
    // Allow closing when onOpenChange(false) is called from the modal
    // The modal itself guards against unwanted closes (via shouldAllowCloseRef)
    // This ensures the modal closes immediately after saving API keys
    if (!open) {
      setShowModal(false);
    } else {
      setShowModal(true);
    }
  };

  // Reset check when user changes (e.g., new login)
  useEffect(() => {
    if (user) {
      // Reset on new user session
      const userId = typeof user === "object" ? user.id : user;
      if (userId) {
        // Only reset if it's a different user
        const lastUserId = sessionStorage.getItem("last_api_check_user");
        if (lastUserId !== userId) {
          hasCheckedRef.current = false;
          sessionStorage.setItem("last_api_check_user", userId);
        }
      }
    }
  }, [user]);

  return {
    showModal,
    hasApiKeys,
    isChecking,
    backendAvailable,
    onDismiss: handleDismiss,
    onModalChange: handleModalClose,
  };
}
