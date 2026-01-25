"use client";

import React, { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import dynamicImport from "next/dynamic";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";
import loginAnimation from "@/public/animations/login.json";

const Lottie = dynamicImport(() => import("lottie-react"), {
  ssr: false,
  loading: () => <div className="h-64 w-64 animate-pulse rounded bg-gray-200/10" />,
});
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Bot, Sparkles, CheckCircle, CheckCircle2, ArrowRight, MessageSquare, Plus, X, Lock, FileText, RotateCcw, Users, Zap } from "lucide-react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/components/providers/AuthProvider";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { apiGet } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { logDebug, logError, getErrorMessage, getActionableErrorMessage } from "@/lib/utils/errorHandler";
import { ErrorDisplay } from "@/components/common/ErrorDisplay";
import { RateLimitErrorDisplay } from "@/components/common/RateLimitErrorDisplay";
import { useTurnstile } from "@/components/providers/TurnstileProvider";
import { checkRateLimitStatus } from "@/lib/api/rate-limit";
import { needsCaptcha } from "@/lib/turnstile/client";
import type { ModeratorBrief, ModeratorExpert } from "@/features/moderator/types";
import { LIVE_SESSION_TRANSFER_KEY, type LiveSessionTransfer, type TransferKnight } from "@/features/rounds/liveSessionTransfer";
import {
  BOARDROOM_CHAT_CACHE_VERSION,
  BOARDROOM_CHAT_TTL_MS,
  LAUNCHPAD_INTAKE_CACHE_VERSION,
  LAUNCHPAD_INTAKE_TTL_MS,
  LAUNCHPAD_TRANSFER_CACHE_VERSION,
  LIVE_SESSION_TRANSFER_TTL_MS,
  LIVE_SESSION_TRANSFER_VERSION,
} from "@/features/rounds/storageKeys";
import {
  readSessionCache,
  readSessionCacheWithDetails,
  removeSessionCache,
  writeSessionCache,
} from "@/lib/storage/sessionCache";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";
import { useToast } from "@/components/common/ToastProvider";
import { getCacheSyncManager } from "@/lib/storage/cacheSync";
import { SummaryEditor } from "@/components/intake/SummaryEditor";
import { DocumentUploadConfirm } from "@/components/intake/DocumentUploadConfirm";
import { InlineLoading } from "@/components/ui/InlineLoading";
import { GradientButton } from "@/components/ui/gradient-button";
import { ProgressIndicator } from "@/components/ui/ProgressIndicator";
import { ProgressTracker, calculateUploadProgress, estimateUploadTimeRemaining } from "@/lib/utils/loadingHelpers";
import { LaunchpadSkeleton } from "@/components/ui/skeletons/LaunchpadSkeleton";
import { IntakeChat } from "@/features/launchpad/components/IntakeChat";
import { KnightSelectorModal } from "@/features/launchpad/components/KnightSelectorModal";
import { Tooltip } from "@/components/ui/tooltip";
import { HelpCircle } from "lucide-react";

type IntakeChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

type IntakeAssistantResponse = {
  question: string;
  done: boolean;
  summary: string;
};

type LaunchpadCacheState = {
  messages?: IntakeChatMessage[];
  summary?: string | null;
  moderatorBrief?: ModeratorBrief | null;
  knights?: TransferKnight[] | null;
};

type LaunchpadTransferState = {
  messages?: IntakeChatMessage[];
  summary?: string | null;
  moderatorBrief?: ModeratorBrief | null;
  knights?: TransferKnight[] | null;
  knightIds?: string[] | null;
  autoStart?: boolean;
  fromDocumentUpload?: boolean; // Flag to show summary editor for document uploads
  autoConfirmSummary?: boolean; // Flag to auto-confirm summary and start moderator brief
};

type BoardroomIntakeCache = {
  messages?: IntakeChatMessage[];
  summary?: string | null;
};

type ApiKnight = {
  id: string;
  name: string;
  role: string;
  goal: string;
  backstory: string;
  prompt: string | null;
  model: string;
  stance?: string | null;
  temperature: number;
  origin: "official" | "workspace";
  author: { name: string };
  verified: boolean;
  websearch_enabled?: boolean;
};

const MIN_KNIGHTS_REQUIRED = 3;
const MAX_KNIGHTS_ALLOWED = 12;

const mapApiKnightToTransfer = (knight: ApiKnight): TransferKnight => ({
  id: knight.id,
  name: knight.name,
  role: knight.role,
  goal: knight.goal,
  backstory: knight.backstory,
  prompt: knight.prompt,
  model: knight.model,
  stance: knight.stance ?? null,
  temperature: knight.temperature,
  websearch_enabled: knight.websearch_enabled ?? false,
});

const mapTransferKnightToApi = (knight: TransferKnight): ApiKnight => ({
  id: knight.id,
  name: knight.name,
  role: knight.role,
  goal: knight.goal,
  backstory: knight.backstory,
  prompt: knight.prompt ?? null,
  model: knight.model,
  stance: knight.stance ?? null,
  temperature: knight.temperature,
  origin: "workspace",
  author: { name: "Moderator" },
  verified: true,
  websearch_enabled: knight.websearch_enabled ?? false,
});

const generateId = () => Math.random().toString(36).slice(2, 10);
const TRANSFER_STORAGE_KEY = "launchpad-intake-transfer";
const CACHE_STORAGE_KEY = "launchpad-intake-state";
const BOARDROOM_CACHE_KEY = "boardroom-intake-state";

const STEP_LABELS: Array<{ label: string; description: string }> = [
  { label: "Intake", description: "Gather the brief with the intake assistant" },
  { label: "Confirm", description: "Approve the working summary" },
  { label: "Moderator", description: "Board moderator prepares the room" },
  { label: "Debate", description: "AI Council debates your strategic question" },
];

const normalizeModeratorBrief = (brief: ModeratorBrief | null | undefined): ModeratorBrief | null => {
  if (!brief) {
    return null;
  }
  return {
    topicSummary: brief.topicSummary ?? "",
    strategicQuestion: brief.strategicQuestion ?? "",
    missionStatement: brief.missionStatement ?? "",
    keyAssumptions: Array.isArray(brief.keyAssumptions) ? brief.keyAssumptions.filter(Boolean) : [],
    recommendedExperts: normalizeModeratorExperts(brief.recommendedExperts),
  };
};

const normalizeModeratorExperts = (input: unknown): ModeratorExpert[] => {
  if (!input) {
    return [];
  }
  if (Array.isArray(input)) {
    const result: ModeratorExpert[] = [];
    input.forEach((entry, index) => {
      if (entry && typeof entry === "object") {
        const record = entry as Record<string, unknown>;
        const id = String(record.id ?? record.name ?? record.role ?? `expert_${index}`).trim();
        const name = String(record.name ?? record.role ?? record.id ?? `Expert ${index + 1}`).trim();
        const role = String(record.role ?? record.name ?? "Board Member").trim();
        if (name || role) {
          result.push({
            id: id || `${index}`,
            name: name || role,
            role: role || name,
          });
        }
      } else if (typeof entry === "string" && entry.trim()) {
        const value = entry.trim();
        result.push({
          id: value,
          name: value,
          role: value,
        });
      }
    });
    return result;
  }
  if (typeof input === "string" && input.trim()) {
    return [
      {
        id: input.trim(),
        name: input.trim(),
        role: input.trim(),
      },
    ];
  }
  return [];
};

function LaunchpadPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, token, status: authStatus, requireAuth } = useAuth();
  const { execute: executeTurnstile } = useTurnstile();
  const [chatMessages, setChatMessages] = useState<IntakeChatMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState<string | null>(null);
  const [isChatActive, setIsChatActive] = useState(false);
  const [pendingTransfer, setPendingTransfer] = useState<{
    messages: IntakeChatMessage[];
    summary: string | null;
    moderatorBrief?: ModeratorBrief | null;
    knights?: TransferKnight[] | null;
    knightIds?: string[] | null;
    autoStart?: boolean;
    fromDocumentUpload?: boolean;
    autoConfirmSummary?: boolean;
  } | null>(null);
  const [intakeSummary, setIntakeSummary] = useState<string | null>(null);
  const [moderatorBrief, setModeratorBrief] = useState<ModeratorBrief | null>(null);
  const [moderatorLoading, setModeratorLoading] = useState(false);
  const [moderatorProgress, setModeratorProgress] = useState(0);
  const [moderatorError, setModeratorError] = useState<string | null>(null);
  const [moderatorRateLimitError, setModeratorRateLimitError] = useState<{
    error: string;
    limit: number;
    remaining: number;
    resetAt: number;
    retryAfter: number;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStartTime, setUploadStartTime] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadRateLimitError, setUploadRateLimitError] = useState<{
    error: string;
    limit: number;
    remaining: number;
    resetAt: number;
    retryAfter: number;
  } | null>(null);
  const [sessionProgressTracker] = useState(() => new ProgressTracker([
    "Preparing session",
    "Setting up knights",
    "Initializing debate",
  ]));
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [uploadedSummary, setUploadedSummary] = useState<string | null>(null);
  const [isSummaryFromDocumentUpload, setIsSummaryFromDocumentUpload] = useState(false);
  const [showUploadConfirm, setShowUploadConfirm] = useState(false);
  const [previewData, setPreviewData] = useState<{
    fileName: string;
    fileSize: number;
    extractedTextPreview: string;
  } | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const isCreatingSessionRef = useRef(false);
  const [isLaunchingLiveSession, setIsLaunchingLiveSession] = useState(false);
  const [seatError, setSeatError] = useState<string | null>(null);
  const [showSeatModal, setShowSeatModal] = useState(false);
  const seatModalTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [isPreparingSession, setIsPreparingSession] = useState(false);
  const [debateStatus, setDebateStatus] = useState<"draft" | "running" | "completed" | "error" | null>(null);
  const [sessionStatusLoading, setSessionStatusLoading] = useState(false);
  const [sessionStatusError, setSessionStatusError] = useState<string | null>(null);
  const [knightSearch, setKnightSearch] = useState("");
  const [selectedKnights, setSelectedKnights] = useState<ApiKnight[]>([]);
  const [dismissedExpertIds, setDismissedExpertIds] = useState<string[]>([]);
  const [recommendedError, setRecommendedError] = useState<string | null>(null);
  const [cacheRestoreInfo, setCacheRestoreInfo] = useState<{
    messageCount: number;
    hasSummary: boolean;
    hasModeratorBrief: boolean;
    knightsCount: number;
    timestamp: number;
  } | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const { showToast } = useToast();
  const hasUnsavedChanges = useMemo(() => {
    return (
      chatMessages.length > 0 ||
      Boolean(intakeSummary) ||
      Boolean(moderatorBrief) ||
      selectedKnights.length > 0
    );
  }, [chatMessages.length, intakeSummary, moderatorBrief, selectedKnights.length]);
  const { checkBeforeNavigate, skipWarning } = useUnsavedChangesWarning({
    hasUnsavedChanges,
    message: "You have unsaved changes in your launchpad session. Are you sure you want to leave?",
    enabled: hasUnsavedChanges,
    allowExternalUrls: true, // Community Edition: Allow external URLs
  });
  const selectedKnightIds = useMemo(() => selectedKnights.map((knight) => knight.id), [selectedKnights]);
  // Create a stable string key for dependency tracking - ensures recomputation when knights change
  const selectedKnightIdsKey = selectedKnightIds.join(',');
  const selectedKnightTransfers = useMemo(() => selectedKnights.map(mapApiKnightToTransfer), [selectedKnights]);
  const isSeatModalDisabled = selectedKnights.length >= MAX_KNIGHTS_ALLOWED;
  const isModeratorDispatched = Boolean(moderatorBrief);

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

  // Helper function to get moderator status text
  const getModeratorStatusText = useCallback((
    debateStatus: "draft" | "running" | "completed" | "error" | null,
    hasModeratorBrief: boolean,
    hasSession: boolean
  ): string => {
    if (!hasModeratorBrief) {
      return "";
    }

    if (!hasSession) {
      return "Ready to start debate";
    }

    const debateText = (() => {
      switch (debateStatus) {
        case "running":
          return "Debate Running";
        case "completed":
          return "Debate Completed";
        case "error":
          return "Debate Error";
        case "draft":
        default:
          return "Ready to start debate";
      }
    })();

    return debateText;
  }, []);
  const handleKnightToggle = useCallback((knight: ApiKnight) => {
    setSelectedKnights((prev) => {
      const exists = prev.some((item) => item.id === knight.id);
      if (exists) {
        return prev.filter((item) => item.id !== knight.id);
      }
      if (prev.length >= MAX_KNIGHTS_ALLOWED) {
        return prev;
      }
      return [...prev, knight];
    });
  }, []);

  const handleKnightRemove = useCallback((id: string) => {
    setSelectedKnights((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleKnightSearchChange = useCallback((value: string) => {
    setKnightSearch(value);
  }, []);

  const handleSeatModalOpen = useCallback(() => {
    if (isSeatModalDisabled) {
      return;
    }
    setShowSeatModal(true);
  }, [isSeatModalDisabled]);

  const handleSeatModalClose = useCallback(() => {
    setShowSeatModal(false);
  }, []);

  useEffect(() => {
    if (selectedKnights.length >= MIN_KNIGHTS_REQUIRED && seatError) {
      setSeatError(null);
    }
  }, [seatError, selectedKnights.length]);

  useEffect(() => {
    setDismissedExpertIds([]);
    setRecommendedError(null);
  }, [moderatorBrief?.topicSummary, moderatorBrief?.strategicQuestion]);

  const [showReplaceBoardroomModal, setShowReplaceBoardroomModal] = useState(false);
  const pendingBoardroomReplaceAction = useRef<(() => void) | null>(null);
  const [showReplaceUploadModal, setShowReplaceUploadModal] = useState(false);
  const pendingUploadReplaceAction = useRef<(() => void) | null>(null);

  const hasBootstrapped = useRef(false);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [showButtonSparkle, setShowButtonSparkle] = useState(false);

  const conversationTranscript = useMemo(() => {
    const transcriptMessages = isChatActive ? chatMessages : pendingTransfer?.messages ?? chatMessages;
    return transcriptMessages
      .map((message) => (message.role === "assistant" ? `Assistant: ${message.content}` : `User: ${message.content}`))
      .join("\n");
  }, [chatMessages, isChatActive, pendingTransfer]);

  const officialKnightsQuery = useQuery({
    staleTime: 5 * 60 * 1000, // 5 minutes - prevent unnecessary refetches
    queryKey: ["launchpad", "knights", "official", user?.id ?? "guest"],
    queryFn: () => apiGet<ApiKnight[]>("/knights/official", { token: token ?? undefined }),
  });

  const workspaceKnightsQuery = useQuery({
    queryKey: ["launchpad", "knights", "mine", user?.id ?? "guest"], // Use user ID instead of token/authStatus to prevent refetch on auth changes
    queryFn: () => {
      if (!token) {
        return Promise.resolve<ApiKnight[]>([]);
      }
      return apiGet<ApiKnight[]>("/knights/mine", { token });
    },
    enabled: !!user?.id, // Only depend on actual user ID, not token or auth status
    staleTime: 5 * 60 * 1000, // 5 minutes - prevent unnecessary refetches
  });

  const availableKnights = useMemo(() => {
    const map = new Map<string, ApiKnight>();
    officialKnightsQuery.data?.forEach((knight) => map.set(knight.id, knight));
    workspaceKnightsQuery.data?.forEach((knight) => map.set(knight.id, knight));
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [officialKnightsQuery.data, workspaceKnightsQuery.data]);

  const activeRecommendedExperts = useMemo(() => {
    if (!moderatorBrief?.recommendedExperts) {
      return [];
    }
    return moderatorBrief.recommendedExperts.filter((expert) => !dismissedExpertIds.includes(expert.id));
  }, [moderatorBrief, dismissedExpertIds]);

  const findKnightForExpert = useCallback(
    (expert: ModeratorExpert) => {
      if (!expert) {
        return null;
      }
      const direct = availableKnights.find((knight) => knight.id === expert.id);
      if (direct) {
        return direct;
      }
      const phrase = `${expert.name ?? ""} ${expert.role ?? ""}`.trim().toLowerCase();
      if (!phrase) {
        return null;
      }
      return (
        availableKnights.find((knight) => {
          const haystack = `${knight.name} ${knight.role}`.toLowerCase();
          return haystack.includes(phrase) || phrase.includes(haystack);
        }) ?? null
      );
    },
    [availableKnights],
  );

  const recommendedMatchMap = useMemo(() => {

    const map = new Map<string, ApiKnight | null>();

    activeRecommendedExperts.forEach((expert) => {

      map.set(expert.id, findKnightForExpert(expert));

    });

    return map;

  }, [activeRecommendedExperts, findKnightForExpert]);



  const selectedRecommendedIds = useMemo(() => {
    const set = new Set<string>();
    const selectedIdSet = new Set(selectedKnightIds);
    recommendedMatchMap.forEach((match, expertId) => {
      if (match && selectedIdSet.has(match.id)) {
        set.add(expertId);
      }
    });
    return set;
  }, [recommendedMatchMap, selectedKnightIdsKey]);

  const recommendedKnightIds = useMemo(() => {
    const set = new Set<string>();
    recommendedMatchMap.forEach((match) => {
      if (match) {
        set.add(match.id);
      }
    });
    return set;
  }, [recommendedMatchMap]);

  const additionalSeatedKnights = useMemo(() => {
    if (recommendedKnightIds.size === 0) {
      return selectedKnights;
    }
    return selectedKnights.filter((knight) => !recommendedKnightIds.has(knight.id));
  }, [selectedKnights, recommendedKnightIds]);



  // Enhanced remove handler that also dismisses the corresponding recommended expert
  const handleKnightRemoveWithDismiss = useCallback((id: string) => {
    // Remove the knight from selection
    setSelectedKnights((prev) => prev.filter((item) => item.id !== id));
    
    // Also dismiss any recommended expert that corresponds to this knight
    recommendedMatchMap.forEach((match, expertId) => {
      if (match && match.id === id) {
        setDismissedExpertIds((prev) => 
          prev.includes(expertId) ? prev : [...prev, expertId]
        );
      }
    });
  }, [recommendedMatchMap]);

  const handleExpertSeatToggle = useCallback(
    (expert: ModeratorExpert) => {
      const match = findKnightForExpert(expert);
      if (!match) {
        setRecommendedError("This Knight is not in your workspace yet. Import it from the catalog first.");
        return;
      }
      setRecommendedError(null);
      const isSelected = selectedKnights.some((item) => item.id === match.id);
      if (isSelected) {
        // When unseating from recommended experts, also dismiss the expert
        handleKnightRemoveWithDismiss(match.id);
      } else {
        handleKnightToggle(match);
      }
    },
    [findKnightForExpert, selectedKnights, handleKnightRemoveWithDismiss, handleKnightToggle],
  );

  const handleExpertDismiss = useCallback(
    (expert: ModeratorExpert) => {
      setRecommendedError(null);
      setDismissedExpertIds((prev) => (prev.includes(expert.id) ? prev : [...prev, expert.id]));
      const match = findKnightForExpert(expert);
      if (match) {
        handleKnightRemove(match.id);
      }
    },
    [findKnightForExpert, handleKnightRemove],
  );

  useEffect(() => {
    if (!pendingTransfer?.knights || pendingTransfer.knights.length === 0 || selectedKnights.length > 0) {
      return;
    }
    setSelectedKnights(pendingTransfer.knights.map(mapTransferKnightToApi));
  }, [pendingTransfer, selectedKnights.length]);

  useEffect(() => {
    if (!moderatorBrief || availableKnights.length === 0) {
      return;
    }
    if (selectedKnights.length > 0) {
      return;
    }
    const recommendations = activeRecommendedExperts;
    const used = new Set<string>();
    const matches: ApiKnight[] = [];

    recommendations.forEach((expert) => {
      if (matches.length >= MAX_KNIGHTS_ALLOWED) {
        return;
      }
      const match = recommendedMatchMap.get(expert.id);
      if (match && !used.has(match.id)) {
        used.add(match.id);
        matches.push(match);
      }
    });

    if (matches.length < MIN_KNIGHTS_REQUIRED) {
      for (const knight of availableKnights) {
        if (matches.length >= MIN_KNIGHTS_REQUIRED || matches.length >= MAX_KNIGHTS_ALLOWED) {
          break;
        }
        if (used.has(knight.id)) {
          continue;
        }
        used.add(knight.id);
        matches.push(knight);
      }
    }
    if (matches.length > MAX_KNIGHTS_ALLOWED) {
      matches.splice(MAX_KNIGHTS_ALLOWED);
    }
    if (matches.length > 0) {
      setSelectedKnights(matches);
    }
  }, [moderatorBrief, activeRecommendedExperts, availableKnights, selectedKnights.length, recommendedMatchMap]);

  const invokeIntake = useCallback(async (history: IntakeChatMessage[], existingSummary?: string): Promise<IntakeAssistantResponse> => {
    // 1. Check rate limit status FIRST
    const rateLimitStatus = await checkRateLimitStatus("intake", token);
    
    // 2. Determine if CAPTCHA needed
    const captchaNeeded = needsCaptcha(user, rateLimitStatus);
    
    // 3. Execute Turnstile if needed
    let turnstileToken: string | null = null;
    if (captchaNeeded) {
      turnstileToken = await executeTurnstile("intake");
      if (!turnstileToken) {
        // If widget fails, log warning but don't block the request
        // The backend will still verify if token is provided, but won't block if missing in dev
        if (process.env.NODE_ENV === "development") {
          console.warn("[turnstile] Failed to generate token, proceeding without CAPTCHA (dev mode)");
        }
        // In production, we should probably block, but for now allow to proceed
        // The backend will handle verification
      }
    }
    
    // 4. Make request with Turnstile token in headers
    const response = await fetch("/api/intake", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(turnstileToken ? { "X-Turnstile-Token": turnstileToken } : {}),
      },
      body: JSON.stringify({
        history: history.map(({ role, content }) => ({ role, content })),
        existingSummary: existingSummary,
      }),
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => ({}));
      const message = (errorBody as { error?: string }).error ?? "Intake assistant failed.";
      throw new Error(message);
    }

    return (await response.json()) as IntakeAssistantResponse;
  }, [user, token, executeTurnstile]);

  const bootstrapChat = useCallback(async () => {
    if (hasBootstrapped.current) {
      return;
    }
    hasBootstrapped.current = true;
    setChatLoading(true);
    setChatError(null);
    try {
      // If there's an existing summary (e.g., from document upload), pass it to the intake bot
      const existingSummaryForIntake = intakeSummary || undefined;
      const data = await invokeIntake([], existingSummaryForIntake);
      // If done is true, always set the summary (even if empty, API will generate a default)
      if (data.done && data.summary) {
        setIntakeSummary(data.summary);
      } else if (data.summary) {
        // Also set summary if provided (for intermediate updates)
        setIntakeSummary(data.summary);
      }
      if (data.question) {
        setChatMessages([{ id: generateId(), role: "assistant", content: data.question }]);
      }
    } catch (error) {
      logError(error, "Launchpad: bootstrapChat");
      const actionableError = getActionableErrorMessage(error);
      setChatError(actionableError.message);
    } finally {
      setChatLoading(false);
    }
  }, [invokeIntake, intakeSummary]);

  const handleRetryBootstrapChat = useCallback(async () => {
    hasBootstrapped.current = false;
    setChatError(null);
    await bootstrapChat();
  }, [bootstrapChat]);

  useEffect(() => {
    if (!isChatActive) {
      return;
    }
    const container = chatContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [chatMessages, isChatActive]);

  // Show sparkling animation on Start intake button when there's no stored session
  useEffect(() => {
    if (!pendingTransfer && !isChatActive && !chatLoading && !intakeSummary) {
      // Delay showing animation slightly for better UX
      const timer = setTimeout(() => {
        setShowButtonSparkle(true);
      }, 1000);
      return () => clearTimeout(timer);
    } else {
      setShowButtonSparkle(false);
    }
  }, [pendingTransfer, isChatActive, chatLoading, intakeSummary]);

  useEffect(() => {
    // Don't clear cache during initial mount before restoration completes
    // This prevents clearing the cache before the restoration useEffect can read it
    if (!hasBootstrapped.current) {
      return;
    }

    const hasState =
      chatMessages.length > 0 ||
      Boolean(intakeSummary) ||
      Boolean(moderatorBrief) ||
      selectedKnightTransfers.length > 0;

    // Don't clear cache if there's a pending transfer (user hasn't chosen to resume or start fresh yet)
    // This prevents clearing the cache when component remounts and pendingTransfer is set but state vars are still empty
    const hasPendingTransfer = Boolean(pendingTransfer);

    // Also check if cache exists - if it does, don't clear it even if state is empty
    // This handles the case where component remounts and pendingTransfer hasn't been set yet
    const cachedState = readSessionCache<LaunchpadCacheState>(
      CACHE_STORAGE_KEY,
      {
        version: LAUNCHPAD_INTAKE_CACHE_VERSION,
      },
    );
    const hasCachedState = Boolean(
      cachedState &&
      ((cachedState.messages && cachedState.messages.length > 0) ||
        cachedState.summary ||
        cachedState.moderatorBrief ||
        (cachedState.knights && cachedState.knights.length > 0))
    );

    if (!hasState) {
      // Only clear cache if there's no pending transfer AND no cached state
      // This prevents clearing cache during remount before restoration can set pendingTransfer
      if (!hasPendingTransfer && !hasCachedState) {
        removeSessionCache(CACHE_STORAGE_KEY);
        removeSessionCache(BOARDROOM_CACHE_KEY); // Also clear boardroom cache since they share the same intake
        logDebug("[Launchpad] No state to save, clearing cache");
      } else {
        logDebug("[Launchpad] No state but pendingTransfer or cachedState exists, preserving cache", {
          hasPendingTransfer,
          hasCachedState,
        });
      }
      return;
    }

    const stateToSave = {
      messages: chatMessages,
      summary: intakeSummary,
      moderatorBrief,
      knights: selectedKnightTransfers,
    };
    
    logDebug("[Launchpad] Saving state to cache:", {
      messagesCount: chatMessages.length,
      hasSummary: Boolean(intakeSummary),
      hasModeratorBrief: Boolean(moderatorBrief),
      knightsCount: selectedKnightTransfers.length,
    });

    const writeResult = writeSessionCache(
      CACHE_STORAGE_KEY,
      stateToSave,
      {
        version: LAUNCHPAD_INTAKE_CACHE_VERSION,
        ttlMs: LAUNCHPAD_INTAKE_TTL_MS,
      },
    );
    
    if (!writeResult.success) {
      if (writeResult.reason === "quota_exceeded") {
        setStorageError("Storage is full. Please clear old sessions or refresh the page.");
        showToast({
          title: "Storage full",
          description: "Unable to save your progress. Please clear old sessions or refresh the page.",
          variant: "error",
        });
      } else if (writeResult.reason === "storage_unavailable") {
        setStorageError("Storage is unavailable. Your progress may not be saved.");
        showToast({
          title: "Storage unavailable",
          description: "Unable to save your progress. Please refresh the page.",
          variant: "error",
        });
      }
    } else {
      setStorageError(null);
      // Broadcast cache update
      const syncManager = getCacheSyncManager();
      syncManager.broadcastUpdate(CACHE_STORAGE_KEY, Date.now());
    }
    
    // Also sync to boardroom cache (messages and summary only) so boardroom page can resume
    const boardroomWriteResult = writeSessionCache(
      BOARDROOM_CACHE_KEY,
      {
        messages: chatMessages,
        summary: intakeSummary,
      },
      {
        version: BOARDROOM_CHAT_CACHE_VERSION,
        ttlMs: BOARDROOM_CHAT_TTL_MS,
      },
    );
    
    if (boardroomWriteResult.success) {
      const syncManager = getCacheSyncManager();
      syncManager.broadcastUpdate(BOARDROOM_CACHE_KEY, Date.now());
    }
  }, [chatMessages, intakeSummary, moderatorBrief, selectedKnightTransfers, pendingTransfer, showToast]);

  const handleChatSubmit = useCallback(
    async (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      if (!isChatActive) {
        return;
      }
      const trimmed = chatInput.trim();
      if (!trimmed || chatLoading) {
        return;
      }
      const userMessage: IntakeChatMessage = {
        id: generateId(),
        role: "user",
        content: trimmed,
      };
      setChatInput("");
      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
      const historyForRequest = [...chatMessages, userMessage];
      setChatMessages(historyForRequest);
      setChatLoading(true);
      setChatError(null);
      try {
        // If there's an existing summary (e.g., from document upload), pass it to the intake bot
        // This allows the bot to read the summary and ask for additional context
        const existingSummaryForIntake = intakeSummary || undefined;
        const data = await invokeIntake(historyForRequest, existingSummaryForIntake);
        // If done is true, always set the summary (even if empty, API will generate a default)
        if (data.done && data.summary) {
          setIntakeSummary(data.summary);
        } else if (data.summary) {
          // Also set summary if provided (for intermediate updates)
          setIntakeSummary(data.summary);
        }
        if (data.question) {
          setChatMessages((prev) => [...prev, { id: generateId(), role: "assistant", content: data.question }]);
        }
        // Clear any previous errors on success
        setChatError(null);
      } catch (error) {
        logError(error, "Launchpad: handleChatSubmit");
        const actionableError = getActionableErrorMessage(error);
        setChatError(actionableError.message);
      } finally {
        setChatLoading(false);
      }
    },
    [chatInput, chatLoading, chatMessages, invokeIntake, isChatActive, intakeSummary],
  );

  const handleFilePreview = useCallback(
    async (file: File) => {
      setUploading(true);
      setUploadError(null);
      setUploadProgress(0);
      setUploadStartTime(Date.now());
      
      try {
        const formData = new FormData();
        formData.append("file", file);

        const headers: HeadersInit = {};
        // Include token if available (optional for Community Edition)
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        // Use XMLHttpRequest for progress tracking
        const xhr = new XMLHttpRequest();
        const response = await new Promise<Response>((resolve, reject) => {
          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              const progress = calculateUploadProgress(e.loaded, e.total);
              setUploadProgress(progress);
            }
          });

          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(new Response(xhr.responseText, {
                status: xhr.status,
                statusText: xhr.statusText,
                headers: new Headers(),
              }));
            } else {
              reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
            }
          });

          xhr.addEventListener("error", () => {
            reject(new Error("Network error"));
          });

          xhr.open("POST", "/api/intake/upload/preview");
          Object.entries(headers).forEach(([key, value]) => {
            xhr.setRequestHeader(key, value);
          });
          xhr.send(formData);
        });

        if (!response.ok) {
          const errorText = await response.text();
          const errorBody = JSON.parse(errorText || "{}") as { 
            error?: string; 
            detail?: string;
            message?: string;
            limit?: number;
            remaining?: number;
            reset_at?: number;
            retry_after?: number;
          };
          
          // Handle rate limit errors (429)
          if (response.status === 429) {
            const rateLimitError = {
              error: errorBody.error || errorBody.message || errorBody.detail || "Rate limit exceeded",
              limit: errorBody.limit ?? 5,
              remaining: errorBody.remaining ?? 0,
              resetAt: errorBody.reset_at ?? Math.floor(Date.now() / 1000) + 3600,
              retryAfter: errorBody.retry_after ?? 3600,
            };
            setUploadRateLimitError(rateLimitError);
            setUploadError(null); // Clear generic error
            setUploading(false);
            return;
          }
          
          const errorMessage = errorBody.error || errorBody.detail || errorBody.message || "Failed to preview document";
          setUploadRateLimitError(null); // Clear rate limit error for other errors
          throw new Error(errorMessage);
        }

        const responseText = await response.text();
        const data = JSON.parse(responseText) as {
          extracted_text_preview: string;
          file_name: string;
          file_size: number;
          word_count: number;
          character_count: number;
        };
        
        setUploadProgress(100);
        // Store file and preview data
        setPendingFile(file);
        setPreviewData({
          fileName: data.file_name,
          fileSize: data.file_size,
          extractedTextPreview: data.extracted_text_preview,
        });
        
        // Check if there's existing state (summary, messages, active chat, or pending transfer)
        // Also check sessionStorage for cached state that might not have been restored yet
        const hasActiveState = Boolean(intakeSummary) || chatMessages.length > 0 || isChatActive || Boolean(moderatorBrief);
        const hasPendingTransfer = Boolean(pendingTransfer);
        
        // Check sessionStorage for cached state (synchronously, works for unencrypted data)
        const cachedState = readSessionCache<LaunchpadCacheState>(CACHE_STORAGE_KEY, {
          version: LAUNCHPAD_INTAKE_CACHE_VERSION,
        });
        const hasCachedState = Boolean(
          cachedState && 
          ((cachedState.messages?.length ?? 0) > 0 || cachedState.summary || cachedState.moderatorBrief || (cachedState.knights?.length ?? 0) > 0)
        );
        
        // Also check boardroom cache since they share the same intake
        const boardroomCachedState = readSessionCache<BoardroomIntakeCache>(BOARDROOM_CACHE_KEY, {
          version: BOARDROOM_CHAT_CACHE_VERSION,
        });
        const hasBoardroomCachedState = Boolean(boardroomCachedState && ((boardroomCachedState.messages?.length ?? 0) > 0 || boardroomCachedState.summary));
        
        const hasExistingState = hasActiveState || hasPendingTransfer || hasCachedState || hasBoardroomCachedState;
        
        if (hasExistingState) {
          // Store action to proceed with upload confirmation after replacement is confirmed
          pendingUploadReplaceAction.current = () => {
            setShowUploadConfirm(true);
          };
          // Show replacement confirmation dialog
          setShowReplaceUploadModal(true);
        } else {
          // Show normal upload confirmation dialog
          setShowUploadConfirm(true);
        }
      } catch (error) {
        logError(error, "Launchpad: handleFilePreview");
        const actionableError = getActionableErrorMessage(error);
        setUploadError(actionableError.message);
        setUploadRateLimitError(null); // Clear rate limit error on generic errors
      } finally {
        setUploading(false);
        setUploadProgress(0);
        setUploadStartTime(null);
      }
    },
    [token, intakeSummary, chatMessages.length, isChatActive]
  );

  const handleRetryFilePreview = useCallback(async () => {
    if (pendingFile) {
      setUploadError(null);
      await handleFilePreview(pendingFile);
    }
  }, [pendingFile, handleFilePreview]);

  const handleUploadConfirm = useCallback(
    async () => {
      if (!pendingFile) {
        return;
      }

      setUploading(true);
      setShowUploadConfirm(false);
      setUploadError(null);
      setUploadProgress(0);
      setUploadStartTime(Date.now());
      
      try {
        const formData = new FormData();
        formData.append("file", pendingFile);

        const headers: HeadersInit = {};
        // Include token if available (optional for Community Edition)
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        // Use XMLHttpRequest for progress tracking
        const xhr = new XMLHttpRequest();
        const response = await new Promise<Response>((resolve, reject) => {
          xhr.upload.addEventListener("progress", (e) => {
            if (e.lengthComputable) {
              const progress = calculateUploadProgress(e.loaded, e.total);
              setUploadProgress(progress);
            }
          });

          xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(new Response(xhr.responseText, {
                status: xhr.status,
                statusText: xhr.statusText,
                headers: new Headers(),
              }));
            } else {
              reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText}`));
            }
          });

          xhr.addEventListener("error", () => {
            reject(new Error("Network error"));
          });

          xhr.open("POST", "/api/intake/upload");
          Object.entries(headers).forEach(([key, value]) => {
            xhr.setRequestHeader(key, value);
          });
          xhr.send(formData);
        });

        if (!response.ok) {
          const responseText = await response.text();
          const errorBody = JSON.parse(responseText || "{}") as { error?: string; detail?: string };
          const errorMessage = errorBody.error || errorBody.detail || "Failed to upload document";
          
          throw new Error(errorMessage);
        }

        const responseText = await response.text();
        const data = JSON.parse(responseText) as { summary: string; done: boolean };
        
        if (data.summary) {
          // Automatically set the summary (no editor) - user can review and manually dispatch moderator
          setIntakeSummary(data.summary);
          setChatMessages([]);
          setChatError(null);
          // Clear upload error on success
          setUploadError(null);
        } else {
          throw new Error("No summary generated from document");
        }
      } catch (error) {
        logError(error, "Launchpad: handleUploadConfirm");
        const actionableError = getActionableErrorMessage(error);
        setUploadError(actionableError.message);
        setUploadRateLimitError(null); // Clear rate limit error on generic errors
      } finally {
        setUploading(false);
        setPendingFile(null);
        setPreviewData(null);
      }
    },
    [pendingFile, token]
  );

  const handleUploadCancel = useCallback(() => {
    setShowUploadConfirm(false);
    setPendingFile(null);
    setPreviewData(null);
    setUploadError(null);
    setUploadRateLimitError(null);
  }, []);

  const handleUploadReplaceConfirm = useCallback(() => {
    setShowReplaceUploadModal(false);
    const action = pendingUploadReplaceAction.current;
    pendingUploadReplaceAction.current = null;
    // Clear the state first (similar to reset but we'll proceed with upload)
    removeSessionCache(CACHE_STORAGE_KEY);
    removeSessionCache(BOARDROOM_CACHE_KEY);
    removeSessionCache(TRANSFER_STORAGE_KEY);
    setChatMessages([]);
    setIntakeSummary(null);
    setModeratorBrief(null);
    setModeratorError(null);
    setModeratorRateLimitError(null);
    setChatError(null);
    setPendingTransfer(null);
    setSelectedKnights([]);
    setKnightSearch("");
    setSeatError(null);
    hasBootstrapped.current = false;
    // Proceed with upload confirmation
    if (action) {
      action();
    } else {
      setShowUploadConfirm(true);
    }
  }, []);

  const handleUploadReplaceCancel = useCallback(() => {
    pendingUploadReplaceAction.current = null;
    setShowReplaceUploadModal(false);
    setPendingFile(null);
    setPreviewData(null);
    setUploadError(null);
  }, []);

  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        void handleFilePreview(file);
      }
      // Reset input so same file can be selected again
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    },
    [handleFilePreview]
  );

  const handleUploadButtonClick = useCallback(async () => {
    fileInputRef.current?.click();
  }, []);

  const handleSummaryConfirm = useCallback(
    (editedSummary: string) => {
      const isFromDocumentUpload = isSummaryFromDocumentUpload; // Capture current value
      setIntakeSummary(editedSummary);
      setIsEditingSummary(false);
      setUploadedSummary(null);
      setIsSummaryFromDocumentUpload(false); // Reset flag
      
      // Auto-start moderator brief generation if summary came from document upload
      if (isFromDocumentUpload && editedSummary.trim()) {
        // Use setTimeout to ensure state updates are applied before calling handleSendToModerator
        // We'll create a temporary function that uses editedSummary directly to avoid closure issues
        setTimeout(async () => {
          // Use the editedSummary directly instead of reading from state to avoid closure issues
          setModeratorBrief(null);
          setModeratorError(null);
    setModeratorRateLimitError(null);
          setModeratorLoading(true);
          setModeratorProgress(0);
          
          // Simulate progress steps - slower progression
          const progressSteps = [15, 30, 45, 60, 70, 80, 85, 90];
          let stepIndex = 0;
          const progressInterval = setInterval(() => {
            if (stepIndex < progressSteps.length) {
              setModeratorProgress(progressSteps[stepIndex]);
              stepIndex++;
            }
          }, 1200);
          
          try {
            const headers: HeadersInit = {
              "Content-Type": "application/json",
            };
            
            // Add Authorization header if token is available (Community Edition)
            if (token) {
              headers.Authorization = `Bearer ${token}`;
            }
            
            const response = await fetch("/api/moderator", {
              method: "POST",
              headers,
              body: JSON.stringify({
                topic: editedSummary,
                phase: "brief",
                context: conversationTranscript,
              }),
            });

            if (!response.ok) {
              const errorBody = await response.json().catch(() => ({}));
              
              // Check if it's a rate limit error (429)
              if (response.status === 429 && errorBody.limit !== undefined) {
                setModeratorRateLimitError({
                  error: errorBody.error || errorBody.message || "Rate limit exceeded",
                  limit: errorBody.limit,
                  remaining: errorBody.remaining || 0,
                  resetAt: errorBody.reset_at || Math.floor(Date.now() / 1000) + errorBody.retry_after,
                  retryAfter: errorBody.retry_after || 3600,
                });
                setModeratorError(null); // Clear regular error
                clearInterval(progressInterval);
                return; // Don't throw, we've handled it
              }
              
              const message = (errorBody as { error?: string }).error ?? "Board moderator request failed.";
              throw new Error(message);
            }

            const payload = (await response.json()) as { brief?: ModeratorBrief };
            if (payload.brief) {
              setModeratorProgress(100);
              setModeratorBrief(normalizeModeratorBrief(payload.brief));
            } else {
              throw new Error("Moderator returned an incomplete brief.");
            }
          } catch (error) {
            logError(error, "Launchpad: auto-generate moderator brief from document upload");
            const actionableError = getActionableErrorMessage(error);
            setModeratorError(actionableError.message);
          } finally {
            clearInterval(progressInterval);
            setModeratorLoading(false);
            setModeratorProgress(0);
          }
        }, 0);
      }
    },
    [isSummaryFromDocumentUpload, conversationTranscript]
  );

  const handleSummaryCancel = useCallback(() => {
    setIsEditingSummary(false);
    setUploadedSummary(null);
    setIsSummaryFromDocumentUpload(false); // Reset flag
    setUploadError(null);
  }, []);

  // Auto-resize textarea based on content (max 3 rows)
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 76; // ~3 rows for text-sm with py-2
      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  }, [chatInput]);

  // Handle Ctrl+Enter (or Cmd+Enter on Mac) to submit
  const handleTextareaKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        if (!chatLoading && chatInput.trim()) {
          const form = event.currentTarget.closest("form");
          if (form) {
            form.requestSubmit();
          }
        }
      }
    },
    [chatInput, chatLoading]
  );

  const resumeConversation = useCallback(
    (
      messages: IntakeChatMessage[],
      summary: string | null,
      cachedBrief: ModeratorBrief | null,
      cachedKnights: TransferKnight[] | null,
    ) => {
      const restoredMessages = [...messages];
      setChatMessages(restoredMessages);
      setIntakeSummary(summary ?? null);
      setChatError(null);
      // Normalize moderator brief once and reuse it
      const normalizedBrief = normalizeModeratorBrief(cachedBrief);
      setModeratorBrief(normalizedBrief);
      setSelectedKnights(
        (cachedKnights ?? []).map((knight) => ({
          id: knight.id,
          name: knight.name,
          role: knight.role,
          goal: knight.goal,
          backstory: knight.backstory,
          prompt: knight.prompt ?? null,
          model: knight.model,
          stance: knight.stance,
          temperature: knight.temperature,
          origin: "workspace",
          author: { name: "Moderator" },
          verified: true,
        })),
      );
      setModeratorError(null);
    setModeratorRateLimitError(null);
      setModeratorLoading(false);
      setIsChatActive(true);
      hasBootstrapped.current = true;

      // Only regenerate intake if moderator hasn't been set up yet AND no summary exists
      // If moderator brief exists OR summary exists, the intake process is complete and we shouldn't regenerate
      const lastMessage = restoredMessages[restoredMessages.length - 1];
      const hasSummary = Boolean(summary);
      const shouldRegenerateIntake = lastMessage?.role === "user" && !normalizedBrief && !hasSummary;
      
      if (shouldRegenerateIntake) {
        logDebug("[Launchpad] Resuming intake conversation - no moderator brief or summary found");
        setChatLoading(true);
        void (async () => {
          try {
            const data = await invokeIntake(restoredMessages);
            // If done is true, always set the summary (even if empty, API will generate a default)
            if (data.done && data.summary) {
              setIntakeSummary(data.summary);
            } else if (data.summary) {
              // Also set summary if provided (for intermediate updates)
              setIntakeSummary(data.summary);
            }
            if (data.question) {
              setChatMessages((prev) => [
                ...prev,
                { id: generateId(), role: "assistant", content: data.question },
              ]);
            }
          } catch (error) {
            logError(error, "Launchpad: resumeConversation");
            const actionableError = getActionableErrorMessage(error);
            setChatError(actionableError.message);
          } finally {
            setChatLoading(false);
          }
        })();
      } else {
        logDebug("[Launchpad] Skipping intake regeneration", {
          hasModeratorBrief: Boolean(normalizedBrief),
          hasSummary,
          lastMessageRole: lastMessage?.role,
        });
      }
    },
    [invokeIntake]
  );

  // Restore state on mount only
  useEffect(() => {
    // Only run restoration once on mount
    if (hasBootstrapped.current) {
      return;
    }

    logDebug("[Launchpad] Initial mount - checking for cached state");

    let restored = false;

    // First check for transfer payload
    const transferPayload = readSessionCache<LaunchpadTransferState>(
      TRANSFER_STORAGE_KEY,
      {
        version: LAUNCHPAD_TRANSFER_CACHE_VERSION,
      },
    );
    if (transferPayload) {
      logDebug("[Launchpad] Found transfer payload, restoring");
      removeSessionCache(TRANSFER_STORAGE_KEY);
      const normalizedTransfer = {
        messages: transferPayload.messages ?? [],
        summary: transferPayload.summary ?? null,
        moderatorBrief: normalizeModeratorBrief(transferPayload.moderatorBrief),
        knights: transferPayload.knights ?? null,
        knightIds: transferPayload.knightIds ?? null,
        autoStart: transferPayload.autoStart ?? false,
        fromDocumentUpload: transferPayload.fromDocumentUpload ?? false,
        autoConfirmSummary: transferPayload.autoConfirmSummary ?? false,
      };
      if (normalizedTransfer.autoStart) {
        // If autoConfirmSummary is true, automatically set summary (user can review and decide to dispatch moderator)
        if (normalizedTransfer.autoConfirmSummary && normalizedTransfer.summary) {
          setIntakeSummary(normalizedTransfer.summary);
          setChatMessages(normalizedTransfer.messages);
          setChatError(null);
          // Summary is set automatically, but user must manually click "Send to Moderator" to start brief generation
        } else if (normalizedTransfer.fromDocumentUpload && normalizedTransfer.summary) {
          // If from document upload but not auto-confirm, show summary editor
          setUploadedSummary(normalizedTransfer.summary);
          setIsEditingSummary(true);
          setIsSummaryFromDocumentUpload(true);
          setChatMessages(normalizedTransfer.messages);
          setChatError(null);
        } else {
          resumeConversation(
            normalizedTransfer.messages,
            normalizedTransfer.summary,
            normalizedTransfer.moderatorBrief ?? null,
            null,
          );
        }
        restored = true;
      } else {
        setIntakeSummary(normalizedTransfer.summary);
        setPendingTransfer(normalizedTransfer);
        restored = true;
      }
    }

    if (restored) {
      logDebug("[Launchpad] Restored from transfer payload");
      hasBootstrapped.current = true;
      return;
    }

    // Then check for regular cached state (launchpad's own cache)
    (async () => {
      // Use shared flag to prevent duplicate toasts when navigating between pages
      const RESTORE_TOAST_FLAG = "rt:intake:restore-toast-shown";
      
      const cacheResult = await readSessionCacheWithDetails<LaunchpadCacheState>(
        CACHE_STORAGE_KEY,
        {
          version: LAUNCHPAD_INTAKE_CACHE_VERSION,
        },
      );
      
      if (cacheResult.success) {
        const cachedState = cacheResult.data;
        logDebug("[Launchpad] Found cached state:", {
          messagesCount: cachedState.messages?.length ?? 0,
          hasSummary: Boolean(cachedState.summary),
          hasModeratorBrief: Boolean(cachedState.moderatorBrief),
          knightsCount: cachedState.knights?.length ?? 0,
        });
        
        const restoredMessages = cachedState.messages ?? [];
        const restoredSummary = cachedState.summary ?? null;
        const restoredBrief = normalizeModeratorBrief(cachedState.moderatorBrief);
        const restoredKnights = cachedState.knights ?? null;
        
        // Only restore if we have meaningful state to restore
        if (restoredMessages.length > 0 || restoredSummary || restoredBrief || (restoredKnights && restoredKnights.length > 0)) {
          // Restore the cached state as pending transfer so user can choose to resume or start fresh
          logDebug("[Launchpad] Found cached state, setting as pending transfer for user to resume");
          setPendingTransfer({
            messages: restoredMessages,
            summary: restoredSummary,
            moderatorBrief: restoredBrief,
            knights: restoredKnights,
            knightIds: restoredKnights?.map((k) => k.id) ?? null,
            autoStart: false, // Don't auto-start, let user choose
          });
          
          setCacheRestoreInfo({
            messageCount: restoredMessages.length,
            hasSummary: Boolean(restoredSummary),
            hasModeratorBrief: Boolean(restoredBrief),
            knightsCount: restoredKnights?.length ?? 0,
            timestamp: cacheResult.timestamp,
          });
          
          // Check flag right before showing toast to prevent race conditions
          if (sessionStorage.getItem(RESTORE_TOAST_FLAG) !== "true") {
            // Show informative toast - use unified "Intake restored" title
            const parts: string[] = [];
            if (restoredMessages.length > 0) {
              parts.push(`${restoredMessages.length} message${restoredMessages.length !== 1 ? "s" : ""}`);
            }
            if (restoredSummary) parts.push("summary");
            if (restoredBrief) parts.push("moderator brief");
            if (restoredKnights && restoredKnights.length > 0) {
              parts.push(`${restoredKnights.length} knight${restoredKnights.length !== 1 ? "s" : ""}`);
            }
            
            showToast({
              title: "Intake restored",
              description: `Found your previous session with ${parts.join(", ")}`,
              variant: "info",
            });
            
            sessionStorage.setItem(RESTORE_TOAST_FLAG, "true");
          }
          
          hasBootstrapped.current = true;
          return;
        }
      }
      
      if (!cacheResult.success && cacheResult.reason === "version_mismatch") {
        showToast({
          title: "Cache format updated",
          description: "Your saved session used an older format. Starting fresh.",
          variant: "info",
        });
      }
      
      // If no launchpad cache, check for boardroom cache (they share the same intake)
      const boardroomCacheResult = await readSessionCacheWithDetails<BoardroomIntakeCache>(
        BOARDROOM_CACHE_KEY,
        {
          version: BOARDROOM_CHAT_CACHE_VERSION,
        },
      );
      
      if (boardroomCacheResult.success) {
        const boardroomCache = boardroomCacheResult.data;
        if ((Array.isArray(boardroomCache.messages) && boardroomCache.messages.length > 0) || (typeof boardroomCache.summary === "string" && boardroomCache.summary.trim().length > 0)) {
          logDebug("[Launchpad] Found boardroom cached intake, setting as pending transfer for user to resume");
          const messageCount = boardroomCache.messages?.length ?? 0;
          const hasSummary = Boolean(boardroomCache.summary);
          
          setPendingTransfer({
            messages: boardroomCache.messages ?? [],
            summary: boardroomCache.summary ?? null,
            moderatorBrief: null, // Boardroom doesn't have moderator brief
            knights: null, // Boardroom doesn't have knights
            knightIds: null,
            autoStart: false, // Don't auto-start, let user choose
          });
          
          setCacheRestoreInfo({
            messageCount,
            hasSummary,
            hasModeratorBrief: false,
            knightsCount: 0,
            timestamp: boardroomCacheResult.timestamp,
          });
          
          // Check flag right before showing toast to prevent race conditions
          if (sessionStorage.getItem(RESTORE_TOAST_FLAG) !== "true") {
            showToast({
              title: "Intake restored",
              description: `Found your previous intake with ${messageCount} message${messageCount !== 1 ? "s" : ""}${hasSummary ? " and a summary" : ""}`,
              variant: "info",
            });
            
            sessionStorage.setItem(RESTORE_TOAST_FLAG, "true");
          }
          
          hasBootstrapped.current = true;
          return;
        }
      }
      
      if (!boardroomCacheResult.success && boardroomCacheResult.reason === "version_mismatch") {
        showToast({
          title: "Cache format updated",
          description: "Your saved intake used an older format. Starting fresh.",
          variant: "info",
        });
      }
      
      // No cached state found, bootstrap new chat
      logDebug("[Launchpad] No cached state found, bootstrapping new chat");
      hasBootstrapped.current = true;
      void bootstrapChat();
    })();
  }, [resumeConversation, bootstrapChat, showToast]);

  const hasBoardroomIntake = useCallback(() => {
    const cached = readSessionCache<BoardroomIntakeCache>(
      BOARDROOM_CACHE_KEY,
      {
        version: BOARDROOM_CHAT_CACHE_VERSION,
      },
    );
    if (!cached) {
      return false;
    }
    return Boolean(
      (Array.isArray(cached.messages) && cached.messages.length > 0) ||
      (typeof cached.summary === "string" && cached.summary.trim().length > 0),
    );
  }, []);

  const requestBoardroomReplacement = useCallback(
    (action: () => void) => {
      if (!hasBoardroomIntake()) {
        action();
        return;
      }
      pendingBoardroomReplaceAction.current = action;
      setShowReplaceBoardroomModal(true);
    },
    [hasBoardroomIntake]
  );

  const performLaunchpadIntakeReset = useCallback(() => {
    removeSessionCache(CACHE_STORAGE_KEY);
    removeSessionCache(BOARDROOM_CACHE_KEY);
    removeSessionCache(TRANSFER_STORAGE_KEY);
    setChatMessages([]);
    setIntakeSummary(null);
    setModeratorBrief(null);
    setModeratorError(null);
    setModeratorRateLimitError(null);
    setChatError(null);
    setPendingTransfer(null);
    setIsChatActive(false);
    setModeratorLoading(false);
    setSelectedKnights([]);
    setKnightSearch("");
    setSeatError(null);
    hasBootstrapped.current = false;
    // Don't automatically start the intake - let user click "Start intake" button
  }, []);

  const performLaunchpadIntakeStart = useCallback(() => {
    removeSessionCache(CACHE_STORAGE_KEY);
    removeSessionCache(BOARDROOM_CACHE_KEY);
    removeSessionCache(TRANSFER_STORAGE_KEY);
    setChatMessages([]);
    setIntakeSummary(null);
    setModeratorBrief(null);
    setModeratorError(null);
    setModeratorRateLimitError(null);
    setChatError(null);
    setPendingTransfer(null);
    setIsChatActive(true);
    setModeratorLoading(false);
    setSelectedKnights([]);
    setKnightSearch("");
    setSeatError(null);
    hasBootstrapped.current = false;
    void bootstrapChat();
  }, [bootstrapChat]);

  const handleBoardroomReplaceConfirm = useCallback(() => {
    setShowReplaceBoardroomModal(false);
    const action = pendingBoardroomReplaceAction.current;
    pendingBoardroomReplaceAction.current = null;
    if (action) {
      action();
    }
  }, []);

  const handleBoardroomReplaceCancel = useCallback(() => {
    pendingBoardroomReplaceAction.current = null;
    setShowReplaceBoardroomModal(false);
  }, []);

  useEffect(() => {
    if (!pendingTransfer || isChatActive || !pendingTransfer.autoStart) {
      return;
    }
    resumeConversation(
      pendingTransfer.messages,
      pendingTransfer.summary ?? null,
      pendingTransfer.moderatorBrief ?? null,
      pendingTransfer.knights ?? null,
    );
    setPendingTransfer(null);
  }, [isChatActive, pendingTransfer, resumeConversation]);

  // Set up BroadcastChannel sync for cache updates
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncManager = getCacheSyncManager();
    const unsubscribe = syncManager.subscribe((message) => {
      if (message.type === "cache-updated" && (message.key === CACHE_STORAGE_KEY || message.key === BOARDROOM_CACHE_KEY)) {
        // Cache was updated in another tab, refresh if we're not actively editing
        if (!isChatActive && !hasUnsavedChanges) {
          const cached = readSessionCache<LaunchpadCacheState>(CACHE_STORAGE_KEY, {
            version: LAUNCHPAD_INTAKE_CACHE_VERSION,
          });
          if (cached && ((cached.messages?.length ?? 0) > 0 || cached.summary || cached.moderatorBrief || (cached.knights && cached.knights.length > 0))) {
            if (!pendingTransfer) {
              setPendingTransfer({
                messages: cached.messages ?? [],
                summary: cached.summary ?? null,
                moderatorBrief: normalizeModeratorBrief(cached.moderatorBrief),
                knights: cached.knights ?? null,
                knightIds: cached.knights?.map((k) => k.id) ?? null,
                autoStart: false,
              });
            }
          }
        }
      } else if (message.type === "cache-removed" && (message.key === CACHE_STORAGE_KEY || message.key === BOARDROOM_CACHE_KEY)) {
        // Cache was removed in another tab
        if (!isChatActive && !hasUnsavedChanges) {
          setPendingTransfer(null);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isChatActive, hasUnsavedChanges, pendingTransfer]);

  const handleStartIntake = useCallback(() => {
    setShowButtonSparkle(false); // Hide animation when button is clicked
    if (!checkBeforeNavigate()) {
      return;
    }
    requestBoardroomReplacement(performLaunchpadIntakeStart);
  }, [performLaunchpadIntakeStart, requestBoardroomReplacement, checkBeforeNavigate]);

  const handleResumeTransfer = useCallback(() => {
    if (!pendingTransfer) {
      handleStartIntake();
      return;
    }
    resumeConversation(
      pendingTransfer.messages,
      pendingTransfer.summary ?? null,
      pendingTransfer.moderatorBrief ?? null,
      pendingTransfer.knights ?? null,
    );
    setPendingTransfer(null);
  }, [handleStartIntake, pendingTransfer, resumeConversation]);

  const handleRestart = useCallback(() => {
    requestBoardroomReplacement(performLaunchpadIntakeReset);
  }, [performLaunchpadIntakeReset, requestBoardroomReplacement]);

  const handleRefineIntake = useCallback(() => {
    // Don't clear the summary - keep it so the brief stays visible
    // Activate chat and bootstrap it with the existing summary
    setIsChatActive(true);
    // Bootstrap chat with existing summary so bot can read it and ask for more context
    // Reset hasBootstrapped flag to allow re-bootstrapping when adding more context
    // Only bootstrap if there are no existing messages to avoid losing conversation history
    if (chatMessages.length === 0 && intakeSummary) {
      hasBootstrapped.current = false;
      void bootstrapChat();
    }
    // If there are existing messages, the existing summary will be passed in handleChatSubmit
    // Focus the input after a brief delay to ensure it's rendered
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 100);
  }, [intakeSummary, chatMessages.length, bootstrapChat]);

  const handleSendToModerator = useCallback(async () => {
    if (!intakeSummary) {
      return;
    }
    setModeratorBrief(null);
    setModeratorError(null);
    setModeratorRateLimitError(null);
    setModeratorLoading(true);
    setModeratorProgress(0);
    
    // Simulate progress steps
    const progressSteps = [25, 50, 75];
    let stepIndex = 0;
    const progressInterval = setInterval(() => {
      if (stepIndex < progressSteps.length) {
        setModeratorProgress(progressSteps[stepIndex]);
        stepIndex++;
      }
    }, 500);
    
    try {
      // 1. Check rate limit status FIRST
      const rateLimitStatus = await checkRateLimitStatus("moderator", token);
      
      // 2. Determine if CAPTCHA needed
      const captchaNeeded = needsCaptcha(user, rateLimitStatus);
      
      // 3. Execute Turnstile if needed
      let turnstileToken: string | null = null;
      if (captchaNeeded) {
        turnstileToken = await executeTurnstile("moderator");
        if (!turnstileToken) {
          setModeratorError("Security verification failed. Please refresh and try again.");
          clearInterval(progressInterval);
          setModeratorLoading(false);
          return;
        }
      }
      
      // 4. Make request with Turnstile token and auth token in headers
      const headers: HeadersInit = {
        "Content-Type": "application/json",
        ...(turnstileToken ? { "X-Turnstile-Token": turnstileToken } : {}),
      };
      
      // Add Authorization header if token is available (Community Edition)
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      
      const response = await fetch("/api/moderator", {
        method: "POST",
        headers,
        body: JSON.stringify({
          topic: intakeSummary,
          phase: "brief",
          context: conversationTranscript,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        
        // Debug logging
        if (process.env.NODE_ENV === "development") {
          console.log("[rate-limit] Response status:", response.status);
          console.log("[rate-limit] Error body:", errorBody);
        }
        
        // Check if it's a rate limit error (429)
        if (response.status === 429 && errorBody.limit !== undefined) {
          if (process.env.NODE_ENV === "development") {
            console.log("[rate-limit] Rate limit error detected:", errorBody);
          }
          setModeratorRateLimitError({
            error: errorBody.error || errorBody.message || "Rate limit exceeded",
            limit: errorBody.limit,
            remaining: errorBody.remaining || 0,
            resetAt: errorBody.reset_at || Math.floor(Date.now() / 1000) + errorBody.retry_after,
            retryAfter: errorBody.retry_after || 3600,
          });
          setModeratorError(null); // Clear regular error
          clearInterval(progressInterval); // Stop progress animation
          setModeratorLoading(false); // Stop loading state
          return; // Don't throw, we've handled it
        }
        
        const message = (errorBody as { error?: string }).error ?? "Board moderator request failed.";
        throw new Error(message);
      }

      const payload = (await response.json()) as { brief?: ModeratorBrief };
      if (payload.brief) {
        setModeratorProgress(100);
        setModeratorBrief(normalizeModeratorBrief(payload.brief));
        // Clear any previous errors on success
        setModeratorError(null);
    setModeratorRateLimitError(null);
      } else {
        throw new Error("Moderator returned an incomplete brief.");
      }
    } catch (error) {
      logError(error, "Launchpad: handleSendToModerator");
      
      // Check if it's a rate limit error from the error object
      if (error instanceof Error && (error as any).status === 429) {
        // Try to extract rate limit info from error if available
        const rateLimitInfo = (error as any).rateLimitInfo;
        if (rateLimitInfo) {
          setModeratorRateLimitError({
            error: error.message || "Rate limit exceeded",
            limit: rateLimitInfo.limit,
            remaining: rateLimitInfo.remaining || 0,
            resetAt: rateLimitInfo.reset_at || Math.floor(Date.now() / 1000) + rateLimitInfo.retry_after,
            retryAfter: rateLimitInfo.retry_after || 3600,
          });
          setModeratorError(null);
          return;
        }
      }
      
      const actionableError = getActionableErrorMessage(error);
      setModeratorError(actionableError.message);
      setModeratorRateLimitError(null); // Clear rate limit error
    } finally {
      clearInterval(progressInterval); // Ensure interval is cleared
      setModeratorLoading(false);
    }
  }, [conversationTranscript, intakeSummary, user, token, executeTurnstile]);

  const handleRetryModeratorBrief = useCallback(async () => {
    setModeratorError(null);
    setModeratorRateLimitError(null);
    setModeratorRateLimitError(null);
    await handleSendToModerator();
  }, [handleSendToModerator]);

  const handleStartLiveSession = useCallback(async () => {
    // Guard against double-click
    if (isCreatingSessionRef.current) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[Launchpad] Session creation already in progress, ignoring duplicate request");
      }
      return;
    }
    
    if (!moderatorBrief) {
      console.warn("[Launchpad] Cannot start session: moderator brief is missing");
      setModeratorError("Please generate a moderator brief before starting the session.");
      return;
    }
    if (selectedKnights.length < MIN_KNIGHTS_REQUIRED) {
      setSeatError(`Seat at least ${MIN_KNIGHTS_REQUIRED} Knights before launching.`);
      return;
    }
    setSeatError(null);
    setModeratorError(null);
    setModeratorRateLimitError(null);
    
    // Create draft session first
    isCreatingSessionRef.current = true;
    setIsLaunchingLiveSession(true);
    setIsPreparingSession(true);
    sessionProgressTracker.nextStep(); // Move to first step
    try {
      const headers: HeadersInit = { "Content-Type": "application/json" };
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
      console.log("[Launchpad] Creating debate session with:", {
        hasModeratorBrief: !!moderatorBrief,
        hasIntakeSummary: !!intakeSummary,
        knightCount: selectedKnightIds.length,
        hasToken: !!token,
      });
      
      const response = await fetch("/api/debate/session", {
        method: "POST",
        headers,
        body: JSON.stringify({
          topic: moderatorBrief.topicSummary || intakeSummary || "Live session topic",
          moderatorBrief,
          intakeSummary: intakeSummary ?? null,
          intakeConversation: chatMessages.map((msg) => ({ role: msg.role, content: msg.content })) ?? null,
          knightIds: selectedKnightIds,
          knights: selectedKnightTransfers,
        }),
      });
      
      console.log("[Launchpad] Session creation response:", {
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
      });
      
      if (!response.ok) {
        const errorBody = (await response.json().catch(() => ({}))) as { error?: string };
        console.error("[Launchpad] Session creation failed:", errorBody);
        throw new Error(errorBody.error ?? `Unable to create debate session (${response.status} ${response.statusText}).`);
      }
      const payload = (await response.json()) as { sessionId?: string };
      if (!payload.sessionId) {
        console.error("[Launchpad] Session ID missing from response:", payload);
        throw new Error("Debate session ID missing from response.");
      }
      
      console.log("[Launchpad] Session created successfully:", payload.sessionId);
      
      // Store topic in sessionStorage (backend has Redis/DB fallbacks for persistence)
      const topicToStore = moderatorBrief.topicSummary || intakeSummary || "Live session topic";
      if (typeof window !== "undefined") {
        sessionStorage.setItem(`session_topic_${payload.sessionId}`, topicToStore);
      }
      
      // Clear intake cache since debate is starting
      removeSessionCache(CACHE_STORAGE_KEY);
      removeSessionCache(BOARDROOM_CACHE_KEY);
      removeSessionCache(TRANSFER_STORAGE_KEY);
      logDebug("[Launchpad] Cleared intake cache after creating debate session", { sessionId: payload.sessionId });
      
      // Skip payment and navigate directly to live session
      // Show loading state for a moment before navigating (better UX feedback)
      sessionProgressTracker.nextStep(); // Move to next step - "Setting up knights"
      
      // Add a delay to show the preparation screen (minimum 2 seconds)
      await new Promise(resolve => setTimeout(resolve, 1500));
      sessionProgressTracker.nextStep(); // Move to final step - "Launching debate"
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      skipWarning(); // Skip unsaved changes warning
      // Scroll to top before navigation to prevent jump
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "instant" });
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      }
      // IMPORTANT: Keep isPreparingSession=true during navigation to prevent screen jump
      // The loading screen will cover the transition until the live page loads
      // Use replace with scroll: false to prevent any scroll restoration
      router.replace(`/app/live?session=${payload.sessionId}`, { scroll: false });
      // Don't set isPreparingSession to false here - let the page transition handle it
    } catch (error) {
      logError(error, "Launchpad: handleStartLiveSession");
      console.error("[Launchpad] Error starting live session:", error);
      
      // Log more details about the error
      if (error instanceof Error) {
        console.error("[Launchpad] Error message:", error.message);
        console.error("[Launchpad] Error stack:", error.stack);
        if ((error as any).response) {
          console.error("[Launchpad] Error response:", (error as any).response);
        }
      }
      
      const actionableError = getActionableErrorMessage(error);
      setModeratorError(actionableError.message || "Failed to start session. Please try again.");
      setIsPreparingSession(false);
    } finally {
      isCreatingSessionRef.current = false;
      setIsLaunchingLiveSession(false);
    }
  }, [
    conversationTranscript,
    intakeSummary,
    moderatorBrief,
    selectedKnightIds,
    selectedKnightTransfers,
    selectedKnights.length,
    token,
    router,
    skipWarning,
  ]);

  const currentStep = useMemo(() => {
    // Skip payment step - go directly from moderator to debate
    // Step 4: Debate is running or completed
    if (debateStatus === "running" || debateStatus === "completed") return 4;
    // Step 3: Moderator brief is ready (ready for debate)
    if (moderatorBrief) return 3;
    // Step 2: Summary is ready
    if (intakeSummary) return 2;
    // Step 1: Intake
    return 1;
  }, [intakeSummary, moderatorBrief, debateStatus]);

  if (authStatus === "loading") {
    return <LaunchpadSkeleton />;
  }

  return (
    <div
      className="relative min-h-screen overflow-hidden text-white transition-opacity duration-500"
      style={{ animation: "pageFade 600ms ease-out" }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{ animation: "pageFade 900ms ease-out" }}
      />

      <div
        className="relative z-10 container-box flex flex-col gap-10 transition-all duration-500"
        style={{ animation: "contentRise 600ms ease-out 0.1s both" }}
      >
        <header
          className="transition-transform duration-500"
          style={{ animation: "contentRise 600ms ease-out 0.15s both" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <h1 className="text-[clamp(2.25rem,3.2vw,3rem)] font-semibold leading-tight text-white">
                Prepare Your Idea for Roasting
              </h1>
              <p className="mt-3 max-w-2xl text-base text-white/75">
                Intake Assistant captures your brief, then the board moderator assembles your AI Council. Twelve specialized Knights will debate, challenge, and roast weak ideas until only defensible truth remains.
              </p>
            </div>
          </div>
        </header>

        <section
          className="flex flex-wrap gap-3 text-xs uppercase tracking-[0.32em] text-base-subtext/70"
          style={{ animation: "contentRise 600ms ease-out 0.2s both" }}
        >
          {STEP_LABELS.map((step, index) => {
            const stepNumber = index + 1;
            const isActive = currentStep === stepNumber;
            const isCompleted = currentStep > stepNumber;
            // Step colors: Step 1: gold, Step 2: teal, Step 3: emerald, Step 4: purple (debate)
            const getStepBorderClass = () => {
              if (stepNumber === 1) {
                return isActive ? "border-gold-500" : isCompleted ? "border-gold-500" : "border-gold-900/50";
              } else if (stepNumber === 2) {
                return isActive ? "border-teal-500" : isCompleted ? "border-teal-500" : "border-teal-900/50";
              } else if (stepNumber === 3) {
                return isActive ? "border-emerald-500" : isCompleted ? "border-emerald-500" : "border-emerald-900/50";
              } else if (stepNumber === 4) {
                // Step 4 is Debate (purple)
                return isActive ? "border-purple-500" : isCompleted ? "border-purple-500" : "border-purple-900/50";
              }
            };
            // Get status text for DEBATE step
            const getStatusText = () => {
              // Step 4 is Debate
              if (stepNumber === 4) {
                if (debateStatus === "running") return "Running";
                if (debateStatus === "completed") return "Completed";
                if (debateStatus === "error") return "Error";
                return "";
              }
              return "";
            };

            const statusText = getStatusText();
            const getStatusColor = () => {
              // Step 4 is Debate
              if (stepNumber === 4) {
                if (debateStatus === "running") return "bg-purple-500/20 text-purple-300 border border-purple-500/30";
                if (debateStatus === "completed") return "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30";
                if (debateStatus === "error") return "bg-rose-500/20 text-rose-300 border border-rose-500/30";
                return "bg-purple-500/10 text-purple-200 border border-purple-500/20";
              }
              return "";
            };

            // For Debate step, use icon-based minimal design
            // Step 4 is Debate
            const isDebateStep = stepNumber === 4;
            
            return (
              <span
                key={step.label}
                className={cn(
                  isDebateStep 
                    ? "inline-flex min-w-[80px] flex-shrink-0 items-center justify-center gap-2 rounded-full border px-3 py-2 text-[0.7rem] transition"
                    : "inline-flex min-w-[160px] flex-1 items-center justify-between gap-3 rounded-full border px-4 py-2 text-[0.7rem] transition",
                  getStepBorderClass(),
                  isActive ? "text-base-text" : isCompleted ? "text-white" : "text-base-subtext",
                )}
                style={{ animation: "contentRise 600ms ease-out 0.25s both" }}
                title={isDebateStep ? "Debate" : undefined}
              >
                {isDebateStep ? (
                  // Minimal icon-based design for Debate
                  <>
                    {debateStatus === "running" ? (
                      <Zap className={cn(
                        "h-4 w-4 shrink-0",
                        isActive ? "text-purple-400" : isCompleted ? "text-purple-500" : "text-purple-500/50"
                      )} />
                    ) : debateStatus === "completed" ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-purple-500" />
                    ) : (
                      <Users className={cn(
                        "h-4 w-4 shrink-0",
                        isActive ? "text-purple-400" : isCompleted ? "text-purple-500" : "text-purple-500/50"
                      )} />
                    )}
                    {isActive && !debateStatus && (
                      <InlineLoading size="sm" spinnerColor="text-purple-500" />
                    )}
                    {statusText && (
                      <span className={cn(
                        "text-[0.65rem] font-medium normal-case tracking-normal whitespace-nowrap",
                        getStatusColor() || (isActive ? "text-purple-300" : isCompleted ? "text-purple-400" : "text-purple-500/70")
                      )}>
                        {statusText}
                      </span>
                    )}
                  </>
                ) : (
                  // Standard design for other steps
                  <>
                    <span>{step.label}</span>
                    <span className="flex items-center gap-2">
                      {statusText && (
                        <span className={cn(
                          "text-[0.7rem] font-medium normal-case tracking-normal whitespace-nowrap px-2 py-0.5 rounded",
                          getStatusColor() || (isActive ? "text-base-text/90" : isCompleted ? "text-white/80" : "text-base-subtext/90")
                        )}>
                          {statusText}
                        </span>
                      )}
                      {isCompleted ? (
                        <CheckCircle2 
                          className={cn(
                            "h-4 w-4 shrink-0",
                            stepNumber === 1 ? "text-gold-500" : stepNumber === 2 ? "text-teal-500" : stepNumber === 3 ? "text-emerald-500" : stepNumber === 4 ? "text-cyan-500" : "text-purple-500"
                          )} 
                          aria-hidden="true" 
                        />
                      ) : isActive ? (
                        <InlineLoading size="sm" spinnerColor={stepNumber === 1 ? "text-gold-500" : stepNumber === 2 ? "text-teal-500" : stepNumber === 3 ? "text-emerald-500" : stepNumber === 4 ? "text-cyan-500" : "text-purple-500"} />
                      ) : (
                        <ArrowRight className="h-4 w-4 shrink-0 opacity-60" aria-hidden="true" />
                      )}
                    </span>
                  </>
                )}
              </span>
            );
          })}
        </section>

        <section
          className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
          style={{ animation: "contentRise 600ms ease-out 0.3s both" }}
        >
          <div className="rounded-[26px] border border-slate-200/20   p-6 transition-transform duration-500">
            <div className="flex items-center justify-between gap-3 text-xs uppercase tracking-[0.35em]">
              <div className="flex items-center gap-3">
                <span className="mt-1 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gold-500/30 bg-[radial-gradient(circle_at_center,_rgba(242,194,79,0.22)_0%,_rgba(15,23,36,0.85)_70%)] text-white">
                  <Bot className="h-6 w-6" aria-hidden="true" />
                </span>
                Intake Assistant
              </div>
              {(intakeSummary || chatMessages.length > 0 || isChatActive) && (
                <button
                  type="button"
                  onClick={() => requestBoardroomReplacement(performLaunchpadIntakeReset)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-rose-100 transition hover:border-rose-300/60 hover:text-rose-200"
                  aria-label="Restart intake"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" />
                  Restart
                </button>
              )}
            </div>

            {!isChatActive ? (
              <div className="mt-6 space-y-4 rounded-2xl border border-dashed border-gold-500/35 bg-[rgba(20,18,12,0.6)] p-6 text-sm text-gold-100/80">
                <div>
                  <p className="text-base font-semibold text-white">Launch the intake assistant when you're ready to get roasted.</p>
                  <div className="mt-2 text-xs uppercase tracking-[0.32em] text-gold-200/60">
                    {pendingTransfer ? (
                      <div className="space-y-1">
                        <p>Resume where you left off; your idea is ready for roasting.</p>
                        {cacheRestoreInfo && (
                          <p className="text-[0.65rem] normal-case text-gold-300/70">
                            {cacheRestoreInfo.messageCount > 0 && (
                              <span>{cacheRestoreInfo.messageCount} message{cacheRestoreInfo.messageCount !== 1 ? "s" : ""}</span>
                            )}
                            {cacheRestoreInfo.messageCount > 0 && cacheRestoreInfo.hasSummary && <span> • </span>}
                            {cacheRestoreInfo.hasSummary && <span>Summary</span>}
                            {cacheRestoreInfo.hasModeratorBrief && (
                              <>
                                {(cacheRestoreInfo.messageCount > 0 || cacheRestoreInfo.hasSummary) && <span> • </span>}
                                <span>Moderator brief</span>
                              </>
                            )}
                            {cacheRestoreInfo.knightsCount > 0 && (
                              <>
                                {(cacheRestoreInfo.messageCount > 0 || cacheRestoreInfo.hasSummary || cacheRestoreInfo.hasModeratorBrief) && <span> • </span>}
                                <span>{cacheRestoreInfo.knightsCount} knight{cacheRestoreInfo.knightsCount !== 1 ? "s" : ""}</span>
                              </>
                            )}
                            {cacheRestoreInfo.timestamp && (
                              <span className="ml-2">
                                {new Date(cacheRestoreInfo.timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                              </span>
                            )}
                          </p>
                        )}
                      </div>
                    ) : (
                      "Share your opening context; the intake assistant will gather the rest and prep the moderator."
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-3">
                  <div className="relative inline-block">
                    <GradientButton
                      variant="gold"
                      onClick={handleStartIntake}
                      className={cn(
                        "!bg-gold-500/60 hover:!bg-gold-500/70 !text-gold-100",
                        showButtonSparkle ? "relative z-10 shadow-lg shadow-gold-500/20" : ""
                      )}
                    >
                      Click Here to Start
                    </GradientButton>
                  </div>
                  {pendingTransfer ? (
                    <button
                      type="button"
                      aria-label="Resume previous intake conversation"
                      className="inline-flex items-center gap-2 rounded-full border border-gold-500/40 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:border-gold-400/60 hover:text-gold-200"
                      onClick={handleResumeTransfer}
                    >
                      <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      Resume previous brief
                    </button>
                  ) : null}
                  <GradientButton
                    variant="ghost"
                    onClick={handleUploadButtonClick}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <InlineLoading size="sm" text="Uploading..." />
                    ) : (
                      <>
                        <FileText className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                        Upload document
                      </>
                    )}
                  </GradientButton>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.docx"
                    onChange={handleFileSelect}
                    className="hidden"
                    aria-label="Upload document"
                  />
                </div>
              </div>
            ) : (
              <IntakeChat
                messages={chatMessages}
                input={chatInput}
                onInputChange={(value) => {
                  setChatInput(value);
                  // Activate chat if user starts typing and there's an existing summary
                  if (!isChatActive && value.trim() && intakeSummary) {
                    setIsChatActive(true);
                    // Bootstrap chat with existing summary
                    if (chatMessages.length === 0) {
                      void bootstrapChat();
                    }
                  }
                }}
                onSubmit={handleChatSubmit}
                onKeyDown={handleTextareaKeyDown}
                isLoading={chatLoading}
                error={chatError}
                onRetryError={handleRetryBootstrapChat}
                onDismissError={() => setChatError(null)}
                uploadError={uploadError}
                onRetryUpload={handleRetryFilePreview}
                uploadRateLimitError={uploadRateLimitError}
                onUploadRateLimitErrorDismiss={() => setUploadRateLimitError(null)}
                isEditingSummary={isEditingSummary}
                uploadedSummary={uploadedSummary}
                onSummaryConfirm={handleSummaryConfirm}
                onSummaryCancel={handleSummaryCancel}
                intakeSummary={intakeSummary}
                onInputFocus={() => {
                  // Activate chat when user focuses on input if there's an existing summary
                  if (!isChatActive && intakeSummary && chatMessages.length === 0) {
                    setIsChatActive(true);
                    // Bootstrap chat with existing summary
                    void bootstrapChat();
                  }
                }}
                chatContainerRef={chatContainerRef}
                textareaRef={textareaRef}
              />
            )}

            {/* Document Upload Replacement Confirmation Modal */}
        {showReplaceUploadModal && typeof document !== "undefined"
          ? createPortal(
              <div
                className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm"
                role="dialog"
                aria-modal="true"
                aria-labelledby="upload-replace-heading"
                onClick={handleUploadReplaceCancel}
              >
                <div
                  className="w-full max-w-lg rounded-[28px] border border-emerald-500/35 bg-[rgba(6,24,35,0.96)] p-6"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="space-y-4 text-emerald-100/80">
                    <div>
                      <p id="upload-replace-heading" className="text-lg font-semibold text-white">
                        Replace existing session?
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-emerald-100/70">
                        Uploading this document will replace your current intake session. Continue if you are comfortable discarding the current session.
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-3 text-xs uppercase tracking-[0.26em]">
                      <button
                        type="button"
                        onClick={handleUploadReplaceCancel}
                        className="rounded-full border border-emerald-500/35 px-4 py-2 text-emerald-200 transition hover:border-emerald-400/55 hover:text-white"
                      >
                        Keep existing session
                      </button>
                      <button
                        type="button"
                        onClick={handleUploadReplaceConfirm}
                        className="rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-2 text-[#0b1b2c] transition hover:from-emerald-400 hover:to-emerald-500"
                      >
                        Replace with document
                      </button>
                    </div>
                  </div>
                </div>
              </div>,
              document.body,
            )
          : null}

            {/* Document Upload Confirmation Modal */}
            {showUploadConfirm && previewData && (
              <DocumentUploadConfirm
                open={showUploadConfirm}
                onOpenChange={setShowUploadConfirm}
                onConfirm={handleUploadConfirm}
                onCancel={handleUploadCancel}
                fileName={previewData.fileName}
                fileSize={previewData.fileSize}
                extractedTextPreview={previewData.extractedTextPreview}
                isLoading={uploading}
              />
            )}
            
            {/* Storage Error Display */}
            {storageError && (
              <div className="mt-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
                <p className="font-semibold text-amber-200">Storage Warning</p>
                <p className="mt-1">{storageError}</p>
                <button
                  type="button"
                  onClick={() => setStorageError(null)}
                  className="mt-2 text-xs underline hover:text-amber-50"
                >
                  Dismiss
                </button>
              </div>
            )}
          </div>

          <div
            className="flex flex-col gap-6 transition-transform duration-500"
            style={{ animation: "contentRise 600ms ease-out 0.34s both" }}
          >
            <div className="rounded-[26px] border border-slate-200/20  p-5">
              <p className="text-[0.6rem] uppercase tracking-[0.35em] text-gold-500/70">Current status</p>
              <div className="mt-3 flex items-center gap-3 text-sm font-medium text-white">
                <span
                  className={cn(
                    "inline-flex h-2.5 w-2.5 rounded-full",
                    currentStep >= 2 ? "bg-gold-500" : isChatActive ? "bg-gold-500/60 animate-pulse" : "bg-gold-500/40",
                  )}
                />
                {currentStep === 1 && (isChatActive ? "Gathering context with intake assistant" : "Awaiting intake kickoff")}
                {currentStep === 2 && "Summary ready for approval"}
                {currentStep === 3 && "Board moderator has prepared the council for debate"}
                {currentStep === 4 && (
                  debateStatus === "running" ? "Debate in progress" : debateStatus === "completed" ? "Debate completed" : "Ready to start debate"
                )}
              </div>
              <p className="mt-3 text-xs leading-relaxed text-gold-100/65">
                Provide enough context so the moderator can line up the right knights and constraints. You can restart
                the intake at any time if you want to refine the brief.
              </p>
            </div>

            <div className="rounded-[26px] border border-gold-500/20 p-5">
              <p className="flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.35em] text-gold-500/70">
                <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
                Transcript
              </p>
              <div className="mt-3 max-h-48 overflow-y-auto text-[0.72rem] leading-relaxed text-gold-100/60">
                {conversationTranscript ? (
                  conversationTranscript.split("\n").map((line, index) => (
                    <p key={index} className="mt-1">
                      {line}
                    </p>
                  ))
                ) : (
                  <p className="text-gold-100/50">Conversation transcript will appear here.</p>
                )}
              </div>
            </div>
          </div>
        </section>

        {intakeSummary ? (
          <section
            className="rounded-[28px] border border-teal-400/30 bg-[rgba(10,26,40,0.78)] px-6 py-6 transition-transform duration-500"
            style={{ animation: "contentRise 600ms ease-out 0.38s both" }}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.35em] text-teal-200/80">
                  <CheckCircle2 className="h-4 w-4 text-teal-300" aria-hidden="true" />
                  Summary ready
                </p>
                <h2 className="mt-2 text-xl font-semibold text-white">Confirm intake brief</h2>
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleSendToModerator}
                  disabled={moderatorLoading || isModeratorDispatched}
                  className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-teal-500 to-teal-600 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#0b1b2c] transition hover:from-teal-400 hover:to-teal-500 disabled:cursor-not-allowed disabled:opacity-50 disabled:saturate-50"
                >
                  {isModeratorDispatched ? "Moderator dispatched" : "Dispatch moderator"}
                  {moderatorLoading ? <InlineLoading size="sm" spinnerColor="text-[#0b1b2c]" /> : null}
                </button>
                <button
                  type="button"
                  onClick={handleRefineIntake}
                  disabled={moderatorLoading || isModeratorDispatched}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-200 transition hover:border-slate-200/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Add more context
                </button>
                <button
                  type="button"
                  onClick={handleRestart}
                  className="inline-flex items-center gap-2 rounded-full border border-rose-400/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-rose-100 transition hover:border-rose-300/60 hover:text-rose-200"
                >
                  Restart intake
                </button>
              </div>
            </div>
            <p className="mt-4 whitespace-pre-line text-sm leading-relaxed text-slate-200/80">{intakeSummary}</p>
            {moderatorRateLimitError ? (
              <RateLimitErrorDisplay
                error={moderatorRateLimitError.error}
                limit={moderatorRateLimitError.limit}
                remaining={moderatorRateLimitError.remaining}
                resetAt={moderatorRateLimitError.resetAt}
                retryAfter={moderatorRateLimitError.retryAfter}
                onDismiss={() => setModeratorRateLimitError(null)}
                onRetry={handleRetryModeratorBrief}
                className="mt-3"
              />
            ) : moderatorError ? (
              <ErrorDisplay
                error={moderatorError}
                onRetry={handleRetryModeratorBrief}
                onDismiss={() => setModeratorError(null)}
                variant="inline"
                retryable={true}
                className="mt-3"
              />
            ) : null}
          </section>
        ) : null}

        {moderatorBrief ? (
          <section
            className="space-y-6 rounded-[28px] border border-emerald-500/35 px-6 py-6 transition-transform duration-500"
            style={{ animation: "contentRise 600ms ease-out 0.45s both" }}
          >
            <div className="flex items-center gap-3">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-emerald-500/40 bg-[rgba(16,185,129,0.16)] text-emerald-300">
                <Sparkles className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <div className="text-[0.6rem] uppercase tracking-[0.35em] text-emerald-500/80 flex items-center gap-1">
                  Board{" "}
                  <Tooltip content="The background and goal for this discussion.">
                    <span className="inline-flex items-center gap-1">
                      moderator brief
                      <HelpCircle className="h-2.5 w-2.5 text-emerald-500/60 cursor-help" />
                    </span>
                  </Tooltip>
                </div>
                <h2 className="text-2xl font-semibold text-white">Room is configured</h2>
              </div>
            </div>

            <div className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-2xl border border-emerald-500/18 bg-[rgba(6,24,35,0.7)] p-4">
                <p className="text-[0.6rem] uppercase tracking-[0.32em] text-emerald-200/70">Topic summary</p>
                <p className="mt-2 text-sm leading-relaxed text-emerald-100/80">{moderatorBrief.topicSummary}</p>
              </div>
              <div className="rounded-2xl border border-emerald-500/18 bg-[rgba(6,24,35,0.7)] p-4">
                <p className="text-[0.6rem] uppercase tracking-[0.32em] text-emerald-200/70">Strategic question</p>
                <p className="mt-2 text-sm leading-relaxed text-emerald-100/80">{moderatorBrief.strategicQuestion}</p>
              </div>
            </div>

            <div className="rounded-2xl border border-emerald-500/18 bg-[rgba(6,24,35,0.7)] p-4">
              <p className="text-[0.6rem] uppercase tracking-[0.32em] text-emerald-200/70">Key assumptions</p>
              <ul className="mt-3 space-y-2 text-sm text-emerald-100/80">
                {moderatorBrief.keyAssumptions.length > 0 ? (
                  moderatorBrief.keyAssumptions.map((assumption, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <span className="mt-[6px] inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500/80" />
                      <span>{assumption}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-emerald-100/55">Assumptions will be populated during debate.</li>
                )}
              </ul>
            </div>

            <div className="rounded-2xl border border-emerald-500/18 bg-[rgba(6,24,35,0.7)] p-4">
              <p className="text-[0.6rem] uppercase tracking-[0.32em] text-emerald-200/70">Recommended experts</p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                {activeRecommendedExperts.length > 0 ? (
                  activeRecommendedExperts.map((expert) => {
                    const match = recommendedMatchMap.get(expert.id) ?? null;
                    const isSeated = selectedRecommendedIds.has(expert.id);
                    const tooltipSections =
                      match
                        ? [
                          match.goal ? { label: "Goal", value: match.goal } : null,
                          match.backstory ? { label: "Backstory", value: match.backstory } : null,
                          match.prompt ? { label: "Prompt", value: match.prompt } : null,
                        ].filter(Boolean)
                        : [];
                    return (
                      <div
                        key={expert.id}
                        className="group relative inline-flex items-center gap-1 rounded-full border border-emerald-500/35 bg-[rgba(16,185,129,0.18)] pr-1"
                      >
                        <button
                          type="button"
                          onClick={() => handleExpertSeatToggle(expert)}
                          disabled={!match}
                          className={cn(
                            "flex items-center gap-2 rounded-full pl-3 pr-2 py-1 text-xs font-semibold uppercase tracking-[0.26em] transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500",
                            isSeated ? "text-white" : "text-emerald-200",
                            match ? "hover:text-white" : "cursor-not-allowed opacity-60",
                          )}
                          aria-pressed={isSeated}
                        >
                          <span className="whitespace-nowrap">
                            {expert.name}
                            <span className="ml-2 text-[0.45rem] tracking-[0.3em] text-emerald-300/70">
                              {(() => {
                                // Use role from matched knight (from database), fallback to expert.role
                                const displayText = match 
                                  ? match.role 
                                  : (expert.role || "Unavailable");
                                // Truncate long text to prevent badge overflow
                                return displayText.length > 40 
                                  ? `${displayText.substring(0, 37)}...` 
                                  : displayText;
                              })()}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleExpertDismiss(expert)}
                          className="inline-flex h-6 w-6 items-center justify-center text-emerald-100 transition hover:border-rose-200/60 hover:bg-rose-400/20 hover:text-rose-50"
                          aria-label={`Dismiss ${expert.name}`}
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                        {tooltipSections.length > 0 ? (
                          <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-72 -translate-x-1/2 rounded-2xl border border-emerald-500/30 bg-[rgba(6,24,35,0.95)] p-3 text-left text-[0.7rem] leading-snug text-emerald-100 opacity-0 shadow-[0_16px_40px_rgba(10,8,4,0.55)] transition duration-200 group-hover:block group-hover:translate-y-1 group-hover:opacity-100 group-focus-within:block">
                            {tooltipSections.map((section) => (
                              <div key={`${expert.id}-${section!.label}`} className="mt-2 first:mt-0">
                                <p className="text-[0.55rem] uppercase tracking-[0.28em] text-emerald-500/80">
                                  {section!.label}
                                </p>
                                <p className="mt-1 text-[0.7rem] text-white/90">{section!.value}</p>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                ) : (
                  <span className="text-xs uppercase tracking-[0.24em] text-emerald-100/55">
                    Moderator will assign experts during debate.
                  </span>
                )}
                {additionalSeatedKnights.length > 0
                  ? additionalSeatedKnights.map((knight) => {
                    const tooltipSections = [
                      knight.goal ? { label: "Goal", value: knight.goal } : null,
                      knight.backstory ? { label: "Backstory", value: knight.backstory } : null,
                      knight.prompt ? { label: "Prompt", value: knight.prompt } : null,
                    ].filter(Boolean);
                    return (
                      <div
                        key={knight.id}
                        className="group relative inline-flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/10 pr-1"
                      >
                        <button
                          type="button"
                          onClick={() => handleKnightRemove(knight.id)}
                          className="flex items-center gap-2 rounded-full pl-3 pr-2 py-1 text-xs font-semibold uppercase tracking-[0.26em] text-emerald-200 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
                          aria-label={`Remove ${knight.name}`}
                        >
                          <span className="whitespace-nowrap">
                            {knight.name}
                            <span className="ml-2 text-[0.45rem] tracking-[0.3em] text-emerald-300/70">
                              {knight.role}
                            </span>
                          </span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleKnightRemove(knight.id)}
                          className="inline-flex h-6 w-6 items-center justify-center text-emerald-100 transition hover:border-rose-200/60 hover:bg-rose-400/20 hover:text-rose-50"
                          aria-label={`Dismiss ${knight.name}`}
                        >
                          <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                        {tooltipSections.length > 0 ? (
                          <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-2 hidden w-72 -translate-x-1/2 rounded-2xl border border-emerald-500/30 bg-[rgba(6,24,35,0.95)] p-3 text-left text-[0.7rem] leading-snug text-emerald-100 opacity-0 shadow-[0_16px_40px_rgba(10,8,4,0.55)] transition duration-200 group-hover:block group-hover:translate-y-1 group-hover:opacity-100 group-focus-within:block">
                            {tooltipSections.map((section) => (
                              <div key={`${knight.id}-${section!.label}`} className="mt-2 first:mt-0">
                                <p className="text-[0.55rem] uppercase tracking-[0.28em] text-emerald-500/80">
                                  {section!.label}
                                </p>
                                <p className="mt-1 text-[0.7rem] text-white/90">{section!.value}</p>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                  : null}
                <button
                  ref={seatModalTriggerRef}
                  type="button"
                  onClick={handleSeatModalOpen}
                  disabled={isSeatModalDisabled}
                  className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-200 transition hover:border-emerald-400/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-emerald-500/40 disabled:hover:text-emerald-200"
                  aria-disabled={isSeatModalDisabled}
                >
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Seat knights
                </button>
              </div>
              {recommendedError ? <p className="mt-2 text-xs text-rose-300">{recommendedError}</p> : null}
              {seatError ? <p className="mt-3 text-xs text-rose-300">{seatError}</p> : null}
            </div>

            <div className="rounded-2xl border border-emerald-500/18 bg-[rgba(6,24,35,0.7)] p-4">
              <p className="text-[0.6rem] uppercase tracking-[0.32em] text-emerald-200/70">Mission statement</p>
              <p className="mt-2 text-sm leading-relaxed text-emerald-100/80">{moderatorBrief.missionStatement}</p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-emerald-500/22 bg-[rgba(6,24,35,0.65)] px-5 py-4 text-sm text-emerald-100/75">
              <p>
                Ready to seat knights and launch the session? You can adjust experts before the debate kicks off.
              </p>
              <button
                type="button"
                onClick={handleStartLiveSession}
                disabled={isLaunchingLiveSession}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-[#071225] transition hover:from-emerald-400 hover:to-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isLaunchingLiveSession && (
                  <InlineLoading size="sm" spinnerColor="text-[#071225]" />
                )}
                {isLaunchingLiveSession ? "Starting..." : "Start live session"}
              </button>
            </div>
          </section>
        ) : null}

        {!intakeSummary && chatMessages.length > 0 ? (
          <p
            className="text-xs uppercase tracking-[0.28em] text-teal-100/55"
            style={{ animation: "contentRise 600ms ease-out 0.5s both" }}
          >
            The intake assistant will surface a working summary once it has enough information.
          </p>
        ) : null}

        {!moderatorBrief && intakeSummary ? (
          <p
            className="text-xs uppercase tracking-[0.28em] text-emerald-100/55"
            style={{ animation: "contentRise 600ms ease-out 0.5s both" }}
          >
            Approve the summary to dispatch the board moderator.
          </p>
        ) : null}


        <SeatKnightsModal 
          open={Boolean(showSeatModal && moderatorBrief)} 
          onClose={handleSeatModalClose}
          triggerElement={seatModalTriggerRef.current}
        >
          <div className="flex w-full max-w-5xl flex-col rounded-[28px] border border-emerald-500/35 bg-[rgba(6,24,35,0.96)] p-6">
            <div className="mb-5 flex items-center justify-between gap-4">
              <div>
                <p id="seat-knights-heading" className="text-lg font-semibold text-white">
                  Manage Knights
                </p>
                <p className="mt-1 text-sm text-emerald-100/70">
                  Select up to {MAX_KNIGHTS_ALLOWED} board members. At least {MIN_KNIGHTS_REQUIRED} are required to launch the debate.
                </p>
              </div>
              <button
                type="button"
                onClick={handleSeatModalClose}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-emerald-500/30 text-emerald-200 transition hover:border-emerald-400/60 hover:text-white"
                aria-label="Close knight manager"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="mt-4 w-full max-h-[70vh] overflow-y-auto pr-1">
              <KnightSelectorModal
                availableKnights={availableKnights}
                selectedKnights={selectedKnights}
                onToggle={handleKnightToggle}
                onRemove={handleKnightRemoveWithDismiss}
                search={knightSearch}
                onSearchChange={handleKnightSearchChange}
                isLoading={officialKnightsQuery.isLoading || workspaceKnightsQuery.isLoading}
                seatError={seatError}
                requiredCount={MIN_KNIGHTS_REQUIRED}
              />
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={handleSeatModalClose}
                className="inline-flex items-center gap-2 rounded-full border border-emerald-500/40 px-5 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-200 transition hover:border-emerald-400/70 hover:text-white"
              >
                Done
              </button>
            </div>
          </div>
        </SeatKnightsModal>
        {showReplaceBoardroomModal && typeof document !== "undefined"
          ? createPortal(
              <div
                className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm"
                role="dialog"
                aria-modal="true"
                aria-labelledby="boardroom-replace-heading"
                onClick={handleBoardroomReplaceCancel}
              >
                <div
                  className="w-full max-w-lg rounded-[28px] border border-emerald-500/35 bg-[rgba(6,24,35,0.96)] p-6"
                  onClick={(event) => event.stopPropagation()}
                >
                  <div className="space-y-4 text-emerald-100/80">
                    <div>
                      <p id="boardroom-replace-heading" className="text-lg font-semibold text-white">
                        Replace Crucible intake?
                      </p>
                      <p className="mt-2 text-sm leading-relaxed text-emerald-100/70">
                        Starting a new intake here will overwrite the conversation currently staged in the Crucible.
                        Continue if you are comfortable discarding that simulation.
                      </p>
                    </div>
                    <div className="flex flex-wrap justify-end gap-3 text-xs uppercase tracking-[0.26em]">
                      <button
                        type="button"
                        onClick={handleBoardroomReplaceCancel}
                        className="rounded-full border border-emerald-500/35 px-4 py-2 text-emerald-200 transition hover:border-emerald-400/55 hover:text-white"
                      >
                        Keep existing
                      </button>
                      <button
                        type="button"
                        onClick={handleBoardroomReplaceConfirm}
                        className="rounded-full bg-gradient-to-r from-emerald-500 to-emerald-600 px-5 py-2 text-[#0b1b2c] transition hover:from-emerald-400 hover:to-emerald-500"
                      >
                        Replace session
                      </button>
                    </div>
                  </div>
                </div>
              </div>,
              document.body,
            )
          : null}

        {/* Generating Moderator Brief Loading Screen */}
        <AnimatePresence>
          {moderatorLoading && moderatorProgress > 0 && moderatorProgress < 100 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[1000]"
            >
              <LoadingScreen
                title="Generating moderator brief..."
                subtitle="The board moderator is preparing your council for ruthless debate"
                progress={moderatorProgress}
                showProgress={true}
                estimatedTime={moderatorProgress > 0 ? Math.max(0, Math.round((100 - moderatorProgress) / (moderatorProgress / 2))) : undefined}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Preparing Session Loading Screen */}
        <AnimatePresence>
          {isPreparingSession && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[1000]"
            >
              <LoadingScreen
                title="Preparing your debate session..."
                subtitle="Setting up your roundtable with selected knights"
                progress={sessionProgressTracker.getProgress()}
                showProgress={true}
                currentStep={sessionProgressTracker.getStepLabel()}
                estimatedTime={sessionProgressTracker.getEstimatedTimeRemaining() ?? undefined}
              />
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      <style jsx global>{`
        @keyframes pageFade {
          0% {
            opacity: 0;
          }
          100% {
            opacity: 1;
          }
        }
        @keyframes contentRise {
          0% {
            opacity: 0;
            transform: translateY(24px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

type SeatKnightsModalProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  triggerElement?: HTMLElement | null;
};

function SeatKnightsModal({ open, onClose, children, triggerElement }: SeatKnightsModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);
  
  useFocusTrap(modalRef, {
    isOpen: open,
    onEscape: onClose,
    lockBodyScroll: true,
    returnFocus: true,
    triggerElement,
    disableBackdropClick: false,
  });

  if (typeof document === "undefined" || !open) {
    return null;
  }

  return createPortal(
    <div
      ref={modalRef}
      className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto bg-black/70 px-4 py-10 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="seat-knights-heading"
      onClick={onClose}
    >
      <div className="w-full max-w-5xl" onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export default function LaunchpadPage() {
  return (
    <Suspense fallback={
      <div className="container-box flex min-h-[60vh] items-center justify-center text-base-subtext">
        <InlineLoading size="md" text="Loading..." />
      </div>
    }>
      <LaunchpadPageContent />
    </Suspense>
  );
}
