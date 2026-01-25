"use client";

import { useEffect, useMemo, useState } from "react";
import type { AuditTimelineEntry } from "@/app/(app)/app/live/types";
import { cn } from "@/lib/utils";

export type AgentOutcomeTabsProps = {
  timeline: AuditTimelineEntry[];
};

type AgentOutcomeGroup = {
  role: string;
  entries: AuditTimelineEntry[];
};

export function AgentOutcomeTabs({ timeline }: AgentOutcomeTabsProps) {
  const grouped = useMemo<AgentOutcomeGroup[]>(() => {
    const map = new Map<string, AuditTimelineEntry[]>();
    timeline.forEach((entry) => {
      const key = entry.agent_role?.trim() || entry.task || "General";
      const existing = map.get(key) ?? [];
      existing.push(entry);
      map.set(key, existing);
    });
    return Array.from(map.entries())
      .map(([role, entries]) => ({ role, entries }))
      .sort((a, b) => a.role.localeCompare(b.role));
  }, [timeline]);

  const [activeRole, setActiveRole] = useState<string | null>(null);

  useEffect(() => {
    if (!grouped.length) {
      setActiveRole(null);
      return;
    }
    if (!activeRole || !grouped.some((group) => group.role === activeRole)) {
      setActiveRole(grouped[0].role);
    }
  }, [activeRole, grouped]);

  if (!grouped.length) {
    return (
      <p className="text-sm text-[color:var(--rt-subtext)]">
        Audit data will populate when agents publish their statements.
      </p>
    );
  }

  const activeGroup = grouped.find((group) => group.role === activeRole) ?? grouped[0];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2 overflow-x-auto">
        {grouped.map((group) => {
          const isActive = group.role === activeGroup.role;
          return (
            <button
              key={group.role}
              type="button"
              onClick={() => setActiveRole(group.role)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold tracking-wide transition",
                isActive
                  ? "border-[color:var(--rt-accent-700)] bg-[color:var(--rt-accent-100)] text-[color:var(--rt-accent-600)]"
                  : "border-[color:var(--rt-border)] text-[color:var(--rt-muted)] hover:text-[color:var(--rt-text)]",
              )}
            >
              {group.role}
              <span className="rounded-full bg-[color:var(--rt-surface)] px-2 py-0.5 text-[10px] text-[color:var(--rt-subtext)]">
                {group.entries.length}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-4">
        {activeGroup.entries.map((entry, index) => (
          <article
            key={`${activeGroup.role}-${entry.task}-${index}`}
            className="space-y-3 rounded-xl border px-4 py-3"
            style={{ borderColor: "var(--rt-border)", background: "var(--rt-surface-2)" }}
          >
            <header className="space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--rt-muted)]">
                  {entry.task}
                </p>
                {entry.linked_tool_calls?.length ? (
                  <div className="flex flex-wrap gap-2 text-[11px] text-[color:var(--rt-muted)]">
                    {entry.linked_tool_calls.map((callId) => (
                      <span
                        key={`${entry.task}-tool-${callId}`}
                        className="rounded-full border px-2 py-0.5"
                        style={{ borderColor: "var(--rt-border)" }}
                      >
                        Tool #{callId}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              {entry.headline ? (
                <p className="text-sm font-semibold text-[color:var(--rt-text)]">
                  {entry.headline.replace(/\*\*/g, "")}
                </p>
              ) : null}
              {entry.agent_goal ? (
                <p className="text-xs text-[color:var(--rt-subtext)]">{entry.agent_goal}</p>
              ) : null}
            </header>

            {entry.why?.length ? (
              <div>
                <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--rt-muted)]">Reasons</p>
                <ul className="mt-1 list-disc space-y-1 pl-4 text-sm text-[color:var(--rt-text)]">
                  {entry.why.map((reason, reasonIndex) => (
                    <li key={`${entry.task}-reason-${reasonIndex}`}>{reason.replace(/\*\*/g, "")}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            {entry.excerpt ? (
              <p className="text-sm text-[color:var(--rt-text)]">{entry.excerpt}</p>
            ) : null}

            {entry.citations?.urls?.length ? (
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-[0.28em] text-[color:var(--rt-muted)]">References</p>
                <ul className="space-y-1 text-sm">
                  {entry.citations.urls.map((url) => (
                    <li key={`${entry.task}-${url}`}>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[color:var(--rt-accent-600)] underline-offset-4 hover:underline"
                      >
                        {url}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </div>
  );
}
