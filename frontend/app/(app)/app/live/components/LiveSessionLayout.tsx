"use client";

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardList,
  Clock3,
  CreditCard,
  ExternalLink,
  LayoutPanelTop,
  Loader2,
  Maximize2,
  RadioTower,
  ScrollText,
  ShieldCheck,
  Target,
  Trash2,
  UsersRound,
  X,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { AgentOutcomeTabs } from "@/features/rounds/components/AgentOutcomeTabs";
import { LiveSessionFrame } from "@/features/rounds/components/LiveSessionFrame";
import type {
  ExpertClaim,
  InsightItem,
  ParticipantPresence,
  Stage,
  StageMeta,
  StageStatus,
} from "@/features/rounds/types";
import type { LiveSessionTransfer } from "@/features/rounds/liveSessionTransfer";

import { formatTimestamp, snippet } from "../helpers";
import type {
  AuditTimelineEntry,
  DebateRunStatus,
  DebateTranscriptEntry,
  FinalJudgeSummary,
  TrustReport,
} from "../types";

const STATUS_STYLES: Record<DebateRunStatus, { label: string; badge: string; icon: LucideIcon }> = {
  idle: {
    label: "Waiting",
    badge: "border-cyan-500/30 bg-transparent text-cyan-100/60",
    icon: Clock3,
  },
  running: {
    label: "Streaming",
    badge: "border-cyan-500/40 bg-cyan-500/20 text-cyan-100",
    icon: Loader2,
  },
  completed: {
    label: "Complete",
    badge: "border-cyan-500/40 bg-cyan-500/10 text-cyan-200",
    icon: CheckCircle2,
  },
  error: {
    label: "Error",
    badge: "border-rose-500/40 bg-rose-500/10 text-rose-200",
    icon: AlertTriangle,
  },
};
type CardProps = {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  action?: ReactNode;
  children: ReactNode;
};

function Card({ title, subtitle, icon: Icon, action, children }: CardProps) {
  return (
    <section className="rounded-2xl border border-cyan-500/30 bg-[rgba(6,24,35,0.85)] p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-sm font-medium text-cyan-100/80">
            {Icon ? <Icon className="h-4 w-4 text-cyan-200" aria-hidden="true" /> : null}
            <span className="text-[13px]">{title}</span>
          </div>
          {subtitle ? <p className="text-xs text-cyan-100/60">{subtitle}</p> : null}
        </div>
        {action ? <div className="text-xs text-cyan-100">{action}</div> : null}
      </div>
      <div className="mt-4 space-y-4 text-[15px] leading-relaxed text-white">{children}</div>
    </section>
  );
}
type ExpandablePanelProps = {
  title: string;
  subtitle?: string;
  icon?: LucideIcon;
  renderContent: () => ReactNode;
  previewHeight?: number;
};

function ExpandablePanel({ title, subtitle, icon: Icon, renderContent, previewHeight = 320 }: ExpandablePanelProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  useEffect(() => {
    if (!isExpanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsExpanded(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isExpanded]);

  return (
    <>
      <section
        className="rounded-2xl border p-5"
        style={{ background: "var(--rt-surface)", borderColor: "var(--rt-border)", boxShadow: "var(--rt-shadow)" }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--rt-muted)]">
              {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
              <span className="text-[13px]">{title}</span>
            </div>
            {subtitle ? <p className="text-sm text-[color:var(--rt-subtext)]">{subtitle}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
            style={{
              borderColor: "var(--rt-accent-700)",
              color: "var(--rt-accent-600)",
              background: "var(--rt-accent-100)",
            }}
          >
            <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
            Expand
          </button>
        </div>
        <div
          className="mt-4 rounded-xl border"
          style={{ borderColor: "var(--rt-border)", background: "var(--rt-surface-2)" }}
        >
          <div className="overflow-y-auto pr-2" style={{ maxHeight: previewHeight }}>
            {renderContent()}
          </div>
        </div>
      </section>

      {isExpanded ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-6 py-10"
          role="dialog"
          aria-modal="true"
          onClick={() => setIsExpanded(false)}
        >
          <div
            className="relative flex w-full max-w-5xl flex-col rounded-[var(--rt-radius-lg)] border p-6"
            style={{
              background: "var(--rt-panel-elevated)",
              borderColor: "var(--rt-border-strong)",
              boxShadow: "var(--rt-shadow-elevated)",
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-6">
              <div className="space-y-1">
                <div className="flex items-center gap-2 text-sm font-medium text-[color:var(--rt-muted)]">
                  {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
                  <span className="text-[13px]">{title}</span>
                </div>
                {subtitle ? <p className="text-sm text-[color:var(--rt-subtext)]">{subtitle}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => setIsExpanded(false)}
                className="inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium"
                style={{ borderColor: "var(--rt-border)", color: "var(--rt-text)" }}
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
                Close
              </button>
            </div>
            <div className="mt-6 flex-1 overflow-y-auto pr-3">{renderContent()}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
export function StatusBadge({ status }: { status: DebateRunStatus }) {
  const config = STATUS_STYLES[status];
  const Icon = config.icon;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-[12px] font-medium",
        config.badge,
      )}
    >
      <Icon className={cn("h-3.5 w-3.5", status === "running" ? "animate-spin" : "")} aria-hidden="true" />
      {config.label}
    </span>
  );
}
type InfoStatProps = {
  label: string;
  value: ReactNode;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "good" | "warn";
};

function InfoStat({ label, value, hint, icon: Icon, tone = "default" }: InfoStatProps) {
  const toneStyles: Record<NonNullable<InfoStatProps["tone"]>, { bg: string; border: string; text?: string }> = {
    default: { bg: "transparent", border: "var(--rt-border)" },
    good: { bg: "var(--rt-success-100)", border: "var(--rt-success-700)" },
    warn: { bg: "var(--rt-warn-100)", border: "var(--rt-warn-700)" },
  };

  const t = toneStyles[tone];
  return (
    <div className="rounded-xl border px-4 py-3" style={{ background: t.bg, borderColor: t.border }}>
      <p className="text-xs text-[color:var(--rt-muted)]">{label}</p>
      <div className="mt-1.5 flex items-center gap-2 text-lg font-semibold text-[color:var(--rt-text)]">
        {Icon ? <Icon className="h-4 w-4" aria-hidden="true" /> : null}
        <span>{value}</span>
      </div>
      {hint ? <p className="mt-0.5 text-xs text-[color:var(--rt-subtext)]">{hint}</p> : null}
    </div>
  );
}
type LiveSessionStatsGridProps = {
  status: DebateRunStatus;
  sessionId?: string | null;
  releaseOk: boolean;
  participantsCount: number;
  evidenceCount: number;
  logPreviewCount: number;
  totalLogCount: number;
};

export function LiveSessionStatsGrid({
  status,
  sessionId,
  releaseOk,
  participantsCount,
  evidenceCount,
  logPreviewCount,
  totalLogCount,
}: LiveSessionStatsGridProps) {
  const stats = [
    {
      label: "Release gate",
      value: releaseOk ? "Pass" : "Hold",
      hint: releaseOk ? "Final judge cleared" : "Waiting for judge",
      icon: ShieldCheck,
      tone: releaseOk ? "good" : "warn",
    },
    {
      label: "Knights",
      value: participantsCount || "-",
      hint: "Seats on call",
      icon: UsersRound,
    },
    {
      label: "Evidence",
      value: evidenceCount || "-",
      hint: "Citations captured",
      icon: ClipboardList,
    },
    {
      label: "Log lines",
      value: logPreviewCount || "-",
      hint: totalLogCount > 0 ? `${totalLogCount} total` : "No output yet",
      icon: Activity,
    },
  ] as const;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {stats.map((stat, index) => (
        <div
          key={stat.label}
          className="motion-safe:animate-in motion-safe:fade-in"
          style={{ animationDelay: `${index * 50}ms` } as React.CSSProperties}
        >
          <InfoStat {...stat} />
        </div>
      ))}
    </div>
  );
}
type StageFlowProps = {
  stages: StageMeta[];
  currentStage: Stage;
  currentLabel: string;
  sessionStatus: DebateRunStatus;
};

export function StageFlow({ stages, currentStage, currentLabel, sessionStatus }: StageFlowProps) {
  const isSessionComplete = sessionStatus === "completed";
  const normalizedStages = isSessionComplete
    ? stages.map((stageMeta) => ({ ...stageMeta, status: "done" as StageStatus }))
    : stages;
  const completed = normalizedStages.filter((stage) => stage.status === "done").length;
  const currentIndex = normalizedStages.findIndex((s) => s.stage === currentStage);

  return (
    <section className="rounded-2xl border border-cyan-500/30 bg-[rgba(6,24,35,0.85)] p-4">
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-[0.3em] text-cyan-100/60">Stage</span>
          <span className="text-sm font-semibold text-white">
            {currentLabel || currentStage}
          </span>
        </div>
        <span className="text-xs text-cyan-100/60">
          {completed} / {stages.length}
        </span>
      </div>

      {/* Compact horizontal progress bar */}
      <div className="relative h-2 rounded-full bg-[rgba(6,24,35,0.6)] border border-cyan-500/20 overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500/40 to-cyan-500/20 transition-all duration-500"
          style={{ width: `${((completed + (currentIndex >= 0 ? 0.5 : 0)) / stages.length) * 100}%` }}
        />
        {currentIndex >= 0 && (
          <div
            className="absolute inset-y-0 bg-gradient-to-r from-cyan-500/60 to-cyan-500/40 animate-pulse"
            style={{
              left: `${(currentIndex / stages.length) * 100}%`,
              width: `${(1 / stages.length) * 100}%`,
            }}
          />
        )}
      </div>

      {/* Compact stage labels */}
      <div className="mt-3 flex flex-wrap gap-1.5 text-[10px]">
        {normalizedStages.slice(0, 7).map((stageMeta) => {
          const isActive = stageMeta.stage === currentStage;
          const isDone = stageMeta.status === "done";
          
          return (
            <span
              key={stageMeta.stage}
              className={cn(
                "rounded-full px-2 py-0.5 border transition-all",
                isActive
                  ? "border-cyan-500/60 bg-cyan-500/20 text-cyan-100"
                  : isDone
                  ? "border-cyan-500/30 bg-cyan-500/10 text-cyan-100/70"
                  : "border-cyan-500/20 bg-transparent text-cyan-100/40",
              )}
              title={stageMeta.label}
            >
              {stageMeta.label}
            </span>
          );
        })}
      </div>
    </section>
  );
}

function EvidenceList({ urls }: { urls: string[] }) {
  if (urls.length === 0) {
    return <p className="text-sm text-[color:var(--rt-subtext)]">Citations will appear once the crew logs evidence.</p>;
  }

  return (
    <ol className="space-y-2 text-sm text-[color:var(--rt-text)]">
      {urls.map((url) => (
        <li
          key={url}
          className="flex items-start gap-2 rounded-xl border p-3"
          style={{ borderColor: "var(--rt-border)", background: "var(--rt-surface-2)" }}
        >
          <ExternalLink className="mt-0.5 h-4 w-4 flex-none text-[color:var(--rt-muted)]" aria-hidden="true" />
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="truncate text-[color:var(--rt-text)] underline-offset-4 hover:underline"
          >
            {url}
          </a>
        </li>
      ))}
    </ol>
  );
}
type ListBlockProps = {
  title: string;
  items?: string[];
  placeholder: string;
};

function ListBlock({ title, items, placeholder }: ListBlockProps) {
  const data = Array.isArray(items) ? items : [];
  if (data.length === 0) {
    return (
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.32em] text-[color:var(--rt-muted)]">{title}</p>
        <p className="mt-1 text-sm text-[color:var(--rt-subtext)]">{placeholder}</p>
      </div>
    );
  }

  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.32em] text-[color:var(--rt-muted)]">{title}</p>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-[color:var(--rt-text)]">
        {data.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

type AgentOutcomesCardProps = {
  timeline: AuditTimelineEntry[];
};

function AgentOutcomesCard({ timeline }: AgentOutcomesCardProps) {
  return (
    <Card title="Agent outcomes" subtitle="Role-by-role statements + cites" icon={UsersRound}>
      <AgentOutcomeTabs timeline={timeline} />
    </Card>
  );
}

function TimelineList({ items }: { items: AuditTimelineEntry[] }) {
  if (items.length === 0) {
    return (
      <p className="text-sm text-[color:var(--rt-subtext)]">
        Timeline will populate when the final judge confirms the summary.
      </p>
    );
  }

  return (
    <ol className="space-y-3">
      {(Array.isArray(items) ? items : []).map((item, index) => (
        <li
          key={`${item.task}-${index}`}
          className="rounded-xl border p-4"
          style={{ borderColor: "var(--rt-border)", background: "var(--rt-surface-2)" }}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.3em] text-[color:var(--rt-muted)]">{item.task}</p>
              {item.headline ? <p className="text-base font-semibold text-[color:var(--rt-text)]">{item.headline}</p> : null}
            </div>
            {item.why && item.why.length > 0 ? (
              <span
                className="rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.3em]"
                style={{ borderColor: "var(--rt-border)", color: "var(--rt-subtext)" }}
              >
                {item.why[0]}
              </span>
            ) : null}
          </div>
          {item.excerpt ? <p className="mt-2 text-sm text-[color:var(--rt-subtext)]">{snippet(item.excerpt, 360)}</p> : null}
          {item.citations?.urls && item.citations.urls.length > 0 ? (
            <p className="mt-2 text-xs text-[color:var(--rt-muted)]">
              Citations: {item.citations.urls.map((url) => url.replace(/^https?:\/\//, "")).join(", ")}
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

function TranscriptList({ entries }: { entries: DebateTranscriptEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-sm text-[color:var(--rt-subtext)]">
        Once each Knight publishes their statements, the transcript will sync here.
      </p>
    );
  }

  return (
    <ul className="space-y-3">
      {(Array.isArray(entries) ? entries : []).map((entry, index) => (
        <li
          key={`${entry.task}-${index}`}
          className="rounded-xl border p-4"
          style={{ borderColor: "var(--rt-border)", background: "var(--rt-surface-2)" }}
        >
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--rt-muted)]">{entry.task}</p>
              <p className="text-base font-semibold text-[color:var(--rt-text)]">{entry.role}</p>
            </div>
            {entry.agent ? <span className="text-xs text-[color:var(--rt-subtext)]">{entry.agent}</span> : null}
          </div>
          {entry.output ? <p className="mt-2 text-sm text-[color:var(--rt-text)]">{snippet(entry.output, 420)}</p> : null}
        </li>
      ))}
    </ul>
  );
}

type TrustSummaryProps = {
  trustReport: TrustReport | null;
  toolGate?: { limit?: number; actual?: number; ok?: boolean };
};

function TrustSummary({ trustReport, toolGate }: TrustSummaryProps) {
  if (!trustReport && !toolGate) {
    return <p className="text-sm text-[color:var(--rt-subtext)]">Trust telemetry will publish after the run completes.</p>;
  }

  return (
    <div className="space-y-3 text-sm">
      {trustReport?.models ? (
        <div
          className="rounded-xl border p-3"
          style={{ borderColor: "var(--rt-border)", background: "var(--rt-surface-2)" }}
        >
          <p className="text-[11px] uppercase tracking-[0.32em] text-[color:var(--rt-muted)]">Models</p>
          <ul className="mt-2 space-y-1 text-[color:var(--rt-text)]">
            {trustReport.models.moderator ? (
              <li>
                <span className="text-[color:var(--rt-subtext)]">Moderator</span>{" "}
                <span className="text-[color:var(--rt-text)]">
                  {trustReport.models.moderator.provider} · {trustReport.models.moderator.model}
                </span>
              </li>
            ) : null}
            {trustReport.models.final_judge ? (
              <li>
                <span className="text-[color:var(--rt-subtext)]">Final judge</span>{" "}
                <span className="text-[color:var(--rt-text)]">
                  {trustReport.models.final_judge.provider} · {trustReport.models.final_judge.model}
                </span>
              </li>
            ) : null}
            {trustReport.models.participants?.length ? (
              <li className="text-[color:var(--rt-subtext)]">
                Participants · <span className="text-[color:var(--rt-text)]">{trustReport.models.participants.length} seats</span>
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}

      {toolGate ? (
        <div
          className="rounded-xl border p-3"
          style={{ borderColor: "var(--rt-border)", background: "var(--rt-surface-2)" }}
        >
          <p className="text-[11px] uppercase tracking-[0.32em] text-[color:var(--rt-muted)]">Tool budget</p>
          <p className="mt-1 text-[color:var(--rt-text)]">
            {toolGate.actual ?? 0} / {toolGate.limit ?? "?"} calls
          </p>
          <p
            className="text-xs"
            style={{ color: toolGate.ok ? "var(--rt-success-700)" : "var(--rt-danger-700)" }}
          >
            {toolGate.ok ? "Within budget" : "Exceeded budget"}
          </p>
        </div>
      ) : null}
    </div>
  );
}

type LiveSessionHeaderProps = {
  status: DebateRunStatus;
  title: string;
  question: string;
  currentStage?: Stage;
  stageLabel?: string;
  error?: string | null;
  isComplete?: boolean;
  sessionId?: string | null;
};

export function LiveSessionHeader({ status, title, question, currentStage, stageLabel, error, isComplete = false, sessionId }: LiveSessionHeaderProps) {
  const statusConfig = STATUS_STYLES[status];
  const StatusIcon = statusConfig.icon;

  return (
    <header className="rounded-2xl border border-cyan-500/30 bg-[rgba(6,24,35,0.85)] p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-semibold leading-tight text-white">{title}</h1>
          </div>
          <p className="text-[15px] text-cyan-100/80">{question}</p>
        </div>
      </div>

      {error ? (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="inline-flex items-center gap-2 rounded-xl border border-rose-500/40 bg-[rgba(244,63,94,0.15)] px-4 py-2 text-sm text-rose-100">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            {error}
          </div>
        </div>
      ) : null}
    </header>
  );
}
type LiveSessionMainColumnProps = {
  sessionId?: string | null;
  currentStage: Stage;
  stageMeta: StageMeta[];
  participants: ParticipantPresence[];
  insights: InsightItem[];
  expertClaims: ExpertClaim[];
  finalSummary: FinalJudgeSummary | null;
  releaseOk: boolean;
  releaseGateCopy: string;
  evidenceUrls: string[];
  status: DebateRunStatus;
  stageLabel: string;
  stageSummaryCopy: string;
  stageExitCriteria: string[];
  toolUsageLabel: string;
  toolUsageCopy: string;
  toolUsageClass: string;
  participantsCount: number;
  timeline: AuditTimelineEntry[];
  transcript: DebateTranscriptEntry[];
};

export function LiveSessionMainColumn({
  sessionId,
  currentStage,
  stageMeta,
  participants,
  insights,
  expertClaims,
  finalSummary,
  releaseOk,
  releaseGateCopy,
  evidenceUrls,
  status,
  stageLabel,
  stageSummaryCopy,
  stageExitCriteria,
  toolUsageLabel,
  toolUsageCopy,
  toolUsageClass,
  participantsCount,
  timeline,
  transcript,
}: LiveSessionMainColumnProps) {
  return (
    <div className="space-y-6">
      <LiveSessionFrame
        currentStage={currentStage}
        stages={stageMeta}
        participants={participants}
        insights={insights}
        expertClaims={expertClaims}
        sessionId={sessionId ?? undefined}
      >
        <div className="space-y-6">
          <Card title="Final verdict" subtitle={finalSummary ? "Judge output" : "Awaiting completion"} icon={ShieldCheck}>
            {finalSummary ? (
              <div className="space-y-6">
                <div className="space-y-4">
                  {finalSummary.summary ? <p className="text-base text-[color:var(--rt-text)]">{finalSummary.summary}</p> : null}
                  <div className="flex flex-col gap-4 lg:flex-row lg:flex-wrap">
                    <div className="flex-1 min-w-[220px]">
                      <ListBlock
                        title="Round 1 highlights"
                        items={finalSummary.round1_highlights}
                        placeholder="Claims will populate after round one."
                      />
                    </div>
                    <div className="flex-1 min-w-[220px]">
                      <ListBlock
                        title="Round 2 insights"
                        items={finalSummary.round2_insights}
                        placeholder="Insights will populate after round two."
                      />
                    </div>
                  </div>
                  <ListBlock
                    title="Recommended actions"
                    items={finalSummary.recommended_actions}
                    placeholder="Actions will populate if the judge approves release."
                  />
                </div>
                <div className="flex flex-wrap gap-4">
                  <div
                    className="min-w-[200px] flex-1 rounded-2xl border p-4"
                    style={{ borderColor: "var(--rt-border)", background: "var(--rt-surface-2)" }}
                  >
                    <p className="text-[11px] uppercase tracking-[0.3em] text-[color:var(--rt-muted)]">Confidence</p>
                    <p className="mt-2 text-4xl font-semibold text-[color:var(--rt-text)]">
                      {/* {typeof finalSummary.confidence === "number" ? ${Math.round(finalSummary.confidence)}% : "-"} */}
                    </p>
                  </div>
                  <div
                    className="min-w-[200px] flex-1 rounded-2xl border p-4"
                    style={{ borderColor: "var(--rt-border)", background: "var(--rt-surface-2)" }}
                  >
                    <p className="text-[11px] uppercase tracking-[0.3em] text-[color:var(--rt-muted)]">Release gate</p>
                    <span
                      className={cn(
                        "mt-2 inline-flex items-center justify-center rounded-full px-3 py-1 text-[11px] uppercase tracking-[0.3em]",
                        releaseOk
                          ? "border-[color:var(--rt-success-700)] bg-[color:var(--rt-success-100)] text-[color:var(--rt-success-700)]"
                          : "border-[color:var(--rt-danger-700)] bg-[color:var(--rt-danger-100)] text-[color:var(--rt-danger-700)]",
                      )}
                    >
                      {releaseOk ? "PASS" : "HOLD"}
                    </span>
                    <p className="mt-2 text-xs text-[color:var(--rt-muted)]">{releaseGateCopy}</p>
                  </div>
                  <div
                    className="min-w-[200px] flex-1 rounded-2xl border p-4"
                    style={{ borderColor: "var(--rt-border)", background: "var(--rt-surface-2)" }}
                  >
                    <p className="text-[11px] uppercase tracking-[0.3em] text-[color:var(--rt-muted)]">Evidence locker</p>
                    <p className="mt-2 text-sm text-[color:var(--rt-text)]">
                      {evidenceUrls.length
                        ? "references logged during this run."
                        : "Evidence locker will populate as the crew cites sources."}
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-[color:var(--rt-subtext)]">
                The moderator is synthesising the transcript. This block will populate when the final judge finishes.
              </p>
            )}
          </Card>

          <Card title="Run pulse" subtitle="Live health + gates" icon={Activity}>
            <div className="space-y-4">
              <div
                className="rounded-2xl border p-4"
                style={{ borderColor: "var(--rt-border)", background: "var(--rt-surface-2)" }}
              >
                <p className="text-[11px] uppercase tracking-[0.3em] text-[color:var(--rt-muted)]">Current stage</p>
                <p className="mt-2 text-lg font-semibold text-[color:var(--rt-text)]">{stageLabel}</p>
                <p className="mt-1 text-sm text-[color:var(--rt-subtext)]">{stageSummaryCopy}</p>
                {stageExitCriteria.length ? (
                  <div className="mt-3">
                    <p className="text-[11px] uppercase tracking-[0.3em] text-[color:var(--rt-muted)]">Advances when</p>
                    <ul className="mt-2 space-y-1 text-sm text-[color:var(--rt-text)]">
                      {stageExitCriteria.slice(0, 3).map((criterion) => (
                        <li key={criterion} className="flex gap-2">
                          <span className="text-[color:var(--rt-muted)]">&bull;</span>
                          <span>{criterion}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div
                  className="rounded-2xl border p-4"
                  style={{ borderColor: "var(--rt-border)", background: "var(--rt-surface-2)" }}
                >
                  <p className="text-[11px] uppercase tracking-[0.3em] text-[color:var(--rt-muted)]">Release gate</p>
                  <p className="mt-2 text-lg font-semibold text-[color:var(--rt-text)]">{releaseOk ? "Pass" : "Hold"}</p>
                  <p className="text-xs text-[color:var(--rt-muted)]">{releaseGateCopy}</p>
                </div>
                <div
                  className="rounded-2xl border p-4"
                  style={{ borderColor: "var(--rt-border)", background: "var(--rt-surface-2)" }}
                >
                  <p className="text-[11px] uppercase tracking-[0.3em] text-[color:var(--rt-muted)]">Tool budget</p>
                  <p className="mt-2 text-lg font-semibold text-[color:var(--rt-text)]">{toolUsageLabel}</p>
                  <p className={cn("text-xs text-[color:var(--rt-subtext)]", toolUsageClass)}>{toolUsageCopy}</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div
                  className="rounded-2xl border p-4"
                  style={{ borderColor: "var(--rt-border)", background: "var(--rt-surface-2)" }}
                >
                  <p className="text-[11px] uppercase tracking-[0.3em] text-[color:var(--rt-muted)]">Knights online</p>
                  <p className="mt-2 text-lg font-semibold text-[color:var(--rt-text)]">{participantsCount || "-"}</p>
                  <p className="text-xs text-[color:var(--rt-muted)]">Live presence rail keeps seats honest.</p>
                </div>
                <div
                  className="rounded-2xl border p-4"
                  style={{ borderColor: "var(--rt-border)", background: "var(--rt-surface-2)" }}
                >
                  <p className="text-[11px] uppercase tracking-[0.3em] text-[color:var(--rt-muted)]">Evidence captured</p>
                  <p className="mt-2 text-lg font-semibold text-[color:var(--rt-text)]">{evidenceUrls.length || "-"}</p>
                  <p className="text-xs text-[color:var(--rt-muted)]">Locker mirrors citations in near real-time.</p>
                </div>
              </div>
            </div>
          </Card>

          {timeline.length > 0 ? <AgentOutcomesCard timeline={timeline} /> : null}

          <div className="grid gap-6 lg:grid-cols-2">
            <ExpandablePanel
              title="Audit timeline"
              subtitle="Trace & headlines"
              icon={LayoutPanelTop}
              previewHeight={320}
              renderContent={() => <TimelineList items={timeline} />}
            />
            <ExpandablePanel
              title="Transcript digest"
              subtitle="Crew output"
              icon={ScrollText}
              previewHeight={320}
              renderContent={() => <TranscriptList entries={transcript} />}
            />
          </div>
        </div>
      </LiveSessionFrame>
    </div>
  );
}
type LiveSessionSidebarProps = {
  brief: LiveSessionTransfer["moderatorBrief"];
  currentStage?: Stage;
  stageLabel?: string;
  onClearTransfer: () => void;
  canClearTransfer: boolean;
  isClearing: boolean;
};

export function LiveSessionSidebar({
  brief,
  currentStage,
  stageLabel,
  onClearTransfer,
  canClearTransfer,
  isClearing,
}: LiveSessionSidebarProps) {
  return (
    <aside className="space-y-4">
      {/* Simplified Moderator Brief - Just context info */}
      <Card title="Moderator Brief" subtitle="Context for the debate" icon={Target}>
        <div className="text-sm text-cyan-50/80">
          <p>This session is configured with the moderator brief from Launchpad. Key details are shown below the debate stream.</p>
        </div>
        {canClearTransfer && (
          <div className="mt-4 pt-4 border-t border-cyan-500/20">
            <button
              type="button"
              onClick={onClearTransfer}
              className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-100 transition hover:bg-cyan-500/20"
              disabled={isClearing}
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              Clear Session
            </button>
          </div>
        )}
      </Card>
    </aside>
  );
}







