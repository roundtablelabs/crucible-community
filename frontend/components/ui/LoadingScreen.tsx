"use client";

import { motion } from "framer-motion";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

interface LoadingScreenProps {
  title?: string;
  subtitle?: string;
  progress?: number; // 0-100
  showProgress?: boolean;
  estimatedTime?: number; // seconds remaining
  currentStep?: string; // e.g., "Step 2 of 5"
  variant?: "full-screen" | "modal" | "inline";
  actionButton?: {
    label: string;
    onClick: () => void;
    showAfterSeconds?: number;
  };
}

export function LoadingScreen({
  title = "Loading...",
  subtitle,
  progress,
  showProgress = false,
  estimatedTime,
  currentStep,
  variant = "full-screen",
  actionButton,
}: LoadingScreenProps) {
  const [showActionButton, setShowActionButton] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(
    estimatedTime ?? null
  );

  useEffect(() => {
    setMounted(true);
    // Lock body scroll when loading screen is visible (only for full-screen variant)
    if (variant === "full-screen") {
      document.body.style.overflow = "hidden";
    }
    return () => {
      if (variant === "full-screen") {
        document.body.style.overflow = "";
      }
    };
  }, [variant]);

  // Update time remaining if estimatedTime is provided
  useEffect(() => {
    if (estimatedTime === undefined) {
      return;
    }
    setTimeRemaining(estimatedTime);
    const interval = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 0) {
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [estimatedTime]);

  const formatTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  useEffect(() => {
    if (actionButton?.showAfterSeconds) {
      const timer = setTimeout(() => {
        setShowActionButton(true);
      }, actionButton.showAfterSeconds * 1000);
      return () => clearTimeout(timer);
    }
  }, [actionButton]);

  const isFullScreen = variant === "full-screen";
  const isModal = variant === "modal";
  const isInline = variant === "inline";

  const content = (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        "flex flex-col items-center justify-center px-4",
        isFullScreen &&
          "fixed inset-0 z-[9999] bg-[rgba(6,24,35,0.98)] backdrop-blur-md",
        isModal &&
          "fixed inset-0 z-[9999] bg-black/70 backdrop-blur-sm",
        isInline && "relative"
      )}
      style={
        isFullScreen || isModal
          ? {
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: "100vw",
              height: "100vh",
            }
          : undefined
      }
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className={cn(
          "flex flex-col items-center text-center",
          isFullScreen || isModal ? "max-w-md" : "w-full"
        )}
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
          className={cn(isFullScreen || isModal ? "mb-6" : "mb-4")}
        >
          <Loader2
            className={cn(
              "text-gold-500",
              isFullScreen || isModal ? "h-12 w-12" : "h-6 w-6"
            )}
            aria-hidden="true"
          />
        </motion.div>

        <motion.h2
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className={cn(
            "font-semibold text-white",
            isFullScreen || isModal ? "text-xl" : "text-base"
          )}
        >
          {title}
        </motion.h2>

        {subtitle && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className={cn(
              "text-base-subtext",
              isFullScreen || isModal ? "mt-2 text-sm" : "mt-1 text-xs"
            )}
          >
            {subtitle}
          </motion.p>
        )}

        {currentStep && (
          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.25 }}
            className={cn(
              "mt-2 text-xs font-medium uppercase tracking-[0.2em] text-gold-500/70",
              isInline && "mt-1"
            )}
          >
            {currentStep}
          </motion.p>
        )}

        {showProgress && progress !== undefined && (
          <motion.div
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: "100%" }}
            transition={{ delay: 0.3 }}
            className={cn(
              "w-full",
              isFullScreen || isModal ? "mt-6 max-w-xs" : "mt-4"
            )}
          >
            <div className="h-1 overflow-hidden rounded-full bg-gold-500/20">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${progress}%` }}
                transition={{ duration: 0.3 }}
                className="h-full bg-gradient-to-r from-gold-500 to-gold-600"
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-base-subtext">
              <span>{progress}%</span>
              {timeRemaining !== null && timeRemaining > 0 && (
                <span>~{formatTime(timeRemaining)} remaining</span>
              )}
            </div>
          </motion.div>
        )}

        {actionButton && showActionButton && (
          <motion.button
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            onClick={actionButton.onClick}
            className={cn(
              "rounded-full border border-gold-500/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-gold-200 transition hover:border-gold-400 hover:text-white",
              isFullScreen || isModal ? "mt-6" : "mt-4"
            )}
          >
            {actionButton.label}
          </motion.button>
        )}
      </motion.div>
    </motion.div>
  );

  // Use portal to render outside of any transformed ancestors (only for full-screen and modal variants)
  if (!mounted) {
    return null;
  }

  if (isFullScreen || isModal) {
    return createPortal(content, document.body);
  }

  // For inline variant, render directly
  return content;
}

