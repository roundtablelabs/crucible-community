"use client";

import Link from "next/link";
import {
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Braces,
  ChevronDown,
  Clock3,
  CreditCard,
  FileDown,
  FileText,
  Layers,
  Play,
  ScrollText,
  Search,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { FaFilePdf } from "react-icons/fa";

import { useAuth } from "@/components/providers/AuthProvider";
import { cn } from "@/lib/utils";
import type { DecisionLogSession } from "@/types/decision-log";
import { GlassCard } from "@/components/ui/glass-card";
import { apiDelete, getApiBaseUrl } from "@/lib/api/client";
import { logError, getErrorMessage, getActionableErrorMessage } from "@/lib/utils/errorHandler";
import { useToast } from "@/components/common/ToastProvider";
import { PdfGenerationOverlay } from "@/components/ui/PdfGenerationOverlay";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { InlineLoading } from "@/components/ui/InlineLoading";
import { LazyLoad } from "@/components/ui/LazyLoad";
import { SessionsListSkeleton } from "@/components/ui/skeletons/SessionsListSkeleton";
import { AnimatePresence, motion } from "framer-motion";

// Quality Badge Component
function QualityBadge({ tier, score }: { tier: string; score: number }) {
  const tierColors: Record<string, { bg: string; text: string; border: string }> = {
    excellent: { bg: "bg-green-500/10", text: "text-green-400", border: "border-green-500/30" },
    good: { bg: "bg-blue-500/10", text: "text-blue-400", border: "border-blue-500/30" },
    acceptable: { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-500/30" },
    poor: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/30" },
    critical: { bg: "bg-red-500/10", text: "text-red-400", border: "border-red-500/30" },
  };
  
  const colors = tierColors[tier] || tierColors.acceptable;
  const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
  
  return (
    <div className={cn(
      "px-2 py-1 rounded-md border text-xs font-medium",
      colors.bg,
      colors.text,
      colors.border
    )}>
      {tierLabel} ({(score * 100).toFixed(0)}%)
    </div>
  );
}

const numberFormatter = new Intl.NumberFormat();
const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

type SortOption = "newest" | "oldest" | "topic-asc" | "topic-desc";

type SessionDeletionMessage = {
  type: "session-deleted";
  sessionId: string;
};

// Explicitly type props to prevent Next.js from implicitly passing searchParams
export default function SessionsPage() {
  const { user, status: authStatus, requireAuth, token } = useAuth();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");
  const [sessionToDelete, setSessionToDelete] = useState<DecisionLogSession | null>(null);
  const broadcastChannelRef = useRef<BroadcastChannel | null>(null);
  const selectedIdRef = useRef<string | null>(null);

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

  // Keep ref in sync with state
  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  // Check if BroadcastChannel is available
  const hasBroadcastChannel = typeof window !== "undefined" && "BroadcastChannel" in window;

  // Set up BroadcastChannel for cross-tab synchronization
  useEffect(() => {
    if (!hasBroadcastChannel) {
      return;
    }

    const channel = new BroadcastChannel("roundtable-session-deletions");
    broadcastChannelRef.current = channel;

    // Listen for deletion events from other tabs
    const handleMessage = (event: MessageEvent<SessionDeletionMessage>) => {
      if (event.data.type === "session-deleted") {
        // Clear selection if the deleted session was selected
        if (selectedIdRef.current === event.data.sessionId) {
          setSelectedId(null);
        }
        // Invalidate queries to refetch and sync with server
        queryClient.invalidateQueries({ queryKey: ["decision-log"] });
      }
    };

    const handleError = (event: Event) => {
      if (process.env.NODE_ENV === "development") {
        console.warn("BroadcastChannel error:", event);
      }
    };

    channel.addEventListener("message", handleMessage);
    channel.addEventListener("messageerror", handleError);

    return () => {
      channel.removeEventListener("message", handleMessage);
      channel.removeEventListener("messageerror", handleError);
      channel.close();
      broadcastChannelRef.current = null;
    };
  }, [queryClient, hasBroadcastChannel]);

  const sessionsQuery = useQuery({
    queryKey: ["decision-log", user?.id ?? "guest"], // Use user ID instead of auth status to prevent refetch on auth changes
    queryFn: async () => {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      
      // Include token in Authorization header if available
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      
      const response = await fetch("/api/internal/sessions", {
        cache: "no-store",
        credentials: "include", // Include cookies
        headers,
      });
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error("Unable to load session history.");
        }
        throw new Error("Unable to load session history.");
      }
      return (await response.json()) as DecisionLogSession[];
    },
    enabled: true, // Always enabled
    staleTime: 5 * 60 * 1000, // Increased from 5 seconds to 5 minutes to reduce unnecessary refetches
    refetchOnWindowFocus: true, // Refetch when user switches back to the tab
    // Only poll if BroadcastChannel is not available (as fallback for cross-tab sync)
    refetchInterval: hasBroadcastChannel ? false : 60 * 1000,
  });

  const deleteMutation = useMutation({
    mutationFn: async (session: DecisionLogSession) => {
      const headers: HeadersInit = {
        "Content-Type": "application/json",
      };
      
      // Include token in Authorization header if available
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      
      const response = await fetch(`/api/internal/sessions/${session.dbId}`, {
        method: "DELETE",
        credentials: "include", // Include cookies for Community Edition
        headers,
      });
      if (!response.ok) {
        throw new Error("Failed to delete session");
      }
    },
    onMutate: async (sessionToDelete) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ["decision-log", user?.id ?? "guest"] });

      // Snapshot the previous value
      const previousSessions = queryClient.getQueryData<DecisionLogSession[]>([
        "decision-log",
        user?.id ?? "guest",
      ]);

      // Optimistically update to the new value
      if (previousSessions) {
        queryClient.setQueryData<DecisionLogSession[]>(
          ["decision-log", user?.id ?? "guest"],
          previousSessions.filter((s) => s.id !== sessionToDelete.id)
        );
      }

      // If the deleted session was selected, clear the selection
      if (selectedId === sessionToDelete.id) {
        setSelectedId(null);
      }

      // Return a context object with the snapshotted value
      return { previousSessions };
    },
    onError: (err, sessionToDelete, context) => {
      // If the mutation fails, use the context returned from onMutate to roll back
      if (context?.previousSessions) {
        queryClient.setQueryData<DecisionLogSession[]>(
          ["decision-log", user?.id ?? "guest"],
          context.previousSessions
        );
      }
      const actionableError = getActionableErrorMessage(err);
      showToast({
        title: "Delete Failed",
        description: actionableError.retryable 
          ? `${actionableError.message} You can try deleting again.`
          : actionableError.message,
        variant: "error",
      });
    },
    onSuccess: (_, deletedSession) => {
      // Invalidate to sync with server (as fallback, though optimistic update already handled it)
      queryClient.invalidateQueries({ queryKey: ["decision-log"] });
      
      // Broadcast deletion to other tabs/windows
      if (broadcastChannelRef.current) {
        broadcastChannelRef.current.postMessage({
          type: "session-deleted",
          sessionId: deletedSession.id,
        });
      }
      
      showToast({
        title: "Session Deleted",
        description: "The session has been permanently deleted.",
        variant: "success",
      });
    },
  });

  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);

  const sessions = useMemo(
    () => sessionsQuery.data ?? [],
    [sessionsQuery.data],
  );

  // Filter and sort sessions
  const filteredAndSortedSessions = useMemo(() => {
    let result = [...sessions];


    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase().trim();
      result = result.filter(
        (session) =>
          session.topic?.toLowerCase().includes(query) ||
          session.id.toLowerCase().includes(query) ||
          session.knightIds.some((id) => id.toLowerCase().includes(query)),
      );
    }

    // Apply sorting
    result.sort((a, b) => {
      switch (sortBy) {
        case "newest":
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        case "oldest":
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case "topic-asc":
          return (a.topic ?? "").localeCompare(b.topic ?? "");
        case "topic-desc":
          return (b.topic ?? "").localeCompare(a.topic ?? "");
        default:
          return 0;
      }
    });

    return result;
  }, [sessions, searchQuery, sortBy]);

  // Calculate session duration
  const getSessionDuration = useCallback((session: DecisionLogSession): string | null => {
    if (!session.completedAt) return null;
    const start = new Date(session.createdAt).getTime();
    const end = new Date(session.completedAt).getTime();
    const durationMs = end - start;
    if (durationMs < 0) return null;
    
    const minutes = Math.floor(durationMs / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    return `${minutes}m`;
  }, []);

  const activeSessionId = useMemo(() => {
    if (!sessions.length) {
      return null;
    }
    if (selectedId && sessions.some((session) => session.id === selectedId)) {
      return selectedId;
    }
    return sessions[0].id;
  }, [selectedId, sessions]);

  const selectedSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions],
  );

  const summary = useMemo(() => {
    if (sessions.length === 0) {
      return {
        total: 0,
        lastUpdated: null as string | null,
      };
    }

    let lastUpdated = 0;

    sessions.forEach((session) => {
      const timestamp = new Date(session.updatedAt).getTime();
      if (!Number.isNaN(timestamp)) {
        lastUpdated = Math.max(lastUpdated, timestamp);
      }
    });

    return {
      total: sessions.length,
      lastUpdated: lastUpdated ? new Date(lastUpdated).toISOString() : null,
    };
  }, [sessions]);


  const [currentPage, setCurrentPage] = useState(0);
  const ITEMS_PER_PAGE = 10;

  const totalPages = Math.ceil(filteredAndSortedSessions.length / ITEMS_PER_PAGE);
  const paginatedSessions = useMemo(() => {
    const startIndex = currentPage * ITEMS_PER_PAGE;
    return filteredAndSortedSessions.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredAndSortedSessions, currentPage]);

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(0);
  }, [searchQuery, sortBy]);

  const lastUpdatedLabel = useMemo(() => {
    if (!summary.lastUpdated) {
      return "Awaiting your first session";
    }
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(summary.lastUpdated));
  }, [summary.lastUpdated]);

  return (
    <div className="container-box space-y-4">
      <header className="flex flex-col gap-6 rounded-3xl border border-gold-500/30 bg-base-panel p-6 shadow-soft lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold text-base-text">Decision Log</h1>
          <p className="text-sm text-base-subtext max-w-3xl">
          Every Launchpad intake and live Crucible simulation is archived here with a comprehensive, 
          audit-ready trail. Instantly review outcomes, 
          reopen active threads, or export signed PDF dossiers for stakeholder reporting.
          </p>
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

                {/* Search */}
                <div className="mb-6">
                  <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.32em] text-base-subtext">
                    Search
                  </label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-base-subtext/70" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Topic, ID, Agent..."
                      className="w-full rounded-full border border-base-divider bg-base-bg/60 pl-10 pr-10 py-2.5 text-sm text-base-text placeholder:text-base-subtext/70 focus:border-gold-500/50 focus:outline-none focus:ring-2 focus:ring-gold-500/20"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery("")}
                        aria-label="Clear search"
                        className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full p-1 text-base-subtext/70 transition hover:bg-base-bg/80 hover:text-base-text"
                      >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Sort Filter */}
                <div>
                  <label className="mb-3 block text-xs font-semibold uppercase tracking-[0.32em] text-base-subtext">
                    Sort
                  </label>
                  <div className="space-y-2.5">
                    {([
                      { value: "newest" as SortOption, label: "Newest first" },
                      { value: "oldest" as SortOption, label: "Oldest first" },
                      { value: "topic-asc" as SortOption, label: "Topic A-Z" },
                      { value: "topic-desc" as SortOption, label: "Topic Z-A" },
                    ]).map((option) => (
                      <label key={option.value} className="flex items-center gap-2.5 cursor-pointer group">
                        <input
                          type="radio"
                          name="sort"
                          checked={sortBy === option.value}
                          onChange={() => setSortBy(option.value)}
                          aria-label={option.label}
                          className="h-4 w-4 rounded border-base-divider bg-base-bg/60 text-gold-500 cursor-pointer focus:ring-2 focus:ring-gold-500/20"
                        />
                        <span className="text-sm text-base-text group-hover:text-gold-300 transition">
                          {option.label}
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </GlassCard>
        </aside>

        {/* Main Content */}
        <SessionList
          sessions={paginatedSessions}
          isLoading={sessionsQuery.isLoading}
          errorMessage={
            sessionsQuery.isError && !sessionsQuery.isLoading
              ? (sessionsQuery.error as Error).message
              : null
          }
          selectedId={activeSessionId}
          onSelect={setSelectedId}
          getSessionDuration={getSessionDuration}
          lastUpdatedLabel={lastUpdatedLabel}
          totalPages={totalPages}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          totalItems={filteredAndSortedSessions.length}
          onDelete={(session) => {
            setSessionToDelete(session);
          }}
          deletingSessionId={deletingSessionId}
        />
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmationDialog
        open={sessionToDelete !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSessionToDelete(null);
          }
        }}
        onConfirm={() => {
          if (sessionToDelete) {
            setDeletingSessionId(sessionToDelete.id);
            // Close dialog immediately since optimistic update will remove session from UI
            setSessionToDelete(null);
            deleteMutation.mutate(sessionToDelete, {
              onSettled: () => {
                setDeletingSessionId(null);
              },
            });
          }
        }}
        title="Delete Session"
        description={`You are about to delete this session, including its log and PDF. This action cannot be undone.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="danger"
        isLoading={deletingSessionId === sessionToDelete?.id}
      />
    </div>
  );
}



type SessionListProps = {
  sessions: DecisionLogSession[];
  isLoading: boolean;
  errorMessage: string | null;
  selectedId: string | null;
  onSelect: (id: string) => void;
  getSessionDuration: (session: DecisionLogSession) => string | null;
  lastUpdatedLabel: string;
  totalPages: number;
  currentPage: number;
  onPageChange: (page: number) => void;
  totalItems: number;
  onDelete: (session: DecisionLogSession) => void;
  deletingSessionId: string | null;
};

function SessionList({
  sessions,
  isLoading,
  errorMessage,
  selectedId,
  onSelect,
  getSessionDuration,
  lastUpdatedLabel,
  totalPages,
  currentPage,
  onPageChange,
  totalItems,
  onDelete,
  deletingSessionId,
}: SessionListProps) {
  const isEmptyState = !isLoading && sessions.length === 0 && totalItems === 0;

  return (
    <section className="min-w-0 flex flex-col h-[calc(100vh-280px)]">
      {isLoading ? (
        <SessionsListSkeleton />
      ) : errorMessage ? (
        <GlassCard variant="elevated" className="rounded-3xl p-12">
          <div className="text-center">
            <p className="text-sm text-rose-300">{errorMessage}</p>
          </div>
        </GlassCard>
      ) : isEmptyState ? (
        <GlassCard variant="elevated" className="rounded-3xl p-12">
          <div className="text-center">
            <p className="text-base font-medium text-base-text mb-2">
              No sessions yet. Start a new topic in the Launchpad to begin.
            </p>
            <p className="text-sm text-base-subtext">
              <Link
                href="/app/launchpad"
                className="text-gold-500 underline-offset-2 hover:underline"
              >
                Go to Launchpad
              </Link>
              &nbsp;to create your first session.
            </p>
          </div>
        </GlassCard>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto space-y-2 pr-2">
            {sessions.map((session, index) => {
              const sessionCard = (
                <SessionCard
                  key={session.id}
                  session={session}
                  isSelected={session.id === selectedId}
                  onSelect={onSelect}
                  getSessionDuration={getSessionDuration}
                  onDelete={onDelete}
                  isDeleting={deletingSessionId === session.id}
                />
              );
              
              // Lazy load items beyond the first 5 (above the fold)
              if (index >= 5) {
                return (
                  <LazyLoad key={session.id} fallback={<div className="h-24 bg-base-bg/20 rounded-lg animate-pulse" />}>
                    {sessionCard}
                  </LazyLoad>
                );
              }
              
              return sessionCard;
            })}
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 mt-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => onPageChange(Math.max(0, currentPage - 1))}
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
                      onClick={() => onPageChange(pageNum)}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition",
                        isActive
                          ? "border-gold-500/50 bg-gold-500/10 text-gold-300"
                          : "border-base-divider text-base-text hover:border-gold-500/40 hover:text-gold-300"
                      )}
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
                onClick={() => onPageChange(Math.min(totalPages - 1, currentPage + 1))}
                disabled={currentPage >= totalPages - 1}
                className="flex items-center justify-center rounded-full border border-base-divider p-2 text-base-text transition hover:border-gold-500/40 hover:text-gold-300 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-base-divider disabled:hover:text-base-text"
                aria-label="Next page"
              >
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}

type SessionCardProps = {
  session: DecisionLogSession;
  isSelected: boolean;
  onSelect: (id: string) => void;
  getSessionDuration: (session: DecisionLogSession) => string | null;
  onDelete: (session: DecisionLogSession) => void;
  isDeleting: boolean;
};

function SessionCard({
  session,
  isSelected,
  onSelect,
  getSessionDuration,
  onDelete,
  isDeleting,
}: SessionCardProps) {
  const { token } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [isDownloadingJson, setIsDownloadingJson] = useState(false);
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isDownloadingPdfFromJson, setIsDownloadingPdfFromJson] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [pdfGenerationStartTime, setPdfGenerationStartTime] = useState<number | null>(null);
  const [isDownloadDropdownOpen, setIsDownloadDropdownOpen] = useState(false);
  const downloadDropdownRef = useRef<HTMLDivElement>(null);
  const downloadButtonRef = useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState<{ top: number; left: number } | null>(null);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete(session);
  };

  // Calculate dropdown position and handle click outside
  useEffect(() => {
    const updateDropdownPosition = () => {
      if (downloadButtonRef.current && isDownloadDropdownOpen) {
        const rect = downloadButtonRef.current.getBoundingClientRect();
        setDropdownPosition({
          top: rect.top - 8, // 8px margin (mb-2)
          left: rect.right - 224, // 224px = w-56 (14rem)
        });
      }
    };

    if (isDownloadDropdownOpen) {
      updateDropdownPosition();
      window.addEventListener("scroll", updateDropdownPosition, true);
      window.addEventListener("resize", updateDropdownPosition);
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (
        downloadDropdownRef.current &&
        !downloadDropdownRef.current.contains(event.target as Node) &&
        downloadButtonRef.current &&
        !downloadButtonRef.current.contains(event.target as Node)
      ) {
        setIsDownloadDropdownOpen(false);
      }
    };

    if (isDownloadDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        window.removeEventListener("scroll", updateDropdownPosition, true);
        window.removeEventListener("resize", updateDropdownPosition);
      };
    } else {
      setDropdownPosition(null);
    }
  }, [isDownloadDropdownOpen]);

  const handleDownloadJson = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!session.auditLogUri) return;
    
    setIsDownloadDropdownOpen(false);
    setIsDownloadingJson(true);
    showToast({
      title: "Downloading JSON",
      description: "Your file download has started...",
      variant: "info",
    });
    try {
      // Ensure we have a JWT token (exchange UUID if needed)
      let jwtToken = token;
      if (token) {
        const { ensureJWTToken } = await import("@/lib/auth/client-token");
        jwtToken = await ensureJWTToken(token);
        if (!jwtToken) {
          throw new Error("Failed to authenticate. Please try signing in again.");
        }
      }
      
      // Always use the API endpoint for Community Edition
      // The backend handles S3, file://, and local paths transparently
      const response = await fetch(`/api/artifacts/${session.id}/json`, {
        method: "GET",
        credentials: "include",
        headers: {
          ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to download JSON file");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${session.id}_audit_log.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      logError(error, "Sessions: downloadJSON");
      showToast({
        title: "Download Failed",
        description: getErrorMessage(error),
        variant: "error",
      });
    } finally {
      setIsDownloadingJson(false);
    }
  };

  const handleGeneratePdf = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!session.auditLogUri) {
      showToast({
        title: "Cannot Generate PDF",
        description: "JSON artifact not available. Cannot generate PDF without JSON data.",
        variant: "error",
      });
      return;
    }
    
    setIsGeneratingPdf(true);
    setPdfGenerationStartTime(Date.now());
    
    try {
      // Use Next.js API route which handles token exchange server-side
      const response = await fetch(`/api/artifacts/${session.id}/generate-pdf`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        // Try to parse as JSON for more detailed error
        try {
          const errorJson = JSON.parse(errorText);
          throw new Error(errorJson.details || errorJson.error || errorText);
        } catch {
          throw new Error(errorText || "Failed to generate PDF");
        }
      }

      const result = await response.json();
      
      // Refresh the session list to get the updated artifactUri
      await queryClient.invalidateQueries({ queryKey: ["decision-log"] });
      
      showToast({
        title: "PDF Generated",
        description: "PDF generated successfully! You can now download it.",
        variant: "success",
      });
    } catch (error) {
      logError(error, "Sessions: generatePdf");
      showToast({
        title: "PDF Generation Failed",
        description: getErrorMessage(error),
        variant: "error",
      });
    } finally {
      setIsGeneratingPdf(false);
      setPdfGenerationStartTime(null);
    }
  };

  const handleDownloadPdf = async (e: React.MouseEvent) => {
    e.stopPropagation();
    
    if (!session.artifactUri) {
      showToast({
        title: "Download Failed",
        description: "Artifact not available for this session",
        variant: "error",
      });
      return;
    }
    
    setIsDownloadingPdf(true);
    showToast({
      title: "Downloading PDF",
      description: "Your file download has started...",
      variant: "info",
    });
    try {
      // If it's a PDF, use the PDF endpoint; otherwise download directly from artifactUri
      if (session.artifactUri.endsWith(".pdf")) {
        // Use Next.js API route which handles token exchange server-side
        const response = await fetch(`/api/artifacts/${session.id}/pdf`, {
          method: "GET",
          credentials: "include",
        });

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(errorText || "Failed to download PDF");
        }

        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${session.id}_executive_brief.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        showToast({
          title: "PDF Downloaded",
          description: "PDF downloaded successfully",
          variant: "success",
        });
      } else {
        // For non-PDF artifacts (e.g., old JSON in artifactUri), use API endpoint
        // This handles local file paths, S3 URIs, etc. transparently
        const response = await fetch(`/api/artifacts/${session.id}/json`, {
          method: "GET",
          credentials: "include",
        });
        if (!response.ok) {
          throw new Error("Failed to download artifact");
        }
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${session.id}_artifact.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
        
        showToast({
          title: "Artifact Downloaded",
          description: "Artifact downloaded successfully",
          variant: "success",
        });
      }
    } catch (error) {
      logError(error, "Sessions: downloadArtifact");
      showToast({
        title: "Download Failed",
        description: getErrorMessage(error),
        variant: "error",
      });
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleDownloadPdfFromJson = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!session.auditLogUri) return;
    
    setIsDownloadDropdownOpen(false);
    setIsDownloadingPdfFromJson(true);
    showToast({
      title: "Downloading PDF",
      description: "Your file download has started...",
      variant: "info",
    });
    try {
      const response = await fetch(`/api/artifacts/${session.id}/download-pdf-from-json`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to generate PDF");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${session.id}_debate_document.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      showToast({
        title: "PDF Downloaded",
        description: "PDF downloaded successfully",
        variant: "success",
      });
    } catch (error) {
      logError(error, "Sessions: downloadPdfFromJson");
      showToast({
        title: "Download Failed",
        description: getErrorMessage(error),
        variant: "error",
      });
    } finally {
      setIsDownloadingPdfFromJson(false);
    }
  };

  const duration = getSessionDuration(session);
  const knightCount = session.knightIds.length;

  // Calculate elapsed seconds for PDF generation
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  
  useEffect(() => {
    if (!isGeneratingPdf || !pdfGenerationStartTime) {
      setElapsedSeconds(0);
      return;
    }

    // Update immediately
    const updateElapsed = () => {
      const elapsed = Math.floor((Date.now() - pdfGenerationStartTime) / 1000);
      setElapsedSeconds(elapsed);
    };

    updateElapsed(); // Initial update
    const interval = setInterval(updateElapsed, 1000);

    return () => clearInterval(interval);
  }, [isGeneratingPdf, pdfGenerationStartTime]);

  return (
    <>
      <PdfGenerationOverlay
        isOpen={isGeneratingPdf}
        elapsedSeconds={elapsedSeconds}
        estimatedTotalSeconds={300} // 5 minutes
      />
      <div
      className="group w-full rounded-2xl border border-base-divider bg-base-panel p-6 transition hover:border-gold-500/40 hover:bg-gold-500/5"
    >
      <button
        type="button"
        onClick={() => onSelect(session.id)}
        className="w-full text-left"
      >
        <div className="space-y-2">
          {/* Line 1: Topic and Quality Badge */}
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-base-text group-hover:text-gold-300 transition line-clamp-1 truncate flex-1 min-w-0">
              {session.topic || "Untitled session"}
            </h3>
            {session.qualityTier && session.qualityScore !== null && (
              <QualityBadge tier={session.qualityTier} score={session.qualityScore} />
            )}
          </div>
          
          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-base-subtext/70">
            <span className="inline-flex items-center gap-1.5">
              <Clock3 className="h-3.5 w-3.5 text-base-subtext/50" />
              <span className="text-base-subtext/50">Created:</span>
              <span className="font-medium">{formatDateTime(session.createdAt)}</span>
            </span>
            {duration && (
              <>
                <span className="text-base-subtext/30">•</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="text-base-subtext/50">Duration:</span>
                  <span className="font-medium">{duration}</span>
                </span>
              </>
            )}
            <span className="text-base-subtext/30">•</span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-base-subtext/50" />
              <span className="text-base-subtext/50">Agents:</span>
              <span className="font-medium">{knightCount}</span>
            </span>
          </div>
        </div>
      </button>
      <div className="mt-3 flex justify-between items-center border-t border-base-divider pt-3">
        <div className="flex items-center gap-2">
          {session.status === "running" ? (
            <Link
              href={`/app/live?session=${session.id}`}
              className="inline-flex items-center gap-2 rounded-full border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs font-medium text-cyan-300 transition hover:border-cyan-500/60 hover:bg-cyan-500/20"
              onClick={(event) => event.stopPropagation()}
            >
              <Play className="h-3.5 w-3.5" />
              Join Live
            </Link>
          ) : session.status === "completed" ? (
            <Link
              href={`/app/sessions/${session.id}/output`}
              className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:border-emerald-500/60 hover:bg-emerald-500/20"
              onClick={(event) => event.stopPropagation()}
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
              View Output
            </Link>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {session.auditLogUri && (
            <>
              <button
                ref={downloadButtonRef}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsDownloadDropdownOpen(!isDownloadDropdownOpen);
                }}
                disabled={isDownloadingJson || isDownloadingPdfFromJson}
                aria-label={isDownloadingJson || isDownloadingPdfFromJson ? "Downloading..." : "Download options"}
                className="inline-flex items-center gap-2 rounded-full border border-gray-500/40 bg-gray-500/20 px-3 py-1.5 text-xs font-medium text-white transition hover:border-gray-500/60 hover:bg-gray-500/30 disabled:cursor-not-allowed disabled:opacity-50"
                title="Download JSON or PDF"
              >
                {(isDownloadingJson || isDownloadingPdfFromJson) ? (
                  <InlineLoading size="sm" />
                ) : (
                  <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                )}
                {isDownloadingJson || isDownloadingPdfFromJson ? "Downloading..." : "Download Debate"}
              </button>

              {typeof window !== "undefined" && createPortal(
                <AnimatePresence>
                  {isDownloadDropdownOpen && !isDownloadingJson && !isDownloadingPdfFromJson && dropdownPosition && (
                    <motion.div
                      ref={downloadDropdownRef}
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
                      className="fixed z-[9999] w-56 rounded-xl border border-gold-500/40 bg-[rgba(15,12,8,0.98)] backdrop-blur-xl shadow-[0_16px_48px_rgba(10,8,4,0.6)] overflow-hidden"
                      style={{
                        top: `${dropdownPosition.top}px`,
                        left: `${dropdownPosition.left}px`,
                        transform: "translateY(-100%)",
                      }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="py-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadJson(e);
                          }}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gold-100/90 transition hover:bg-gold-500/10 hover:text-gold-200"
                        >
                          <Braces className="h-4 w-4 text-gold-500/70" />
                          <div className="flex-1">
                            <p className="font-semibold text-white">Download JSON</p>
                            <p className="text-xs text-gold-100/60">Raw debate data</p>
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownloadPdfFromJson(e);
                          }}
                          className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gold-100/90 transition hover:bg-gold-500/10 hover:text-gold-200"
                        >
                          <FileDown className="h-4 w-4 text-gold-500/70" />
                          <div className="flex-1">
                            <p className="font-semibold text-white">Download PDF</p>
                            <p className="text-xs text-gold-100/60">Formatted document</p>
                          </div>
                        </button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>,
                document.body
              )}
            </>
          )}
          {session.status === "completed" && (
            <>
              {session.artifactUri && session.artifactUri.endsWith(".pdf") ? (
                <button
                  type="button"
                  onClick={handleDownloadPdf}
                  disabled={isDownloadingPdf}
                  aria-label={isDownloadingPdf ? "Downloading PDF" : "Download PDF"}
                  className="inline-flex items-center gap-2 rounded-full border border-gold-500/40 bg-gold-500/10 px-3 py-1.5 text-xs font-medium text-gold-300 transition hover:border-gold-500/60 hover:bg-gold-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Download PDF"
                >
                  {isDownloadingPdf ? (
                    <InlineLoading size="sm" />
                  ) : (
                    <FaFilePdf className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {isDownloadingPdf ? "Downloading..." : "Download Brief"}
                </button>
              ) : session.auditLogUri && !session.artifactUri ? (
                <button
                  type="button"
                  onClick={handleGeneratePdf}
                  disabled={isGeneratingPdf}
                  aria-label={isGeneratingPdf ? "Generating PDF" : "Generate PDF"}
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-medium text-emerald-300 transition hover:border-emerald-500/60 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                  title="Generate PDF"
                >
                  {isGeneratingPdf ? (
                    <InlineLoading size="sm" />
                  ) : (
                    <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  {isGeneratingPdf ? "Generating..." : "Generate PDF"}
                </button>
              ) : null}
            </>
          )}
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            aria-label={isDeleting ? `Deleting session ${session.id}` : `Delete session ${session.id}`}
            className="inline-flex items-center gap-2 rounded-full border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:border-rose-500/60 hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {isDeleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      </div>
    </div>
    </>
  );
}


type SessionDetailPanelProps = {
  session: DecisionLogSession | null;
  isLoading: boolean;
  getSessionDuration: (session: DecisionLogSession) => string | null;
};

function SessionDetailPanel({
  session,
  isLoading,
  getSessionDuration,
}: SessionDetailPanelProps) {
  const { token } = useAuth();
  const { showToast } = useToast();
  const [isDownloadingPdf, setIsDownloadingPdf] = useState(false);
  const [isDownloadingJson, setIsDownloadingJson] = useState(false);

  const handleDownloadPdf = async () => {
    if (!session || !session.artifactUri || !session.artifactUri.endsWith(".pdf")) {
      showToast({
        title: "Download Failed",
        description: "PDF not available for this session",
        variant: "error",
      });
      return;
    }
    
    setIsDownloadingPdf(true);
    try {
      // Use Next.js API route which handles token exchange server-side
      const response = await fetch(`/api/artifacts/${session.id}/pdf`, {
        method: "GET",
        credentials: "include",
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to download PDF");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${session.id}_executive_brief.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      showToast({
        title: "PDF Downloaded",
        description: "PDF downloaded successfully",
        variant: "success",
      });
    } catch (error) {
      logError(error, "SessionDetailPanel: downloadPDF");
      showToast({
        title: "Download Failed",
        description: getErrorMessage(error),
        variant: "error",
      });
    } finally {
      setIsDownloadingPdf(false);
    }
  };

  const handleDownloadJson = async () => {
    if (!session || !session.auditLogUri) return;
    
    setIsDownloadingJson(true);
    try {
      // Ensure we have a JWT token (exchange UUID if needed)
      let jwtToken = token;
      if (token) {
        const { ensureJWTToken } = await import("@/lib/auth/client-token");
        jwtToken = await ensureJWTToken(token);
        if (!jwtToken) {
          throw new Error("Failed to authenticate. Please try signing in again.");
        }
      }
      
      const baseUrl = getApiBaseUrl();
      const response = await fetch(`${baseUrl}/artifacts/${session.id}/download`, {
        method: "GET",
        credentials: "include",
        headers: {
          ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
        },
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to download JSON file");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${session.id}_audit_log.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      showToast({
        title: "JSON Downloaded",
        description: "JSON audit log downloaded successfully",
        variant: "success",
      });
    } catch (error) {
      logError(error, "SessionDetailPanel: downloadJSON");
      showToast({
        title: "Download Failed",
        description: getErrorMessage(error),
        variant: "error",
      });
    } finally {
      setIsDownloadingJson(false);
    }
  };
  if (isLoading) {
    return (
      <aside className="lg:sticky lg:top-6">
        <GlassCard variant="elevated" className="p-6">
          <div className="space-y-4">
            <SkeletonLine className="h-4 w-1/3" />
            <SkeletonLine className="h-8 w-full" />
            <SkeletonLine className="h-4 w-2/3" />
            <SkeletonLine className="h-4 w-3/4" />
          </div>
        </GlassCard>
      </aside>
    );
  }

  if (!session) {
    return (
      <aside className="lg:sticky lg:top-6">
        <GlassCard variant="elevated" className="p-8 text-center">
          <div className="flex flex-col items-center gap-4">
            <div className="rounded-full border border-base-divider bg-base-bg/60 p-4">
              <ScrollText className="h-8 w-8 text-base-subtext/60" aria-hidden="true" />
            </div>
            <div className="space-y-2">
              <h3 className="text-lg font-semibold text-base-text">
                Select a session
              </h3>
              <p className="text-sm text-base-subtext">
                Click on a card to view detailed information, Agents, and export artifacts.
              </p>
            </div>
          </div>
        </GlassCard>
      </aside>
    );
  }

  const duration = getSessionDuration(session);

  return (
    <aside className="lg:sticky lg:top-6">
      <GlassCard variant="elevated" className="p-6">
        <div className="space-y-6">
          {/* Header */}
          <div className="space-y-3 border-b border-base-divider pb-6">
            <p className="font-mono text-xs text-base-subtext/70">{session.id}</p>
            <h2 className="text-xl font-semibold leading-tight text-base-text">
              {session.topic ?? "Untitled session"}
            </h2>
          </div>

          {/* Actions */}
          <div className="flex flex-col gap-2">
            {session.artifactUri && session.artifactUri.endsWith(".pdf") && (
              <button
                type="button"
                onClick={handleDownloadPdf}
                disabled={isDownloadingPdf}
                className="inline-flex items-center gap-2 rounded-full bg-gold-500/90 px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-navy-900 transition hover:bg-gold-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDownloadingPdf ? (
                  <>
                    <InlineLoading size="sm" />
                    Downloading...
                  </>
                ) : (
                  <>
                    Download PDF
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            )}
            {session.auditLogUri && (
              <button
                type="button"
                onClick={handleDownloadJson}
                disabled={isDownloadingJson}
                className="inline-flex items-center gap-2 rounded-full border border-base-divider px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] text-base-text transition hover:text-gold-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isDownloadingJson ? (
                  <>
                    <InlineLoading size="sm" />
                    Downloading...
                  </>
                ) : (
                  <>
                    View audit log
                    <ArrowUpRight className="h-3.5 w-3.5" />
                  </>
                )}
              </button>
            )}
          </div>

          {/* Details */}
          <div className="space-y-4">
            <DetailBlock title="Timeline">
              <TimelineEntry label="Created" value={formatDateTime(session.createdAt)} />
              <TimelineEntry label="Last updated" value={formatDateTime(session.updatedAt)} />
              {session.completedAt && (
                <TimelineEntry label="Completed" value={formatDateTime(session.completedAt)} />
              )}
              {duration && (
                <TimelineEntry label="Duration" value={duration} />
              )}
            </DetailBlock>

            <DetailBlock title="Deployed Agents">
              {session.knightIds.length === 0 ? (
                <p className="text-sm text-base-subtext">No Agents captured for this simulation.</p>
              ) : (
                <ul className="flex flex-wrap gap-2">
                  {session.knightIds.map((knight) => (
                    <li
                      key={knight}
                      className="rounded-full border border-base-divider bg-base-bg/60 px-3 py-1.5 font-mono text-xs uppercase tracking-[0.2em] text-base-subtext"
                    >
                      {knight}
                    </li>
                  ))}
                </ul>
              )}
            </DetailBlock>
          </div>
        </div>
      </GlassCard>
    </aside>
  );
}

function DetailBlock({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-base-divider/50 bg-base-bg/40 p-5">
      <p className="text-xs font-semibold uppercase tracking-[0.35em] text-base-subtext">
        {title}
      </p>
      <div className="space-y-3 text-sm text-base-text">{children}</div>
    </div>
  );
}

function TimelineEntry({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-sm font-medium text-base-subtext">{label}</span>
      <span className="font-mono text-sm text-base-text">
        {value}
      </span>
    </div>
  );
}

type ArtifactActionProps = {
  href: string | null;
  label: string;
  variant?: "primary" | "ghost";
};

function ArtifactAction({ href, label, variant = "primary" }: ArtifactActionProps) {
  const baseClass =
    "inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold-500/60";

  if (!href) {
    return (
      <button
        type="button"
        disabled
        className={cn(
          baseClass,
          "cursor-not-allowed border border-dashed border-base-divider/60 text-base-subtext",
        )}
      >
        {label} pending
      </button>
    );
  }

  return (
    <Link
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(
        baseClass,
        variant === "primary"
          ? "bg-gold-500/90 text-navy-900 hover:bg-gold-500"
          : "border border-base-divider text-base-text hover:text-gold-300",
      )}
    >
      {label}
      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}

function SkeletonLine({ className }: { className: string }) {
  return (
    <div
      className={cn("animate-pulse rounded-full bg-base-divider/40", className)}
    />
  );
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "—";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return dateTimeFormatter.format(date);
}

function formatNumber(value: number): string {
  return numberFormatter.format(value);
}
