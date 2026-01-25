"use client";

import React, { useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { useFocusTrap } from "@/lib/hooks/useFocusTrap";

type ExpandedImageModalProps = {
  open: boolean;
  onClose: () => void;
  imageSrc?: string;
  imageAlt?: string;
};

/**
 * ExpandedImageModal - Full-screen image preview modal
 */
export const ExpandedImageModal = React.forwardRef<HTMLDivElement, ExpandedImageModalProps>(
  ({ open, onClose, imageSrc = "/boardroom-preview.webp", imageAlt = "Boardroom expanded view" }, forwardedRef) => {
    const internalRef = useRef<HTMLDivElement>(null);
    const modalRef = (forwardedRef || internalRef) as React.RefObject<HTMLDivElement>;

    useFocusTrap(modalRef, {
      isOpen: open,
      onEscape: onClose,
      lockBodyScroll: true,
      returnFocus: false, // Image modal doesn't have a specific trigger
      triggerElement: null,
      disableBackdropClick: false,
    });

    // Don't render if no image source is provided
    if (!imageSrc) {
      return null;
    }

    return (
      <AnimatePresence>
        {open && (
          <motion.div
            ref={modalRef}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-4 py-10 backdrop-blur-sm"
            onClick={onClose}
            role="dialog"
            aria-modal="true"
            aria-label="Expanded image view"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="relative w-full max-w-[calc(100vw-2rem)] sm:max-w-5xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={onClose}
                className="absolute -top-12 right-0 flex items-center gap-2 rounded-full border border-white/30 bg-black/50 px-4 py-2 text-sm text-white transition hover:border-gold-500/60 hover:text-gold-200 min-h-[44px]"
                aria-label="Close expanded image"
              >
                <X className="h-4 w-4" aria-hidden="true" />
                Close
              </button>
              <div className="rounded-2xl border border-gold-500/40 bg-[rgba(20,18,12,0.95)] p-4 overflow-hidden">
                <img 
                  src={imageSrc}
                  alt={imageAlt}
                  className="w-full h-auto rounded-xl"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    );
  }
);

ExpandedImageModal.displayName = "ExpandedImageModal";

