"use client";

import { SessionCardSkeleton } from "./SessionCardSkeleton";
import { SkeletonScreen, SkeletonLine } from "../SkeletonScreen";

export function SessionsListSkeleton() {
  return (
    <section className="min-w-0 flex flex-col h-[calc(100vh-280px)]">
      <div className="flex-1 overflow-y-auto space-y-2 pr-2">
        {Array.from({ length: 6 }).map((_, index) => (
          <SessionCardSkeleton key={index} />
        ))}
      </div>

      {/* Pagination skeleton */}
      <div className="flex items-center justify-center gap-2 border-t border-base-divider pt-4 mt-4 flex-shrink-0">
        <SkeletonLine width="40px" height="40px" className="h-10 w-10 rounded-full" />
        <div className="flex items-center gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonLine
              key={i}
              width="32px"
              height="32px"
              className="h-8 w-8 rounded-full"
            />
          ))}
        </div>
        <SkeletonLine width="40px" height="40px" className="h-10 w-10 rounded-full" />
      </div>
    </section>
  );
}

