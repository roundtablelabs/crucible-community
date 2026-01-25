"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

type BreadcrumbItem = {
  label: string;
  href: string;
};

type BreadcrumbsProps = {
  items: BreadcrumbItem[];
  className?: string;
  rightContent?: ReactNode;
};

export function Breadcrumbs({ items, className, rightContent }: BreadcrumbsProps) {
  if (items.length === 0) {
    return null;
  }

  return (
    <nav
      className={cn("mb-6 flex items-center justify-between gap-2 text-sm text-base-subtext", className)}
      aria-label="Breadcrumb"
    >
      <div className="flex items-center gap-2">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <div key={item.href} className="flex items-center gap-2">
              {index > 0 && <ChevronRight className="h-4 w-4 flex-shrink-0" aria-hidden="true" />}
              {isLast ? (
                <span className="text-base-text" aria-current="page">
                  {item.label}
                </span>
              ) : (
                <Link
                  href={item.href}
                  className="transition hover:text-base-text"
                  aria-label={`Navigate to ${item.label}`}
                >
                  {item.label}
                </Link>
              )}
            </div>
          );
        })}
      </div>
      {rightContent && (
        <div className="flex items-center gap-2">
          {rightContent}
        </div>
      )}
    </nav>
  );
}







