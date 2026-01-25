import { formatCurrency } from "@/lib/utils";
import { Breadcrumbs } from "@/components/navigation/Breadcrumbs";
import { DecisionBriefTooltip, RoundTooltip, ConvergenceTooltip } from "./TooltipWrapper";

type PageProps = {
  params: Promise<{ id: string }>;
  // Explicitly handle searchParams to prevent serialization errors
  // If searchParams is needed in the future, unwrap it with await in server components
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata = {
  title: "Decision Brief · Crucible",
};

const SUMMARY_POINTS = [
  "Launch in Singapore under the VCC regime to align with LP mix.",
  "Secure dual counsel to monitor AUSTRAC enforcement risk.",
  "Trigger re-evaluation if Australian LPs exceed 30%.",
];

const NEXT_ACTIONS = [
  { owner: "Chair", action: "Engage Singapore counsel for MAS pre-filing." },
  { owner: "Risk Knight", action: "Draft quarterly compliance audit plan." },
  {
    owner: "Moderator",
    action: "Share Decision Brief with investors by Friday.",
  },
];

export default async function DecisionBrief({ params, searchParams: _searchParams }: PageProps) {
  const { id } = await params;

  return (
    <div className="container-box space-y-8">
      <Breadcrumbs
        items={[
          { label: "Decision Log", href: "/app/sessions" },
          { label: `Session ${id.slice(0, 8)}...`, href: `/app/sessions/${id}` },
          { label: "Decision Brief", href: `/app/sessions/${id}/brief` },
        ]}
      />
      <header className="flex flex-col gap-3 rounded-3xl border border-base-divider bg-base-panel p-6 shadow-soft md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-base-text flex items-center gap-2">
            Decision Brief
            <DecisionBriefTooltip />
          </h1>
          <div className="text-sm text-base-subtext">
            Session {id} · Generated automatically after{" "}
            <span className="inline-flex items-center gap-1">
              Round 3
              <RoundTooltip />
            </span>{" "}
            <span className="inline-flex items-center gap-1">
              convergence
              <ConvergenceTooltip />
            </span>
            .
          </div>
        </div>
        <button className="rounded-full border border-navy-900/40 px-5 py-3 text-xs font-semibold uppercase tracking-[0.28em] text-base-text transition hover:border-navy-900">
          Export PDF (Playwright)
        </button>
      </header>

      <section className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <article className="space-y-6 rounded-3xl border border-base-divider bg-base-panel p-6 shadow-soft">
          <div>
            <h2 className="text-lg font-semibold text-base-text">
              Recommendation
            </h2>
            <p className="mt-2 text-sm text-base-subtext">
              Launch in Singapore with mitigation plan for Australian marketing
              exposure. Maintain Cayman feeder for legacy investors.
            </p>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.28em] text-gold-text">
              Why this matters
            </h3>
            <ul className="mt-3 space-y-2 text-sm text-base-subtext">
              {SUMMARY_POINTS.map((point) => (
                <li
                  key={point}
                  className="rounded-2xl bg-base-bg/80 px-4 py-3 leading-relaxed"
                >
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.28em] text-gold-text">
              Dissent snapshot
            </h3>
            <p className="mt-2 text-sm text-base-subtext">
              Growth Knight prefers Australia for domestic distribution
              advantages. Revisit if AU LP concentration exceeds trigger.
            </p>
          </div>
        </article>

        <aside className="space-y-6 rounded-3xl border border-base-divider bg-base-panel p-6 shadow-soft">
          <div>
            <h2 className="text-lg font-semibold text-base-text">
              Key metrics
            </h2>
            <ul className="mt-3 space-y-2 text-sm text-base-subtext">
              <li className="flex items-center justify-between rounded-xl bg-steel-100 px-4 py-3">
                <span>Confidence</span>
                <strong className="text-base-text">84%</strong>
              </li>
              <li className="flex items-center justify-between rounded-xl bg-steel-100 px-4 py-3">
                <span>Sessions this month</span>
                <strong className="text-base-text">4</strong>
              </li>
              <li className="flex items-center justify-between rounded-xl bg-steel-100 px-4 py-3">
                <span>Spend</span>
                <strong className="text-base-text">
                  {formatCurrency(4)}
                </strong>
              </li>
            </ul>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-base-text">Next steps</h2>
            <ul className="mt-3 space-y-2 text-sm text-base-subtext">
              {NEXT_ACTIONS.map((item) => (
                <li
                  key={item.action}
                  className="rounded-xl border border-base-divider bg-base-bg/70 px-4 py-3"
                >
                  <span className="text-xs uppercase tracking-[0.32em] text-base-subtext">
                    {item.owner}
                  </span>
                  <p className="mt-1 text-base-subtext">{item.action}</p>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>
    </div>
  );
}
