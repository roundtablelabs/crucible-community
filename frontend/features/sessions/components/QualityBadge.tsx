"use client";

import React, { useState } from "react";
import { cn } from "@/lib/utils";

type QualityBadgeProps = {
  tier: string;
  score: number;
  breakdown?: Record<string, number> | null;
};

export function QualityBadge({ tier, score, breakdown }: QualityBadgeProps) {
  const [expanded, setExpanded] = useState(false);
  const tierColors: Record<string, { bg: string; text: string; border: string }> = {
    excellent: { bg: "bg-green-500/10", text: "text-green-400", border: "border-green-500/30" },
    good: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30" },
    acceptable: { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-500/30" },
    poor: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/30" },
    critical: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30" },
  };

  const colors = tierColors[tier] || tierColors.acceptable;
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className={cn(
          "px-3 py-1.5 rounded-md border text-sm font-medium transition hover:opacity-80",
          colors.bg,
          colors.text,
          colors.border
        )}
      >
        {tierLabel} ({(score * 100).toFixed(0)}%)
      </button>
      {expanded && breakdown && (
        <div className="absolute top-full left-0 mt-2 p-3 rounded-lg border border-base-divider bg-base-panel shadow-lg z-10 min-w-[200px]">
          <div className="text-xs font-semibold text-base-text mb-2">Quality Breakdown</div>
          {Object.entries(breakdown).map(([key, value]) => (
            <div key={key} className="flex justify-between items-center gap-4 text-xs text-base-subtext mb-1">
              <span className="capitalize">{key.replace('_', ' ')}:</span>
              <span className="font-medium">{(value * 100).toFixed(0)}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

