"use client";

import React, { useRef } from "react";
import { createPortal } from "react-dom";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";

type UploadReplaceModalProps = {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

function FocusTrapHelper({
  modalRef,
  onClose,
}: {
  modalRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  useFocusTrap(modalRef, {
    isOpen: true,
    onEscape: onClose,
    lockBodyScroll: true,
    returnFocus: true,
    triggerElement: null,
    disableBackdropClick: false,
  });
  return null;
}

/**
 * UploadReplaceModal - Confirmation modal for replacing existing session with document upload
 * 
 * NOTE: This modal uses createPortal to render to document.body to avoid z-index issues.
 * This pattern MUST be preserved per the refactoring plan.
 */
export function UploadReplaceModal({
  open,
  onConfirm,
  onCancel,
}: UploadReplaceModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Don't render if closed or if we're not in browser
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <>
      <FocusTrapHelper modalRef={modalRef} onClose={onCancel} />
      <div
        ref={modalRef}
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-replace-heading"
        onClick={onCancel}
      >
        <div
          className="w-full max-w-lg rounded-[28px] border border-gold-500/35 bg-[rgba(15,12,8,0.96)] p-6 shadow-[0_40px_120px_rgba(10,8,4,0.75)]"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="space-y-4 text-gold-100/80">
            <div>
              <p id="upload-replace-heading" className="text-lg font-semibold text-white">
                Replace existing session?
              </p>
              <p className="mt-2 text-sm leading-relaxed text-gold-100/70">
                Uploading this document will replace your current intake session. Continue if you are comfortable discarding the current session.
              </p>
            </div>
            <div className="flex flex-wrap justify-end gap-3 text-xs uppercase tracking-[0.26em]">
              <button
                type="button"
                onClick={onCancel}
                className="rounded-full border border-gold-500/35 px-4 py-2 text-gold-200 transition hover:border-gold-400/55 hover:text-white"
              >
                Keep existing session
              </button>
              <button
                type="button"
                onClick={onConfirm}
                className="rounded-full bg-gradient-to-r from-gold-500 to-gold-600 px-5 py-2 text-[#0b1b2c] transition hover:from-gold-400 hover:to-gold-500"
              >
                Replace with document
              </button>
            </div>
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}

