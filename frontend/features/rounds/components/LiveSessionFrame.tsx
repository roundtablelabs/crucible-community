import { ReactNode, useState } from "react";
import { FaArrowsAltH, FaColumns } from "react-icons/fa";
import { cn } from "@/lib/utils";
import type {
  ExpertClaim,
  InsightItem,
  ParticipantPresence,
  Stage,
  StageMeta,
} from "../types";
import { StageRail } from "./StageRail";
import { PeopleRail } from "./PeopleRail";
import { InsightRail } from "./InsightRail";

type LiveSessionFrameProps = {
  currentStage: Stage;
  stages: StageMeta[];
  participants: ParticipantPresence[];
  insights: InsightItem[];
  expertClaims?: ExpertClaim[];
  sessionId?: string;
  children: ReactNode;
  onSelectStage?: (stage: Stage) => void;
  reducedMotion?: boolean;
  className?: string;
};

export function LiveSessionFrame({
  currentStage,
  stages,
  participants,
  insights,
  expertClaims = [],
  sessionId,
  children,
  onSelectStage,
  reducedMotion,
  className,
}: LiveSessionFrameProps) {
  const [focusMode, setFocusMode] = useState(false);

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <header className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-base-divider bg-base-panel/80 px-4 py-3 shadow-soft">
        <div className="flex flex-col">
          <span className="text-xs uppercase tracking-[0.28em] text-base-subtext">
            Live session · {currentStage}
          </span>
          {sessionId ? (
            <span className="text-[11px] uppercase tracking-[0.24em] text-base-subtext/80">
              Round {sessionId.slice(0, 8)}
            </span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => setFocusMode((prev) => !prev)}
          className="flex items-center gap-2 rounded-full border border-base-divider px-3 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-base-text transition hover:border-info-500 hover:text-info-600"
        >
          {focusMode ? (
            <>
              <FaColumns className="h-3.5 w-3.5" aria-hidden="true" />
              Exit focus
            </>
          ) : (
            <>
              <FaArrowsAltH className="h-3.5 w-3.5" aria-hidden="true" />
              Focus mode
            </>
          )}
        </button>
      </header>
      <div
        className={cn(
          "grid min-h-[480px] gap-4 transition-all",
          focusMode
            ? "grid-cols-1"
            : "lg:grid-cols-[280px_minmax(0,1fr)_300px] xl:grid-cols-[300px_minmax(0,1fr)_320px]",
        )}
      >
        {!focusMode ? (
          <StageRail
            stages={stages}
            orientation="vertical"
            onSelectStage={onSelectStage}
            reducedMotion={Boolean(reducedMotion)}
            className="sticky top-4 h-fit"
          />
        ) : null}

        <main
          className={cn(
            "flex flex-col gap-4 rounded-3xl border border-base-divider bg-base-panel/95 p-4 shadow-soft",
            focusMode ? "" : "lg:col-start-2",
          )}
        >
          {children}
        </main>

        {!focusMode ? (
          <div className="flex flex-col gap-4 lg:col-start-3">
            <PeopleRail participants={participants} />
            <InsightRail insights={insights} expertClaims={expertClaims} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
