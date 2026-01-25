"use client";

/**
 * IntakeAssistantCard component
 * Main intake assistant card with header, chat/inactive state, and guide moderator section
 * 
 * Extracted from frontend/app/(app)/app/page.tsx
 * 
 * This is a purely presentational component - all state management and business logic
 * remain in the parent BoardroomPageContent component.
 */

import React, { FormEvent } from "react";
import {
  Bot,
  CheckCircle,
  FileText,
  HelpCircle,
  RotateCcw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/glass-card";
import { GradientButton } from "@/components/ui/gradient-button";
import { BentoGrid } from "@/components/ui/bento-grid";
import { BentoCard } from "@/components/ui/bento-card";
import { Tooltip } from "@/components/ui/tooltip";
import { InlineLoading } from "@/components/ui/InlineLoading";
import { DocumentUploadConfirm } from "@/components/intake/DocumentUploadConfirm";
import { IntakeChat } from "./IntakeChat";
import { UploadReplaceModal } from "./UploadReplaceModal";
import type { IntakeChatMessage, IntakeRateLimitError, UploadRateLimitError, PreviewData, CacheRestoreInfo } from "../types";

type IntakeAssistantCardProps = {
  // Chat state
  isChatActive: boolean;
  chatMessages: IntakeChatMessage[];
  chatInput: string;
  onChatInputChange: (value: string) => void;
  chatLoading: boolean;
  intakeSummary: string | null;
  
  // Cache restoration
  pendingCachedIntake: { messages: IntakeChatMessage[]; summary: string | null } | null;
  cacheRestoreInfo: CacheRestoreInfo | null;
  
  // UI state
  showButtonSparkle: boolean;
  
  // Upload state
  uploading: boolean;
  uploadProgress: number;
  uploadStartTime: number | null;
  pendingFile: File | null;
  previewData: PreviewData | null;
  showUploadConfirm: boolean;
  showReplaceUploadModal: boolean;
  
  // Error states
  chatError: string | null;
  uploadError: string | null;
  uploadRateLimitError: UploadRateLimitError | null;
  storageError: string | null;
  intakeRateLimitError: IntakeRateLimitError | null;
  
  // Handlers - Launchpad
  onRequestLaunchpadReplacement: (resetFn: () => void) => void;
  onPerformBoardroomIntakeReset: () => void;
  onStartFreshIntake: () => void;
  onResumeIntake: () => void;
  
  // Handlers - Upload
  onUploadButtonClick: () => void;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onUploadConfirm: () => void;
  onUploadReplaceConfirm: () => void;
  onUploadReplaceCancel: () => void;
  onUploadCancel: () => void;
  onShowUploadConfirmChange: (show: boolean) => void;
  
  // Handlers - Chat
  onChatSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onChatErrorDismiss: () => void;
  onRateLimitErrorDismiss: () => void;
  onStorageErrorDismiss: () => void;
  onUploadErrorDismiss: () => void;
  onUploadRateLimitErrorDismiss: () => void;
  
  // Handlers - Guided Intake
  onOpenGuidedIntake: () => void;
  
  // Refs
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  chatContainerRef: React.RefObject<HTMLDivElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  guidedIntakeTriggerRef: React.RefObject<HTMLButtonElement | null>;
};

export function IntakeAssistantCard({
  // Chat state
  isChatActive,
  chatMessages,
  chatInput,
  onChatInputChange,
  chatLoading,
  intakeSummary,
  
  // Cache restoration
  pendingCachedIntake,
  cacheRestoreInfo,
  
  // UI state
  showButtonSparkle,
  
  // Upload state
  uploading,
  uploadProgress,
  uploadStartTime,
  pendingFile,
  previewData,
  showUploadConfirm,
  showReplaceUploadModal,
  
  // Error states
  chatError,
  uploadError,
  uploadRateLimitError,
  storageError,
  intakeRateLimitError,
  
  // Handlers - Launchpad
  onRequestLaunchpadReplacement,
  onPerformBoardroomIntakeReset,
  onStartFreshIntake,
  onResumeIntake,
  
  // Handlers - Upload
  onUploadButtonClick,
  onFileSelect,
  onUploadConfirm,
  onUploadReplaceConfirm,
  onUploadReplaceCancel,
  onUploadCancel,
  onShowUploadConfirmChange,
  
  // Handlers - Chat
  onChatSubmit,
  onChatErrorDismiss,
  onRateLimitErrorDismiss,
  onStorageErrorDismiss,
  onUploadErrorDismiss,
  onUploadRateLimitErrorDismiss,
  
  // Handlers - Guided Intake
  onOpenGuidedIntake,
  
  // Refs
  fileInputRef,
  chatContainerRef,
  textareaRef,
  guidedIntakeTriggerRef,
}: IntakeAssistantCardProps) {
  return (
    <div className="relative">
      {/* Gold glow behind intake assistant */}
      <div
        className="pointer-events-none absolute left-[15%] top-1/2 hidden h-80 w-80 -translate-y-1/2 rounded-full bg-gold-400/15 blur-3xl md:block"
        style={{ opacity: 0.5 }}
      />
      {/* Teal/cyan glow behind summary card */}
      <div
        className="pointer-events-none absolute right-[20%] top-1/2 hidden h-72 w-72 -translate-y-1/2 rounded-full bg-cyan-400/10 blur-3xl md:block"
        style={{ opacity: 0.4 }}
      />
      <BentoGrid columns={2} className="relative gap-6">
        <BentoCard size="xl" asChild>
          <GlassCard variant="elevated" className="px-8 py-8">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-[0.6rem] uppercase tracking-[0.35em] text-gold-500/70">Intake assistant</p>
                    <h2 className="mt-2 text-xl font-semibold text-white">Enter your Startup Idea or High Stake decision for Roasting</h2>
                  </div>
                  {/* Only show RESTART button if there are actual user messages or an intake summary */}
                  {(intakeSummary || chatMessages.some(msg => msg.role === "user") || isChatActive) && (
                    <button
                      type="button"
                      onClick={() => onRequestLaunchpadReplacement(onPerformBoardroomIntakeReset)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/40 px-3 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-rose-100 transition hover:border-rose-300/60 hover:text-rose-200 ml-auto"
                      aria-label="Restart intake"
                    >
                      <RotateCcw className="h-3 w-3" aria-hidden="true" />
                      Restart
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className={cn(
              "mt-6 grid gap-4 items-stretch",
              isChatActive ? "lg:grid-cols-1" : "lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]"
            )}>
              <div className="flex h-full items-start gap-5">
                <span className="mt-1 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-gold-500/30 bg-[radial-gradient(circle_at_center,_rgba(242,194,79,0.22)_0%,_rgba(15,23,36,0.85)_70%)] text-white">
                  <Bot className="h-6 w-6" aria-hidden="true" />
                </span>
                <div className="flex-1 space-y-5 h-full">
                  {!isChatActive ? (
                    <div className="flex h-full flex-col justify-between space-y-4 rounded-2xl border border-dashed border-gold-500/35 bg-[rgba(20,18,12,0.6)] p-6 text-sm text-gold-100/80">
                      <div>
                        <p className="text-base font-semibold text-white">Begin your strategic briefing when ready.</p>
                        <div className="mt-2 text-xs uppercase text-gold-200/60">
                          {pendingCachedIntake ? (
                            <div className="space-y-1">
                              <p>Resume where you left off; your simulation is ready.</p>
                              {cacheRestoreInfo && (
                                <p className="text-[0.65rem] normal-case text-gold-300/70">
                                  {cacheRestoreInfo.messageCount > 0 && (
                                    <span>{cacheRestoreInfo.messageCount} message{cacheRestoreInfo.messageCount !== 1 ? "s" : ""}</span>
                                  )}
                                  {cacheRestoreInfo.messageCount > 0 && cacheRestoreInfo.hasSummary && <span> • </span>}
                                  {cacheRestoreInfo.hasSummary && <span>Summary saved</span>}
                                  {cacheRestoreInfo.timestamp && (
                                    <span className="ml-2">
                                      {new Date(cacheRestoreInfo.timestamp).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>
                          ) : (
                            <>
                              Tell us what you are building. The agents will look for holes in your{" "}
                              <Tooltip content="The background and goal for this discussion." side="top">
                                <span className="inline-flex items-center gap-1">
                                logic
                                  <HelpCircle className="h-3 w-3 text-gold-200/40 cursor-help" />
                                </span>
                              </Tooltip>
                              .
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <div className="relative inline-block">
                          <GradientButton
                            variant="gold"
                            onClick={() => {
                              void onStartFreshIntake();
                            }}
                            className={cn(
                              "!bg-gold-500/60 hover:!bg-gold-500/70 !text-gold-100",
                              showButtonSparkle ? "relative z-10 shadow-lg shadow-gold-500/20" : ""
                            )}
                          >
                            Click Here to Start
                          </GradientButton>
                        </div>
                        {pendingCachedIntake ? (
                          <button
                            type="button"
                            aria-label="Resume previous intake conversation"
                            className="inline-flex items-center gap-2 rounded-full border border-gold-500/40 px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-white transition hover:border-gold-400/60 hover:text-gold-200"
                            onClick={() => {
                              void onResumeIntake();
                            }}
                          >
                            <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" />
                            Resume previous brief
                          </button>
                        ) : null}
                        <GradientButton
                          variant="ghost"
                          onClick={onUploadButtonClick}
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
                          onChange={onFileSelect}
                          className="hidden"
                          aria-label="Upload document"
                        />
                      </div>
                    </div>
                  ) : (
                    <IntakeChat
                      messages={chatMessages}
                      input={chatInput}
                      onInputChange={onChatInputChange}
                      onSubmit={onChatSubmit}
                      loading={chatLoading}
                      chatError={chatError}
                      onChatErrorDismiss={onChatErrorDismiss}
                      rateLimitError={intakeRateLimitError}
                      onRateLimitErrorDismiss={onRateLimitErrorDismiss}
                      storageError={storageError}
                      onStorageErrorDismiss={onStorageErrorDismiss}
                      uploadError={uploadError}
                      onUploadErrorDismiss={onUploadErrorDismiss}
                      uploadRateLimitError={uploadRateLimitError}
                      onUploadRateLimitErrorDismiss={onUploadRateLimitErrorDismiss}
                      uploading={uploading}
                      uploadProgress={uploadProgress}
                      uploadStartTime={uploadStartTime}
                      pendingFileSize={pendingFile?.size ?? null}
                      hasSummary={Boolean(intakeSummary)}
                      containerRef={chatContainerRef}
                      textareaRef={textareaRef}
                    />
                  )}
                </div>
              </div>

              {/* Document Upload Replacement Confirmation Modal */}
              <UploadReplaceModal
                open={showReplaceUploadModal}
                onConfirm={onUploadReplaceConfirm}
                onCancel={onUploadReplaceCancel}
              />

              {/* Document Upload Confirmation Modal */}
              {showUploadConfirm && previewData && (
                <DocumentUploadConfirm
                  open={showUploadConfirm}
                  onOpenChange={onShowUploadConfirmChange}
                  onConfirm={onUploadConfirm}
                  onCancel={onUploadCancel}
                  fileName={previewData.fileName}
                  fileSize={previewData.fileSize}
                  extractedTextPreview={previewData.extractedTextPreview}
                  isLoading={uploading}
                />
              )}
              {!isChatActive && (
                <div className="space-y-3 h-full">
                  <div className="flex h-full flex-col rounded-2xl border border-gold-500/20 bg-[rgba(20,18,12,0.78)] space-y-3 p-4 text-sm text-gold-100/70 shadow-[0_18px_40px_rgba(10,8,4,0.25)]">
                    <p className="font-medium text-white/85">Guide the moderator</p>
                    <p className="mt-2 leading-relaxed">
                      Describe the decision you're working on, what evidence or signals you have, and what's holding things back. The intake assistant will summarize your update into a crisp, ready-to-share board brief.
                    </p>
                    <button
                      ref={guidedIntakeTriggerRef}
                      type="button"
                      aria-label="Open board-level question builder"
                      className="mt-auto inline-flex items-center justify-center rounded-full border border-gold-500/35 px-4 py-2 text-xs font-semibold uppercase tracking-[0.28em] text-white transition hover:border-gold-400/60 hover:text-gold-200"
                      onClick={onOpenGuidedIntake}
                    >
                      Board-level question builder
                    </button>
                  </div>
                </div>
              )}
            </div>
          </GlassCard>
        </BentoCard>
      </BentoGrid>
    </div>
  );
}

