"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { preprocessMarkdownContent } from "@/lib/utils/markdownPreprocessor";
import { cn } from "@/lib/utils";

interface MarkdownRendererProps {
  content: string;
  className?: string;
  variant?: "cyan" | "base" | "red" | "rebuttal" | "judge";
}

export function MarkdownRenderer({ content, className, variant = "cyan" }: MarkdownRendererProps) {
  // Preprocess content to convert arrays to lists
  const processedContent = preprocessMarkdownContent(content);

  // Color scheme: Use neutral colors for text/links/headings, but keep colored code terms
  // Code term colors vary by variant to maintain some visual distinction
  const codeColors = variant === "red" ? {
    code: "text-rose-200",
    codeBg: "bg-rose-500/20",
    codeBlockBg: "bg-[rgba(244,63,94,0.15)]",
  } : variant === "rebuttal" ? {
    code: "text-amber-200",
    codeBg: "bg-amber-500/20",
    codeBlockBg: "bg-[rgba(245,158,11,0.15)]",
  } : variant === "judge" ? {
    code: "text-gold-200",
    codeBg: "bg-gold-500/20",
    codeBlockBg: "bg-[rgba(217,164,65,0.15)]",
  } : {
    code: "text-cyan-200",
    codeBg: "bg-cyan-500/20",
    codeBlockBg: "bg-[rgba(6,24,35,0.8)]",
  };
  
  // Use neutral base colors for all text, links, and headings
  const colors = {
    text: "text-base-text",
    textMuted: "text-base-subtext",
    textSecondary: "text-base-subtext/90",
    heading: "text-base-text",
    headingSecondary: "text-base-subtext",
    link: "text-gold-300 hover:text-gold-200",
    code: codeColors.code,
    codeBg: codeColors.codeBg,
    codeBlockBg: codeColors.codeBlockBg,
    border: "border-base-divider",
    borderSecondary: "border-base-divider/60",
    bg: "bg-base-bg/40",
    bgSecondary: "bg-base-bg/20",
  };

  return (
    <div className={cn("markdown-content", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Headers
          h1: ({ node, ...props }) => (
            <h1 className={cn("mt-6 mb-4 text-2xl font-bold first:mt-0", colors.heading)} {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className={cn("mt-5 mb-3 text-xl font-semibold first:mt-0", colors.heading)} {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className={cn("mt-4 mb-2 text-lg font-semibold first:mt-0", colors.headingSecondary)} {...props} />
          ),
          h4: ({ node, ...props }) => (
            <h4 className={cn("mt-3 mb-2 text-base font-semibold first:mt-0", colors.headingSecondary)} {...props} />
          ),
          h5: ({ node, ...props }) => (
            <h5 className={cn("mt-2 mb-1 text-sm font-semibold first:mt-0", colors.headingSecondary)} {...props} />
          ),
          h6: ({ node, ...props }) => (
            <h6 className={cn("mt-2 mb-1 text-xs font-semibold first:mt-0", colors.textMuted)} {...props} />
          ),
          // Paragraphs
          p: ({ node, ...props }) => (
            <p className={cn("mb-3 text-sm leading-relaxed last:mb-0", colors.text)} {...props} />
          ),
          // Lists
          ul: ({ node, ...props }) => (
            <ul className={cn("mb-3 ml-4 list-disc space-y-1.5 text-sm", colors.text)} {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className={cn("mb-3 ml-4 list-decimal space-y-1.5 text-sm", colors.text)} {...props} />
          ),
          li: ({ node, ...props }) => (
            <li className="leading-relaxed" {...props} />
          ),
          // Links
          a: ({ node, ...props }) => (
            <a
              className={cn("underline transition-colors", colors.link)}
              target="_blank"
              rel="noopener noreferrer"
              {...props}
            />
          ),
          // Strong/Bold
          strong: ({ node, ...props }) => (
            <strong className={cn("font-semibold", colors.heading)} {...props} />
          ),
          // Emphasis/Italic
          em: ({ node, ...props }) => (
            <em className="italic" {...props} />
          ),
          // Code
          code: ({ inline, className, children, ...props }: React.HTMLAttributes<HTMLElement> & { inline?: boolean }) => {
            if (inline) {
              return (
                <code
                  className={cn("rounded px-1.5 py-0.5 text-xs font-mono", colors.codeBg, colors.code)}
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code
                className={cn("block overflow-x-auto rounded-lg p-3 text-xs font-mono", colors.codeBlockBg, colors.code)}
                {...props}
              >
                {children}
              </code>
            );
          },
          pre: ({ node, ...props }) => (
            <pre className={cn("mb-3 overflow-x-auto rounded-lg p-3 last:mb-0", colors.codeBlockBg)} {...props} />
          ),
          // Blockquote
          blockquote: ({ node, ...props }) => {
            return (
              <blockquote
                className={cn("my-3 border-l-4 pl-4 italic border-base-divider bg-base-bg/40 text-base-subtext")}
                {...props}
              />
            );
          },
          // Horizontal rule
          hr: ({ node, ...props }) => {
            return (
              <hr className={cn("my-4 border-base-divider")} {...props} />
            );
          },
          // Tables
          table: ({ node, ...props }) => (
            <div className="my-4 overflow-x-auto">
              <table
                className={cn("min-w-full border-collapse border", colors.border)}
                {...props}
              />
            </div>
          ),
          thead: ({ node, ...props }) => (
            <thead className={colors.bgSecondary} {...props} />
          ),
          tbody: ({ node, ...props }) => {
            return (
              <tbody className={cn("divide-y divide-base-divider")} {...props} />
            );
          },
          tr: ({ node, ...props }) => {
            return (
              <tr className={cn("border-b border-base-divider")} {...props} />
            );
          },
          th: ({ node, ...props }) => {
            return (
              <th
                className={cn("border px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.2em] border-base-divider bg-base-bg/60 text-base-subtext")}
                {...props}
              />
            );
          },
          td: ({ node, ...props }) => {
            return (
              <td
                className={cn("border px-4 py-2 text-sm border-base-divider text-base-text")}
                {...props}
              />
            );
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}

