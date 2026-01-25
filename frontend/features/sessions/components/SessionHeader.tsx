"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, FileDown, Users } from "lucide-react";
import { InlineLoading } from "@/components/ui/InlineLoading";
import { QualityBadge } from "./QualityBadge";

type SessionMetadata = {
  session_id: string;
  topic: string | null;
  status: string;
  created_at: string | null;
  completed_at: string | null;
  exported_at: string;
  participants?: Array<{ knight_id: string | null }>;
};

type SessionHeaderProps = {
  metadata: SessionMetadata | undefined;
  strategicQuestion: string | null;
  duration: string | null;
  participants: Array<{ id: string; name: string }>;
  hasPdf: boolean;
  isDownloadingPdf: boolean;
  onDownloadPdf: () => void;
  onOpenDrawer: () => void;
  qualityTier?: string | null;
  qualityScore?: number | null;
  qualityBreakdown?: Record<string, number> | null;
  sessionIdFromUrl?: string;
};

export function SessionHeader({
  metadata,
  strategicQuestion,
  duration,
  participants,
  hasPdf,
  isDownloadingPdf,
  onDownloadPdf,
  onOpenDrawer,
  qualityTier,
  qualityScore,
  qualityBreakdown,
  sessionIdFromUrl,
}: SessionHeaderProps) {
  const sessionId = metadata?.session_id || sessionIdFromUrl;

  return (
    <header className="flex flex-col gap-4 rounded-3xl border border-gold-500/30 bg-base-panel p-6 shadow-soft sm:flex-row sm:items-start sm:justify-between relative">
      <div className="flex-1 min-w-0 space-y-2">
        <Link
          href="/app/sessions"
          className="inline-flex items-center gap-2 text-sm text-base-subtext transition hover:text-base-text"
        >
          <ArrowLeft className="h-4 w-4 flex-shrink-0" />
          Back to Sessions
        </Link>
        <h1 className="text-lg font-semibold text-base-text break-words">
          {metadata?.topic || "Session Output"}
        </h1>
        {strategicQuestion && (
          <p className="text-sm text-base-subtext italic break-words">
            {typeof strategicQuestion === "string" ? strategicQuestion : String(strategicQuestion)}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-4 text-sm text-base-subtext font-mono">
          {metadata?.session_id && (
            <span>
              <span>Session ID: </span>
              <span>{metadata.session_id}</span>
            </span>
          )}
          {metadata?.completed_at && (
            <span>
              <span>Finished: </span>
              <span>{new Date(metadata.completed_at).toLocaleString()}</span>
            </span>
          )}
          {duration && (
            <span>
              <span>Duration: </span>
              <span>{duration}</span>
            </span>
          )}
          {qualityTier && qualityScore !== null && qualityScore !== undefined && (
            <QualityBadge 
              tier={qualityTier} 
              score={qualityScore}
              breakdown={qualityBreakdown}
            />
          )}
        </div>
      </div>
      <div className="flex-shrink-0 sm:ml-4 flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
        <button
          type="button"
          onClick={onOpenDrawer}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-gold-500/30 bg-base-bg/60 px-4 py-2 text-xs font-medium text-base-text transition hover:bg-base-bg hover:border-gold-500/50 min-h-[44px] w-full sm:w-auto"
          title="View Participants"
        >
          <Users className="h-4 w-4 flex-shrink-0" />
          <span className="hidden sm:inline">{participants.length}</span>
        </button>
        {hasPdf && (
          <button
            type="button"
            onClick={onDownloadPdf}
            disabled={isDownloadingPdf}
            className="inline-flex items-center justify-center gap-2 rounded-full border border-gold-500/30 bg-base-bg/60 px-5 py-2 text-[10px] font-semibold uppercase text-base-text transition hover:bg-base-bg hover:border-gold-500/50 whitespace-nowrap w-full sm:w-auto min-h-[44px]"
          >
            {isDownloadingPdf ? (
              <>
                <InlineLoading size="sm" />
                Downloading...
              </>
            ) : (
              <>
                <FileDown className="h-4 w-4 flex-shrink-0" />
                Download PDF
              </>
            )}
          </button>
        )}
      </div>
    </header>
  );
}
