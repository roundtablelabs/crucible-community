"use client";

import { ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { CommandPalette } from "@/components/ui/command-palette";
import { ErrorBoundary } from "@/components/common/ErrorBoundary";
import { FloatingHelpButton } from "@/components/help/FloatingHelpButton";
import { PasswordChangeModal } from "@/components/auth/PasswordChangeModal";
import { LicenseAgreementModal } from "@/components/license/LicenseAgreementModal";
import { ApiKeyRequiredModal } from "@/components/api-keys/ApiKeyRequiredModal";
import { useApiKeyCheck } from "@/lib/hooks/useApiKeyCheck";
import { validateCommunityEditionConfig, getConfigErrorMessage, getConfigWarningMessage } from "@/lib/config/validate";
import type { Metadata } from "next";

// Note: Metadata cannot be exported from client components
// The root layout metadata will be used, but we ensure icons are accessible
export default function AppLayout({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { showModal, onModalChange } = useApiKeyCheck();
  
  // Check authentication BEFORE any rendering for Community Edition
  // This prevents the app from flashing before redirect
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(() => {
    // Server-side: return null to show loading (client will handle auth check)
    if (typeof window === "undefined") {
      return null;
    }
    
    // Client-side: check auth token synchronously
    const token = localStorage.getItem("auth_token");
    return token !== null;
  });

  // Validate configuration on mount (client-side only)
  useEffect(() => {
    if (typeof window !== "undefined") {
      const validation = validateCommunityEditionConfig();
      
      // Show errors in console (and potentially in UI for production)
      if (!validation.valid) {
        const errorMessage = getConfigErrorMessage(validation);
        console.error("[App Layout] Configuration errors:", errorMessage);
        
        // In production, we might want to show a banner or modal
        // For now, just log to console
        if (process.env.NODE_ENV === "production") {
          console.error(
            "⚠️ Configuration errors detected. The application may not work correctly. " +
            "Please check your environment variables."
          );
        }
      }
      
      // Show warnings in console
      if (validation.warnings.length > 0) {
        const warningMessage = getConfigWarningMessage(validation);
        console.warn("[App Layout] Configuration warnings:", warningMessage);
      }
    }
  }, []);

  // Check authentication and redirect if needed
  // This useEffect handles navigation, but the initial check is synchronous (above)
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    
    const token = localStorage.getItem("auth_token");
    if (!token) {
      // No token found - redirect to login page immediately
      // This runs after the synchronous check, so it won't cause a flash
      router.replace("/auth/login");
      return;
    }
    
    // Token exists - ensure authenticated state is set
    if (isAuthenticated === false || isAuthenticated === null) {
      setIsAuthenticated(true);
    }
  }, [router, isAuthenticated]);

  // Show loading only on initial mount (server-side render or first client render)
  if (isAuthenticated === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy-900 via-navy-800 to-navy-900">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-gold-500 mx-auto mb-4" />
          <p className="text-base-text">Loading...</p>
        </div>
      </div>
    );
  }

  // If not authenticated, don't render content (will redirect)
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-navy-900 via-navy-800 to-navy-900">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-gold-500 mx-auto mb-4" />
          <p className="text-base-text">Redirecting to login...</p>
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <AppShell key="app-shell">
        <motion.main
          key="app-main"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
        >
          {children}
        </motion.main>
      </AppShell>
      <CommandPalette />
      <FloatingHelpButton />
      <PasswordChangeModal />
      <LicenseAgreementModal />
      <ApiKeyRequiredModal open={showModal} onOpenChange={onModalChange} />
    </ErrorBoundary>
  );
}
