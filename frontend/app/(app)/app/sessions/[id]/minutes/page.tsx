import { Breadcrumbs } from "@/components/navigation/Breadcrumbs";

type PageProps = {
  params: Promise<{ id: string }>;
  // Explicitly handle searchParams to prevent serialization errors
  // If searchParams is needed in the future, unwrap it with await in server components
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

const LOG = [
  {
    round: "Round 1 · Positions",
    entries: [
      {
        id: "law_regulatory_v1",
        headline: "Launch in Singapore",
        citation: "MAS Guidelines 2024",
      },
      {
        id: "macro_strategy_v1",
        headline: "Singapore offers faster market access for APAC LPs.",
        citation: "IMF APAC Outlook 2025",
      },
    ],
  },
  {
    round: "Round 2 · Challenges",
    entries: [
      {
        id: "risk_audit_v1",
        headline: "Quantify AUSTRAC enforcement likelihood.",
        citation: "AUSTRAC Annual Report 2024",
      },
    ],
  },
  {
    round: "Round 3 · Convergence",
    entries: [
      {
        id: "moderator",
        headline: "Converged on Singapore with quarterly risk audits.",
        citation: "Moderator summary",
      },
    ],
  },
];

export const metadata = {
  title: "Minutes · Crucible",
};

export default async function MinutesPage({ params, searchParams: _searchParams }: PageProps) {
  const { id } = await params;
  return (
    <div className="container-box space-y-8">
      <Breadcrumbs
        items={[
          { label: "Decision Log", href: "/app/sessions" },
          { label: `Session ${id.slice(0, 8)}...`, href: `/app/sessions/${id}` },
          { label: "Minutes", href: `/app/sessions/${id}/minutes` },
        ]}
      />
      <header className="rounded-3xl border border-base-divider bg-base-panel p-6 shadow-soft">
        <h1 className="text-2xl font-semibold text-base-text">Meeting Minutes</h1>
        <p className="text-sm text-base-subtext">
          Session {id}. Export JSON or PDF to share with your board or
          regulators.
        </p>
      </header>

      <section className="space-y-6">
        {LOG.map((round) => (
          <article
            key={round.round}
            className="rounded-3xl border border-base-divider bg-base-panel p-6 shadow-soft"
          >
            <h2 className="text-lg font-semibold text-base-text">
              {round.round}
            </h2>
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
