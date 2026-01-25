"use client";

import { Tooltip } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";

export function DecisionBriefTooltip() {
  return (
    <Tooltip content="The final report with recommendations.">
      <HelpCircle className="h-4 w-4 text-base-subtext/60 cursor-help" />
    </Tooltip>
  );
}

export function RoundTooltip() {
  return (
    <Tooltip content="Stages of the discussion.">
      <HelpCircle className="h-3 w-3 text-base-subtext/60 cursor-help" />
    </Tooltip>
  );
}

export function ConvergenceTooltip() {
  return (
    <Tooltip content="Bringing different viewpoints together into a final agreement.">
      <HelpCircle className="h-3 w-3 text-base-subtext/60 cursor-help" />
    </Tooltip>
  );
}

