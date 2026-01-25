/**
 * Crucible Community Edition
 * Copyright (C) 2025 Roundtable Labs Pty Ltd
 * 
 * Licensed under AGPL-3.0. See LICENSE file for details.
 */

"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useAuth } from "@/components/providers/AuthProvider";
import { apiDelete, apiGet, apiPost, apiPut } from "@/lib/api/client";
import { GlassCard } from "@/components/ui/glass-card";
import { logError } from "@/lib/utils/errorHandler";
import { LazyLoad } from "@/components/ui/LazyLoad";
import { Tooltip } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";

type KnightOrigin = "official" | "workspace"; // Community Edition: marketplace removed
type ModelEntry = {
  id: string;
  display_name: string;
  provider: string;
  api_identifier: string;
};

type Knight = {
  id: string;
  name: string;
  role: string;
  prompt: string | null;
  goal: string;
  backstory: string;
  model: string;
  websearch_enabled: boolean;
  created_at: string;
  author: {
    name: string;
  };
  verified: boolean;
  origin: KnightOrigin;
  // Community Edition: marketplace_listing_id removed
  version?: string | null;
  owner_id?: string | null;
  temperature: number;
  linkedin_profile_url?: string | null;
  seniority_level?: string | null;
  primary_domain?: string | null;
  domain_tags?: string[] | null;
};

type KnightFormValues = {
  name: string;
  role: string;
  goal: string;
  backstory: string;
  prompt: string;
  model: string;
  websearch_enabled: boolean;
  temperature: number;
  verified: boolean;
  authorName: string;
  version?: string | null;
  // Community Edition: marketplaceListingId removed
  seniority_level?: string | null;
  primary_domain?: string | null;
  domain_tags?: string[] | null;
  linkedin_profile_url?: string | null;
};

type KnightCard = {
  knight: Knight;
  modelLabel: string;
};

const ORIGIN_LABEL: Record<KnightOrigin, string> = {
  official: "Official",
  workspace: "Workspace",
};
const DEFAULT_TEMPERATURE = 0.7;
const TEMPERATURE_MIN = 0.0;
const TEMPERATURE_MAX = 2.0;

const roundToTenth = (value: number) => Math.round(value * 10) / 10;

const clampTemperature = (value: number) => {
  if (!Number.isFinite(value)) {
    return DEFAULT_TEMPERATURE;
  }
  const rounded = roundToTenth(value);
  return Math.max(TEMPERATURE_MIN, Math.min(TEMPERATURE_MAX, rounded));
};

const deriveToneTag = (temperature: number) => {
  if (temperature <= 0.4) {
    return "Conservative";
  }
  if (temperature <= 1.0) {
    return "Balanced";
  }
  return "Aggressive";
};


function toFormValues(knight: Knight | undefined, defaultModel: string): KnightFormValues {
  if (!knight) {
    return {
      name: "",
      role: "",
      goal: "",
      backstory: "",
      prompt: "",
      model: defaultModel,
      websearch_enabled: false,
      temperature: DEFAULT_TEMPERATURE,
      verified: true,
      authorName: "",
      version: undefined,
      seniority_level: null,
      primary_domain: null,
      domain_tags: null,
      linkedin_profile_url: null,
    };
  }

  return {
    name: knight.name,
    role: knight.role,
    goal: knight.goal,
    backstory: knight.backstory,
    prompt: knight.prompt ?? "",
    model: knight.model,
    websearch_enabled: knight.websearch_enabled,
    temperature: clampTemperature(knight.temperature),
    verified: knight.verified,
    authorName: knight.author.name,
    version: knight.version ?? "",
    seniority_level: knight.seniority_level ?? null,
    primary_domain: knight.primary_domain ?? null,
    domain_tags: knight.domain_tags ?? null,
    linkedin_profile_url: knight.linkedin_profile_url ?? null,
  };
}

function buildPayload(values: KnightFormValues) {
  return {
    name: values.name.trim() || undefined,
    role: values.role.trim(),
    goal: values.goal.trim(),
    backstory: values.backstory.trim(),
    prompt: values.prompt.trim(),
    model: values.model,
    websearch_enabled: values.websearch_enabled,
    temperature: clampTemperature(values.temperature),
    verified: values.verified,
    seniority_level: values.seniority_level?.trim() || null,
    primary_domain: values.primary_domain?.trim() || null,
    domain_tags: values.domain_tags && values.domain_tags.length > 0 ? values.domain_tags : null,
    linkedin_profile_url: values.linkedin_profile_url?.trim() || null,
    author: {
      name: values.authorName.trim(),
    },
    version: values.version?.trim() || null,
  };
}

type EditorState =
  | { mode: "create" }
  | { mode: "edit"; knight: Knight };

export default function KnightsPage() {
  const { user, token, requireAuth } = useAuth();
  const queryClient = useQueryClient();
  const [briefKnight, setBriefKnight] = useState<Knight | null>(null);
  const [editorState, setEditorState] = useState<EditorState | null>(null);
  const [selectedOrigin, setSelectedOrigin] = useState<KnightOrigin | null>(null);
  const [selectedModels, setSelectedModels] = useState<Set<string>>(new Set());
  const [currentPage, setCurrentPage] = useState(0);
  const ITEMS_PER_PAGE = 10;

  // Prevent page jump on navigation - ensure page starts at top
  useEffect(() => {
    if (typeof window !== "undefined") {
      // Prevent browser scroll restoration
      if ("scrollRestoration" in window.history) {
        window.history.scrollRestoration = "manual";
      }
      // Scroll to top immediately on mount
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  }, []); // Run once on mount

  const officialQuery = useQuery({
    staleTime: 5 * 60 * 1000, // 5 minutes - prevent unnecessary refetches
    queryKey: ["knights", "official"],
    queryFn: () => apiGet<Knight[]>("/knights/official"),
  });

  const mineQuery = useQuery({
    queryKey: ["knights", "mine", user?.id ?? "guest"], // Use user ID instead of token to prevent refetch on auth changes
    queryFn: () => apiGet<Knight[]>("/knights/mine", { token }),
    enabled: !!user?.id, // Only depend on actual user ID, not token or auth status
    staleTime: 5 * 60 * 1000, // 5 minutes - prevent unnecessary refetches
  });

  const modelsQuery = useQuery({
    queryKey: ['models'],
    queryFn: () => apiGet<ModelEntry[]>('/api/models'),
    staleTime: 5 * 60 * 1000, // 5 minutes - models don't change frequently
  });

  const modelOptions = useMemo(() => {
    if (!modelsQuery.data) {
      return [];
    }
    const uniqueMap = new Map<string, ModelEntry>();
    modelsQuery.data.forEach((entry) => {
      if (!uniqueMap.has(entry.id)) {
        uniqueMap.set(entry.id, entry);
      }
    });
    return Array.from(uniqueMap.values()).sort((a, b) => a.display_name.localeCompare(b.display_name));
  }, [modelsQuery.data]);
  const modelLabelMap = useMemo(() => {
    const map: Record<string, string> = {};
    modelOptions.forEach((model) => {
      map[model.id] = model.display_name;
    });
    return map;
  }, [modelOptions]);

  const knights = useMemo(() => {
    const official = officialQuery.data ?? [];
    const workspace = mineQuery.data ?? [];
    // Community Edition: marketplace removed, no filtering needed
    return [...official, ...workspace];
  }, [officialQuery.data, mineQuery.data]);

  const knightCards = useMemo<KnightCard[]>(() => {
    return knights.map((knight) => {
      const modelLabel = modelLabelMap[knight.model] ?? knight.model;
      return {
        knight,
        modelLabel,
      };
    });
  }, [knights, modelLabelMap]);

  const filteredCards = useMemo(() => {
    let filtered = knightCards;

    // Community Edition: marketplace removed, no filtering needed

    // Filter by origin
    if (selectedOrigin) {
      filtered = filtered.filter((card) => card.knight.origin === selectedOrigin);
    }

    // Filter by model
    if (selectedModels.size > 0) {
      filtered = filtered.filter((card) => selectedModels.has(card.knight.model));
    }

    return filtered;
  }, [knightCards, selectedOrigin, selectedModels]);

  const totalPages = Math.ceil(filteredCards.length / ITEMS_PER_PAGE);
  const paginatedCards = useMemo(() => {
    const startIndex = currentPage * ITEMS_PER_PAGE;
    return filteredCards.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredCards, currentPage]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(0);
  }, [selectedOrigin, selectedModels]);

  const latestCreatedAt = useMemo<number | null>(() => {
    if (knights.length === 0) {
      return null;
    }
    return knights.reduce<number | null>((latest, knight) => {
      const timestamp = Date.parse(knight.created_at);
      if (Number.isNaN(timestamp)) {
        return latest;
      }
      if (latest === null) {
        return timestamp;
      }
      return Math.max(latest, timestamp);
    }, null);
  }, [knights]);

  const lastUpdatedLabel = useMemo(() => {
    if (latestCreatedAt === null) {
      return "Waiting for roster";
    }
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(latestCreatedAt));
  }, [latestCreatedAt]);

  const defaultModel = useMemo(() => {
    // Try to find GPT-5.1 first, otherwise fall back to first available model
    const gpt51 = modelOptions.find((option) =>
      option.display_name.toLowerCase().includes("gpt-5.1") ||
      option.display_name.toLowerCase().includes("gpt 5.1") ||
      option.id.toLowerCase().includes("gpt-5.1")
    );
    return gpt51?.id ?? modelOptions[0]?.id ?? "";
  }, [modelOptions]);
  const editorDialogKey =
    editorState?.mode === "edit"
      ? `edit-${editorState.knight.id}`
      : `create-${defaultModel}`;

  const invalidateKnights = () => {
    queryClient.invalidateQueries({ queryKey: ["knights", "official"] }).catch(() => undefined);
    queryClient.invalidateQueries({ queryKey: ["knights", "mine"] }).catch(() => undefined);
  };

  const ensureAuth = async () => {
    try {
      await requireAuth({ reason: "Manage Knights" });
      return true;
    } catch {
      return false;
    }
  };

  const createMutation = useMutation({
    mutationFn: (values: KnightFormValues) => apiPost<Knight>("/knights", { body: buildPayload(values), token }),
    onSuccess: () => {
      invalidateKnights();
      setEditorState(null);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ knight, values }: { knight: Knight; values: KnightFormValues }) =>
      apiPut<Knight>(`/knights/${encodeURIComponent(knight.id)}`, { body: buildPayload(values), token }),
    onSuccess: () => {
      invalidateKnights();
      setEditorState(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (knight: Knight) => apiDelete(`/knights/${encodeURIComponent(knight.id)}`, { token }),
    onSuccess: () => {
      invalidateKnights();
    },
  });

  // Install functionality removed for Community Edition

  const handleCreateRequest = () => {
    void (async () => {
      if (await ensureAuth() && modelOptions.length > 0) {
        setEditorState({ mode: "create" });
      }
    })();
  };

  const handleEditRequest = (knight: Knight) => {
    void (async () => {
      if (await ensureAuth()) {
        setEditorState({ mode: "edit", knight });
      }
    })();
  };

  const isLoading = officialQuery.isLoading || mineQuery.isLoading || modelsQuery.isLoading;
  const isError = officialQuery.isError || mineQuery.isError || modelsQuery.isError;
  const isEmptyState = !isLoading && filteredCards.length === 0;

  // Get unique models from knightCards
  const availableModels = useMemo(() => {
    const modelSet = new Set<string>();
    knightCards.forEach((card) => {
      modelSet.add(card.knight.model);
    });
    return Array.from(modelSet).sort();
  }, [knightCards]);

  // Get model labels for display
  const modelLabels = useMemo(() => {
    const labels: Record<string, string> = {};
    knightCards.forEach((card) => {
      if (!labels[card.knight.model]) {
        labels[card.knight.model] = card.modelLabel;
      }
    });
    return labels;
  }, [knightCards]);

  const handleModelToggle = (modelId: string) => {
    setSelectedModels((prev) => {
      const next = new Set(prev);
      if (next.has(modelId)) {
        next.delete(modelId);
      } else {
        next.add(modelId);
      }
      return next;
    });
  };

  // Install error message removed for Community Edition

  return (
    <div className="container-box space-y-4">
      <header className="flex flex-col gap-6 rounded-3xl border border-gold-500/30 bg-base-panel p-6 shadow-soft lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-base-text flex items-center gap-2">
            Knights Library
            <Tooltip content="Specialized AI experts invited to your session.">
              <HelpCircle className="h-4 w-4 text-base-subtext/60 cursor-help" />
            </Tooltip>
          </h1>
          <div className="text-sm text-base-subtext max-w-3xl">
            Curate your official and workspace{" "}
            <Tooltip content="Specialized AI experts invited to your session.">
              <span className="inline-flex items-center gap-1">
                Knights
                <HelpCircle className="h-3 w-3 text-base-subtext/40 cursor-help" />
              </span>
            </Tooltip>
            . Create custom knights for your debates. Shares the same provenance rails as the Boardroom and Launchpad.
          </div>
        </div>
        <div className="flex flex-wrap gap-3 justify-end">
          <button
            type="button"
            onClick={handleCreateRequest}
            disabled={modelOptions.length === 0 || createMutation.isPending}
            aria-label={createMutation.isPending ? "Creating knight..." : "Create new knight"}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-gold-500 to-gold-600 px-5 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-[#071225] transition hover:from-gold-400 hover:to-gold-500 disabled:cursor-not-allowed disabled:opacity-60 whitespace-nowrap w-[165px]"
          >
            <Plus className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
            Create Knight
          </button>
          {/* Install button removed for Community Edition */}
        </div>
      </header>

      <div className="grid gap-4 lg:grid-cols-[220px_1fr]">
        {/* Sidebar Filters */}
        <aside className="flex flex-col gap-4 lg:sticky lg:top-6">
          <GlassCard variant="elevated" className="p-5 flex flex-col h-[calc(100vh-280px)]">
            <div className="space-y-6 flex-1 overflow-y-auto">
              <div>
                <h2 className="text-sm font-semibold uppercase tracking-[0.32em] text-base-text mb-4">
                  Filters
                </h2>

                {/* Origin Filter */}
                <div className="mb-6">
                  <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.32em] text-base-subtext">
                    Origin
                  </label>
                  <div className="space-y-2.5">
                    <label className="flex items-center gap-2.5 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={selectedOrigin === null}
                        onChange={() => setSelectedOrigin(null)}
                        className="h-4 w-4 rounded border-base-divider bg-base-bg/60 text-gold-500  cursor-pointer"
                      />
                      <span className="text-sm text-base-text group-hover:text-gold-300 transition">
                        All Origins
                      </span>
                    </label>
                    {(["official", "workspace"] as KnightOrigin[]).map((origin) => (
                      <label key={origin} className="flex items-center gap-2.5 cursor-pointer group">
                        <input
                          type="checkbox"
                          checked={selectedOrigin === origin}
                          onChange={() => setSelectedOrigin(origin)}
                          className="h-4 w-4 rounded border-base-divider bg-base-bg/60 text-gold-500  cursor-pointer"
                        />
                        <span className="text-sm text-base-text group-hover:text-gold-300 transition">
                          {ORIGIN_LABEL[origin]}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Model Filter */}
                <div>
                  <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.32em] text-base-subtext">
                    Model
                  </label>
                  <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-2">
                    {availableModels.length > 0 ? (
                      availableModels.map((modelId) => (
                        <label key={modelId} className="flex items-center gap-2.5 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={selectedModels.has(modelId)}
                            onChange={() => handleModelToggle(modelId)}
                            className="h-4 w-4 rounded border-base-divider bg-base-bg/60 text-gold-500  cursor-pointer"
                          />
                          <span className="text-sm text-base-text group-hover:text-gold-300 transition">
                            {modelLabels[modelId] || modelId}
                          </span>
                        </label>
                      ))
                    ) : (
                      <p className="text-xs text-base-subtext/70">No models available</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </aside>

        {/* Main Content - List */}
        <section className="min-w-0 flex flex-col h-[calc(100vh-280px)]">
          {isLoading ? (
            <GlassCard variant="elevated" className="rounded-3xl p-12">
              <div className="flex items-center justify-center">
                <span className="inline-flex items-center gap-3 text-sm text-base-subtext">
                  <Loader2 className="h-4 w-4 animate-spin text-teal-200" aria-hidden="true" />
                  Syncing Knights from the hangar...
                </span>
              </div>
            </GlassCard>
          ) : filteredCards.length > 0 ? (
            <>
              <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                {paginatedCards.map(({ knight, modelLabel }, index) => {
                  const toneLabel = deriveToneTag(knight.temperature);
                  const canDelete = knight.origin !== "official";
                  const cardContent = (
                    <div
                      key={knight.id}
                      className="group w-full rounded-2xl border border-base-divider bg-base-panel p-6 transition hover:border-gold-500/40 hover:bg-gold-500/5"
                    >
                      <button
                        type="button"
                        onClick={() => setBriefKnight(knight)}
                        aria-label={`View details for ${knight.name}`}
                        className="w-full text-left"
                      >
                        <div className="space-y-2">
                          {/* Line 1: Name and Role */}
                          <div className="flex items-center gap-3">
                            <h3 className="text-lg font-semibold text-base-text group-hover:text-gold-300 transition">
                              {knight.name}
                            </h3>
                            <span className="rounded-full border border-base-divider bg-base-bg/60 px-2.5 py-1 text-xs font-medium uppercase tracking-[0.2em] text-base-subtext">
                              {knight.role || "No Role"}
                            </span>
                            {knight.linkedin_profile_url && (
                              <a
                                href={knight.linkedin_profile_url.startsWith("http") ? knight.linkedin_profile_url : `https://${knight.linkedin_profile_url}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="ml-auto inline-flex items-center text-base-subtext hover:text-white transition"
                                aria-label="View LinkedIn profile"
                              >
                                <svg
                                  stroke="currentColor"
                                  fill="currentColor"
                                  strokeWidth="0"
                                  viewBox="0 0 448 512"
                                  className="h-4 w-4 text-[#0a66c2]"
                                  aria-hidden="true"
                                  height="1em"
                                  width="1em"
                                  xmlns="http://www.w3.org/2000/svg"
                                >
                                  <path d="M416 32H31.9C14.3 32 0 46.5 0 64.3v383.4C0 465.5 14.3 480 31.9 480H416c17.6 0 32-14.5 32-32.3V64.3c0-17.8-14.4-32.3-32-32.3zM135.4 416H69V202.2h66.5V416zm-33.2-243c-21.3 0-38.5-17.3-38.5-38.5S80.9 96 102.2 96c21.2 0 38.5 17.3 38.5 38.5 0 21.3-17.2 38.5-38.5 38.5zm282.1 243h-66.4V312c0-24.8-.5-56.7-34.5-56.7-34.6 0-39.9 27-39.9 54.9V416h-66.4V202.2h63.7v29.2h.9c8.9-16.8 30.6-34.5 62.9-34.5 67.2 0 79.7 44.3 79.7 101.9V416z" />
                                </svg>
                              </a>
                            )}
                          </div>

                          {/* Line 2: Goal */}
                          <p className="line-clamp-2 text-sm leading-relaxed text-base-subtext">
                            {knight.goal || "No mission goal specified."}
                          </p>

                          {/* Line 3: Metadata */}
                          <div className="flex flex-wrap items-center gap-3 text-xs text-base-subtext/70">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="text-base-subtext/50">Origin:</span>
                              <span className="font-medium">{ORIGIN_LABEL[knight.origin]}</span>
                            </span>
                            <span className="text-base-subtext/30">•</span>
                            <span className="inline-flex items-center gap-1.5">
                              <span className="text-base-subtext/50">Model:</span>
                              <span className="font-medium">{modelLabel}</span>
                            </span>
                            <span className="text-base-subtext/30">•</span>
                            <span className="inline-flex items-center gap-1.5">
                              <span className="text-base-subtext/50">Tone:</span>
                              <span className="font-medium">{toneLabel}</span>
                            </span>
                            {knight.verified && (
                              <>
                                <span className="text-base-subtext/30">•</span>
                                <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-emerald-300">
                                  Verified
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </button>
                      {canDelete && (
                        <div className="mt-3 flex justify-end border-t border-base-divider pt-3">
                          <button
                            type="button"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (confirm(`Are you sure you want to delete "${knight.name}"? This action cannot be undone.`)) {
                                try {
                                  await deleteMutation.mutateAsync(knight);
                                  // Explicitly invalidate and refetch after successful deletion
                                  invalidateKnights();
                                } catch (error) {
                                  logError(error, "Knights: deleteKnight");
                                }
                              }
                            }}
                            disabled={deleteMutation.isPending}
                            aria-label={deleteMutation.isPending ? `Deleting ${knight.name}...` : `Delete ${knight.name}`}
                            className="inline-flex items-center gap-2 rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:border-rose-500/60 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                            {deleteMutation.isPending ? "Deleting..." : "Delete"}
                          </button>
                        </div>
                      )}
                    </div>
                  );

                  // Lazy load items beyond the first 3 (above the fold)
                  if (index >= 3) {
                    return (
                      <LazyLoad key={knight.id} fallback={<div className="h-32 bg-base-bg/20 rounded-2xl animate-pulse" />}>
                        {cardContent}
                      </LazyLoad>
                    );
                  }

                  return cardContent;
                })}
              </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2 pt-4 mt-4 flex-shrink-0">
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.max(0, prev - 1))}
                    disabled={currentPage === 0}
                    className="flex items-center justify-center rounded-full border border-base-divider p-2 text-base-text transition hover:border-gold-500/40 hover:text-gold-300 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-base-divider disabled:hover:text-base-text"
                    aria-label="Previous page"
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </button>
                  <div className="flex items-center gap-1">
                    {Array.from({ length: totalPages }, (_, i) => i).map((pageNum) => {
                      const isActive = currentPage === pageNum;
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => setCurrentPage(pageNum)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${isActive
                              ? "border-gold-500/50 bg-gold-500/10 text-gold-300"
                              : "border-base-divider text-base-text hover:border-gold-500/40 hover:text-gold-300"
                            }`}
                          aria-label={`Go to page ${pageNum + 1}`}
                          aria-current={isActive ? "page" : undefined}
                        >
                          {pageNum + 1}
                        </button>
                      );
                    })}
                  </div>
                  <button
                    type="button"
                    onClick={() => setCurrentPage((prev) => Math.min(totalPages - 1, prev + 1))}
                    disabled={currentPage >= totalPages - 1}
                    className="flex items-center justify-center rounded-full border border-base-divider p-2 text-base-text transition hover:border-gold-500/40 hover:text-gold-300 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-base-divider disabled:hover:text-base-text"
                    aria-label="Next page"
                  >
                    <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              )}
            </>
          ) : (
            <GlassCard variant="elevated" className="rounded-3xl p-12">
              <div className="text-center">
                <p className="text-base font-medium text-base-text mb-2">
                  {(selectedOrigin !== null || selectedModels.size > 0) ? "No experts match your filters" : "You don't have any custom experts yet. Create one to get started."}
                </p>
                <p className="text-sm text-base-subtext">
                  {(selectedOrigin !== null || selectedModels.size > 0)
                    ? "Try adjusting your filters to see more results."
                    : "Create your first expert to see it here."}
                </p>
              </div>
            </GlassCard>
          )}
        </section>
      </div>

      {isError ? (
        <div className="rounded-[28px] border border-rose-500/40 px-6 py-4 text-sm text-rose-100 shadow-[0_24px_80px_rgba(26,4,12,0.6)]">
          We're having trouble connecting to the AI experts right now. Please try again in a minute.
        </div>
      ) : null}

      {modelOptions.length === 0 && !modelsQuery.isLoading ? (
        <div className="rounded-[28px] border border-slate-200/20 px-6 py-4 text-sm text-slate-200/85 shadow-[0_25px_70px_rgba(3,6,16,0.6)]">
          Model catalog is empty. Register at least one LLM in <span className="font-semibold">Settings &rarr; Models</span> before creating Knights.
        </div>
      ) : null}

      <KnightEditorDialog
        key={editorDialogKey}
        state={editorState}
        modelOptions={modelOptions}
        defaultModel={defaultModel}
        currentUserName={user?.name ?? user?.email ?? "Workspace Contributor"}
        onOpenChange={(open) => {
          if (!open) {
            setEditorState(null);
          }
        }}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
        onSubmit={(values) => {
          const isOfficialFork = editorState?.mode === "edit" && editorState.knight.origin === "official";
          if (isOfficialFork) {
            createMutation.mutate({
              ...values,
              verified: false,
            });
            return;
          }
          if (editorState?.mode === "edit" && editorState.knight) {
            updateMutation.mutate({ knight: editorState.knight, values });
          } else {
            createMutation.mutate(values);
          }
        }}
      />
      {/* InstallKnightDialog removed for Community Edition */}
      <KnightBriefDialog
        knight={briefKnight}
        modelLabelMap={modelLabelMap}
        onClose={() => setBriefKnight(null)}
      />
      <style jsx global>{`
        .knight-spotlight {
          position: absolute;
          width: 420px;
          height: 420px;
          border-radius: 9999px;
          filter: blur(70px);
          opacity: 0.35;
          pointer-events: none;
        }
        .knight-spotlight--gold {
          top: 80px;
          left: 50%;
          transform: translate(-50%, 0);
          background: radial-gradient(circle, rgba(242, 194, 79, 0.28), transparent 70%);
          animation: knight-spotlight-gold 22s ease-in-out infinite alternate;
        }
        .knight-spotlight--teal {
          top: 260px;
          left: 20%;
          background: radial-gradient(circle, rgba(71, 209, 193, 0.25), transparent 70%);
          animation: knight-spotlight-teal 26s ease-in-out infinite alternate;
        }
        @keyframes knight-spotlight-gold {
          0% {
            transform: translate(-50%, 0) scale(1);
            opacity: 0.5;
          }
          50% {
            transform: translate(-46%, -25px) scale(1.08);
            opacity: 0.75;
          }
          100% {
            transform: translate(-54%, 18px) scale(0.95);
            opacity: 0.5;
          }
        }
        @keyframes knight-spotlight-teal {
          0% {
            transform: translate(0, 0) scale(1);
            opacity: 0.5;
          }
          50% {
            transform: translate(35px, -20px) scale(1.06);
            opacity: 0.75;
          }
          100% {
            transform: translate(-30px, 30px) scale(0.92);
            opacity: 0.5;
          }
        }
      `}</style>
    </div>
  );

}

function KnightEditorDialog({
  state,
  modelOptions,
  defaultModel,
  currentUserName,
  onOpenChange,
  onSubmit,
  isSubmitting,
}: {
  state: EditorState | null;
  modelOptions: ModelEntry[];
  defaultModel: string;
  currentUserName?: string | null;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: KnightFormValues) => void;
  isSubmitting: boolean;
}) {
  const open = Boolean(state);
  const hasModels = modelOptions.length > 0;
  const [isTechnicalExpanded, setIsTechnicalExpanded] = useState(true);
  const [domainTagsInput, setDomainTagsInput] = useState("");
  const buildSeedValues = () => {
    const base = toFormValues(state?.mode === "edit" ? state.knight : undefined, defaultModel);
    if (state?.mode === "edit" && state.knight.origin === "official") {
      return {
        ...base,
        authorName: currentUserName ?? base.authorName,
        verified: false,
      };
    }
    // Auto-fill author name from current user when creating
    if (state?.mode !== "edit" && currentUserName) {
      return {
        ...base,
        authorName: currentUserName,
      };
    }
    return base;
  };
  const [formValues, setFormValues] = useState<KnightFormValues>(buildSeedValues);
  useEffect(() => {
    const newValues = buildSeedValues();
    setFormValues(newValues);
    setDomainTagsInput(newValues.domain_tags?.join(", ") || "");
  }, [state, defaultModel, currentUserName]);

  const handleChange = <K extends keyof KnightFormValues>(key: K, value: KnightFormValues[K]) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formValues.model) {
      return;
    }
    onSubmit(formValues);
  };

  const title = state?.mode === "edit" ? `Edit ${state.knight.name}` : "Create Knight";
  const activeModel = useMemo(
    () => modelOptions.find((option) => option.id === formValues.model),
    [modelOptions, formValues.model],
  );
  const toneLabel = deriveToneTag(formValues.temperature);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[98] bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[99] w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 rounded-[32px] border border-teal-200/40 bg-[rgba(6,16,28,0.96)] p-6 text-sm text-slate-200/80 shadow-[0_45px_120px_rgba(2,10,26,0.85)] sm:p-8">
          <form onSubmit={handleSubmit} className="flex max-h-[90vh] flex-col">
            <header className="flex flex-wrap items-start justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <Dialog.Title className="text-2xl font-semibold text-white">{title}</Dialog.Title>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-200/70">
                  {state?.mode === "edit"
                    ? "Retune this Knight's story, prompt, and guardrails so it feels at home in the boardroom."
                    : "Draft the identity, mission, and operating guardrails for a new Knight before it joins the boardroom."}
                </p>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-full border border-slate-200/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-slate-200 transition hover:border-slate-200/55 hover:text-white"
                >
                  Close
                </button>
              </Dialog.Close>
            </header>

            <div className="flex flex-1 flex-col gap-6 overflow-y-auto p-2 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-200/30 [&::-webkit-scrollbar-thumb]:rounded-full [scrollbar-width:thin]">
              {/* Identity Section */}
              <GlassCard variant="default" className="p-5">
                <p className="text-xs uppercase tracking-[0.32em] text-white mb-4">Identity</p>
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2 text-sm text-white">
                      <span className="text-xs font-medium text-slate-200/80">Name / Alias</span>
                      <input
                        className="w-full rounded-2xl border border-slate-200/25 bg-[rgba(6,12,24,0.88)] px-4 py-3 text-sm text-white outline-none transition "
                        value={formValues.name}
                        onChange={(event) => handleChange("name", event.target.value)}
                        placeholder="Board Moderator"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-white">
                      <span className="text-xs font-medium text-slate-200/80">Role</span>
                      <input
                        className="w-full rounded-2xl border border-slate-200/25 bg-[rgba(6,12,24,0.88)] px-4 py-3 text-sm text-white outline-none transition "
                        value={formValues.role}
                        onChange={(event) => handleChange("role", event.target.value)}
                        required
                      />
                    </label>
                  </div>
                </div>
              </GlassCard>

              {/* Profile Section */}
              <GlassCard variant="default" className="p-5">
                <p className="text-xs uppercase tracking-[0.32em] text-white mb-4">Profile</p>
                <div className="space-y-4">
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="space-y-2 text-sm text-white">
                      <span className="text-xs font-medium text-slate-200/80">Seniority Level</span>
                      <input
                        className="w-full rounded-2xl border border-slate-200/25 bg-[rgba(6,12,24,0.88)] px-4 py-3 text-sm text-white outline-none transition "
                        value={formValues.seniority_level || ""}
                        onChange={(event) => handleChange("seniority_level", event.target.value || null)}
                        placeholder="e.g., Senior, Principal, Director"
                      />
                    </label>
                    <label className="space-y-2 text-sm text-white">
                      <span className="text-xs font-medium text-slate-200/80">Primary Domain</span>
                      <input
                        className="w-full rounded-2xl border border-slate-200/25 bg-[rgba(6,12,24,0.88)] px-4 py-3 text-sm text-white outline-none transition "
                        value={formValues.primary_domain || ""}
                        onChange={(event) => handleChange("primary_domain", event.target.value || null)}
                        placeholder="e.g., Finance, Technology, Strategy"
                      />
                    </label>
                  </div>
                  <div className="space-y-2 text-sm text-white">
                    <span className="text-xs font-medium text-slate-200/80">Domain Tags</span>
                    <div className="flex flex-wrap gap-2 rounded-2xl border border-slate-200/25 bg-[rgba(6,12,24,0.88)] p-2 min-h-[48px] items-center">
                      {formValues.domain_tags && formValues.domain_tags.length > 0 && (
                        <>
                          {formValues.domain_tags.map((tag, index) => (
                            <span
                              key={index}
                              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/20 bg-[rgba(8,20,36,0.6)] backdrop-blur px-3 py-1.5 text-xs font-medium text-white"
                            >
                              {tag}
                              <button
                                type="button"
                                onClick={() => {
                                  const newTags = formValues.domain_tags?.filter((_, i) => i !== index) || [];
                                  handleChange("domain_tags", newTags.length > 0 ? newTags : null);
                                  setDomainTagsInput(newTags.join(", "));
                                }}
                                className="rounded-full p-0.5 hover:bg-slate-200/20 transition"
                                aria-label={`Remove ${tag}`}
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </>
                      )}
                      <input
                        className="flex-1 min-w-[120px] bg-transparent px-2 py-1 text-sm text-white outline-none placeholder:text-slate-400/50"
                        value={domainTagsInput}
                        onChange={(event) => {
                          setDomainTagsInput(event.target.value);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === ",") {
                            event.preventDefault();
                            const inputValue = event.currentTarget.value.trim();
                            if (inputValue) {
                              const newTag = inputValue.replace(/,/g, "").trim();
                              if (newTag && !formValues.domain_tags?.includes(newTag)) {
                                const updatedTags = [...(formValues.domain_tags || []), newTag];
                                handleChange("domain_tags", updatedTags);
                                setDomainTagsInput("");
                              } else {
                                setDomainTagsInput("");
                              }
                            }
                          } else if (event.key === "Backspace" && domainTagsInput === "" && formValues.domain_tags && formValues.domain_tags.length > 0) {
                            // Remove last tag when backspace is pressed on empty input
                            const newTags = formValues.domain_tags.slice(0, -1);
                            handleChange("domain_tags", newTags.length > 0 ? newTags : null);
                          }
                        }}
                        onBlur={() => {
                          // On blur, if there's text, add it as a tag
                          const inputValue = domainTagsInput.trim();
                          if (inputValue) {
                            const newTag = inputValue.replace(/,/g, "").trim();
                            if (newTag && !formValues.domain_tags?.includes(newTag)) {
                              const updatedTags = [...(formValues.domain_tags || []), newTag];
                              handleChange("domain_tags", updatedTags);
                            }
                            setDomainTagsInput("");
                          }
                        }}
                        placeholder={formValues.domain_tags && formValues.domain_tags.length > 0 ? "Add another tag..." : "Type and press Enter or comma"}
                      />
                    </div>
                  </div>
                </div>
              </GlassCard>

              {/* Narrative Section */}
              <GlassCard variant="elevated" className="p-5">
                <p className="text-xs uppercase tracking-[0.32em] text-white mb-4">Narrative</p>
                <div className="space-y-4">
                  <label className="space-y-2 text-sm text-white">
                    <span className="text-xs font-medium text-slate-200/80">Mission Goal</span>
                    <textarea
                      className="min-h-[88px] w-full rounded-2xl border border-slate-200/20 bg-[rgba(5,14,28,0.9)] px-4 py-3 text-sm text-white outline-none transition "
                      value={formValues.goal}
                      onChange={(event) => handleChange("goal", event.target.value)}
                      required
                    />
                  </label>
                  <label className="space-y-2 text-sm text-white">
                    <span className="text-xs font-medium text-slate-200/80">Backstory</span>
                    <textarea
                      className="min-h-[120px] w-full rounded-2xl border border-slate-200/20 bg-[rgba(5,14,28,0.9)] px-4 py-3 text-sm text-white outline-none transition "
                      value={formValues.backstory}
                      onChange={(event) => handleChange("backstory", event.target.value)}
                      required
                    />
                  </label>
                  <label className="space-y-2 text-sm text-white">
                    <span className="text-xs font-medium text-slate-200/80">Prompt</span>
                    <textarea
                      className="min-h-[140px] w-full rounded-2xl border border-slate-200/20 bg-[rgba(5,14,28,0.9)] px-4 py-3 text-sm text-white outline-none transition "
                      value={formValues.prompt}
                      onChange={(event) => handleChange("prompt", event.target.value)}
                      required
                    />
                  </label>
                </div>
              </GlassCard>

              {/* Technical Settings Section */}
              <GlassCard variant="default" className="p-5 !border-gold-500/40">
                <button
                  type="button"
                  onClick={() => setIsTechnicalExpanded(!isTechnicalExpanded)}
                  aria-label={isTechnicalExpanded ? "Collapse technical settings" : "Expand technical settings"}
                  aria-expanded={isTechnicalExpanded}
                  className="flex w-full items-center justify-between text-left"
                >
                  <p className="text-xs uppercase tracking-[0.32em] text-gold-300">Technical Settings</p>
                  {isTechnicalExpanded ? (
                    <ChevronUp className="h-4 w-4 text-gold-400/60 transition-transform" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gold-400/60 transition-transform" aria-hidden="true" />
                  )}
                </button>
                {isTechnicalExpanded && (
                  <div className="space-y-4 transition-all">
                    <label className="space-y-2 text-sm text-white">
                      <span className="text-xs font-medium text-slate-200/80">Model</span>
                      <select
                        value={formValues.model}
                        onChange={(event) => handleChange("model", event.target.value)}
                        className="w-full rounded-2xl border border-slate-200/25 bg-[rgba(6,12,24,0.88)] px-4 py-3 text-sm text-white outline-none transition"
                        disabled={!hasModels}
                        required
                      >
                        {modelOptions.map((option) => {
                          const providerLabel = option.provider.charAt(0).toUpperCase() + option.provider.slice(1);
                          return (
                            <option key={option.id} value={option.id}>
                              {option.display_name} &middot; {providerLabel}
                            </option>
                          );
                        })}
                      </select>
                      {!hasModels ? (
                        <p className="text-xs text-amber-300 mt-2">No models available. Seed the model catalog first.</p>
                      ) : null}
                    </label>
                    <div className="border-t border-white/10 pt-4">
                      <div>
                        <p className="text-xs font-medium text-slate-200/80 mb-3">Tone Control</p>
                        <div className="space-y-3">
                          <div className="flex items-center gap-3">
                            <input
                              type="range"
                              min={TEMPERATURE_MIN}
                              max={TEMPERATURE_MAX}
                              step={0.1}
                              value={formValues.temperature}
                              onChange={(event) => handleChange("temperature", clampTemperature(Number(event.target.value)))}
                              className="h-1 flex-1 cursor-pointer appearance-none rounded-full bg-slate-200/20 accent-[#47d1c1]"
                              aria-label="Temperature slider"
                            />
                            <input
                              type="number"
                              min={TEMPERATURE_MIN}
                              max={TEMPERATURE_MAX}
                              step={0.1}
                              inputMode="decimal"
                              className="w-20 rounded-2xl border border-slate-200/25 bg-[rgba(6,12,24,0.88)] px-3 py-2 text-sm text-white outline-none transition focus:border-gold-500/50 focus:ring-1 focus:ring-gold-500/30"
                              value={formValues.temperature}
                              onChange={(event) => {
                                const numValue = Number(event.target.value);
                                if (!isNaN(numValue)) {
                                  handleChange("temperature", clampTemperature(numValue));
                                }
                              }}
                              aria-label="Temperature value"
                            />
                            <span className="text-[10px] uppercase tracking-[0.32em] text-slate-200/60 w-24">{toneLabel}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="border-t border-white/10 pt-4">
                      <label className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.28em] text-slate-200/70">
                        <span>Web Search</span>
                        <input
                          type="checkbox"
                          checked={formValues.websearch_enabled}
                          onChange={(event) => handleChange("websearch_enabled", event.target.checked)}
                          className="h-5 w-5 rounded border border-slate-200/40 bg-[rgba(4,12,24,0.9)] text-[#47d1c1]"
                        />
                      </label>
                      <p className="mt-2 text-[0.8rem] text-slate-200/60">Allow this Knight to pull live context during missions.</p>
                    </div>
                  </div>
                )}
              </GlassCard>
            </div>

            <footer className="flex flex-wrap justify-end gap-3 border-t border-white/10 pt-4 text-xs uppercase tracking-[0.26em]">
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="rounded-full border border-slate-200/35 px-4 py-2 text-slate-200 transition hover:border-slate-200/55 hover:text-white"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <button
                type="submit"
                className="inline-flex items-center rounded-full bg-gradient-to-r from-gold-500 to-gold-600 px-5 py-2 text-[#071225] font-semibold uppercase tracking-[0.3em] text-xs transition hover:from-gold-400 hover:to-gold-500 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={isSubmitting || !formValues.model || !hasModels}
              >
                {isSubmitting ? "Saving..." : "Save Knight"}
              </button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function KnightBriefDialog({
  knight,
  modelLabelMap,
  onClose
}: {
  knight: Knight | null;
  modelLabelMap: Record<string, string>;
  onClose: () => void;
}) {
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const createdAtLabel = knight ? new Date(knight.created_at).toLocaleString() : "";
  const toneLabel = knight ? deriveToneTag(knight.temperature) : "";
  const modelLabel = knight ? (modelLabelMap[knight.model] ?? knight.model) : "";

  return (
    <Dialog.Root open={Boolean(knight)} onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[98] bg-black/70 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[99] w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 rounded-[32px] border border-teal-200/40 bg-[rgba(6,16,28,0.96)] p-6 text-sm text-slate-200/80 shadow-[0_40px_120px_rgba(2,10,26,0.85)] sm:p-8">
          {knight ? (
            <div className="flex max-h-[90vh] overflow-auto flex-col [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-slate-200/30 [&::-webkit-scrollbar-thumb]:rounded-full [scrollbar-width:thin]">
              <header className="border-b border-white/10 pb-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <p className="text-xs uppercase tracking-[0.32em] text-teal-200/70">{ORIGIN_LABEL[knight.origin]}</p>
                    <Dialog.Title className="mt-3 text-2xl font-semibold text-white">{knight.name}</Dialog.Title>
                    <p className="mt-1 text-base text-slate-200/80">{knight.role}</p>
                    {knight.linkedin_profile_url && (
                      <a
                        href={knight.linkedin_profile_url.startsWith("http") ? knight.linkedin_profile_url : `https://${knight.linkedin_profile_url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-2 bg-base-bg/60 px-3 py-1.5 text-xs font-medium text-base-text transition hover:border-blue-500/50 hover:bg-blue-500/10 hover:text-blue-400"
                      >
                        <svg
                          className="h-4 w-4"
                          fill="currentColor"
                          viewBox="0 0 448 512"
                          aria-hidden="true"
                        >
                          <path d="M416 32H31.9C14.3 32 0 46.5 0 64.3v383.4C0 465.5 14.3 480 31.9 480H416c17.6 0 32-14.5 32-32.3V64.3c0-17.8-14.4-32.3-32-32.3zM135.4 416H69V202.2h66.5V416zm-33.2-243c-21.3 0-38.5-17.3-38.5-38.5S80.9 96 102.2 96c21.2 0 38.5 17.3 38.5 38.5 0 21.3-17.2 38.5-38.5 38.5zm282.1 243h-66.4V312c0-24.8-.5-56.7-34.5-56.7-34.6 0-39.9 27-39.9 54.9V416h-66.4V202.2h63.7v29.2h.9c8.9-16.8 30.6-34.5 62.9-34.5 67.2 0 79.7 44.3 79.7 101.9V416z" />
                        </svg>
                        View LinkedIn Profile
                      </a>
                    )}
                  </div>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      aria-label="Close knight details"
                      className="rounded-full border border-slate-200/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-slate-200 transition hover:border-slate-200/55 hover:text-white"
                    >
                      Close
                    </button>
                  </Dialog.Close>
                </div>
              </header>

              <div className="flex flex-1 min-h-0 flex-col gap-6 py-6">
                {/* Profile Badge Row */}
                {(knight.seniority_level || knight.primary_domain || (knight.domain_tags && knight.domain_tags.length > 0)) && (
                  <div className="flex flex-wrap gap-2">
                    {knight.seniority_level && (
                      <span className="rounded-full border border-slate-200/20 bg-[rgba(8,20,36,0.6)] backdrop-blur px-3 py-1.5 text-xs font-medium text-white">
                        {knight.seniority_level}
                      </span>
                    )}
                    {knight.primary_domain && (
                      <span className="rounded-full border border-slate-200/20 bg-[rgba(8,20,36,0.6)] backdrop-blur px-3 py-1.5 text-xs font-medium text-white">
                        {knight.primary_domain}
                      </span>
                    )}
                    {knight.domain_tags && knight.domain_tags.length > 0 && (
                      <>
                        {knight.domain_tags.map((tag, index) => (
                          <span
                            key={index}
                            className="rounded-full border border-slate-200/20 bg-[rgba(8,20,36,0.6)] backdrop-blur px-3 py-1.5 text-xs font-medium text-white"
                          >
                            {tag}
                          </span>
                        ))}
                      </>
                    )}
                  </div>
                )}

                {/* Mission Goal - Full Width, Elevated */}
                <GlassCard variant="elevated" className="p-5">
                  <p className="text-xs uppercase tracking-[0.32em] text-slate-200/60 mb-3">Mission Goal</p>
                  <p className="whitespace-pre-line text-base text-white leading-relaxed">{knight.goal || "Not documented."}</p>
                </GlassCard>

                {/* Two-Column Grid: Backstory + Technical Details */}
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Left Column - Backstory */}
                  <GlassCard variant="default" className="p-5">
                    <p className="text-xs uppercase tracking-[0.32em] text-slate-200/60 mb-3">Backstory</p>
                    <p className="whitespace-pre-line text-sm leading-relaxed">{knight.backstory || "No backstory provided."}</p>
                  </GlassCard>

                  {/* Right Column - Technical Details */}
                  <GlassCard variant="default" className="p-5">
                    <p className="text-xs uppercase tracking-[0.32em] text-slate-200/60 mb-4">Technical Details</p>
                    <div className="space-y-3 text-sm text-slate-200/70">
                      <div className="flex items-center justify-between">
                        <span>Model</span>
                        <span className="text-white font-medium">{modelLabel}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Tone</span>
                        <span className="text-white font-medium">{toneLabel}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>Temperature</span>
                        <span className="text-white font-medium">{roundToTenth(knight.temperature).toFixed(1)}</span>
                      </div>
                      {knight.version && (
                        <div className="flex items-center justify-between">
                          <span>Version</span>
                          <span className="text-white font-medium">{knight.version}</span>
                        </div>
                      )}
                    </div>
                  </GlassCard>
                </div>

                {/* Collapsible Prompt Section */}
                <div className="rounded-[28px] border border-gold-500/40 bg-[rgba(8,20,36,0.72)] shadow-[0_28px_70px_rgba(5,12,26,0.35)] backdrop-blur p-5">
                  <button
                    type="button"
                    onClick={() => setIsPromptExpanded(!isPromptExpanded)}
                    aria-label={isPromptExpanded ? "Collapse prompt" : "Expand prompt"}
                    aria-expanded={isPromptExpanded}
                    className="flex w-full items-center justify-between text-left"
                  >
                    <p className="text-xs uppercase tracking-[0.32em] text-gold-400">Prompt</p>
                    {isPromptExpanded ? (
                      <ChevronUp className="h-4 w-4 text-gold-400/60 transition-transform" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-gold-400/60 transition-transform" aria-hidden="true" />
                    )}
                  </button>
                  {isPromptExpanded && (
                    <div className="mt-4 max-h-64 overflow-y-auto rounded-xl border border-slate-200/15 bg-[rgba(6,12,24,0.8)] p-4 transition-all">
                      <p className="whitespace-pre-line text-sm text-slate-100 leading-relaxed">{knight.prompt ?? "Prompt not provided."}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// InstallKnightDialog component removed for Community Edition








