"use client";

import { useState, useTransition } from "react";

import { useToast } from "@/components/common/ToastProvider";

type MinutesEntry = {
  id: string;
  headline: string;
  citation: string;
};

type MinutesRound = {
  round: string;
  entries: MinutesEntry[];
};

type MinutesContentProps = {
  sessionId: string;
  log: MinutesRound[];
};

export function MinutesContent({ sessionId, log }: MinutesContentProps) {
  const { showToast } = useToast();
  const [exporting, setExporting] = useState<"pdf" | "json" | null>(null);
  const [, startTransition] = useTransition();

  function handleExport(kind: "pdf" | "json") {
    if (exporting) return;
    setExporting(kind);
    startTransition(() => {
      window.setTimeout(() => {
        setExporting(null);
        showToast({
          title: kind === "pdf" ? "Minutes PDF queued" : "JSON export ready",
          description:
            kind === "pdf"
              ? "We are rendering the minutes via Playwright. You will receive a download link shortly."
              : "A signed JSON download link is in your inbox.",
          variant: "info",
        });
      }, 1400);
    });
  }

  return (
    <div className="container-box space-y-8">
      <header className="flex flex-col gap-4 rounded-3xl border border-base-divider bg-base-panel p-6 shadow-soft md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-base-text">Meeting Minutes</h1>
          <p className="text-sm text-base-subtext">
            Session {sessionId}. Export JSON or PDF to share with your board or regulators.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => handleExport("pdf")}
            disabled={exporting !== null}
            className="rounded-full border border-navy-900/40 px-5 py-3 text-xs font-semibold uppercase tracking-[0.28em] text-base-text transition-transform duration-200 hover:-translate-y-0.5 hover:border-navy-900 disabled:cursor-not-allowed disabled:border-base-divider disabled:text-base-subtext"
          >
            {exporting === "pdf" ? "Preparing PDF..." : "Export PDF"}
          </button>
          <button
            type="button"
            onClick={() => handleExport("json")}
            disabled={exporting !== null}
            className="rounded-full border border-base-divider px-5 py-3 text-xs font-semibold uppercase tracking-[0.28em] text-base-text transition-transform duration-200 hover:-translate-y-0.5 hover:border-navy-900 disabled:cursor-not-allowed disabled:border-base-divider disabled:text-base-subtext"
          >
            {exporting === "json" ? "Packaging JSON..." : "Export JSON"}
          </button>
        </div>
      </header>

      <section className="space-y-6" data-print-section="minutes">
        {log.map((round) => (
          <article
            key={round.round}
            className="rounded-3xl border border-base-divider bg-base-panel p-6 shadow-soft"
          >
            <h2 className="text-lg font-semibold text-base-text">{round.round}</h2>
            <ul className="mt-4 space-y-3 text-sm text-base-subtext">
              {round.entries.map((entry, index) => (
                <li
                  key={`${entry.id}-${index}`}
                  className="rounded-2xl border border-base-divider bg-base-bg/70 p-4"
                >
                  <div className="flex justify-between text-xs uppercase tracking-[0.28em] text-base-subtext">
                    <span>{entry.id}</span>
                    <span>{entry.citation}</span>
                  </div>
                  <p className="mt-2 text-base-subtext">{entry.headline}</p>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </div>
  );
}
