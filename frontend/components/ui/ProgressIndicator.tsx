"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface ProgressIndicatorProps {
  progress: number; // 0-100
  label?: string;
  estimatedTime?: number; // seconds remaining
  showPercentage?: boolean;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "h-1",
  md: "h-1.5",
  lg: "h-2",
};

export function ProgressIndicator({
  progress,
  label,
  estimatedTime,
  showPercentage = true,
  className,
  size = "md",
}: ProgressIndicatorProps) {
  const formatTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}s`;
    }
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return secs > 0 ? `${mins}m ${secs}s` : `${mins}m`;
  };

  const clampedProgress = Math.max(0, Math.min(100, progress));

  return (
    <div className={cn("w-full", className)}>
      {label && (
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-base-text">{label}</span>
          {showPercentage && (
            <span className="text-xs text-base-subtext">
              {Math.round(clampedProgress)}%
            </span>
          )}
        </div>
      )}
      <div
        className={cn(
          "overflow-hidden rounded-full bg-gold-500/20",
          sizeClasses[size]
        )}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${clampedProgress}%` }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className={cn(
            "h-full bg-gradient-to-r from-gold-500 to-gold-600",
            sizeClasses[size]
          )}
        />
      </div>
      {(estimatedTime !== undefined || (showPercentage && !label)) && (
        <div className="mt-2 flex items-center justify-between text-xs text-base-subtext">
          {!label && showPercentage && (
            <span>{Math.round(clampedProgress)}%</span>
          )}
          {estimatedTime !== undefined && estimatedTime > 0 && (
            <span className={cn(label ? "ml-auto" : "")}>
              ~{formatTime(estimatedTime)} remaining
            </span>
          )}
        </div>
      )}
    </div>
  );
}

