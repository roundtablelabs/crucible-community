import { memo, ReactNode } from "react";
import { FaCheck, FaChevronRight, FaClock, FaLock } from "react-icons/fa";
import { cn } from "@/lib/utils";
import type { Stage, StageMeta, StageStatus } from "../types";

type StageRailOrientation = "vertical" | "horizontal";

type StageRailProps = {
  stages: StageMeta[];
  orientation?: StageRailOrientation;
  onSelectStage?: (stage: Stage) => void;
  className?: string;
  reducedMotion?: boolean;
};

const STATUS_INTENT: Record<StageStatus, string> = {
  done: "bg-success-100 border-success-500 text-success-800",
  current: "bg-info-100 border-info-500 text-info-900",
  now: "bg-info-100 border-info-500 text-info-900",
  "up-next": "bg-base-bg border-base-divider text-base-text",
  later: "bg-base-panel border-transparent text-base-subtext",
  locked: "bg-base-panel border-base-divider text-base-subtext/60",
};

const STATUS_DOT: Record<StageStatus, ReactNode> = {
  done: <FaCheck className="h-3 w-3" aria-hidden="true" />,
  current: <div className="h-2.5 w-2.5 rounded-full bg-info-600" />,
  now: <div className="h-2.5 w-2.5 rounded-full bg-info-600" />,
  "up-next": <FaChevronRight className="h-3 w-3" aria-hidden="true" />,
  later: <FaClock className="h-3 w-3" aria-hidden="true" />,
  locked: <FaLock className="h-3 w-3" aria-hidden="true" />,
};

export const StageRail = memo(function StageRail({
  stages,
  orientation = "vertical",
  onSelectStage,
  className,
  reducedMotion = false,
}: StageRailProps) {
  return (
    <nav
      aria-label="Session stages"
      className={cn(
        "flex",
        orientation === "vertical" ? "flex-col gap-3" : "flex-row items-stretch gap-2",
        className,
      )}
    >
      {stages.map((stage) => (
        <StageRailItem
          key={stage.stage}
          stage={stage}
          orientation={orientation}
          onSelectStage={onSelectStage}
          reducedMotion={reducedMotion}
        />
      ))}
    </nav>
  );
});

type StageRailItemProps = {
  stage: StageMeta;
  orientation: StageRailOrientation;
  onSelectStage?: (stage: Stage) => void;
  reducedMotion: boolean;
};

const StageRailItem = memo(function StageRailItem({
  stage,
  orientation,
  onSelectStage,
  reducedMotion,
}: StageRailItemProps) {
  const { stage: stageKey, label, summary, exitCriteria, status, exitCriteriaMet } = stage;
  const handleClick = () => {
    if (onSelectStage) {
      onSelectStage(stageKey);
    }
  };

  const ariaCurrent = status === "current" ? "step" : undefined;
  const statusIntent = STATUS_INTENT[status];
  const dot = STATUS_DOT[status];
  const shouldPulse = status === "current" && !reducedMotion;

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-current={ariaCurrent}
      className={cn(
        "group rounded-2xl border px-4 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-info-500",
        orientation === "vertical" ? "flex flex-col gap-2" : "flex w-full flex-col justify-center gap-1",
        statusIntent,
        status === "locked" ? "cursor-not-allowed opacity-75" : "cursor-pointer",
      )}
      disabled={status === "locked"}
    >
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-base-panel text-xs font-semibold uppercase tracking-[0.28em]",
            status === "done" ? "bg-success-600 text-white" : "bg-base-panel text-base-text",
          )}
        >
          {stageKey[0]}
        </span>
        <div className="flex flex-1 items-center justify-between gap-3">
          <div>
            <div className="text-sm font-semibold text-base-text">{label}</div>
            {summary ? <div className="text-xs text-base-subtext">{summary}</div> : null}
          </div>
          <div
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full border border-current bg-white/70 text-xs text-inherit",
              shouldPulse ? "motion-safe:animate-pulse" : "",
            )}
            aria-hidden="true"
          >
            {dot}
          </div>
        </div>
      </div>
      {exitCriteria.length > 0 ? (
        <ul className="pl-9 text-xs text-base-subtext">
          {exitCriteria.map((criteria) => (
            <li key={criteria} className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cn(
                  "inline-flex h-3 w-3 items-center justify-center rounded-full border border-current",
                  exitCriteriaMet ? "bg-success-600 text-white" : "bg-transparent",
                )}
              >
                {exitCriteriaMet ? <FaCheck className="h-2 w-2" /> : null}
              </span>
              <span>{criteria}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </button>
  );
});

StageRail.displayName = "StageRail";
StageRailItem.displayName = "StageRailItem";
