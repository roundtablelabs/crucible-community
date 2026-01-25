/**
 * Crucible Community Edition
 * Copyright (C) 2025 Roundtable Labs Pty Ltd
 * 
 * Licensed under AGPL-3.0. See LICENSE file for details.
 */

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { X, FileText, CheckCircle, ChevronDown, ChevronUp, AlertCircle } from "lucide-react";
import { apiGet, apiPost } from "@/lib/api/client";
import { logError } from "@/lib/utils/errorHandler";
import { useAuth } from "@/components/providers/AuthProvider";
import { useQueryClient } from "@tanstack/react-query";

type LicenseInfo = {
  version: string;
  content: string;
  notice: string | null;
};

type LicenseStatus = {
  accepted: boolean;
  version: string | null;
  accepted_at: string | null;
  current_version: string;
  needs_acceptance: boolean;
};

export function LicenseAgreementModal() {
  const { token } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [licenseInfo, setLicenseInfo] = useState<LicenseInfo | null>(null);
  const [isAccepting, setIsAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFullNotice, setShowFullNotice] = useState(false);
  const [showFullLicense, setShowFullLicense] = useState(false);

  useEffect(() => {
    // Check license status on mount and whenever token changes
    // In community edition, this works with or without a token
    let retryTimer: NodeJS.Timeout | null = null;
    
    const checkLicenseStatus = async () => {
      try {
        // Try with token if available, otherwise without
        // In community edition, backend will check default admin user if no token
        const status = await apiGet<LicenseStatus>("/license/status", token ? { token } : {});
        console.log("[LicenseModal] License status:", status);
        if (status.needs_acceptance) {
          // Fetch license content (no token needed for /license/current)
          const info = await apiGet<LicenseInfo>("/license/current");
          console.log("[LicenseModal] License needs acceptance, showing modal");
          setLicenseInfo(info);
          setOpen(true);
        } else {
          console.log("[LicenseModal] License already accepted, not showing modal");
        }
      } catch (err) {
        console.error("[LicenseModal] Error checking license status:", err);
        logError(err, "Failed to check license status");
        // In community edition, retry after a short delay if token becomes available
        // This handles the case where the modal mounts before token is set
        if (!token) {
          // Wait a bit and retry if token becomes available
          retryTimer = setTimeout(() => {
            const currentToken = localStorage.getItem("auth_token");
            if (currentToken) {
              console.log("[LicenseModal] Retrying license check with token");
              checkLicenseStatus();
            }
          }, 1000);
        }
      }
    };

    // Always check on mount, even without token
    checkLicenseStatus();
    
    return () => {
      if (retryTimer) {
        clearTimeout(retryTimer);
      }
    };
  }, [token]);

  const handleAccept = async () => {
    if (!licenseInfo) return;

    setIsAccepting(true);
    setError(null);

    try {
      // In Community Edition, token is optional - endpoint will use default admin user
      await apiPost("/license/accept", {
        ...(token ? { token } : {}), // Only include token if available
        body: {
          version: licenseInfo.version,
        },
      });
      setOpen(false);
      
      // Invalidate queries to refresh auth state
      queryClient.invalidateQueries();
      
      // Don't reload the page - just close the modal
      // The useEffect will automatically re-check license status and won't show modal again
      // since license is now accepted. This avoids redirect loops.
    } catch (err) {
      logError(err, "Failed to accept license");
      const errorMessage = err instanceof Error ? err.message : "Failed to accept license. Please try again.";
      
      // If it's an authentication error, suggest logging in first
      if (errorMessage.includes("Authentication required") || errorMessage.includes("log in")) {
        setError("Please log in first, then accept the license agreement.");
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsAccepting(false);
    }
  };

  const handleDecline = () => {
    // User declined - clear auth and redirect to login with warning
    // Clear authentication tokens
    localStorage.removeItem("auth_token");
    localStorage.removeItem("refresh_token");
    
    // Clear auth cookie
    document.cookie = "auth_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    
    // Redirect to login with warning message
    router.push("/auth/login?warning=license_required");
  };

  if (!open || !licenseInfo) {
    return null;
  }

  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => {
      // Prevent closing the modal without accepting (user must accept to continue)
      if (!isOpen) {
        // Only allow closing if user explicitly declines
        return;
      }
      setOpen(isOpen);
    }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9998] bg-navy-900/90 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[9999] w-full max-w-4xl max-h-[90vh] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-base-bg border border-base-divider shadow-2xl flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-base-divider">
            <div className="flex items-center gap-3">
              <FileText className="h-6 w-6 text-gold-400" />
              <div>
                <Dialog.Title className="text-2xl font-bold text-base-text">
                  License Agreement
                </Dialog.Title>
                <p className="text-sm text-base-text-secondary">
                  Version {licenseInfo.version}
                </p>
              </div>
            </div>
            {/* Remove close button - user must accept or decline */}
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {error && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* Concise summary */}
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 rounded-lg bg-gold-500/10 border border-gold-500/30">
                <AlertCircle className="h-5 w-5 text-gold-400 mt-0.5 flex-shrink-0" />
                <div className="flex-1 space-y-2">
                  <h3 className="font-semibold text-gold-400">Key Points</h3>
                  <ul className="text-sm text-base-text-secondary space-y-2">
                    <li className="flex gap-2">
                      <span className="text-gold-400">•</span>
                      <span><strong>Open Source:</strong> Licensed under AGPL-3.0</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-gold-400">•</span>
                      <span><strong>Bring Your Own Key:</strong> You provide and pay for your own API keys (OpenRouter, OpenAI, etc.)</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-gold-400">•</span>
                      <span><strong>No Warranty:</strong> Provided "AS IS" without commercial support or guarantees</span>
                    </li>
                    <li className="flex gap-2">
                      <span className="text-gold-400">•</span>
                      <span><strong>Your Responsibility:</strong> All API costs, terms compliance, and usage limits are yours</span>
                    </li>
                  </ul>
                </div>
              </div>

              {/* Expandable full notice */}
              {licenseInfo.notice && (
                <div className="rounded-lg border border-base-divider bg-base-bg-secondary">
                  <button
                    type="button"
                    onClick={() => setShowFullNotice(!showFullNotice)}
                    className="w-full flex items-center justify-between p-4 text-left hover:bg-base-bg/50 transition-colors"
                  >
                    <span className="text-sm font-medium text-base-text">View Full Notice & Disclaimers</span>
                    {showFullNotice ? (
                      <ChevronUp className="h-4 w-4 text-base-text-secondary" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-base-text-secondary" />
                    )}
                  </button>
                  {showFullNotice && (
                    <div className="px-4 pb-4 border-t border-base-divider">
                      <pre className="text-xs text-base-text-secondary whitespace-pre-wrap font-sans mt-4">
                        {licenseInfo.notice}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* Expandable full license */}
              <div className="rounded-lg border border-base-divider bg-base-bg-secondary">
                <button
                  type="button"
                  onClick={() => setShowFullLicense(!showFullLicense)}
                  className="w-full flex items-center justify-between p-4 text-left hover:bg-base-bg/50 transition-colors"
                >
                  <span className="text-sm font-medium text-base-text">View Full AGPL-3.0 License Text</span>
                  {showFullLicense ? (
                    <ChevronUp className="h-4 w-4 text-base-text-secondary" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-base-text-secondary" />
                  )}
                </button>
                {showFullLicense && (
                  <div className="px-4 pb-4 border-t border-base-divider">
                    <pre className="text-xs text-base-text-secondary whitespace-pre-wrap font-mono bg-base-bg p-4 rounded-lg overflow-x-auto mt-4">
                      {licenseInfo.content}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="p-6 border-t border-base-divider flex items-center justify-between gap-4">
            <p className="text-sm text-base-text-secondary flex-1">
              By clicking "I Accept", you agree to the terms of the AGPL-3.0 license.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleDecline}
                disabled={isAccepting}
                className="px-4 py-2 text-sm text-base-text-secondary hover:text-base-text border border-base-divider hover:border-base-text-secondary rounded-lg transition-colors disabled:opacity-50"
              >
                I Do Not Accept
              </button>
              <button
                type="button"
                onClick={handleAccept}
                disabled={isAccepting}
                className="px-6 py-2 text-sm bg-gold-500 hover:bg-gold-600 text-white rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isAccepting ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    Accepting...
                  </>
                ) : (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    I Accept
                  </>
                )}
              </button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
