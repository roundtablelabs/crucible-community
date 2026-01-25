"use client";

import React, { useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { ErrorDisplay } from "@/components/common/ErrorDisplay";
import { RateLimitErrorDisplay } from "@/components/common/RateLimitErrorDisplay";
import { InlineLoading } from "@/components/ui/InlineLoading";
import { SummaryEditor } from "@/components/intake/SummaryEditor";

type IntakeChatMessage = {
  id: string;
  role: "assistant" | "user";
  content: string;
};

type IntakeChatProps = {
  messages: IntakeChatMessage[];
  input: string;
  onInputChange: (value: string) => void;
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void | Promise<void>;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  isLoading: boolean;
  error: string | null;
  onRetryError?: () => void;
  onDismissError?: () => void;
  uploadError?: string | null;
  onRetryUpload?: () => void;
  uploadRateLimitError?: {
    error: string;
    limit: number;
    remaining: number;
    resetAt: number;
    retryAfter: number;
  } | null;
  onUploadRateLimitErrorDismiss?: () => void;
  isEditingSummary?: boolean;
  uploadedSummary?: string | null;
  onSummaryConfirm?: (editedSummary: string) => void;
  onSummaryCancel?: () => void;
  intakeSummary?: string | null;
  onInputFocus?: () => void;
  chatContainerRef?: React.RefObject<HTMLDivElement | null>;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
};

export function IntakeChat({
  messages,
  input,
  onInputChange,
  onSubmit,
  onKeyDown,
  isLoading,
  error,
  onRetryError,
  onDismissError,
  uploadError,
  onRetryUpload,
  uploadRateLimitError,
  onUploadRateLimitErrorDismiss,
  isEditingSummary,
  uploadedSummary,
  onSummaryConfirm,
  onSummaryCancel,
  intakeSummary,
  onInputFocus,
  chatContainerRef: externalChatContainerRef,
  textareaRef: externalTextareaRef,
}: IntakeChatProps) {
  const internalChatContainerRef = useRef<HTMLDivElement>(null);
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const chatContainerRef = externalChatContainerRef || internalChatContainerRef;
  const textareaRef = externalTextareaRef || internalTextareaRef;

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, chatContainerRef]);

  // Auto-resize textarea based on content (max 3 rows)
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      const scrollHeight = textarea.scrollHeight;
      const maxHeight = 76; // ~3 rows for text-sm with py-2
      textarea.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  }, [input, textareaRef]);

  return (
    <>
      <div
        ref={chatContainerRef}
        className="mt-5 max-h-80 overflow-y-auto pr-1 text-sm text-gold-100/85"
        aria-live="polite"
      >
        {messages.length === 0 && !isLoading ? (
          <p className="text-gold-100/65">Preparing intake conversation...</p>
        ) : null}
        <div className="space-y-3">
          {messages.map((message) => (
            <div
              key={message.id}
              className={cn(
                "flex",
                message.role === "user" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl border px-4 py-2 text-sm leading-relaxed",
                  message.role === "user"
                    ? "border-gold-500/40 bg-[linear-gradient(135deg,rgba(242,194,79,0.32),rgba(20,18,12,0.88))] text-white"
                    : "border-gold-600/30 bg-[linear-gradient(135deg,rgba(250,204,21,0.24),rgba(20,18,12,0.88))] text-gold-50",
                )}
              >
                {message.content}
              </div>
            </div>
          ))}
          {isLoading ? (
            <div className="flex justify-start">
              <div className="flex items-center gap-2 rounded-2xl border border-gold-500/35 bg-[rgba(20,18,12,0.85)] px-4 py-2 text-xs uppercase tracking-[0.24em] text-gold-200/80">
                <InlineLoading size="sm" text="Intake assistant is thinking..." />
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {error ? (
        <ErrorDisplay
          error={error}
          onRetry={onRetryError}
          onDismiss={onDismissError}
          variant="inline"
          retryable={true}
          className="text-xs"
        />
      ) : null}
      {uploadRateLimitError ? (
        <RateLimitErrorDisplay
          error={uploadRateLimitError.error}
          limit={uploadRateLimitError.limit}
          remaining={uploadRateLimitError.remaining}
          resetAt={uploadRateLimitError.resetAt}
          retryAfter={uploadRateLimitError.retryAfter}
          onDismiss={onUploadRateLimitErrorDismiss}
          className="mt-4 text-xs"
        />
      ) : uploadError ? (
        <ErrorDisplay
          error={uploadError}
          onRetry={onRetryUpload}
          onDismiss={() => {}}
          variant="inline"
          retryable={true}
          className="mt-4 text-xs"
        />
      ) : null}
      {isEditingSummary && uploadedSummary ? (
        <div className="mt-5">
          <SummaryEditor
            summary={uploadedSummary}
            onConfirm={onSummaryConfirm || ((_editedSummary: string) => {})}
            onCancel={onSummaryCancel || (() => {})}
            isLoading={false}
          />
        </div>
      ) : null}

      {intakeSummary ? (
        <form className="mt-5 flex gap-3 items-end" onSubmit={onSubmit}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onFocus={onInputFocus}
            onKeyDown={onKeyDown}
            disabled={isLoading}
            placeholder="Add more context or clarify details..."
            rows={1}
            className="flex-1 rounded-xl border border-gold-500/25 bg-[rgba(20,18,12,0.85)] px-4 py-2 text-sm text-white outline-none transition focus:border-gold-500 focus:ring-2 focus:ring-gold-500/40 disabled:opacity-60 resize-none overflow-y-auto max-h-[76px] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-full bg-gradient-to-r from-gold-500 to-gold-600 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.28em] text-base-bg transition hover:from-gold-400 hover:to-gold-500 disabled:cursor-not-allowed disabled:bg-[rgba(20,18,12,0.65)] disabled:text-base-bg h-fit"
            title="Send (Ctrl+Enter)"
          >
            Send
            <span className="ml-1.5 text-[8px] font-normal opacity-60 leading-none">
              <kbd className="inline-flex h-2.5 items-center rounded border border-current/30 px-0.5 text-[7px] font-mono">
                ⌃
              </kbd>
              <span className="mx-0.5">↵</span>
            </span>
          </button>
        </form>
      ) : (
        <form className="mt-5 flex gap-3 items-end" onSubmit={onSubmit}>
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(event) => onInputChange(event.target.value)}
            onKeyDown={onKeyDown}
            disabled={isLoading}
            placeholder="Share context for today's simulation..."
            rows={1}
            className="flex-1 rounded-xl border border-gold-500/25 bg-[rgba(20,18,12,0.85)] px-4 py-2 text-sm text-white outline-none transition focus:border-gold-500 focus:ring-2 focus:ring-gold-500/40 disabled:opacity-60 resize-none overflow-y-auto max-h-[76px] [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="rounded-full bg-gradient-to-r from-gold-500 to-gold-600 px-5 py-2.5 text-xs font-semibold uppercase tracking-[0.28em] text-base-bg transition hover:from-gold-400 hover:to-gold-500 disabled:cursor-not-allowed disabled:bg-[rgba(20,18,12,0.65)] disabled:text-base-bg h-fit"
            title="Send (Ctrl+Enter)"
          >
            Send
            <span className="ml-1.5 text-[8px] font-normal opacity-60 leading-none">
              <kbd className="inline-flex h-2.5 items-center rounded border border-current/30 px-0.5 text-[7px] font-mono">
                ⌃
              </kbd>
              <span className="mx-0.5">↵</span>
            </span>
          </button>
        </form>
      )}
    </>
  );
}

