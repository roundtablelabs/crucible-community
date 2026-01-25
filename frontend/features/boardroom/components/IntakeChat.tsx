"use client";

/**
 * IntakeChat component
 * Displays the intake chat conversation with messages, input form, and error states
 * 
 * Extracted from frontend/app/(app)/app/page.tsx
 */

import React, { FormEvent, useCallback, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { ErrorDisplay } from "@/components/common/ErrorDisplay";
import { RateLimitErrorDisplay } from "@/components/common/RateLimitErrorDisplay";
import type { UploadRateLimitError } from "../types";
import { InlineLoading } from "@/components/ui/InlineLoading";
import { ProgressIndicator } from "@/components/ui/ProgressIndicator";
import { GradientButton } from "@/components/ui/gradient-button";
import { estimateUploadTimeRemaining } from "@/lib/utils/loadingHelpers";
import type { IntakeChatMessage, IntakeRateLimitError } from "../types";

type IntakeChatProps = {
  // Chat state
  messages: IntakeChatMessage[];
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  loading: boolean;
  
  // Error states
  chatError: string | null;
  onChatErrorDismiss: () => void;
  rateLimitError: IntakeRateLimitError | null;
  onRateLimitErrorDismiss: () => void;
  storageError: string | null;
  onStorageErrorDismiss: () => void;
  uploadError: string | null;
  onUploadErrorDismiss: () => void;
  uploadRateLimitError: UploadRateLimitError | null;
  onUploadRateLimitErrorDismiss: () => void;
  
  // Upload progress
  uploading: boolean;
  uploadProgress: number;
  uploadStartTime: number | null;
  pendingFileSize: number | null;
  
  // Summary state (controls input visibility)
  hasSummary: boolean;
  
  // Refs (passed from parent)
  containerRef: React.RefObject<HTMLDivElement | null>;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
};

export function IntakeChat({
  messages,
  input,
  onInputChange,
  onSubmit,
  loading,
  chatError,
  onChatErrorDismiss,
  rateLimitError,
  onRateLimitErrorDismiss,
  storageError,
  onStorageErrorDismiss,
  uploadError,
  onUploadErrorDismiss,
  uploadRateLimitError,
  onUploadRateLimitErrorDismiss,
  uploading,
  uploadProgress,
  uploadStartTime,
  pendingFileSize,
  hasSummary,
  containerRef,
  textareaRef,
}: IntakeChatProps) {
  // Scroll to bottom when messages change
  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [containerRef]);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Handle keyboard submit
  const handleTextareaKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !event.shiftKey && !loading) {
        event.preventDefault();
        const form = event.currentTarget.form;
        if (form) {
          form.requestSubmit();
        }
      }
    },
    [loading]
  );

  // Handle textarea change - starts at 1 row, grows to max 3 rows, then scrolls
  const handleTextareaChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      const textarea = event.target;
      onInputChange(textarea.value);
      
      // Auto-resize: reset height to calculate scrollHeight, then cap at 3 rows
      textarea.style.height = "auto";
      const scrollHeight = textarea.scrollHeight;
      // Calculate height for 3 rows: line-height ~21px (text-sm 14px * 1.5) * 3 rows = ~63px + padding 16px = ~79px
      const maxHeight = 79; // Maximum height for 3 rows
      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    },
    [onInputChange]
  );

  return (
    <>
      {/* Chat Messages Container */}
      <div
        ref={containerRef}
        className="max-h-72 overflow-y-auto pr-1 text-sm text-gold-100/85"
        aria-live="polite"
      >
        <div className="space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex",
                message.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl border px-4 py-2 text-sm leading-relaxed shadow-lg shadow-black/30",
                  message.role === "user"
                    ? "border-gold-500/40 bg-[linear-gradient(135deg,rgba(242,194,79,0.32),rgba(20,15,8,0.88))] text-white"
                    : "border-gold-600/30 bg-[linear-gradient(135deg,rgba(247,209,92,0.24),rgba(15,12,8,0.88))] text-gold-50"
                )}
              >
                {message.content}
              </div>
            </div>
          ))}
          {loading ? (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl border border-gold-500/35 bg-[rgba(20,18,12,0.85)] px-4 py-2 text-xs uppercase tracking-[0.24em] text-gold-200/80">
                <InlineLoading size="sm" text="Thinking..." />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Rate Limit Error */}
      {rateLimitError ? (
        <RateLimitErrorDisplay
          error={rateLimitError.error}
          limit={rateLimitError.limit}
          remaining={rateLimitError.remaining}
          resetAt={rateLimitError.resetAt}
          retryAfter={rateLimitError.retryAfter}
          onDismiss={onRateLimitErrorDismiss}
          className="text-xs"
        />
      ) : chatError ? (
        <ErrorDisplay
          error={chatError}
          onDismiss={onChatErrorDismiss}
          variant="inline"
          className="text-xs"
        />
      ) : null}

      {/* Upload Progress */}
      {uploading && uploadProgress > 0 && uploadProgress < 100 ? (
        <div className="rounded-2xl border border-gold-500/35 bg-[rgba(20,18,12,0.85)] p-4">
          <ProgressIndicator
            progress={uploadProgress}
            label="Uploading document..."
            estimatedTime={
              uploadStartTime && pendingFileSize
                ? estimateUploadTimeRemaining(
                    (uploadProgress / 100) * pendingFileSize,
                    pendingFileSize,
                    (Date.now() - uploadStartTime) / 1000
                  ) ?? undefined
                : undefined
            }
            showPercentage={true}
          />
        </div>
      ) : null}

      {/* Upload Rate Limit Error */}
      {uploadRateLimitError ? (
        <RateLimitErrorDisplay
          error={uploadRateLimitError.error}
          limit={uploadRateLimitError.limit}
          remaining={uploadRateLimitError.remaining}
          resetAt={uploadRateLimitError.resetAt}
          retryAfter={uploadRateLimitError.retryAfter}
          onDismiss={onUploadRateLimitErrorDismiss}
          className="text-xs"
        />
      ) : uploadError ? (
        <ErrorDisplay
          error={uploadError}
          onDismiss={onUploadErrorDismiss}
          variant="inline"
          className="text-xs"
        />
      ) : null}

      {/* Storage Error */}
      {storageError ? (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs text-amber-100">
          <p className="font-semibold text-amber-200">Storage Warning</p>
          <p className="mt-1">{storageError}</p>
          <button
            type="button"
            onClick={onStorageErrorDismiss}
            className="mt-2 text-xs underline hover:text-amber-50"
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {/* Chat Input Form */}
      {!hasSummary ? (
        <form className="flex gap-3 items-end" onSubmit={onSubmit}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleTextareaChange}
            onKeyDown={handleTextareaKeyDown}
            disabled={loading}
            placeholder="Describe your business idea, elevator pitch, or question to get started..."
            rows={1}
            className="flex-1 rounded-xl border border-gold-500/25 bg-[rgba(20,18,12,0.85)] px-4 py-2 text-sm text-white outline-none transition focus:border-gold-500 focus:ring-2 focus:ring-gold-500/40 disabled:opacity-60 resize-none overflow-y-auto max-h-[79px] [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-thumb]:bg-gold-500/30 [&::-webkit-scrollbar-thumb]:rounded-full sm:[&::-webkit-scrollbar]:hidden [-ms-overflow-style:scrollbar] sm:[-ms-overflow-style:none] [scrollbar-width:thin] sm:[scrollbar-width:none]"
          />
          <GradientButton
            type="submit"
            variant="gold"
            disabled={loading || !input.trim()}
            className="h-fit relative"
            title="Send (Ctrl+Enter)"
          >
            Send
            <span className="ml-1.5 text-[8px] font-normal opacity-60 leading-none">
              <kbd className="inline-flex h-2.5 items-center rounded border border-current/30 px-0.5 text-[7px] font-mono">
                ⌃
              </kbd>
              <span className="mx-0.5">↵</span>
            </span>
          </GradientButton>
        </form>
      ) : null}
    </>
  );
}

