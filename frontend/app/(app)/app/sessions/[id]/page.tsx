import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { DebateStream } from "@/features/sessions/components/DebateStream";
import type { AuditTrail } from "@/app/(app)/app/live/types";
import { getSessionRecordForOwner } from "@/lib/server/debateSessionStore";
import { Breadcrumbs } from "@/components/navigation/Breadcrumbs";
import { DownloadButtons } from "./DownloadButtons";

type PageProps = {
  params: Promise<{ id: string }>;
  // Explicitly handle searchParams to prevent serialization errors
  // If searchParams is needed in the future, unwrap it with await in server components
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

export const metadata = {
  title: "Session room · Crucible",
};

export default async function SessionRoom({ params, searchParams: _searchParams }: PageProps) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/app");
  }
  const record = await getSessionRecordForOwner(session.user.id, id);
  if (!record) {
    notFound();
  }

  // Note: auditTrail is not available in DebateSessionRecord
  // Use auditLogUri to fetch audit data if needed
  const audit: AuditTrail | null = null;
  const timeline: any[] = [];

  return (
    <div className="container-box space-y-6">
      <Breadcrumbs
        items={[
          { label: "Decision Log", href: "/app/sessions" },
          { label: `Session ${id.slice(0, 8)}...`, href: `/app/sessions/${id}` },
        ]}
      />
      <header className="rounded-3xl border border-base-divider bg-base-panel p-6 shadow-soft">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.32em] text-base-subtext">Decision</p>
            <h1 className="text-2xl font-semibold text-base-text">{record.topic ?? "Untitled Session"}</h1>
          </div>
          <div className="text-right text-sm text-base-subtext">
            <p>Status: {record.status === "completed" ? "Completed" : record.status}</p>
            <p>Created: {new Date(record.createdAt).toLocaleString()}</p>
            {record.completedAt ? <p>Closed: {new Date(record.completedAt).toLocaleString()}</p> : null}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-3 text-xs">
          <DownloadButtons 
            sessionId={id} 
            artifactUri={record.artifactUri} 
            auditLogUri={record.auditLogUri}
          />
        </div>
      </header>

      <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <div className="h-[800px]">
          <DebateStream sessionId={id} brief={null} />
        </div>

        <aside className="space-y-4 rounded-3xl border border-base-divider bg-base-panel p-6 shadow-soft">
          <div>
            <h3 className="text-base font-semibold text-base-text">Moderator brief</h3>
            <p className="mt-2 text-sm text-base-subtext">
              Moderator brief will appear here once the session captures context.
            </p>
          </div>
          <div>
            <h3 className="text-base font-semibold text-base-text">Knights seated</h3>
            <ul className="mt-2 space-y-2 text-sm text-base-subtext">
              {record.knightIds.length > 0 ? (
                record.knightIds.map((knightId) => (
                  <li key={knightId} className="rounded-2xl border border-base-divider px-3 py-2">
                    <p className="text-base-text">{knightId}</p>
                  </li>
                ))
              ) : (
                <li className="text-sm text-base-subtext/70">No Knights recorded.</li>
              )}
            </ul>
          </div>
        </aside>
      </section>
    </div>
  );
}
