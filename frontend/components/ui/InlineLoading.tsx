"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface InlineLoadingProps {
  size?: "sm" | "md" | "lg";
  text?: string;
  className?: string;
  "aria-label"?: string;
  spinnerColor?: string; // Optional custom color for the spinner (e.g., "text-[#071225]", "text-white", "currentColor")
}

const sizeClasses = {
  sm: "h-3 w-3",
  md: "h-4 w-4",
  lg: "h-5 w-5",
};

const textSizeClasses = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

export function InlineLoading({
  size = "md",
  text,
  className,
  "aria-label": ariaLabel,
  spinnerColor,
}: InlineLoadingProps) {
  return (
    <span
      className={cn("inline-flex items-center gap-2", className)}
      aria-label={ariaLabel || (text ? `${text}...` : "Loading...")}
      role="status"
      aria-live="polite"
    >
      <Loader2
        className={cn(
          "animate-spin",
          spinnerColor || "text-gold-500", // Default to gold-500 if no color specified
          sizeClasses[size]
        )}
        aria-hidden="true"
      />
      {text && (
        <span className={cn("text-base-subtext", textSizeClasses[size])}>
          {text}
        </span>
      )}
    </span>
  );
}

