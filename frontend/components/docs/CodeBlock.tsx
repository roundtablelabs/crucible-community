"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type CodeBlockProps = {
  code: string;
  language?: string;
  filename?: string;
  className?: string;
};

export function CodeBlock({ code, language, filename, className }: CodeBlockProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("relative my-6 rounded-lg border border-base-divider/60 bg-base-panel", className)}>
      {filename && (
        <div className="border-b border-base-divider/60 px-4 py-2 text-xs font-mono text-base-subtext">
          {filename}
        </div>
      )}
      <div className="relative">
        <pre className="overflow-x-auto p-4 text-sm">
          <code className={language ? `language-${language}` : ""}>{code}</code>
        </pre>
        <button
          onClick={copyToClipboard}
          className="absolute right-4 top-4 rounded-lg border border-base-divider/60 bg-base-bg p-2 text-base-subtext transition-colors hover:bg-base-panel hover:text-base-text"
          title="Copy code"
        >
          {copied ? <Check className="h-4 w-4 text-gold-500" /> : <Copy className="h-4 w-4" />}
        </button>
      </div>
      {language && (
        <div className="border-t border-base-divider/60 px-4 py-2 text-xs text-base-subtext">
          {language}
        </div>
      )}
    </div>
  );
}

