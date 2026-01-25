"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/components/providers/AuthProvider";
import { apiGet, apiPost } from "@/lib/api/client";
import { formatCurrency } from "@/lib/utils";

type ApiKnight = {
  id: string;
  name: string;
  role: string;
  prompt: string;
  goal: string;
  backstory: string;
  model: string;
  websearch_enabled: boolean;
  created_at: string;
  author: {
    name: string;
  };
  verified: boolean;
  origin: "official" | "workspace";
  version?: string | null;
  owner_id?: string | null;
  temperature: number;
};

type ModelRecord = {
  id: string;
  display_name: string;
  provider: string;
  api_identifier: string;
};

type SessionPayload = {
  question: string;
  summary?: string;
  knight_ids: string[];
};

type SessionResponse = {
  id: string;
  question: string;
  summary: string | null;
  status: "draft" | "active" | "completed" | "failed";
  created_at: string;
  knight_ids: string[];
};


const SESSION_PRICE = 1;
const DEFAULT_AUTO_SEATED = ["law_regulatory_v1", "macro_strategy_v1", "risk_audit_v1"];

const roundToTenth = (value: number) => Math.round(value * 10) / 10;
const toneFromTemperature = (temperature: number) => {
  if (temperature <= 0.4) return "Guarded";
  if (temperature <= 1.0) return "Balanced";
  return "Bold";
};

export function PreflightForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { user, token, status: authStatus, requireAuth } = useAuth();
  const [question, setQuestion] = useState("Should we launch the fund in Singapore or Australia?");
  const [description, setDescription] = useState("Weigh regulatory complexity and investor sentiment for each jurisdiction.");
  const [selectedKnightIds, setSelectedKnightIds] = useState<string[]>(DEFAULT_AUTO_SEATED);
  const [formError, setFormError] = useState<string | null>(null);
  const [expandedKnightId, setExpandedKnightId] = useState<string | null>(null);
  const hasInitialisedSelection = useRef(false);
  const [catalogAuthPrompted, setCatalogAuthPrompted] = useState(false);

  // Encourage sign-in immediately for busy execs landing on the page.
  const officialKnightsQuery = useQuery({
    queryKey: ["knights", "official"],
    queryFn: () => apiGet<ApiKnight[]>("/knights/official"),
  });

  const installedKnightsQuery = useQuery({
    queryKey: ["knights", "mine", token ?? "guest"],
    queryFn: () => apiGet<ApiKnight[]>("/knights/mine", { token }),
    enabled: authStatus === "ready",
  });

  const modelCatalogQuery = useQuery({
    queryKey: ["models"],
    queryFn: () => apiGet<ModelRecord[]>("/api/models"),
  });
  const hasCatalogModels = (modelCatalogQuery.data?.length ?? 0) > 0;

  const modelLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    modelCatalogQuery.data?.forEach((model) => {
      map[model.id] = model.display_name;
    });
    return map;
  }, [modelCatalogQuery.data]);

  const availableKnights = useMemo(() => {
    const lookup = new Map<string, ApiKnight>();
    officialKnightsQuery.data?.forEach((knight) => {
      lookup.set(knight.id, knight);
    });
    installedKnightsQuery.data?.forEach((knight) => {
      lookup.set(knight.id, knight);
    });
    return Array.from(lookup.values()).sort((a, b) => {
      if (a.origin === b.origin) return a.name.localeCompare(b.name);
      return a.origin === "official" ? -1 : 1;
    });
  }, [officialKnightsQuery.data, installedKnightsQuery.data]);

  // Initialise default selection once knights are loaded.
  useEffect(() => {
    if (hasInitialisedSelection.current || availableKnights.length === 0) {
      return;
    }
    const initial = DEFAULT_AUTO_SEATED.filter((id) => availableKnights.some((knight) => knight.id === id));
    if (initial.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedKnightIds(initial);
    }
    hasInitialisedSelection.current = true;
  }, [availableKnights]);

  useEffect(() => {
    if (!modelCatalogQuery.error || catalogAuthPrompted) {
      return;
    }
    const message = modelCatalogQuery.error instanceof Error ? modelCatalogQuery.error.message : "";
    if (message.includes("(401)")) {
      setCatalogAuthPrompted(true);
      void requireAuth({ reason: "Sign in to load model catalog" }).catch(() => undefined);
    }
  }, [modelCatalogQuery.error, catalogAuthPrompted, requireAuth]);


  const createSessionMutation = useMutation({
    mutationFn: ({ payload, authToken }: { payload: SessionPayload; authToken: string }) =>
      apiPost<SessionResponse>("/sessions", { body: payload, token: authToken }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] }).catch(() => undefined);
    },
  });

  const isLoadingKnights = officialKnightsQuery.isLoading || installedKnightsQuery.isLoading || modelCatalogQuery.isLoading;
  const knightsError = officialKnightsQuery.error ?? installedKnightsQuery.error ?? modelCatalogQuery.error;
  const disableStart = createSessionMutation.isPending || isLoadingKnights || !hasCatalogModels;

  function toggleKnight(id: string) {
    setSelectedKnightIds((prev) => (prev.includes(id) ? prev.filter((knightId) => knightId !== id) : [...prev, id]));
  }

  async function handleStartSession() {
    setFormError(null);
    if (selectedKnightIds.length === 0) {
      setFormError("Select at least one Knight to run a defensible session.");
      return;
    }

    try {
      const authUser = await requireAuth({ reason: "Sign in to start the debate" });
      const payload: SessionPayload = {
        question: question.trim(),
        summary: description.trim() || undefined,
        knight_ids: selectedKnightIds,
      };
      const session = await createSessionMutation.mutateAsync({ payload, authToken: authUser.token });
      router.push(`/app/sessions/${session.id}`);
    } catch (error) {
      console.error("Failed to create session", error);
      setFormError(error instanceof Error ? error.message : "Unable to start the session right now. Try again shortly.");
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.45fr_1fr]">
      <form className="flex flex-col gap-6 rounded-3xl border border-base-divider bg-base-panel p-6 shadow-soft" onSubmit={(event) => {
        event.preventDefault();
        void handleStartSession();
      }}>
        <header className="space-y-2">
          <span className="text-xs font-semibold uppercase tracking-[0.32em] text-gold-500">Preflight</span>
          <h1 className="text-2xl font-semibold text-base-text">Frame the board-level question</h1>
          <p className="text-sm text-base-subtext">
            The orchestrator classifies domains from this context, auto-seats Official Knights, and activates bespoke playbooks per listing.
          </p>
        </header>

        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-base-text">What should the Knights debate?</span>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            rows={3}
            className="rounded-2xl border border-base-divider bg-base-panel px-4 py-3 text-base text-base-text outline-none transition focus:border-info-700 focus:ring-2 focus:ring-info-100"
          />
        </label>

        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium text-base-text">Brief the orchestrator (optional)</span>
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={4}
            className="rounded-2xl border border-base-divider bg-base-panel px-4 py-3 text-base text-base-text outline-none transition focus:border-info-700 focus:ring-2 focus:ring-info-100"
          />
        </label>

        <div className="flex flex-col gap-3 rounded-2xl border border-base-divider/70 bg-base-bg/70 p-4 text-xs uppercase tracking-[0.28em] text-base-subtext">
          <span>Session fee - {formatCurrency(SESSION_PRICE)}</span>
          <span>Median runtime - 2m 40s - Token guardrail active</span>
        </div>

        <button
          type="submit"
          className="mt-2 rounded-full bg-navy-900 px-5 py-3 text-sm font-semibold uppercase tracking-[0.28em] text-base-panel transition hover:bg-navy-800 disabled:cursor-not-allowed disabled:bg-steel-300 disabled:text-base-subtext"
          disabled={disableStart}
        >
          {createSessionMutation.isPending ? "Launching session..." : `Start debate - ${formatCurrency(SESSION_PRICE)}`}
        </button>

        {formError ? (
          <p className="text-sm text-danger-600">{formError}</p>
        ) : null}
      </form>

      <aside className="flex flex-col gap-4 rounded-3xl border border-navy-900/20 bg-base-panel/95 p-6 shadow-soft">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-base-text">Auto-seated Knights</h2>
            <p className="text-sm text-base-subtext">
              Risk and compliance coverage stays pinned; add workspace Knights for extra domain expertise.
            </p>
          </div>
        </div>

        {isLoadingKnights ? (
          <div className="rounded-2xl border border-dashed border-base-divider bg-base-bg/80 p-4 text-sm text-base-subtext">
            Loading Knight roster...
          </div>
        ) : null}

        {knightsError ? (
          <div className="rounded-2xl border border-warning-700/40 bg-warning-100 p-4 text-sm text-warning-900">
            Unable to load Knights. Refresh once connectivity stabilises.
          </div>
        ) : null}

        {!isLoadingKnights && !hasCatalogModels ? (
          <div className="rounded-2xl border border-dashed border-base-divider bg-base-bg/80 p-4 text-xs uppercase tracking-[0.24em] text-base-subtext">
            Model catalog is empty. Seed models before launching a session.
          </div>
        ) : null}

        <ul className="space-y-3 text-sm text-base-subtext">
          {availableKnights.map((knight) => {
            const selected = selectedKnightIds.includes(knight.id);
            const modelLabel = modelLabelMap[knight.model] ?? knight.model;
            const isExpanded = expandedKnightId === knight.id;
            return (
              <li
                key={knight.id}
                className={`rounded-2xl border ${selected ? "border-navy-900/40 bg-base-bg/80" : "border-dashed border-base-divider"} p-4 transition`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-base-text">{knight.name}</h3>
                    <p className="text-xs uppercase tracking-[0.3em] text-base-subtext">
                      {knight.id}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleKnight(knight.id)}
                    className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.28em] transition ${selected ? "border border-danger-700/40 bg-danger-100 text-danger-700" : "border border-info-700/40 bg-info-100 text-info-700"}`}
                  >
                    {selected ? "Remove" : "Add"}
                  </button>
                </div>
                <p className="mt-3 text-sm text-base-subtext line-clamp-3">{knight.prompt}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[0.65rem] uppercase tracking-[0.28em] text-base-subtext/80">
                  <span>
                    {knight.origin === "official"
                      ? "Official Knight"
                      : "Workspace Knight"}
                  </span>
                  <span aria-hidden="true">-</span>
                  <span>Tone - {toneFromTemperature(knight.temperature)}</span>
                  <span aria-hidden="true">-</span>
                  <span>Temp - {roundToTenth(knight.temperature).toFixed(1)}</span>
                  <span aria-hidden="true">-</span>
                  <span>Role - {knight.role}</span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.65rem] uppercase tracking-[0.24em] text-base-subtext/70">
                  <span>Model - {modelLabel}</span>
                  <span aria-hidden="true">-</span>
                  <span>Web search - {knight.websearch_enabled ? "On" : "Off"}</span>
                  <span aria-hidden="true">-</span>
                  <span>Created - {new Date(knight.created_at).toLocaleDateString()}</span>
                </div>
                <p className="mt-2 text-xs text-base-subtext/70">Author: {knight.author.name}</p>
                <button
                  type="button"
                  className="mt-3 inline-flex items-center gap-2 rounded-full border border-base-divider px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-base-text transition hover:border-gold-500 hover:text-gold-500"
                  onClick={() => setExpandedKnightId(isExpanded ? null : knight.id)}
                >
                  {isExpanded ? "Hide details" : "View details"}
                </button>
                {isExpanded ? (
                  <div className="mt-3 space-y-3 rounded-2xl border border-base-divider/40 bg-base-bg/70 p-3 text-xs text-base-subtext/80">
                    <div>
                      <span className="font-semibold uppercase tracking-[0.24em] text-base-text">Prompt</span>
                      <p className="mt-1 whitespace-pre-line text-[0.75rem] leading-relaxed text-base-subtext">{knight.prompt}</p>
                    </div>
                    <div className="grid gap-1 text-[0.7rem] uppercase tracking-[0.2em] text-base-subtext/70">
                      <span>Version - {knight.version ?? "Not set"}</span>
                      <span>Verified - {knight.verified ? "Yes" : "Pending"}</span>
                    </div>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}


