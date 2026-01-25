"use client";

import { useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface RetryButtonProps {
  onRetry: () => Promise<void> | void;
  maxRetries?: number;
  retryCount?: number;
  className?: string;
  disabled?: boolean;
  label?: string;
}

export function RetryButton({
  onRetry,
  maxRetries = 3,
  retryCount = 0,
  className,
  disabled = false,
  label = "Retry",
}: RetryButtonProps) {
  const [isRetrying, setIsRetrying] = useState(false);
  const [hasExceededMax, setHasExceededMax] = useState(false);

  const handleRetry = async () => {
    if (retryCount >= maxRetries) {
      setHasExceededMax(true);
      return;
    }

    setIsRetrying(true);
    try {
      await onRetry();
    } catch (error) {
      // Error handling is done by the caller
      console.error("Retry failed:", error);
    } finally {
      setIsRetrying(false);
    }
  };

  if (hasExceededMax || retryCount >= maxRetries) {
    return (
      <div className={cn("text-sm text-base-subtext", className)}>
        Maximum retry attempts reached ({maxRetries})
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={handleRetry}
      disabled={disabled || isRetrying}
      className={cn(
        "inline-flex items-center gap-2 px-4 py-2 rounded-full",
        "border border-gold-500/40 text-gold-200",
        "transition hover:border-gold-400 hover:text-white",
        "disabled:opacity-50 disabled:cursor-not-allowed",
        className
      )}
    >
      {isRetrying ? (
        <>
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Retrying...</span>
        </>
      ) : (
        <>
          <RefreshCw className="h-4 w-4" />
          <span>
            {label} {retryCount > 0 && `(${retryCount}/${maxRetries})`}
          </span>
        </>
      )}
    </button>
  );
}

