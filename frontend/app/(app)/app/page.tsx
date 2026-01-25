"use client";

import { useRouter } from "next/navigation";
import React, { useCallback, useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/components/providers/AuthProvider";
import { useTurnstile } from "@/components/providers/TurnstileProvider";
import { apiGet } from "@/lib/api/client";
import { Tooltip } from "@/components/ui/tooltip";
import {
  BOARDROOM_CHAT_CACHE_VERSION,
  LAUNCHPAD_INTAKE_CACHE_VERSION,
  LAUNCHPAD_TRANSFER_CACHE_VERSION,
  LAUNCHPAD_TRANSFER_TTL_MS,
} from "@/features/rounds/storageKeys";
import {
  readSessionCache,
  removeSessionCache,
  writeSessionCache,
} from "@/lib/storage/sessionCache";
import { useUnsavedChangesWarning } from "@/lib/hooks/useUnsavedChangesWarning";
import { useToast } from "@/components/common/ToastProvider";
import { getCacheSyncManager } from "@/lib/storage/cacheSync";
import type { DebateRunStatus } from "./live/types";
import { BoardroomSkeleton } from "@/components/ui/skeletons/BoardroomSkeleton";

// Import extracted boardroom components and types
import {
  type SessionListItem,
  type IntakeChatMessage,
  type BoardroomIntakeCache,
  type LaunchpadTransferCache,
  type LaunchpadIntakeCache,
  type CacheRestoreInfo,
  generateId,
  CHAT_CACHE_KEY,
  LAUNCHPAD_TRANSFER_KEY,
  LAUNCHPAD_CACHE_KEY,
  AUTH_ERROR_STORAGE_KEY,
  AUTH_ERROR_MESSAGES,
} from "@/features/boardroom";
import { QuickAccessCards } from "@/features/boardroom/components/QuickAccessCards";
import { ExpandedImageModal } from "@/features/boardroom/components/ExpandedImageModal";
import { ReplaceLaunchpadModal } from "@/features/boardroom/components/ReplaceLaunchpadModal";
import { GuidedIntakeModal } from "@/features/boardroom/components/GuidedIntakeModal";
import { RunningSessionsBanner } from "@/features/boardroom/components/RunningSessionsBanner";
import { IntakeAssistantCard } from "@/features/boardroom/components/IntakeAssistantCard";
import { BoardroomProgressIndicator } from "@/features/boardroom/components/BoardroomProgressIndicator";
import { useCacheRestoration } from "@/features/boardroom/hooks/useCacheRestoration";
import { useIntakeChat } from "@/features/boardroom/hooks/useIntakeChat";
import { useDocumentUpload } from "@/features/boardroom/hooks/useDocumentUpload";
import { useSessionStatus } from "@/features/boardroom/hooks/useSessionStatus";
import { useCachePersistence } from "@/features/boardroom/hooks/useCachePersistence";
import { useLaunchpadHandlers } from "@/features/boardroom/hooks/useLaunchpadHandlers";
import { useSummaryHandlers } from "@/features/boardroom/hooks/useSummaryHandlers";
import { useTabNotification } from "@/features/boardroom/hooks/useTabNotification";
import type { IntakeRateLimitError } from "@/features/boardroom";

function BoardroomPageContent() {
  const router = useRouter();
  const { user, token, status: authStatus, requireAuth, openAuth } = useAuth();
  const { execute: executeTurnstile } = useTurnstile();
  
  // Helper: Transfer data to launchpad and clear boardroom cache
  const transferToLaunchpad = useCallback((data: LaunchpadTransferCache) => {
    writeSessionCache(LAUNCHPAD_TRANSFER_KEY, data, {
      version: LAUNCHPAD_TRANSFER_CACHE_VERSION,
      ttlMs: LAUNCHPAD_TRANSFER_TTL_MS,
    });
    removeSessionCache(CHAT_CACHE_KEY);
    const syncManager = getCacheSyncManager();
    syncManager.broadcastRemove(CHAT_CACHE_KEY);
  }, []);

  const [isChatActive, setIsChatActive] = useState(false);
  const [pendingCachedIntake, setPendingCachedIntake] = useState<{
    messages: IntakeChatMessage[];
    summary: string | null;
  } | null>(null);

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

  // Show tab notification when there's a pending session to resume
  useTabNotification(!!pendingCachedIntake);
  
  // Document upload state and actions from hook
  const {
    uploading,
    uploadProgress,
    uploadStartTime,
    uploadError,
    setUploadError,
    uploadRateLimitError,
    setUploadRateLimitError,
    pendingFile,
    previewData,
    showUploadConfirm,
    setShowUploadConfirm,
    showReplaceUploadModal,
    fileInputRef,
    handleFilePreview: hookHandleFilePreview,
    handleUploadConfirm: hookHandleUploadConfirm,
    handleUploadCancel,
    handleUploadReplaceConfirm: hookHandleUploadReplaceConfirm,
    handleUploadReplaceCancel,
    handleFileSelect: hookHandleFileSelect,
    handleUploadButtonClick,
    resetUploadState,
  } = useDocumentUpload({ token, user, executeTurnstile, requireAuth });
  
  const [isEditingSummary, setIsEditingSummary] = useState(false);
  const [uploadedSummary, setUploadedSummary] = useState<string | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [showButtonSparkle, setShowButtonSparkle] = useState(false);
  const [showGuidedIntakeModal, setShowGuidedIntakeModal] = useState(false);
  const guidedIntakeTriggerRef = useRef<HTMLButtonElement>(null);
  const replaceModalTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [showExpandedImage, setShowExpandedImage] = useState(false);
  const [authErrorMessage, setAuthErrorMessage] = useState<string | null>(null);
  const [cacheRestoreInfo, setCacheRestoreInfo] = useState<{
    messageCount: number;
    hasSummary: boolean;
    timestamp: number;
  } | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const { showToast } = useToast();
  
  // Create a ref to store skipWarning so it can be updated after useUnsavedChangesWarning
  const skipWarningRef = useRef<(() => void) | undefined>(undefined);
  
  // Intake chat state and actions from hook
  const {
    chatMessages,
    setChatMessages,
    chatInput,
    setChatInput,
    chatLoading,
    setChatLoading,
    chatError,
    setChatError,
    intakeRateLimitError,
    setIntakeRateLimitError,
    intakeSummary,
    setIntakeSummary,
    hasBootstrappedChat,
    invokeIntake,
    bootstrapChat,
    handleChatSubmit,
  } = useIntakeChat({ 
    token, 
    user, 
    executeTurnstile,
    transferToLaunchpad,
    skipWarning: () => skipWarningRef.current?.(),
    textareaRef,
  });

  // Cache restoration hook - manages restoring intake from boardroom/launchpad cache
  useCacheRestoration({
    setPendingCachedIntake,
    setCacheRestoreInfo,
    showToast,
    hasBootstrappedChat,
  });
  
  const { checkBeforeNavigate, skipWarning } = useUnsavedChangesWarning({
    hasUnsavedChanges: isChatActive && (chatMessages.length > 0 || intakeSummary !== null),
    message: "You have unsaved changes in your intake conversation. Are you sure you want to leave?",
    enabled: isChatActive,
  });
  
  // Update skipWarning ref when it becomes available
  useEffect(() => {
    skipWarningRef.current = skipWarning;
  }, [skipWarning]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const stored = window.sessionStorage.getItem(AUTH_ERROR_STORAGE_KEY);
    if (stored) {
      window.sessionStorage.removeItem(AUTH_ERROR_STORAGE_KEY);
      setAuthErrorMessage(AUTH_ERROR_MESSAGES[stored] ?? AUTH_ERROR_MESSAGES.default);
    }
  }, []);

  // Require authentication - redirect to login if not authenticated
  useEffect(() => {
    if (authStatus === "ready" && !user) {
      // Check if token exists in localStorage (in case authUser is null during hydration)
      const token = typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;
      if (!token) {
        // No token found - redirect to login page
        router.replace("/auth/login");
      }
    }
  }, [authStatus, user, router]);

  const isAuthenticated = authStatus === "ready" && Boolean(user);

  // Initialize session status state before query (needed for refetchInterval)
  // This will be updated by useSessionStatus hook
  const [localSessionStatusForQuery, setLocalSessionStatusForQuery] = useState<DebateRunStatus | null>(null);

  const sessionsQuery = useQuery({
    queryKey: ["sessions", token ?? "guest"],
    queryFn: () => apiGet<SessionListItem[]>("/sessions", { token }),
    enabled: isAuthenticated,
    refetchInterval: localSessionStatusForQuery === "running" ? 30000 : false, // Poll every 30s only when session is running
    refetchIntervalInBackground: false, // Only poll when tab is active to reduce unnecessary requests
    refetchOnWindowFocus: false, // Don't refetch when window regains focus
    refetchOnReconnect: false, // Don't refetch on network reconnect
    refetchOnMount: false, // Don't refetch on component mount if data is fresh
    staleTime: 5 * 60 * 1000, // 5 minutes - prevent unnecessary refetches
    gcTime: 10 * 60 * 1000, // Keep data in cache for 10 minutes (formerly cacheTime)
  });

  const sessions = useMemo(() => sessionsQuery.data ?? [], [sessionsQuery.data]);
  const liveSession = useMemo(
    () => sessions.find((session) => session.status === "running" || session.status === "active"),
    [sessions]
  );
  
  // Session status tracking from hook - manages localStorage status and stale cleanup
  const { localSessionStatus } = useSessionStatus({
    liveSession,
    sessionsQuerySuccess: sessionsQuery.isSuccess,
  });

  // Update state so query refetchInterval can react to changes
  useEffect(() => {
    setLocalSessionStatusForQuery(localSessionStatus);
  }, [localSessionStatus]);
  
  // Derive running sessions directly from the main sessions query
  // This avoids redundant network requests and polling
  // Community Edition: No payment_status check needed - all running sessions are valid
  const runningSessions = useMemo(() => {
    return sessions.filter((s) => s.status === "running");
  }, [sessions]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  }, []);

  // Helper: Clear all intake-related caches
  const clearAllIntakeCaches = useCallback(() => {
    removeSessionCache(CHAT_CACHE_KEY);
    removeSessionCache(LAUNCHPAD_CACHE_KEY);
    removeSessionCache(LAUNCHPAD_TRANSFER_KEY);
  }, []);

  // Launchpad handlers hook - manages intake reset, start, resume, and replacement logic
  const {
    showReplaceLaunchpadModal,
    setShowReplaceLaunchpadModal,
    pendingLaunchpadReplaceAction,
    hasLaunchpadIntake,
    requestLaunchpadReplacement,
    performBoardroomIntakeReset,
    performBoardroomIntakeStart,
    handleLaunchpadReplaceConfirm,
    handleLaunchpadReplaceCancel,
    handleStartFreshIntake,
    handleResumeIntake,
  } = useLaunchpadHandlers({
    skipWarning,
    pendingCachedIntake,
    clearAllIntakeCaches,
    setChatMessages,
    setIntakeSummary,
    setChatError,
    setPendingCachedIntake,
    setIsChatActive,
    hasBootstrappedChat,
    bootstrapChat,
  });

  // Summary handlers hook - manages summary editing handlers
  const {
    handleSummaryConfirm,
    handleSummaryCancel,
  } = useSummaryHandlers({
    transferToLaunchpad,
    skipWarning,
    setIntakeSummary,
    setIsEditingSummary,
    setUploadedSummary,
    setUploadError,
  });

  // invokeIntake, bootstrapChat functions are provided by useIntakeChat hook

  // Cache persistence hook - handles saving chat state to session cache
  useCachePersistence({
    chatMessages,
    intakeSummary,
    isChatActive,
    pendingCachedIntake,
    hasBootstrappedChat,
    setStorageError,
    showToast,
  });

  // Show sparkling animation on Start intake button when there's no stored session
  useEffect(() => {
    if (!pendingCachedIntake && !isChatActive && !chatLoading && !uploadedSummary && !intakeSummary) {
      setShowButtonSparkle(true);
    } else {
      setShowButtonSparkle(false);
    }
  }, [pendingCachedIntake, isChatActive, chatLoading, uploadedSummary, intakeSummary]);

  // scrollToBottom is handled by IntakeChat component internally
  // handleChatSubmit is provided by useIntakeChat hook

  // Helper to determine if there's existing state for upload replacement check
  const hasExistingIntakeState = useCallback(() => {
    // Check for actual user messages (not just the greeting message)
    const hasUserMessages = chatMessages.some(msg => msg.role === "user");
    const hasActiveState = Boolean(intakeSummary) || hasUserMessages || isChatActive;
    const hasPendingCache = Boolean(pendingCachedIntake);
    
    // Check sessionStorage for cached state
    const cachedState = readSessionCache<BoardroomIntakeCache>(CHAT_CACHE_KEY, {
      version: BOARDROOM_CHAT_CACHE_VERSION,
    });
    // Check if cached messages have user messages (not just assistant greeting)
    const cachedHasUserMessages = cachedState?.messages?.some(msg => msg.role === "user") ?? false;
    const hasCachedState = Boolean(cachedState && (cachedHasUserMessages || cachedState.summary));
    
    // Also check launchpad cache since they share the same intake
    const launchpadCachedState = readSessionCache<LaunchpadIntakeCache>(LAUNCHPAD_CACHE_KEY, {
      version: LAUNCHPAD_INTAKE_CACHE_VERSION,
    });
    // Check if launchpad cached messages have user messages (not just assistant greeting)
    const launchpadCachedHasUserMessages = launchpadCachedState?.messages?.some(msg => msg.role === "user") ?? false;
    const hasLaunchpadCachedState = Boolean(launchpadCachedState && (launchpadCachedHasUserMessages || launchpadCachedState.summary));
    
    return hasActiveState || hasPendingCache || hasCachedState || hasLaunchpadCachedState;
  }, [intakeSummary, chatMessages, isChatActive, pendingCachedIntake]);

  // Wrapper for file preview that computes hasExistingState
  const handleFilePreview = useCallback(
    async (file: File) => {
      await hookHandleFilePreview(file, hasExistingIntakeState());
    },
    [hookHandleFilePreview, hasExistingIntakeState]
  );

  // Wrapper for file select that computes hasExistingState
  const handleFileSelect = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      hookHandleFileSelect(event, hasExistingIntakeState());
    },
    [hookHandleFileSelect, hasExistingIntakeState]
  );

  // Wrapper for upload confirm that handles navigation on success
  const handleUploadConfirm = useCallback(async () => {
    await hookHandleUploadConfirm((summary: string) => {
      // Store summary and redirect to launchpad
      transferToLaunchpad({
        messages: [],
        summary,
        autoStart: true,
        fromDocumentUpload: true,
        autoConfirmSummary: true,
      });
      skipWarning();
      router.push("/app/launchpad");
    });
  }, [hookHandleUploadConfirm, transferToLaunchpad, skipWarning, router]);

  // Wrapper for upload replace confirm that resets state
  const handleUploadReplaceConfirm = useCallback(() => {
    hookHandleUploadReplaceConfirm(() => {
      // Clear the intake state before proceeding with upload
      clearAllIntakeCaches();
      setChatMessages([]);
      setIntakeSummary(null);
      setChatError(null);
      setPendingCachedIntake(null);
      hasBootstrappedChat.current = false;
    });
  }, [hookHandleUploadReplaceConfirm, clearAllIntakeCaches, setChatMessages, setIntakeSummary, setChatError, hasBootstrappedChat]);

  // Summary handlers are provided by useSummaryHandlers hook

  // Textarea auto-resize and keyboard handling are handled by IntakeChat component internally

  // Launchpad handlers are provided by useLaunchpadHandlers hook

  const handleOpenGuidedIntake = useCallback(() => {
    setShowGuidedIntakeModal(true);
  }, []);

  const handleCloseGuidedIntake = useCallback(() => {
    setShowGuidedIntakeModal(false);
  }, []);

  // Handler for GuidedIntakeModal - receives formatted content from component
  const handleGuidedIntakeSubmit = useCallback(async (content: string) => {
    const stagedMessage: IntakeChatMessage = {
      id: generateId(),
      role: "user",
      content,
    };
    transferToLaunchpad({
      messages: [stagedMessage],
      summary: null,
      autoStart: true,
    });
    setShowGuidedIntakeModal(false);
    await requireAuth({ reason: "Start guided intake" });
    skipWarning();
    router.push("/app/launchpad");
  }, [transferToLaunchpad, requireAuth, router, skipWarning]);

  // handleStartFreshIntake and handleResumeIntake are provided by useLaunchpadHandlers hook

  // Set up BroadcastChannel sync for cache updates
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncManager = getCacheSyncManager();
    const unsubscribe = syncManager.subscribe((message) => {
      if (message.type === "cache-updated" && message.key === CHAT_CACHE_KEY) {
        // Cache was updated in another tab, refresh if we're not actively editing
        if (!isChatActive) {
          const cached = readSessionCache<BoardroomIntakeCache>(CHAT_CACHE_KEY, {
            version: BOARDROOM_CHAT_CACHE_VERSION,
          });
          if (cached && (cached.messages?.length > 0 || cached.summary)) {
            setPendingCachedIntake({
              messages: cached.messages ?? [],
              summary: cached.summary ?? null,
            });
          }
        }
      } else if (message.type === "cache-removed" && message.key === CHAT_CACHE_KEY) {
        // Cache was removed in another tab
        if (!isChatActive && chatMessages.length === 0 && !intakeSummary) {
          setPendingCachedIntake(null);
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [isChatActive, chatMessages.length, intakeSummary]);

  // Session status effects are now handled by useSessionStatus hook

  return (
    <div className="container-box space-y-4">
        {authErrorMessage ? (
          <div className="flex items-start justify-between gap-4 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-5 py-4 text-sm text-amber-100">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-200/90">Sign-in issue</p>
              <p className="mt-1 text-base text-white">{authErrorMessage}</p>
            </div>
            <Tooltip content="Dismiss sign-in warning" side="top">
              <button
                type="button"
                aria-label="Dismiss sign-in warning"
                className="flex items-center justify-center rounded-full border border-amber-500/40 p-2 text-amber-200 transition hover:border-amber-300 hover:text-white min-h-[44px] min-w-[44px]"
                onClick={() => setAuthErrorMessage(null)}
              >
                <span className="sr-only">Dismiss</span>
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M6 6l12 12M18 6L6 18"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
            </button>
            </Tooltip>
          </div>
        ) : null}
        <header className="relative flex flex-col gap-4 rounded-3xl border-b-2 border-gold-500/30 border-x border-t border-base-divider bg-base-panel p-6 shadow-soft overflow-hidden lg:flex-row lg:items-center lg:justify-between">
          {/* Subtle background gradient */}
          <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-gold-500/5 via-transparent to-transparent" aria-hidden="true" />
          
          <div className="relative space-y-3 flex-1">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-[0.35em] text-gold-500/70">Crucible Briefing</span>
              </div>
            </div>
            <div className="space-y-1">
              <h1 className="text-3xl font-bold text-white leading-tight">
                {user ? (
                  <>
                    {greeting}, <span className="text-gold-400">{user.name || user.email?.split('@')[0] || 'Strategic Leader'}</span>
                  </>
                ) : (
                  <>
                    {greeting}, <span className="text-gold-400">Strategic Leader</span>
                  </>
                )}
              </h1>
              <p className="text-sm text-base-subtext/80 leading-relaxed max-w-2xl">
                {(() => {
                  if (runningSessions.length > 0) {
                    return `Your debate "${runningSessions[0].question || 'session'}" is in progress. Monitor it live or start a new strategic question.`;
                  }
                  if (intakeSummary) {
                    return "Your strategic brief is ready. Continue to Launchpad to configure your debate and select your AI Council members.";
                  }
                  // Count only user messages (not assistant greeting messages)
                  const userMessageCount = chatMessages.filter(msg => msg.role === "user").length;
                  if (isChatActive || userMessageCount > 0) {
                    return `You're building your strategic brief. ${userMessageCount > 0 ? `You've shared ${userMessageCount} insight${userMessageCount !== 1 ? 's' : ''}.` : ''} Continue the conversation to refine your question.`;
                  }
                  return "Align the room around the latest signals before the Agents convene. Everything here updates in real time so you step in with certainty.";
                })()}
              </p>
            </div>
          </div>
          
          {/* Status indicator on the right */}
          {user && (
            <div className="relative flex items-center gap-3 lg:ml-6">
              <div className="hidden lg:block h-12 w-px bg-gold-500/20" aria-hidden="true" />
              <div className="flex flex-col items-end gap-1 text-right">
                <div className="flex items-center gap-2">
                  {runningSessions.length > 0 && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-2.5 py-1 text-xs font-medium text-cyan-300">
                      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-pulse" aria-hidden="true" />
                      Active Session
                    </span>
                  )}
                  {intakeSummary && !runningSessions.length && (
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-1 text-xs font-medium text-teal-300">
                      Ready for Launchpad
                    </span>
                  )}
                </div>
                {user.email && (
                  <p className="text-xs text-base-subtext/60">{user.email}</p>
                )}
              </div>
            </div>
          )}
        </header>

        {/* Progress Indicator */}
        <BoardroomProgressIndicator
          user={user}
          intakeSummary={intakeSummary}
          chatMessages={chatMessages.length}
          isChatActive={isChatActive}
          runningSessions={runningSessions}
          onViewLive={(sessionId) => router.push(`/app/live?session=${sessionId}`, { scroll: false })}
        />

        {/* Running Sessions Section - Moved between Crucible briefing and Intake assistant */}
        <RunningSessionsBanner
          runningSessions={runningSessions}
          onViewLive={(sessionId) => router.push(`/app/live?session=${sessionId}`, { scroll: false })}
        />


        <IntakeAssistantCard
          // Chat state
          isChatActive={isChatActive}
          chatMessages={chatMessages}
          chatInput={chatInput}
          onChatInputChange={setChatInput}
          chatLoading={chatLoading}
          intakeSummary={intakeSummary}
          // Cache restoration
          pendingCachedIntake={pendingCachedIntake}
          cacheRestoreInfo={cacheRestoreInfo}
          // UI state
          showButtonSparkle={showButtonSparkle}
          // Upload state
          uploading={uploading}
          uploadProgress={uploadProgress}
          uploadStartTime={uploadStartTime}
          pendingFile={pendingFile}
          previewData={previewData}
          showUploadConfirm={showUploadConfirm}
          showReplaceUploadModal={showReplaceUploadModal}
          // Error states
          chatError={chatError}
          uploadError={uploadError}
          uploadRateLimitError={uploadRateLimitError}
          storageError={storageError}
          intakeRateLimitError={intakeRateLimitError}
          // Handlers - Launchpad
          onRequestLaunchpadReplacement={requestLaunchpadReplacement}
          onPerformBoardroomIntakeReset={performBoardroomIntakeReset}
          onStartFreshIntake={handleStartFreshIntake}
          onResumeIntake={handleResumeIntake}
          // Handlers - Upload
          onUploadButtonClick={handleUploadButtonClick}
          onFileSelect={handleFileSelect}
          onUploadConfirm={handleUploadConfirm}
          onUploadReplaceConfirm={handleUploadReplaceConfirm}
          onUploadReplaceCancel={handleUploadReplaceCancel}
          onUploadCancel={handleUploadCancel}
          onShowUploadConfirmChange={setShowUploadConfirm}
          // Handlers - Chat
          onChatSubmit={handleChatSubmit}
          onChatErrorDismiss={() => setChatError(null)}
          onRateLimitErrorDismiss={() => setIntakeRateLimitError(null)}
          onStorageErrorDismiss={() => setStorageError(null)}
          onUploadErrorDismiss={() => setUploadError(null)}
          onUploadRateLimitErrorDismiss={() => setUploadRateLimitError(null)}
          // Handlers - Guided Intake
          onOpenGuidedIntake={handleOpenGuidedIntake}
          // Refs
          fileInputRef={fileInputRef}
          chatContainerRef={chatContainerRef}
          textareaRef={textareaRef}
          guidedIntakeTriggerRef={guidedIntakeTriggerRef}
        />


        {/* Quick Access Cards */}
        <QuickAccessCards />

      <GuidedIntakeModal
        open={showGuidedIntakeModal}
        onClose={handleCloseGuidedIntake}
        onSubmit={handleGuidedIntakeSubmit}
        triggerRef={guidedIntakeTriggerRef}
      />

      <ReplaceLaunchpadModal
        open={showReplaceLaunchpadModal}
        onConfirm={handleLaunchpadReplaceConfirm}
        onCancel={handleLaunchpadReplaceCancel}
        triggerRef={replaceModalTriggerRef}
      />

      {process.env.NEXT_PUBLIC_INTAKE_PREVIEW_IMAGE && (
        <ExpandedImageModal
          open={showExpandedImage}
          onClose={() => setShowExpandedImage(false)}
          imageSrc={process.env.NEXT_PUBLIC_INTAKE_PREVIEW_IMAGE}
          imageAlt="Intake walkthrough preview"
        />
      )}

    </div>
  );
}

export default function BoardroomPage() {
  return (
    <Suspense fallback={
      <div className="container-box flex min-h-[60vh] items-center justify-center text-base-subtext">
        <BoardroomSkeleton />
      </div>
    }>
      <BoardroomPageContent />
    </Suspense>
  );
}

// Note: All boardroom components and hooks are imported from @/features/boardroom/components and @/features/boardroom/hooks



