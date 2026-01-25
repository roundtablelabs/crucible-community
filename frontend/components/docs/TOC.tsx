"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Heading = {
  id: string;
  text: string;
  level: number;
};

type TOCProps = {
  className?: string;
};

export function TOC({ className }: TOCProps) {
  const [headings, setHeadings] = useState<Heading[]>([]);
  const [activeId, setActiveId] = useState<string>("");

  useEffect(() => {
    const article = document.querySelector("article.prose") || document.querySelector("article");
    if (!article) return;

    const headingElements = article.querySelectorAll("h2, h3");
    const headingData: Heading[] = Array.from(headingElements).map((el) => {
      const id = el.id || el.textContent?.toLowerCase().replace(/\s+/g, "-") || "";
      if (!el.id) el.id = id;
      return {
        id,
        text: el.textContent || "",
        level: parseInt(el.tagName.charAt(1)),
      };
    });

    setHeadings(headingData);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      { rootMargin: "-100px 0px -66% 0px" }
    );

    headingElements.forEach((el) => observer.observe(el));

    return () => {
      headingElements.forEach((el) => observer.unobserve(el));
    };
  }, []);

  if (headings.length === 0) return null;

  return (
    <nav className={cn("sticky top-24 hidden xl:block", className)}>
      <div className="rounded-lg border border-base-divider/60 bg-base-panel p-4">
        <h3 className="mb-4 text-sm font-semibold uppercase tracking-[0.2em] text-base-text">
          On this page
        </h3>
        <ul className="space-y-2 text-sm">
          {headings.map((heading) => (
            <li key={heading.id}>
              <Link
                href={`#${heading.id}`}
                className={cn(
                  "block transition-colors",
                  heading.level === 3 && "pl-4",
                  activeId === heading.id
                    ? "text-gold-500 font-semibold"
                    : "text-base-subtext hover:text-base-text"
                )}
              >
                {heading.text}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </nav>
  );
}

