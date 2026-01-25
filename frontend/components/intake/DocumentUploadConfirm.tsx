"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { FileText, X, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { GradientButton } from "@/components/ui/gradient-button";
import { InlineLoading } from "@/components/ui/InlineLoading";

type DocumentUploadConfirmProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
  fileName: string;
  fileSize: number;
  extractedTextPreview: string;
  isLoading?: boolean;
};

export function DocumentUploadConfirm({
  open,
  onOpenChange,
  onConfirm,
  onCancel,
  fileName,
  fileSize,
  extractedTextPreview,
  isLoading = false,
}: DocumentUploadConfirmProps) {
  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const wordCount = extractedTextPreview.trim().split(/\s+/).filter(Boolean).length;
  const charCount = extractedTextPreview.length;

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9998] bg-navy-900/70 backdrop-blur-sm" />
        <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4 py-10">
          <Dialog.Content
            className={cn(
              "relative w-full max-w-2xl rounded-2xl border bg-base-panel shadow-soft focus:outline-none",
              "border-base-divider max-h-[90vh] overflow-hidden flex flex-col"
            )}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className="flex-1 overflow-y-auto p-6">
              {/* Header */}
              <div className="flex items-start gap-4 mb-6">
                <div className="flex-shrink-0 rounded-full border border-teal-500/40 bg-teal-500/10 p-3">
                  <FileText className="h-5 w-5 text-teal-300" aria-hidden="true" />
                </div>
                <div className="flex-1 space-y-2">
                  <Dialog.Title className="text-lg font-semibold text-base-text">
                    Confirm Document Upload
                  </Dialog.Title>
                  <Dialog.Description className="text-sm leading-relaxed text-base-subtext">
                    Please review the file information and extracted content before proceeding.
                  </Dialog.Description>
                </div>
                <Dialog.Close
                  className="rounded-full p-1.5 text-base-subtext transition hover:bg-base-bg hover:text-base-text"
                  aria-label="Close"
                  onClick={onCancel}
                >
                  <X className="h-4 w-4" />
                </Dialog.Close>
              </div>

              {/* File Information */}
              <div className="mb-6 rounded-xl border border-gold-500/20 bg-[rgba(242,194,79,0.05)] p-4">
                <div className="flex items-center gap-3 mb-2">
                  <FileText className="h-4 w-4 text-gold-400" aria-hidden="true" />
                  <span className="text-sm font-medium text-gold-200">File Information</span>
                </div>
                <div className="space-y-1 text-sm text-base-subtext">
                  <div className="flex justify-between">
                    <span className="text-gold-100/70">File Name:</span>
                    <span className="text-gold-100 font-mono text-xs">{fileName}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gold-100/70">File Size:</span>
                    <span className="text-gold-100">{formatFileSize(fileSize)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gold-100/70">Extracted Text:</span>
                    <span className="text-gold-100">
                      {wordCount} words • {charCount.toLocaleString()} characters
                    </span>
                  </div>
                </div>
              </div>

              {/* Extracted Text Preview */}
              <div className="mb-6">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCircle2 className="h-4 w-4 text-teal-300" aria-hidden="true" />
                  <span className="text-sm font-medium text-base-text">Extracted Content Preview</span>
                </div>
                <div className="rounded-xl border border-base-divider bg-[rgba(20,18,12,0.6)] p-4 max-h-64 overflow-y-auto">
                  <p className="text-sm leading-relaxed text-base-subtext whitespace-pre-wrap">
                    {extractedTextPreview || "No text could be extracted from the document."}
                  </p>
                  {extractedTextPreview.length > 500 && (
                    <p className="mt-2 text-xs text-base-subtext/60 italic">
                      (Showing first 500 characters. Full document will be processed.)
                    </p>
                  )}
                </div>
              </div>

              {/* Info Message */}
              <div className="rounded-xl border border-teal-500/20 bg-[rgba(10,26,40,0.4)] p-3 mb-6">
                <p className="text-xs leading-relaxed text-teal-100/80">
                  <strong className="text-teal-200">Next step:</strong> After confirming, we'll generate an executive summary from this document that you can review and edit before proceeding to the launchpad.
                </p>
              </div>
            </div>

            {/* Actions */}
            <div className="border-t border-base-divider p-6 flex items-center justify-end gap-3">
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={onCancel}
                  className="inline-flex items-center justify-center rounded-full border border-base-divider/70 px-4 py-2 text-sm font-medium text-base-text transition hover:border-gold-500/70 hover:text-gold-500 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Cancel
                </button>
              </Dialog.Close>
              <GradientButton
                variant="gold"
                onClick={onConfirm}
                disabled={isLoading || !extractedTextPreview.trim()}
              >
                {isLoading ? (
                  <InlineLoading size="sm" text="Processing..." spinnerColor="text-navy-900" />
                ) : (
                  "Confirm and Process"
                )}
              </GradientButton>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

