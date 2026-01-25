/**
 * Crucible Community Edition
 * Copyright (C) 2025 Roundtable Labs Pty Ltd
 * 
 * Licensed under AGPL-3.0. See LICENSE file for details.
 */

"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, FileText, Shield, Info } from "lucide-react";
import Link from "next/link";
import { apiGet } from "@/lib/api/client";
import { BRAND } from "@/lib/constants";
import { GlassCard } from "@/components/ui/glass-card";

type VersionInfo = {
  product: string;
  edition: string;
  version: string;
  copyright: string;
  license: string;
  year: number;
};

export default function AboutPage() {
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null);

  // Fetch version information from API
  const { data: apiVersion, isLoading } = useQuery<VersionInfo>({
    queryKey: ["version"],
    queryFn: async () => {
      const response = await apiGet<VersionInfo>("/api/version");
      return response;
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  useEffect(() => {
    if (apiVersion) {
      setVersionInfo(apiVersion);
    }
  }, [apiVersion]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-base-text mb-2">About</h1>
        <p className="text-base-text-secondary">
          Information about Crucible Community Edition, intellectual property, and licensing.
        </p>
      </div>

      {/* Version Information */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Info className="h-5 w-5 text-gold-500" />
          <h2 className="text-xl font-semibold text-base-text">Version Information</h2>
        </div>
        {isLoading ? (
          <div className="flex items-center gap-2 text-base-text-secondary">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading version information...</span>
          </div>
        ) : versionInfo ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-base-text-secondary">Product:</span>
              <span className="text-base-text font-medium">{versionInfo.product}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-base-text-secondary">Edition:</span>
              <span className="text-base-text font-medium capitalize">{versionInfo.edition} Edition</span>
            </div>
            <div className="flex justify-between">
              <span className="text-base-text-secondary">Version:</span>
              <span className="text-base-text font-medium">{versionInfo.version}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-base-text-secondary">Copyright:</span>
              <span className="text-base-text font-medium">© {versionInfo.year} {versionInfo.copyright}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-base-text-secondary">License:</span>
              <span className="text-base-text font-medium">{versionInfo.license}</span>
            </div>
          </div>
        ) : (
          <p className="text-base-text-secondary text-sm">
            Version information unavailable. Using default values.
          </p>
        )}
      </GlassCard>

      {/* Intellectual Property Notice */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <Shield className="h-5 w-5 text-gold-500" />
          <h2 className="text-xl font-semibold text-base-text">Intellectual Property</h2>
        </div>
        <div className="space-y-4 text-sm text-base-text-secondary">
          <p>
            This software and associated documentation are the intellectual property of{" "}
            <span className="font-medium text-base-text">{BRAND.legalCompanyName}</span>. The Crucible debate
            engine, algorithms, and architecture are original works created by Roundtable Labs.
          </p>
          <p>
            <span className="font-medium text-base-text">Intellectual Property © {BRAND.copyrightYear} {BRAND.legalCompanyName}</span>
          </p>
        </div>
      </GlassCard>

      {/* License Information */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-3 mb-4">
          <FileText className="h-5 w-5 text-gold-500" />
          <h2 className="text-xl font-semibold text-base-text">License</h2>
        </div>
        <div className="space-y-4 text-sm text-base-text-secondary">
          <p>
            This software is licensed under the{" "}
            <span className="font-medium text-base-text">AGPL-3.0</span> (GNU Affero General Public License v3.0).
          </p>
          <p>
            This program is free software: you can redistribute it and/or modify
            it under the terms of the GNU Affero General Public License as published by
            the Free Software Foundation, either version 3 of the License, or
            (at your option) any later version. You may obtain a copy of the License at{" "}
            <a
              href="https://www.gnu.org/licenses/agpl-3.0.html"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gold-400 hover:text-gold-300 underline"
            >
              https://www.gnu.org/licenses/agpl-3.0.html
            </a>
            .
          </p>
          <p>
            This program is distributed in the hope that it will be useful,
            but WITHOUT ANY WARRANTY; without even the implied warranty of
            MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
          </p>
          <div className="flex flex-wrap gap-3 pt-2">
            <Link
              href="/app/license"
              scroll={false}
              className="inline-flex items-center gap-2 px-4 py-2 bg-gold-500/10 hover:bg-gold-500/20 border border-gold-500/30 rounded-lg text-gold-400 transition-colors text-sm font-medium"
            >
              <FileText className="h-4 w-4" />
              View Full License
            </Link>
          </div>
        </div>
      </GlassCard>

      {/* Community Edition Disclaimer */}
      <GlassCard className="p-6 border-amber-500/30">
        <div className="flex items-center gap-3 mb-4">
          <Info className="h-5 w-5 text-amber-400" />
          <h2 className="text-xl font-semibold text-base-text">Community Edition</h2>
        </div>
        <div className="space-y-3 text-sm text-base-text-secondary">
          <p>
            This is the <span className="font-medium text-base-text">Community Edition</span> of Crucible,
            provided under the AGPL-3.0 license. This edition:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Is provided "AS IS" without warranty of any kind, express or implied</li>
            <li>Does not include commercial support or service level agreements</li>
            <li>Contains a subset of features from the commercial product</li>
            <li>Is intended for self-hosted deployment with Bring Your Own Key (BYOK) model</li>
          </ul>
        </div>
      </GlassCard>

      {/* Attribution Requirements */}
      <GlassCard className="p-6">
        <h2 className="text-xl font-semibold text-base-text mb-4">Attribution Requirements</h2>
        <div className="space-y-3 text-sm text-base-text-secondary">
          <p>If you distribute modified versions of this software, you must:</p>
          <ol className="list-decimal list-inside space-y-2 ml-2">
            <li>Clearly indicate that it is a modified version</li>
            <li>Retain all copyright notices and the NOTICE file</li>
            <li>Include the full text of the AGPL-3.0 license</li>
          </ol>
        </div>
      </GlassCard>

      {/* Additional Resources */}
      <GlassCard className="p-6">
        <h2 className="text-xl font-semibold text-base-text mb-4">Additional Resources</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Link
            href="/app/license"
            scroll={false}
            className="flex items-center gap-3 p-4 bg-base-bg/50 hover:bg-base-bg border border-base-divider rounded-lg transition-colors group"
          >
            <FileText className="h-5 w-5 text-gold-500 group-hover:text-gold-400" />
            <div>
              <div className="font-medium text-base-text group-hover:text-gold-400">License</div>
              <div className="text-xs text-base-text-secondary">AGPL-3.0</div>
            </div>
          </Link>
        </div>
      </GlassCard>

      {/* Contact Information */}
      <GlassCard className="p-6">
        <h2 className="text-xl font-semibold text-base-text mb-4">Contact</h2>
        <div className="space-y-2 text-sm text-base-text-secondary">
          <p>
            For questions about intellectual property, licensing, or commercial offerings, please contact:
          </p>
          <p className="font-medium text-base-text">{BRAND.legalCompanyName}</p>
          <p>
            Email:{" "}
            <a
              href={`mailto:${BRAND.contactEmail}`}
              className="text-gold-400 hover:text-gold-300 underline"
            >
              {BRAND.contactEmail}
            </a>
          </p>
        </div>
      </GlassCard>
    </div>
  );
}
