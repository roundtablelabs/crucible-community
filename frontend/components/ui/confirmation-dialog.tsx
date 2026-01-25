"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, X } from "lucide-react";
import { cn } from "@/lib/utils";

type ConfirmationDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "default";
  isLoading?: boolean;
};

export function ConfirmationDialog({
  open,
  onOpenChange,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  isLoading = false,
}: ConfirmationDialogProps) {
  const handleConfirm = () => {
    onConfirm();
  };

  const isDanger = variant === "danger";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[9998] bg-navy-900/70 backdrop-blur-sm" />
        <div className="fixed inset-0 z-[9999] flex items-center justify-center px-4 py-10">
          <Dialog.Content
            className={cn(
              "relative w-full max-w-[calc(100vw-2rem)] sm:max-w-md rounded-2xl border bg-base-panel shadow-soft focus:outline-none",
              "border-base-divider"
            )}
            onOpenAutoFocus={(e) => e.preventDefault()}
          >
            <div className="p-6">
              {/* Header */}
              <div className="flex items-start gap-4">
                {isDanger && (
                  <div className="flex-shrink-0 rounded-full border border-rose-500/40 bg-rose-500/10 p-2">
                    <AlertTriangle className="h-5 w-5 text-rose-300" aria-hidden="true" />
                  </div>
                )}
                <div className="flex-1 space-y-2">
                  <Dialog.Title className="text-lg font-semibold text-base-text">
                    {title}
                  </Dialog.Title>
                  <Dialog.Description className="text-sm leading-relaxed text-base-subtext">
                    {description}
                  </Dialog.Description>
                </div>
                <Dialog.Close
                  className="flex items-center justify-center rounded-full p-1.5 text-base-subtext transition hover:bg-base-bg hover:text-base-text min-h-[44px] min-w-[44px]"
                  aria-label="Close"
                >
                  <X className="h-4 w-4" />
                </Dialog.Close>
              </div>

              {/* Actions */}
              <div className="mt-6 flex items-center justify-end gap-3">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    disabled={isLoading}
                    className="inline-flex items-center justify-center rounded-full border border-base-divider/70 px-4 py-2 text-sm font-medium text-base-text transition hover:border-gold-500/70 hover:text-gold-500 disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px]"
                  >
                    {cancelLabel}
                  </button>
                </Dialog.Close>
                <button
                  type="button"
                  onClick={handleConfirm}
                  disabled={isLoading}
                  className={cn(
                    "inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 min-h-[44px]",
                    isDanger
                      ? "border border-rose-500/40 bg-rose-500/10 text-rose-300 hover:border-rose-500/60 hover:bg-rose-500/20"
                      : "bg-gold-500/90 text-navy-900 hover:bg-gold-500"
                  )}
                >
                  {isLoading ? (
                    <>
                      <span className="mr-2 inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Deleting...
                    </>
                  ) : (
                    confirmLabel
                  )}
                </button>
              </div>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

