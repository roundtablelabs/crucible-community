"use client";

import { useState, useEffect, useRef } from "react";
import { CheckCircle2 } from "lucide-react";
import { GradientButton } from "@/components/ui/gradient-button";
import { cn } from "@/lib/utils";
import { InlineLoading } from "@/components/ui/InlineLoading";

type SummaryEditorProps = {
  summary: string;
  onConfirm: (editedSummary: string) => void;
  onCancel: () => void;
  isLoading?: boolean;
};

export function SummaryEditor({
  summary,
  onConfirm,
  onCancel,
  isLoading = false,
}: SummaryEditorProps) {
  const [editedSummary, setEditedSummary] = useState(summary);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Update local state when summary prop changes
  useEffect(() => {
    setEditedSummary(summary);
  }, [summary]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${textareaRef.current.scrollHeight}px`;
    }
  }, [editedSummary]);

  const handleConfirm = () => {
    onConfirm(editedSummary.trim());
  };

  const characterCount = editedSummary.length;
  const wordCount = editedSummary.trim().split(/\s+/).filter(Boolean).length;

  return (
    <div className="rounded-[28px] border border-teal-400/30 bg-[rgba(10,26,40,0.78)] px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-[0.6rem] uppercase tracking-[0.35em] text-teal-200/80">
            <CheckCircle2 className="h-4 w-4 text-teal-300" aria-hidden="true" />
            Review and edit summary
          </p>
          <h2 className="mt-2 text-xl font-semibold text-white">Confirm intake brief</h2>
        </div>
        <div className="flex gap-3">
          <GradientButton
            variant="gold"
            onClick={handleConfirm}
            disabled={isLoading || !editedSummary.trim()}
          >
            {isLoading ? (
              <InlineLoading size="sm" text="Processing..." spinnerColor="text-navy-900" />
            ) : (
              "Confirm and proceed"
            )}
          </GradientButton>
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200/40 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-slate-200 transition hover:border-slate-200/70 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>

      <div className="mt-4">
        <textarea
          ref={textareaRef}
          value={editedSummary}
          onChange={(e) => setEditedSummary(e.target.value)}
          disabled={isLoading}
          placeholder="Edit the generated summary..."
          className={cn(
            "w-full resize-none rounded-2xl border border-gold-500/25 bg-[rgba(20,18,12,0.85)] px-4 py-3",
            "text-sm leading-relaxed text-white outline-none transition",
            "focus:border-gold-500 focus:ring-2 focus:ring-gold-500/40",
            "disabled:cursor-not-allowed disabled:opacity-60",
            "min-h-[120px]"
          )}
          rows={6}
        />
        <div className="mt-2 flex items-center justify-between text-xs text-slate-400/70">
          <span>
            {wordCount} word{wordCount !== 1 ? "s" : ""} • {characterCount} character{characterCount !== 1 ? "s" : ""}
          </span>
          <span className="text-slate-500/60">You can edit this summary before proceeding</span>
        </div>
      </div>
    </div>
  );
}

