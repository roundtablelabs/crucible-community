"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

import { SkeletonScreen, SkeletonLine } from "@/components/ui/SkeletonScreen";

type SessionSummary = {
  id: string;
  question: string;
  status: string;
  createdAt: string;
};

type SessionHistoryListProps = {
  sessions: SessionSummary[];
  heading?: string;
  ctaHref?: string;
  ctaLabel?: string;
  autoLoading?: boolean;
};

export function SessionHistoryList({
  sessions,
  heading = "Latest outcomes",
  ctaHref = "/app/sessions",
  ctaLabel = "View all",
  autoLoading = true,
}: SessionHistoryListProps) {
  const [loading, setLoading] = useState(autoLoading);

  useEffect(() => {
    if (!autoLoading) return;
    const timer = window.setTimeout(() => setLoading(false), 420);
    return () => window.clearTimeout(timer);
  }, [autoLoading]);

  if (loading) {
    return (
      <SkeletonScreen>
        <div className="rounded-3xl border border-base-divider bg-base-panel p-6 shadow-soft">
          <SkeletonLine width="192px" height="20px" className="h-5" />
          <div className="mt-4 space-y-3">
            {[...Array(3)].map((_, index) => (
              <div
                key={index}
                className="flex items-center gap-4 rounded-2xl border border-dashed border-base-divider bg-base-bg/70 p-4"
              >
                <SkeletonLine width="66%" height="16px" className="h-4" />
                <SkeletonLine width="80px" height="16px" className="h-4" />
                <SkeletonLine width="96px" height="16px" className="h-4" />
              </div>
            ))}
          </div>
        </div>
      </SkeletonScreen>
    );
  }

  return (
    <div className="rounded-3xl border border-base-divider bg-base-panel p-6 shadow-soft">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-base-text">{heading}</h2>
        {ctaHref ? (
          <Link
            href={ctaHref}
            className="text-xs font-semibold uppercase tracking-[0.28em] text-base-subtext transition hover:text-base-text"
          >
            {ctaLabel}
          </Link>
        ) : null}
      </div>
      <ul className="mt-4 space-y-4 text-sm text-base-subtext">
        {sessions.map((session) => (
          <li
            key={session.id}
            className="rounded-2xl border border-base-divider bg-base-bg/80 p-4 transition hover:border-navy-900/50 hover:shadow-soft"
          >
            <div className="flex flex-col gap-1">
              <Link
                href={`/app/sessions/${session.id}`}
                className="text-base font-semibold text-base-text transition hover:text-info-700"
              >
                {session.question}
              </Link>
              <span>{session.status}</span>
              <span className="text-xs uppercase tracking-[0.32em] text-base-subtext">
                {new Date(session.createdAt).toLocaleDateString()}
              </span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
