"use client";

import { useEffect, useState } from "react";
import { Loader2, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface PdfGenerationOverlayProps {
  isOpen: boolean;
  elapsedSeconds: number;
  estimatedTotalSeconds?: number;
}

export function PdfGenerationOverlay({
  isOpen,
  elapsedSeconds,
  estimatedTotalSeconds = 300, // 5 minutes default
}: PdfGenerationOverlayProps) {
  const [progress, setProgress] = useState(0);

  // Lock body scroll when overlay is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setProgress(0);
      return;
    }

    // Update progress based on elapsed time
    const progressPercent = Math.min((elapsedSeconds / estimatedTotalSeconds) * 100, 95); // Cap at 95% until complete
    setProgress(progressPercent);

    // Update every second
    const interval = setInterval(() => {
      const newProgress = Math.min((elapsedSeconds / estimatedTotalSeconds) * 100, 95);
      setProgress(newProgress);
    }, 1000);

    return () => clearInterval(interval);
  }, [isOpen, elapsedSeconds, estimatedTotalSeconds]);

  if (!isOpen) return null;

  const remainingSeconds = Math.max(0, estimatedTotalSeconds - elapsedSeconds);
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = Math.floor(remainingSeconds % 60);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-base-bg/95 backdrop-blur-sm">
      <div className="w-full max-w-md px-6">
        <div className="rounded-2xl border border-gold-500/30 bg-base-panel p-8 shadow-2xl">
          {/* Icon and Title */}
          <div className="flex flex-col items-center text-center mb-6">
            <div className="relative mb-4">
              <div className="absolute inset-0 rounded-full bg-gold-500/20 blur-xl" />
              <div className="relative rounded-full border-2 border-gold-500/50 bg-gold-500/10 p-4">
                <FileText className="h-8 w-8 text-gold-400" />
              </div>
            </div>
            <h3 className="text-xl font-semibold text-base-text mb-2">Generating PDF</h3>
            <p className="text-sm text-base-subtext">
              Creating your executive brief... This may take a few minutes.
            </p>
          </div>

          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex items-center justify-between text-xs text-base-subtext mb-2">
              <span>Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-2 w-full rounded-full bg-base-divider/60 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-gold-500 to-gold-400 transition-all duration-1000 ease-out rounded-full"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* Time Remaining */}
          <div className="flex items-center justify-center gap-2 text-sm text-base-subtext mb-6">
            <Loader2 className="h-4 w-4 animate-spin text-gold-400" />
            <span>
              Estimated time remaining:{" "}
              <span className="font-semibold text-base-text">
                {minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`}
              </span>
            </span>
          </div>

          {/* Steps Indicator */}
          <div className="space-y-2 text-xs text-base-subtext">
            <div className={cn(
              "flex items-center gap-2",
              elapsedSeconds > 10 && "text-gold-400"
            )}>
              <div className={cn(
                "h-1.5 w-1.5 rounded-full",
                elapsedSeconds > 10 ? "bg-gold-400" : "bg-base-divider"
              )} />
              <span>Reading session data...</span>
            </div>
            <div className={cn(
              "flex items-center gap-2",
              elapsedSeconds > 60 && "text-gold-400"
            )}>
              <div className={cn(
                "h-1.5 w-1.5 rounded-full",
                elapsedSeconds > 60 ? "bg-gold-400" : "bg-base-divider"
              )} />
              <span>Generating structured brief...</span>
            </div>
            <div className={cn(
              "flex items-center gap-2",
              elapsedSeconds > 120 && "text-gold-400"
            )}>
              <div className={cn(
                "h-1.5 w-1.5 rounded-full",
                elapsedSeconds > 120 ? "bg-gold-400" : "bg-base-divider"
              )} />
              <span>Rendering HTML...</span>
            </div>
            <div className={cn(
              "flex items-center gap-2",
              elapsedSeconds > 180 && "text-gold-400"
            )}>
              <div className={cn(
                "h-1.5 w-1.5 rounded-full",
                elapsedSeconds > 180 ? "bg-gold-400" : "bg-base-divider"
              )} />
              <span>Converting to PDF...</span>
            </div>
            <div className={cn(
              "flex items-center gap-2",
              elapsedSeconds > 240 && "text-gold-400"
            )}>
              <div className={cn(
                "h-1.5 w-1.5 rounded-full",
                elapsedSeconds > 240 ? "bg-gold-400" : "bg-base-divider"
              )} />
              <span>Uploading to storage...</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

