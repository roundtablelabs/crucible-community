"use client";

import { motion, AnimatePresence } from "framer-motion";
import { ReactNode } from "react";

interface AnimatedOverlayProps {
  isOpen: boolean;
  onClose?: () => void;
  children: ReactNode;
  blur?: boolean;
  opacity?: number;
  zIndex?: number;
}

export function AnimatedOverlay({
  isOpen,
  onClose,
  children,
  blur = true,
  opacity = 0.8,
  zIndex = 1000,
}: AnimatedOverlayProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0"
          style={{ zIndex }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={`fixed inset-0 bg-black/80 ${blur ? "backdrop-blur-md" : ""}`}
            style={{ opacity }}
          />
          <div className="relative z-10 h-full w-full" onClick={(e) => e.stopPropagation()}>
            {children}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

