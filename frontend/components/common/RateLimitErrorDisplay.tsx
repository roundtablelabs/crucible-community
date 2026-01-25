"use client";

import { CircleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

interface RateLimitErrorDisplayProps {
  error: string;
  limit: number;
  remaining: number;
  resetAt: number; // Unix timestamp
  retryAfter: number; // Seconds
  onDismiss?: () => void;
  onRetry?: () => Promise<void> | void;
  className?: string;
}

export function RateLimitErrorDisplay({
  error,
  limit,
  remaining,
  resetAt,
  retryAfter,
  onDismiss,
  onRetry,
  className,
}: RateLimitErrorDisplayProps) {
  // Calculate time until reset
  const now = Date.now();
  const resetTime = resetAt * 1000;
  const timeUntilReset = Math.max(0, resetTime - now);
  const hoursUntilReset = Math.floor(timeUntilReset / (1000 * 60 * 60));
  const minutesUntilReset = Math.floor((timeUntilReset % (1000 * 60 * 60)) / (1000 * 60));
  
  // Format reset time
  const resetDate = new Date(resetTime);
  const resetTimeString = resetDate.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  
  // Determine the reason for the rate limit
  const getReason = () => {
    const errorLower = error.toLowerCase();
    if (errorLower.includes("moderator") || errorLower.includes("brief")) {
      return "moderator brief generation";
    }
    if (errorLower.includes("intake") || errorLower.includes("question")) {
      return "intake questions";
    }
    if (errorLower.includes("upload") || errorLower.includes("document")) {
      return "document upload";
    }
    return "this action";
  };

  const reason = getReason();

  return (
    <div
      data-error-display="true"
      data-rate-limit-error="true"
      className={cn(
        "flex flex-col gap-3 rounded-2xl border border-gold-500/40 bg-gold-500/10 p-4 text-xs",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <CircleAlert className="h-5 w-5 flex-shrink-0 text-gold-400 mt-0.5" aria-hidden="true" />
        <div className="flex-1">
          <p className="text-sm font-semibold text-gold-200 mb-1">
            Rate limit exceeded for {reason}
          </p>
          <p className="text-xs text-gold-300/80 mb-2">
            You've reached the limit of {limit} request{limit !== 1 ? "s" : ""} per hour.
          </p>
          <p className="text-xs text-gold-300/80">
            {timeUntilReset > 0 ? (
              <>
                You can try again at {resetTimeString} 
                {hoursUntilReset > 0 && ` (in ${hoursUntilReset} hour${hoursUntilReset !== 1 ? "s" : ""}${minutesUntilReset > 0 ? ` and ${minutesUntilReset} minute${minutesUntilReset !== 1 ? "s" : ""}` : ""})`}
                {hoursUntilReset === 0 && minutesUntilReset > 0 && ` (in ${minutesUntilReset} minute${minutesUntilReset !== 1 ? "s" : ""})`}
              </>
            ) : (
              "You can try again now."
            )}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
            {onRetry && timeUntilReset === 0 && (
              <>
                <button
                  type="button"
                  onClick={onRetry}
                  className="rounded-md bg-gold-500/20 px-3 py-1.5 text-gold-200 transition hover:bg-gold-500/30 hover:text-gold-100"
                >
                  Retry
                </button>
                <span className="text-gold-500/60">•</span>
              </>
            )}
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
        </div>
        {onDismiss && (
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

