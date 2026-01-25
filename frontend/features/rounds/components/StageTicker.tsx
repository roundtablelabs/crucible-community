import { memo } from "react";
import { FaArrowRight } from "react-icons/fa";
import { cn } from "@/lib/utils";
import type { Stage } from "../types";

type StageTickerItem = {
  stage: Stage;
  label: string;
};

type StageTickerProps = {
  now: StageTickerItem;
  next?: StageTickerItem;
  later?: StageTickerItem;
  className?: string;
};

export const StageTicker = memo(function StageTicker({ now, next, later, className }: StageTickerProps) {
  const items = [
    { title: "Now", item: now },
    next ? { title: "Next", item: next } : null,
    later ? { title: "Later", item: later } : null,
  ].filter(Boolean) as Array<{ title: string; item: StageTickerItem }>;
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-3 rounded-3xl border border-base-divider bg-base-panel/80 px-4 py-3 text-sm text-base-subtext shadow-soft",
        className,
      )}
    >
      {items.map((entry, index) => (
        <div key={entry.title} className="flex items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-[0.32em] text-base-subtext/90">
            {entry.title}:
          </span>
          <span className="text-sm font-semibold text-base-text">
            {entry.item.stage} “{entry.item.label}”
          </span>
          {index < items.length - 1 ? (
            <FaArrowRight className="h-3 w-3 text-base-subtext/70" aria-hidden="true" />
          ) : null}
        </div>
      ))}
    </div>
  );
});

StageTicker.displayName = "StageTicker";
