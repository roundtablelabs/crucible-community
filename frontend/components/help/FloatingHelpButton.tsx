"use client";

import { useState, useRef, useEffect } from "react";
import { HelpCircle, X, BookOpen, BookMarked, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { cn, getDocsUrl } from "@/lib/utils";

export function FloatingHelpButton() {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        menuRef.current &&
        buttonRef.current &&
        !menuRef.current.contains(event.target as Node) &&
        !buttonRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
      };
    }
  }, [isOpen]);

  const handleHelpClick = () => {
    setIsOpen(false);
    window.open(getDocsUrl(), "_blank", "noopener,noreferrer");
  };

  const handleGlossaryClick = () => {
    setIsOpen(false);
    window.open(getDocsUrl("glossary"), "_blank", "noopener,noreferrer");
  };

  const handleLicenseClick = () => {
    setIsOpen(false);
    // Small delay to allow menu closing animation to complete before navigation
    setTimeout(() => {
      router.push("/app/about", { scroll: false });
    }, 200);
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-label="Help"
        aria-expanded={isOpen}
        className={cn(
          "fixed bottom-6 right-6 z-50 flex h-11 w-11 items-center justify-center rounded-xl border-2 border-gold-500/40 bg-[rgba(15,12,8,0.95)] backdrop-blur-xl shadow-[0_8px_32px_rgba(10,8,4,0.4)] text-gold-500 transition-all duration-300 hover:border-gold-500/70 hover:bg-[rgba(15,12,8,0.98)] hover:scale-110 hover:shadow-[0_12px_40px_rgba(10,8,4,0.6)]",
          isOpen && "border-gold-500/70 bg-[rgba(15,12,8,0.98)] scale-110"
        )}
      >
        {isOpen ? (
          <X className="h-5 w-5 transition-transform duration-300" aria-hidden="true" />
        ) : (
          <HelpCircle className="h-5 w-5 transition-transform duration-300" aria-hidden="true" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            ref={menuRef}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed bottom-24 right-6 z-50 w-64 rounded-2xl border-2 border-gold-500/40 bg-[rgba(15,12,8,0.98)] backdrop-blur-xl p-2 shadow-[0_16px_48px_rgba(10,8,4,0.6)]"
          >
            <div className="space-y-1">
              <button
                type="button"
                onClick={handleHelpClick}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm text-gold-100/90 transition hover:bg-gold-500/10 hover:text-gold-200"
              >
                <BookOpen className="h-5 w-5 text-gold-500/70" aria-hidden="true" />
                <div className="flex-1">
                  <p className="font-semibold text-white">Help</p>
                  <p className="text-xs text-gold-100/60">View documentation</p>
                </div>
              </button>
              <button
                type="button"
                onClick={handleGlossaryClick}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm text-gold-100/90 transition hover:bg-gold-500/10 hover:text-gold-200"
              >
                <BookMarked className="h-5 w-5 text-gold-500/70" aria-hidden="true" />
                <div className="flex-1">
                  <p className="font-semibold text-white">Glossary</p>
                  <p className="text-xs text-gold-100/60">Key terms explained</p>
                </div>
              </button>
              {/* View License */}
              <button
                type="button"
                onClick={handleLicenseClick}
                className="flex w-full items-center gap-3 rounded-xl px-4 py-3 text-left text-sm text-gold-100/90 transition hover:bg-gold-500/10 hover:text-gold-200"
              >
                <FileText className="h-5 w-5 text-gold-500/70" aria-hidden="true" />
                <div className="flex-1">
                  <p className="font-semibold text-white">View License</p>
                  <p className="text-xs text-gold-100/60">AGPL-3.0</p>
                </div>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

