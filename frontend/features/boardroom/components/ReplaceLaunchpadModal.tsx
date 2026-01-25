"use client";

import React, { useRef } from "react";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";

type ReplaceLaunchpadModalProps = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  triggerRef: React.RefObject<HTMLButtonElement | null>;
};

function FocusTrapHelper({
  modalRef,
  onClose,
  triggerElement,
}: {
  modalRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
  triggerElement: HTMLElement | null;
}) {
  useFocusTrap(modalRef, {
    isOpen: true,
    onEscape: onClose,
    lockBodyScroll: true,
    returnFocus: true,
    triggerElement,
    disableBackdropClick: false,
  });
  return null;
}

export function ReplaceLaunchpadModal({
  open,
  onConfirm,
  onCancel,
  triggerRef,
}: ReplaceLaunchpadModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  if (!open) return null;

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-[99] flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="launchpad-replace-heading"
      onClick={onCancel}
    >
      <FocusTrapHelper
        modalRef={modalRef}
        onClose={onCancel}
        triggerElement={triggerRef.current}
      />
      <div
        className="w-full max-w-[calc(100vw-2rem)] sm:max-w-lg rounded-[28px] border border-gold-500/35 bg-[rgba(15,12,8,0.96)] p-6 shadow-[0_40px_120px_rgba(10,8,4,0.75)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-4 text-gold-100/80">
          <div>
            <p
              id="launchpad-replace-heading"
              className="text-lg font-semibold text-white"
            >
              Replace Launchpad intake?
            </p>
            <p className="mt-2 text-sm leading-relaxed text-gold-100/70">
              Starting a new intake here will overwrite the session currently staged in Launchpad.
              You&rsquo;ll lose any unanswered questions or summaries there.
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-3 text-xs uppercase tracking-[0.26em]">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full border border-gold-500/35 px-4 py-2 text-gold-200 transition hover:border-gold-400/55 hover:text-white"
            >
              Keep existing
            </button>
            <button
              type="button"
              onClick={onConfirm}
              className="rounded-full bg-gradient-to-r from-gold-500 to-gold-600 px-5 py-2 text-[#0b1b2c] transition hover:from-gold-400 hover:to-gold-500"
            >
              Replace session
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

