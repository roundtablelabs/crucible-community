import { memo, ReactNode } from "react";
import { FaBalanceScale, FaClock, FaShieldAlt } from "react-icons/fa";
import { cn } from "@/lib/utils";
import type { HealthSnapshot } from "../types";

type MeetingHealthChipsProps = {
  health: HealthSnapshot;
  className?: string;
};

type ChipDefinition = {
  id: keyof HealthSnapshot;
  label: string;
  icon: ReactNode;
  formatter: (value: number) => string;
};

const CHIP_DEFS: ChipDefinition[] = [
  {
    id: "timeDriftMin",
    label: "Time drift",
    icon: <FaClock className="h-3 w-3" aria-hidden="true" />,
    formatter: (value) => `${value > 0 ? "+" : ""}${value} min`,
  },
  {
    id: "speakingBalance",
    label: "Participation",
    icon: <FaBalanceScale className="h-3 w-3" aria-hidden="true" />,
    formatter: (value) => `${Math.round(value * 100)}%`,
  },
  {
    id: "riskCount",
    label: "Risks",
    icon: <FaShieldAlt className="h-3 w-3" aria-hidden="true" />,
    formatter: (value) => `${value}`,
  },
  {
    id: "decisionConfidence",
    label: "Confidence",
    icon: <FaBalanceScale className="h-3 w-3" aria-hidden="true" />,
    formatter: (value) => `${Math.round(value * 100)}%`,
  },
];

export const MeetingHealthChips = memo(function MeetingHealthChips({
  health,
  className,
}: MeetingHealthChipsProps) {
  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      {CHIP_DEFS.map((chip) => (
        <span
          key={chip.id}
          className="flex items-center gap-1.5 rounded-full border border-base-divider bg-base-panel/80 px-3 py-1 text-xs text-base-subtext"
        >
          {chip.icon}
          <span className="uppercase tracking-[0.24em]">{chip.label}</span>
          <span className="text-base-text">{chip.formatter(health[chip.id])}</span>
        </span>
      ))}
    </div>
  );
});

MeetingHealthChips.displayName = "MeetingHealthChips";
