/**
 * Crucible Community Edition
 * Copyright (C) 2025 Roundtable Labs Pty Ltd
 * 
 * Licensed under AGPL-3.0. See LICENSE file for details.
 */

"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ArrowLeft, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiGet } from "@/lib/api/client";
import { GlassCard } from "@/components/ui/glass-card";
import Link from "next/link";

type LicenseInfo = {
  version: string;
  content: string;
  notice: string | null;
};

export default function LicensePage() {
  const router = useRouter();
  const [licenseContent, setLicenseContent] = useState<string>("");

  const { data: licenseInfo, isLoading, error } = useQuery<LicenseInfo>({
    queryKey: ["license"],
    queryFn: async () => {
      const response = await apiGet<LicenseInfo>("/api/license");
      return response;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  useEffect(() => {
    if (licenseInfo?.content) {
      setLicenseContent(licenseInfo.content);
    }
  }, [licenseInfo]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href="/app/about"
          scroll={false}
          className="inline-flex items-center gap-2 text-base-text-secondary hover:text-gold-400 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Back to About</span>
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold text-base-text mb-2 flex items-center gap-3">
          <FileText className="h-8 w-8 text-gold-500" />
          AGPL-3.0
        </h1>
        {licenseInfo && (
          <p className="text-base-text-secondary">
            Version {licenseInfo.version}
          </p>
        )}
      </div>

      {isLoading ? (
        <GlassCard className="p-6">
          <div className="flex items-center gap-2 text-base-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading license...</span>
          </div>
        </GlassCard>
      ) : error ? (
        <GlassCard className="p-6 border-red-500/30">
          <div className="text-red-400">
            <p className="font-semibold mb-2">Failed to load license</p>
            <p className="text-sm text-base-text-secondary">
              {error instanceof Error ? error.message : "Unknown error occurred"}
            </p>
          </div>
        </GlassCard>
      ) : licenseContent ? (
        <GlassCard className="p-6">
          <div className="prose prose-invert max-w-none">
            <pre className="whitespace-pre-wrap font-mono text-sm text-base-text-secondary leading-relaxed overflow-x-auto">
              {licenseContent}
            </pre>
          </div>
        </GlassCard>
      ) : (
        <GlassCard className="p-6">
          <p className="text-base-text-secondary">License content not available.</p>
        </GlassCard>
      )}

      {licenseInfo?.notice && (
        <GlassCard className="p-6 border-amber-500/30">
          <h2 className="text-xl font-semibold text-base-text mb-4">Notice</h2>
          <div className="prose prose-invert max-w-none">
            <pre className="whitespace-pre-wrap font-mono text-sm text-base-text-secondary leading-relaxed">
              {licenseInfo.notice}
            </pre>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
