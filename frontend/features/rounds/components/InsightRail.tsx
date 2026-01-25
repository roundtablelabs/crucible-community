import { memo, ReactNode, useState } from "react";
import {
  FaChevronDown,
  FaChevronRight,
  FaExclamationTriangle,
  FaFileSignature,
  FaLightbulb,
  FaThumbtack,
} from "react-icons/fa";
import { cn } from "@/lib/utils";
import type { ExpertClaim, InsightItem } from "../types";

type InsightRailProps = {
  insights: InsightItem[];
  expertClaims?: ExpertClaim[];
  className?: string;
  collapsedByDefault?: boolean;
};

const INSIGHT_ICON: Record<InsightItem["kind"], ReactNode> = {
  summary: <FaLightbulb className="h-3.5 w-3.5" aria-hidden="true" />,
  risk: <FaExclamationTriangle className="h-3.5 w-3.5" aria-hidden="true" />,
  decision: <FaFileSignature className="h-3.5 w-3.5" aria-hidden="true" />,
  note: <FaLightbulb className="h-3.5 w-3.5" aria-hidden="true" />,
};

const CONF_MAP = {
  low: "bg-danger-100 text-danger-700",
  medium: "bg-warning-100 text-warning-700",
  high: "bg-success-100 text-success-700",
} as const;

export const InsightRail = memo(function InsightRail({
  insights,
  expertClaims = [],
  className,
  collapsedByDefault = true,
}: InsightRailProps) {
  const [claimsOpen, setClaimsOpen] = useState(!collapsedByDefault);
  const hasClaims = expertClaims.length > 0;
  return (
    <section
      aria-label="Insights"
      className={cn(
        "flex flex-col gap-4 rounded-3xl border border-base-divider bg-base-panel/95 p-4 shadow-soft",
        className,
      )}
    >
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.28em] text-base-subtext">Insights</h2>
        {hasClaims ? (
          <button
            type="button"
            onClick={() => setClaimsOpen((prev) => !prev)}
            className="flex items-center gap-1 rounded-full border border-base-divider px-3 py-1 text-xs text-base-subtext transition hover:text-base-text"
            aria-expanded={claimsOpen}
            aria-controls="expert-panel"
          >
            {claimsOpen ? (
              <FaChevronDown className="h-3 w-3" aria-hidden="true" />
            ) : (
              <FaChevronRight className="h-3 w-3" aria-hidden="true" />
            )}
            Expert panel
          </button>
        ) : null}
      </header>

      {hasClaims ? (
        <div
          id="expert-panel"
          className={cn(
            "overflow-hidden rounded-2xl border border-base-divider bg-base-bg/90 transition-all",
            claimsOpen ? "max-h-[420px] p-3" : "max-h-0 p-0",
          )}
        >
          <div className="space-y-3 text-xs text-base-subtext">
            {expertClaims.map((claim) => (
              <article
                key={claim.id}
                className={cn(
                  "rounded-xl border border-base-divider bg-white/80 p-3 transition hover:border-info-500",
                  claim.pinned ? "shadow-[0_0_0_1px_rgba(46,164,248,0.25)]" : "",
                )}
              >
                <header className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.26em] text-base-subtext">
                    {claim.speaker}
                  </span>
                  {claim.pinned ? (
                    <span className="flex items-center gap-1 text-[10px] uppercase tracking-[0.24em] text-info-600">
                      <FaThumbtack className="h-3 w-3" aria-hidden="true" /> pinned
                    </span>
                  ) : null}
                </header>
                <p className="mt-2 text-sm text-base-text">{claim.claim}</p>
                <footer className="mt-2 flex flex-wrap items-center gap-2 text-xs text-base-subtext">
                  {claim.evidence ? (
                    <span className="rounded-full border border-base-divider px-2 py-0.5">{claim.evidence}</span>
                  ) : null}
                  {claim.confidence ? (
                    <span className={cn("rounded-full px-2 py-0.5 capitalize", CONF_MAP[claim.confidence])}>
                      {claim.confidence} confidence
                    </span>
                  ) : null}
                </footer>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      <ul className="space-y-3 text-sm text-base-subtext">
        {insights.map((insight) => (
          <li
            key={insight.id}
            className={cn(
              "flex flex-col gap-2 rounded-2xl border border-base-divider bg-base-bg/90 p-3",
              insight.pinned ? "border-info-500" : "",
            )}
          >
            <div className="flex items-center gap-2 text-base-text">
              {INSIGHT_ICON[insight.kind]}
              <span className="text-sm font-semibold">{insight.title}</span>
              {insight.confidence ? (
                <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[10px] uppercase tracking-[0.24em]", CONF_MAP[insight.confidence])}>
                  {insight.confidence}
                </span>
              ) : null}
            </div>
            <p className="text-xs text-base-subtext">{insight.description}</p>
            {insight.source ? (
              <span className="text-[11px] uppercase tracking-[0.24em] text-base-subtext/80">{insight.source}</span>
            ) : null}
          </li>
        ))}
        {insights.length === 0 ? (
          <li className="rounded-2xl border border-dashed border-base-divider bg-base-bg/50 p-3 text-xs text-base-subtext">
            AI insights will appear here once the session begins.
          </li>
        ) : null}
      </ul>
    </section>
  );
});

InsightRail.displayName = "InsightRail";
