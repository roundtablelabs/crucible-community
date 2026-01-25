/**
 * Crucible Community Edition
 * Copyright (C) 2025 Roundtable Labs Pty Ltd
 * 
 * Licensed under AGPL-3.0. See LICENSE file for details.
 */

"use client";

import { ArrowLeft, Shield } from "lucide-react";
import Link from "next/link";
import { GlassCard } from "@/components/ui/glass-card";
import { BRAND } from "@/lib/constants";

const BRANDING_CONTENT = `# Branding and Attribution Guidelines

## Overview

This document outlines branding and attribution guidelines for Crucible Community Edition. These guidelines help maintain clarity about the origin of the software and prevent confusion.

## Branding

The following names and branding are used by Roundtable Labs Pty Ltd:

- **Crucible** - Product name
- **Roundtable Labs** - Company name
- **Crucible logo** - Visual identity and logo

## Permitted Uses

You may use these names and branding in the following ways:

1. **Accurate Product References**: You may refer to "Crucible" or "Crucible Community Edition" when accurately describing the software
2. **Attribution**: You may use "Powered by Crucible" or similar attribution when using the software
3. **Documentation**: You may use the names in documentation that accurately describes the software
4. **Source Code Comments**: You may use the names in source code comments and documentation

## Naming Conventions for Derivative Works

If you create a derivative work (fork or modification) of Crucible Community Edition:

- **Use a different name** - Do not use "Crucible" in the name of your derivative work to avoid confusion
- **Clearly indicate** that it is a modified version and not the original Crucible
- **Remove Roundtable Labs branding** - Use your own branding instead
- **Retain attribution** - Keep all copyright notices and attribution to Roundtable Labs in source code

## Logo and Visual Identity

The Crucible logo and visual identity are part of the Crucible brand. When creating derivative works:

- Do not use the Crucible logo or Roundtable Labs branding
- Use your own logo and visual identity
- Maintain clear attribution to the original source

## Attribution Requirements

When distributing or using Crucible Community Edition:

- Retain all copyright notices
- Include attribution to Roundtable Labs Pty Ltd
- Do not remove or modify attribution notices
- Clearly indicate if you've made modifications

## Contact

For questions about branding usage, please contact:

${BRAND.legalCompanyName}  
Australia

## Legal Notice

These branding guidelines supplement but do not modify the AGPL-3.0 license. Branding and naming conventions are separate from copyright and licensing.`;

// Simple markdown to HTML converter for basic formatting
function markdownToHtml(markdown: string): string {
  let html = markdown;
  
  // Headers
  html = html.replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold text-base-text mt-6 mb-4">$1</h1>');
  html = html.replace(/^## (.+)$/gm, '<h2 class="text-xl font-semibold text-base-text mt-5 mb-3">$1</h2>');
  html = html.replace(/^### (.+)$/gm, '<h3 class="text-lg font-semibold text-base-text mt-4 mb-2">$1</h3>');
  
  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="font-semibold text-base-text">$1</strong>');
  
  // Lists
  html = html.replace(/^(\d+)\. (.+)$/gm, '<li class="ml-4 mb-1">$2</li>');
  html = html.replace(/^- (.+)$/gm, '<li class="ml-4 mb-1 list-disc">$1</li>');
  
  // Paragraphs
  html = html.split('\n\n').map(para => {
    if (para.trim() && !para.startsWith('<')) {
      return `<p class="mb-4 text-base-text-secondary leading-relaxed">${para.trim()}</p>`;
    }
    return para;
  }).join('\n');
  
  // Wrap lists - use [\s\S] instead of . with s flag for ES2017 compatibility
  html = html.replace(/(<li[^>]*>[\s\S]*?<\/li>)/g, (match) => {
    if (!match.includes('<ul') && !match.includes('<ol')) {
      return `<ul class="list-disc list-inside space-y-2 mb-4 ml-4">${match}</ul>`;
    }
    return match;
  });
  
  return html;
}

export default function TrademarkPage() {
  const htmlContent = markdownToHtml(BRANDING_CONTENT);

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
          <Shield className="h-8 w-8 text-gold-500" />
          Branding Guidelines
        </h1>
        <p className="text-base-text-secondary">
          Guidelines for branding and attribution when using or modifying Crucible
        </p>
      </div>

      <GlassCard className="p-6">
        <div 
          className="prose prose-invert max-w-none"
          dangerouslySetInnerHTML={{ __html: htmlContent }}
        />
      </GlassCard>
    </div>
  );
}
