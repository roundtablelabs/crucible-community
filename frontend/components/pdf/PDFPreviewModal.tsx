"use client";

import React, { useState } from "react";
import { X, Download, Loader2 } from "lucide-react";
import { GlassCard } from "@/components/ui/glass-card";

interface PDFPreviewModalProps {
  pdfUrl: string | null;
  onClose: () => void;
  filename?: string;
  onDownload?: () => void;
}

export function PDFPreviewModal({
  pdfUrl,
  onClose,
  filename = "executive_brief.pdf",
  onDownload,
}: PDFPreviewModalProps) {
  const [isLoading, setIsLoading] = useState(true);

  if (!pdfUrl) return null;

  const handleDownload = () => {
    if (onDownload) {
      onDownload();
    } else {
      // Fallback: create download link
      const link = document.createElement("a");
      link.href = pdfUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-6xl h-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <GlassCard variant="elevated" className="flex items-center justify-between p-4 mb-2">
          <h2 className="text-lg font-semibold text-base-text">Executive Brief Preview</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="inline-flex items-center gap-2 rounded-full border border-gold-500/40 bg-gold-500/10 px-4 py-2 text-sm font-medium text-gold-300 transition hover:border-gold-500/60 hover:bg-gold-500/20"
            >
              <Download className="h-4 w-4" />
              Download
            </button>
            <button
              onClick={onClose}
              className="inline-flex items-center justify-center rounded-full border border-base-divider/60 bg-base-bg/60 p-2 text-base-subtext transition hover:border-gold-500/40 hover:bg-gold-500/10 hover:text-gold-300"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </GlassCard>

        {/* PDF Viewer */}
        <GlassCard variant="elevated" className="flex-1 overflow-hidden p-0">
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-base-bg/50 z-10">
              <Loader2 className="h-8 w-8 animate-spin text-gold-500" />
            </div>
          )}
          <iframe
            src={pdfUrl}
            className="w-full h-full border-0"
            title="PDF Preview"
            onLoad={() => setIsLoading(false)}
            style={{ minHeight: "600px" }}
          />
        </GlassCard>
      </div>
    </div>
  );
}

