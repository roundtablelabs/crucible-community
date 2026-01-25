/**
 * Crucible Community Edition
 * Copyright (C) 2025 Roundtable Labs Pty Ltd
 * 
 * Licensed under AGPL-3.0. See LICENSE file for details.
 */

"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MouseEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { IconType } from "react-icons";
import {
  FaBriefcase,
  FaChartLine,
  FaChessKnight,
  FaRocket,
  FaDesktop,
  FaCog,
} from "react-icons/fa";
import { Loader2, Lock, FileText, LogOut, HardDrive } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { BRAND } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { RoundtableMark } from "@/components/common/RoundtableMark";
import { useAuth } from "@/components/providers/AuthProvider";
import { FloatingHelpButton } from "@/components/help/FloatingHelpButton";
import { Tooltip } from "@/components/ui/tooltip";
import { useRouter } from "next/navigation";
import { VersionUpdateHeader } from "@/components/common/VersionUpdateHeader";

// Community Edition: Removed Billing navigation
const APP_NAV: Array<{
  label: string;
  href: string;
  icon: IconType | typeof HardDrive;
  requiresAuth?: boolean;
}> = [
  { label: "Boardroom", href: "/app", icon: FaChartLine, requiresAuth: false },
  { label: "Launchpad", href: "/app/launchpad", icon: FaRocket, requiresAuth: true },
  { label: "Live Session", href: "/app/live", icon: FaDesktop, requiresAuth: true },
  { label: "Decision Log", href: "/app/sessions", icon: FaBriefcase, requiresAuth: true },
  { label: "Knights", href: "/app/knights", icon: FaChessKnight, requiresAuth: true },
  { label: "File Explorer", href: "/app/file-explorer", icon: HardDrive, requiresAuth: true },
  { label: "Settings", href: "/app/settings", icon: FaCog, requiresAuth: true },
];

type AppShellProps = {
  children: ReactNode;
};

function CollapseHandle({ className }: { className?: string }) {
  return (
    <svg
      width={18}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M9.35719 3H14.6428C15.7266 2.99999 16.6007 2.99998 17.3086 3.05782C18.0375 3.11737 18.6777 3.24318 19.27 3.54497C20.2108 4.02433 20.9757 4.78924 21.455 5.73005C21.7568 6.32234 21.8826 6.96253 21.9422 7.69138C22 8.39925 22 9.27339 22 10.3572V13.6428C22 14.7266 22 15.6008 21.9422 16.3086C21.8826 17.0375 21.7568 17.6777 21.455 18.27C20.9757 19.2108 20.2108 19.9757 19.27 20.455C18.6777 20.7568 18.0375 20.8826 17.3086 20.9422C16.6008 21 15.7266 21 14.6428 21H9.35717C8.27339 21 7.39925 21 6.69138 20.9422C5.96253 20.8826 5.32234 20.7568 4.73005 20.455C3.78924 19.9757 3.02433 19.2108 2.54497 18.27C2.24318 17.6777 2.11737 17.0375 2.05782 16.3086C1.99998 15.6007 1.99999 14.7266 2 13.6428V10.3572C1.99999 9.27341 1.99998 8.39926 2.05782 7.69138C2.11737 6.96253 2.24318 6.32234 2.54497 5.73005C3.02433 4.78924 3.78924 4.02433 4.73005 3.54497C5.32234 3.24318 5.96253 3.11737 6.69138 3.05782C7.39926 2.99998 8.27341 2.99999 9.35719 3ZM6.85424 5.05118C6.24907 5.10062 5.90138 5.19279 5.63803 5.32698C5.07354 5.6146 4.6146 6.07354 4.32698 6.63803C4.19279 6.90138 4.10062 7.24907 4.05118 7.85424C4.00078 8.47108 4 9.26339 4 10.4V13.6C4 14.7366 4.00078 15.5289 4.05118 16.1458C4.10062 16.7509 4.19279 17.0986 4.32698 17.362C4.6146 17.9265 5.07354 18.3854 5.63803 18.673C5.90138 18.8072 6.24907 18.8994 6.85424 18.9488C7.47108 18.9992 8.26339 19 9.4 19H14.6C15.7366 19 16.5289 18.9992 17.1458 18.9488C17.7509 18.8994 18.0986 18.8072 18.362 18.673C18.9265 18.3854 19.3854 17.9265 19.673 17.362C19.8072 17.0986 19.8994 16.7509 19.9488 16.1458C19.9992 15.5289 20 14.7366 20 13.6V10.4C20 9.26339 19.9992 8.47108 19.9488 7.85424C19.8994 7.24907 19.8072 6.90138 19.673 6.63803C19.3854 6.07354 18.9265 5.6146 18.362 5.32698C18.0986 5.19279 17.7509 5.10062 17.1458 5.05118C16.5289 5.00078 15.7366 5 14.6 5H9.4C8.26339 5 7.47108 5.00078 6.85424 5.05118ZM7 7C7.55229 7 8 7.44772 8 8V16C8 16.5523 7.55229 17 7 17C6.44772 17 6 16.5523 6 16V8C6 7.44772 6.44772 7 7 7Z"
        fill="currentColor"
      />
    </svg>
  );
}

export function AppShell({ children }: AppShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const activePath = useMemo(() => {
    // Ensure we always have a valid path, even during navigation
    if (!pathname || pathname === "") {
      return "/app";
    }
    return pathname;
  }, [pathname]);
  
  // Separate states for mobile and desktop
  const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(false);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  
  const { user, openAuth, signOut, status: authStatus } = useAuth();

  // Ensure component is mounted before rendering auth-dependent UI to prevent hydration mismatches
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const toggleNav = useCallback(() => {
    if (window.innerWidth >= 1280) {
      setIsDesktopCollapsed((prev) => !prev);
    } else {
      setIsMobileNavOpen((prev) => !prev);
    }
  }, []);


  const ensureAuth = useCallback(
    (event: MouseEvent<HTMLElement>, label: string) => {
      event.preventDefault();
      openAuth({ reason: `Sign in to access ${label}` });
    },
    [openAuth],
  );

  const handleSignOut = useCallback(() => {
    setIsSigningOut(true);
  }, []);

  // Handle the sign out delay when isSigningOut becomes true
  useEffect(() => {
    if (isSigningOut) {
      const timeoutId = setTimeout(() => {
          signOut(undefined);
      }, 0); // No delay
      
      return () => {
        clearTimeout(timeoutId);
      };
    }
  }, [isSigningOut, signOut]);

  return (
    <div className="relative flex h-screen flex-col overflow-hidden bg-base-bg">
      {/* Decorative element - bottom right */}
      <div
        className="pointer-events-none absolute left-50 -bottom-30 hidden h-84 w-84 rounded-full bg-teal-100 blur-3xl md:block"
        style={{
          transform: "translateX(17.0891px) translateY(-13.2916px) scale(1.05393)",
          opacity: 0.2,
        }}
      />
      <header className="shrink-0 h-16 border-b-2 border-base-divider bg-base-panel px-4 text-sm md:px-6 relative z-50 sticky top-0">
        <div
          className="pointer-events-none absolute right-10 -top-10 hidden h-84 w-84 rounded-full bg-emerald-100 blur-3xl md:block"
          style={{
            transform: "translateX(17.0891px) translateY(-13.2916px) scale(1.05393)",
            opacity: 0.1,
          }}
        />
        <div className="flex h-16 items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-3">
            <Link
              href="/app"
              className="flex items-center gap-3 text-lg font-semibold uppercase tracking-[0.05em] text-base-text transition hover:text-base-text/80"
            >
              <span className="flex h-9 w-9 items-center justify-center">
                <RoundtableMark size={44} theme="light" showFocal />
              </span>
              <div className="flex items-center gap-2">
                <span>{BRAND.shortName}</span>
              </div>
            </Link>
            <button
              type="button"
              onClick={toggleNav}
              aria-label="Toggle navigation"
              className="flex h-8 w-8 items-center justify-center rounded-full text-base-subtext transition hover:border-navy-900 hover:text-base-text"
            >
              <CollapseHandle
                className={cn(
                  "h-4 w-4 transition-transform duration-300",
                  // Desktop: pointing left (180) when expanded, right (90) when collapsed
                  // Mobile: pointing left (180) when open, right (90) when closed
                  "lg:block hidden",
                  isDesktopCollapsed ? "rotate-90" : "rotate-180"
                )}
              />
              <CollapseHandle
                className={cn(
                  "h-4 w-4 transition-transform duration-300",
                  // Mobile only icon logic
                  "lg:hidden block",
                  isMobileNavOpen ? "rotate-180" : "rotate-90"
                )}
              />
            </button>
          </div>
          <div className="flex items-center gap-3">
            {/* Version Update Notification */}
            <VersionUpdateHeader />
            
            {/* Sign-in/sign-out buttons */}
            {!isMounted ? (
              // Render placeholder during SSR to match initial client render
              <div className="flex items-center justify-center rounded-full border border-gold-500/70 px-4 py-2 text-base-subtext min-w-[80px]">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : authStatus === "loading" ? (
              <div className="flex items-center justify-center rounded-full border border-gold-500/70 px-4 py-2 text-base-subtext min-w-[80px]">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            ) : user ? (
              <button
                className="flex items-center gap-2 rounded-full border border-gold-500/70 px-4 py-1.5 text-base-text transition hover:border-gold-500/70 hover:text-base-text"
                onClick={handleSignOut}
              >
                <span>Sign out</span>
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </div>
      </header>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Overlay for mobile/tablet when sidebar is open - positioned behind sidebar only */}
        {isMobileNavOpen && (
          <div
            className="fixed inset-0 z-20 bg-black/30 xl:hidden"
            onClick={() => setIsMobileNavOpen(false)}
            aria-hidden="true"
          />
        )}
        <aside
          className={cn(
            "border-r-2 border-base-divider bg-base-panel pt-6 shadow-soft transition-all duration-500 ease-in-out overflow-hidden shrink-0",
            // Desktop styles (xl and above) - relative positioning, full height
            "xl:relative xl:z-10 xl:h-full xl:shadow-none",
            isDesktopCollapsed ? "xl:w-[72px]" : "xl:w-[240px]",
            // Mobile/tablet styles (below xl) - fixed overlay
            "max-xl:fixed max-xl:inset-y-16 max-xl:left-0 max-xl:z-40 max-xl:w-64 max-xl:h-[calc(100vh-64px)] max-xl:transform",
            isMobileNavOpen
              ? "max-xl:translate-x-0"
              : "max-xl:-translate-x-full",
          )}
        >
          <nav className="flex h-full flex-col">
            <div
              className={cn(
                "flex flex-1 flex-col gap-1 px-4 pb-6",
                // Keep items left-aligned even when collapsed for consistent icon positioning
              )}
            >
              {APP_NAV.map((item) => {
                const isExact = activePath === item.href;
                const isNested = item.href !== "/app" && activePath.startsWith(`${item.href}/`);
                const isActive = isExact || isNested;
                const Icon = item.icon;
                const requiresAuth = item.requiresAuth ?? true;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-3 px-3 py-2 text-sm font-medium transition",
                      isActive ? "text-base-panel" : "text-base-subtext hover:text-base-text",
                      // Keep left-aligned even when collapsed - only adjust padding slightly
                      isDesktopCollapsed ? "xl:px-2 xl:gap-0" : "",
                    )}
                    onClick={(event) => {
                      // Prevent navigation if already on this page to avoid scroll issues
                      if (isActive) {
                        event.preventDefault();
                        return;
                      }
                      // Prevent default Link navigation and use router.push with scroll: false
                      event.preventDefault();
                      // Scroll to top before navigation to prevent jump
                      if (typeof window !== "undefined") {
                        window.scrollTo({ top: 0, behavior: "instant" });
                        document.documentElement.scrollTop = 0;
                        document.body.scrollTop = 0;
                      }
                      // Use router.push with scroll: false to prevent scroll restoration
                      router.push(item.href, { scroll: false });
                      // Close sidebar on mobile/tablet when navigating
                      if (window.innerWidth < 1280) {
                        setIsMobileNavOpen(false);
                      }
                    }}
                  >
                    <span
                      className={cn(
                        "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-base-subtext transition",
                        isActive ? "bg-base-panel/20 text-base-panel" : "bg-base-panel/70 group-hover:bg-base-panel",
                      )}
                    >
                      <Icon className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
                    </span>
                    <span
                      className={cn(
                        "overflow-hidden whitespace-nowrap text-sm transition-all duration-400 ease-in-out",
                        // Logic for hiding text
                        // Desktop collapsed: hide
                        // Mobile/tablet: always show (if menu is open)
                        isDesktopCollapsed 
                          ? "xl:ml-0 xl:max-w-0 xl:opacity-0" 
                          : "xl:ml-2 xl:max-w-[160px] xl:opacity-100",
                        // Mobile/tablet always shows text since the menu is full width when open
                        "max-xl:ml-2 max-xl:max-w-[160px] max-xl:opacity-100"
                      )}
                    >
                      {item.label}
                    </span>
                  </Link>
                );
              })}
            </div>
            
            {/* Community Edition Badge - Bottom of Sidebar */}
            <div className={cn(
              "mt-auto border-t border-base-divider pt-4 px-4 pb-4",
              isDesktopCollapsed ? "xl:px-2" : ""
            )}>
              <div className={cn(
                "flex items-center justify-center text-xs text-base-subtext",
                isDesktopCollapsed ? "xl:justify-center" : ""
              )}>
                <span className={cn(
                  "text-[0.65rem] font-medium uppercase tracking-[0.1em] text-gold-500/70",
                  isDesktopCollapsed ? "xl:hidden" : ""
                )}>
                  {BRAND.edition}
                </span>
              </div>
            </div>
          </nav>
        </aside>
        <main
          className={cn(
            "flex-1 min-w-0 overflow-y-auto overflow-x-hidden bg-base-panel px-4 py-6 md:px-6 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]",
            "max-xl:relative max-xl:z-30"
          )}
        >
          {children}
        </main>
      </div>
      <FloatingHelpButton />
      
      {/* Sign out popup */}
      <AnimatePresence>
        {isSigningOut && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="fixed inset-0 z-[10000] bg-navy-900/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              className="fixed inset-0 z-[10001] flex items-center justify-center px-4"
            >
              <div className="rounded-2xl border-2 border-gold-500/40 bg-[rgba(15,12,8,0.98)] backdrop-blur-xl p-8 shadow-[0_16px_48px_rgba(10,8,4,0.6)] text-center max-w-sm w-full">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: "spring", stiffness: 200, damping: 15 }}
                  className="mb-4 flex justify-center"
                >
                  <Loader2 className="h-12 w-12 text-gold-500 animate-spin" />
                </motion.div>
                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.2 }}
                  className="text-xl font-semibold text-gold-200 mb-2"
                >
                  Signing out...
                </motion.p>
                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.3 }}
                  className="text-sm text-gold-100/70"
                >
                  You will be signed out in a moment
                </motion.p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
