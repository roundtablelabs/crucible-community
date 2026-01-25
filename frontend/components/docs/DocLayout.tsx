"use client";

import { ReactNode, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, Menu, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { DOCS_STRUCTURE, type DocSection, getBreadcrumbs } from "@/lib/docs/docs-structure";
import { DocSearch } from "./DocSearch";

type DocLayoutProps = {
  children: ReactNode;
};

export function DocLayout({ children }: DocLayoutProps) {
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Extract section and page from pathname (e.g., /docs/getting-started/introduction)
  const pathParts = pathname.replace("/docs/", "").split("/");
  const sectionSlug = pathParts[0] || "";
  const pageSlug = pathParts[1];
  const breadcrumbs = getBreadcrumbs(sectionSlug, pageSlug);

  return (
    <div className="min-h-screen bg-base-bg">
      {/* Mobile sidebar toggle */}
      <div className="sticky top-0 z-50 flex items-center justify-between border-b border-base-divider/60 bg-base-panel px-4 py-3 lg:hidden">
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          className="inline-flex items-center gap-2 text-sm font-semibold text-base-text"
        >
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          <span>Docs</span>
        </button>
        <DocSearch />
      </div>

      <div className="flex">
        {/* Sidebar */}
        <aside
          className={cn(
            "fixed inset-y-0 left-0 z-40 w-64 transform border-r border-base-divider/60 bg-base-panel transition-transform duration-300 ease-in-out lg:sticky lg:translate-x-0 lg:pt-20",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <div className="h-full overflow-y-auto px-4 py-6">
            <nav className="space-y-1">
              {DOCS_STRUCTURE.map((section) => (
                <DocNavSection key={section.href} section={section} pathname={pathname} />
              ))}
            </nav>
          </div>
        </aside>

        {/* Overlay for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 z-30 bg-black/50 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content */}
        <main className="flex-1">
          <div className="container-box py-8 lg:py-12">
            {/* Breadcrumbs */}
            {breadcrumbs.length > 0 && (
              <nav className="mb-6 flex items-center gap-2 text-sm text-base-subtext">
                <Link href="/docs" className="hover:text-base-text">
                  Docs
                </Link>
                {breadcrumbs.map((crumb, index) => (
                  <div key={crumb.href} className="flex items-center gap-2">
                    <ChevronRight className="h-4 w-4" />
                    {index === breadcrumbs.length - 1 ? (
                      <span className="text-base-text">{crumb.title}</span>
                    ) : (
                      <Link href={crumb.href} className="hover:text-base-text">
                        {crumb.title}
                      </Link>
                    )}
                  </div>
                ))}
              </nav>
            )}

            {/* Desktop search */}
            <div className="mb-8 hidden lg:block">
              <DocSearch />
            </div>

            <div className="prose prose-invert prose-lg max-w-none">
              {children}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

type DocNavSectionProps = {
  section: DocSection;
  pathname: string;
  level?: number;
};

function DocNavSection({ section, pathname, level = 0 }: DocNavSectionProps) {
  const isActive = pathname === section.href || pathname.startsWith(section.href + "/");
  const hasChildren = section.children && section.children.length > 0;

  return (
    <div>
      <Link
        href={section.href}
        className={cn(
          "flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors",
          level > 0 && "pl-6",
          isActive
            ? "bg-gold-500/10 text-gold-500 font-semibold"
            : "text-base-subtext hover:bg-base-bg hover:text-base-text"
        )}
      >
        <span>{section.title}</span>
      </Link>
      {hasChildren && (
        <div className="mt-1 space-y-1 pl-3">
          {section.children!.map((child) => (
            <DocNavSection key={child.href} section={child} pathname={pathname} level={level + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

