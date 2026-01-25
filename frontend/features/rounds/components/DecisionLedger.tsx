import { memo } from "react";
import { FaArrowRight, FaFlag, FaUser } from "react-icons/fa";
import { cn } from "@/lib/utils";
import type { DecisionLedgerEntry } from "../types";

type DecisionLedgerProps = {
  entries: DecisionLedgerEntry[];
  className?: string;
  title?: string;
};

const STATUS_STYLE: Record<DecisionLedgerEntry["status"], string> = {
  PROPOSED: "bg-info-100 text-info-700",
  AGREED: "bg-success-100 text-success-700",
  COMMITTED: "bg-warning-100 text-warning-700",
  VERIFIED: "bg-success-200 text-success-900",
  REVISIT: "bg-danger-100 text-danger-700",
};

const CONF_STYLE = {
  low: "bg-danger-100 text-danger-700",
  medium: "bg-warning-100 text-warning-700",
  high: "bg-success-100 text-success-700",
} as const;

export const DecisionLedger = memo(function DecisionLedger({
  entries,
  className,
  title = "Decisions",
}: DecisionLedgerProps) {
  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-3xl border border-base-divider bg-base-panel/95 p-5 shadow-soft",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-base-text">{title}</h2>
        <span className="text-xs uppercase tracking-[0.28em] text-base-subtext">My space</span>
      </header>
      <ul className="space-y-3 text-sm text-base-subtext">
        {entries.map((entry) => (
          <li
            key={entry.id}
            className={cn(
              "flex flex-col gap-3 rounded-2xl border border-base-divider bg-base-bg/90 p-4 transition hover:border-info-500",
              entry.needsAttention ? "shadow-[0_0_0_1px_rgba(246,173,85,0.30)]" : "",
            )}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-base font-semibold text-base-text">{entry.statement}</h3>
              <span className={cn("rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.24em]", STATUS_STYLE[entry.status])}>
                {entry.status.toLowerCase()}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className="flex items-center gap-1 text-base-subtext">
                <FaUser className="h-3 w-3" aria-hidden="true" />
                Owner: {entry.owner}
              </span>
              {entry.dueDate ? (
                <span className="flex items-center gap-1 text-base-subtext">
                  <FaFlag className="h-3 w-3" aria-hidden="true" />
                  Due {entry.dueDate}
                </span>
              ) : null}
              {entry.confidence ? (
                <span className={cn("rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.24em]", CONF_STYLE[entry.confidence])}>
                  Confidence {entry.confidence}
                </span>
              ) : null}
              {entry.needsAttention ? (
                <span className="flex items-center gap-1 text-warning-700">
                  <FaArrowRight className="h-3 w-3" aria-hidden="true" />
                  Needs input
                </span>
              ) : null}
            </div>
          </li>
        ))}
        {entries.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-base-divider bg-base-bg/80 p-4 text-xs text-base-subtext">
            No decisions made yet. Start a discussion to see outcomes here.
          </li>
        ) : null}
      </ul>
    </section>
  );
});

DecisionLedger.displayName = "DecisionLedger";
