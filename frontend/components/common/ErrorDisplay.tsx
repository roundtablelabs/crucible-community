"use client";

import { CircleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ActionableError } from "@/lib/utils/errorHandler";
import Link from "next/link";

interface ErrorDisplayProps {
  error: string | ActionableError | null;
  onRetry?: () => Promise<void> | void;
  onDismiss?: () => void;
  variant?: "inline" | "toast";
  retryable?: boolean;
  className?: string;
  showIcon?: boolean;
  maxRetries?: number;
  retryCount?: number;
}

export function ErrorDisplay({
  error,
  onRetry,
  onDismiss,
  variant = "inline",
  retryable: propRetryable,
  className,
  showIcon = true,
  maxRetries = 3,
  retryCount = 0,
}: ErrorDisplayProps) {
  if (!error) {
    return null;
  }

  // Extract message and retryable flag from error
  let errorMessage: string;
  let isRetryable: boolean;

  if (typeof error === "string") {
    errorMessage = error;
    isRetryable = propRetryable ?? true; // Default to retryable if not specified
  } else {
    errorMessage = error.message;
    isRetryable = propRetryable ?? error.retryable;
  }

  const canRetry = isRetryable && onRetry;
  const canDismiss = onDismiss || variant === "toast";

  // Check if this is a rate limit error
  const isRateLimitError = errorMessage.toLowerCase().includes("rate limit") || 
                          errorMessage.toLowerCase().includes("rate limit exceeded");

  if (variant === "toast") {
    return (
      <div
        data-error-display="true"
        data-error-variant="toast"
        className={cn(
          "flex items-start gap-3 rounded-2xl border border-gold-500/40 bg-gold-500/10 p-4 text-xs",
          className
        )}
      >
        {showIcon && (
          <CircleAlert className="h-5 w-5 flex-shrink-0 text-gold-400 mt-0.5" aria-hidden="true" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gold-200">{errorMessage}</p>
          {isRateLimitError && (
            <>
              <p className="text-xs text-gold-300/80 mt-2">
                Your intake has exceeded the rate limit.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Link
                  href="/legal/acceptable-use"
                  className="text-gold-300 underline hover:text-gold-200 transition"
                >
                  View acceptable use policy
                </Link>
                <span className="text-gold-500/60">•</span>
                <a
                  href={`mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL || process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@example.com"}`}
                  className="text-gold-300 underline hover:text-gold-200 transition"
                >
                  Contact support
                </a>
              </div>
            </>
          )}
        </div>
        {canDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="flex-shrink-0 rounded-full p-1 text-gold-300 transition hover:bg-gold-500/20 hover:text-gold-100"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }

  // Inline variant
  return (
    <div
      data-error-display="true"
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-gold-500/40 bg-gold-500/10 p-4 text-xs mt-4",
        className
      )}
    >
      <div className="flex items-start gap-3">
        {showIcon && (
          <CircleAlert className="h-5 w-5 flex-shrink-0 text-gold-400 mt-0.5" aria-hidden="true" />
        )}
        <div className="flex-1">
          <p className="text-sm text-gold-200">{errorMessage}</p>
          {isRateLimitError && (
            <>
              <p className="text-xs text-gold-300/80 mt-2">
                Your intake has exceeded the rate limit.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs">
                <Link
                  href="/legal/acceptable-use"
                  className="text-gold-300 underline hover:text-gold-200 transition"
                >
                  View acceptable use policy
                </Link>
                <span className="text-gold-500/60">•</span>
                <a
                  href={`mailto:${process.env.NEXT_PUBLIC_CONTACT_EMAIL || process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "support@example.com"}`}
                  className="text-gold-300 underline hover:text-gold-200 transition"
                >
                  Contact support
                </a>
              </div>
            </>
          )}
        </div>
        {canDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="flex-shrink-0 rounded-full p-1 text-gold-300 transition hover:bg-gold-500/20 hover:text-gold-100"
            aria-label="Dismiss error"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>
    </div>
  );
}

