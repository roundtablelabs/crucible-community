"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

interface VideoPreviewProps {
  src: string;
  alt: string;
  className?: string;
  expandable?: boolean;
}

export function VideoPreview({ src, alt, className = "w-full h-auto", expandable = false }: VideoPreviewProps) {
  const [showExpanded, setShowExpanded] = useState(false);
  
  // Get the current origin for absolute URL
  const getImageSrc = () => {
    if (typeof window !== 'undefined') {
      // Use absolute URL with current origin to work across subdomains
      return `${window.location.origin}${src}`;
    }
    // Fallback for SSR - will be replaced on client
    return src;
  };

  return (
    <>
      <img 
        src={getImageSrc()}
        alt={alt} 
        className={expandable ? `${className} cursor-pointer transition-opacity hover:opacity-90` : className}
        onClick={expandable ? () => setShowExpanded(true) : undefined}
      />
      
      {expandable && (
        <AnimatePresence>
          {showExpanded && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-4 py-10 backdrop-blur-sm"
              onClick={() => setShowExpanded(false)}
            >
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 300 }}
                className="relative w-full max-w-5xl"
                onClick={(e) => e.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => setShowExpanded(false)}
                  className="absolute -top-12 right-0 flex items-center gap-2 rounded-full border border-white/30 bg-black/50 px-4 py-2 text-sm text-white transition hover:border-gold-500/60 hover:text-gold-200"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                  Close
                </button>
                <div className="rounded-2xl border border-gold-500/40 bg-[rgba(20,18,12,0.95)] p-4 overflow-hidden">
                  <img 
                    src={getImageSrc()}
                    alt={alt} 
                    className="w-full h-auto rounded-lg"
                  />
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </>
  );
}
