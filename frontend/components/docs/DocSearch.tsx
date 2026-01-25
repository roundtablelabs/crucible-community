"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DOCS_STRUCTURE, type DocSection } from "@/lib/docs/docs-structure";

type SearchResult = {
  section: DocSection;
  matchType: "title" | "description";
};

export function DocSearch() {
  const [query, setQuery] = useState("");
  const [isOpen, setIsOpen] = useState(false);

  const results = useMemo(() => {
    if (!query.trim() || query.length < 2) return [];

    const searchTerm = query.toLowerCase();
    const matches: SearchResult[] = [];

    function searchSection(section: DocSection) {
      if (section.title.toLowerCase().includes(searchTerm)) {
        matches.push({ section, matchType: "title" });
      } else if (section.description?.toLowerCase().includes(searchTerm)) {
        matches.push({ section, matchType: "description" });
      }

      if (section.children) {
        section.children.forEach(searchSection);
      }
    }

    DOCS_STRUCTURE.forEach(searchSection);
    return matches.slice(0, 10);
  }, [query]);

  return (
    <div className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-base-subtext" />
        <input
          type="text"
          placeholder="Search docs..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => setIsOpen(true)}
          onBlur={() => setTimeout(() => setIsOpen(false), 200)}
          className="w-full rounded-lg border border-base-divider/60 bg-base-bg px-10 py-2 text-sm text-base-text placeholder:text-base-subtext focus:border-gold-500/50 focus:outline-none focus:ring-2 focus:ring-gold-500/20"
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-base-subtext hover:text-base-text"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {isOpen && query.length >= 2 && (
        <div className="absolute top-full z-50 mt-2 w-full rounded-lg border border-base-divider/60 bg-base-panel shadow-lg">
          {results.length > 0 ? (
            <div className="max-h-96 overflow-y-auto p-2">
              {results.map((result) => (
                <Link
                  key={result.section.href}
                  href={result.section.href}
                  className="block rounded-lg px-3 py-2 text-sm text-base-subtext transition-colors hover:bg-base-bg hover:text-base-text"
                  onClick={() => {
                    setQuery("");
                    setIsOpen(false);
                  }}
                >
                  <div className="font-semibold text-base-text">{result.section.title}</div>
                  {result.section.description && (
                    <div className="mt-1 text-xs">{result.section.description}</div>
                  )}
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-4 text-center text-sm text-base-subtext">
              No results found for "{query}"
            </div>
          )}
        </div>
      )}
    </div>
  );
}

