"use client";

import { SkeletonScreen, SkeletonLine } from "../SkeletonScreen";
import { cn } from "@/lib/utils";

export function SessionCardSkeleton({ className }: { className?: string }) {
  return (
    <SkeletonScreen>
      <div
        className={cn(
          "w-full rounded-2xl border border-base-divider bg-base-panel p-6",
          className
        )}
      >
        <div className="space-y-2">
          {/* Topic and Quality Badge row */}
          <div className="flex items-center gap-3">
            <SkeletonLine width="60%" height="24px" className="h-6" />
            <SkeletonLine width="80px" height="24px" className="h-6 rounded-md" />
          </div>

          {/* Metadata row */}
          <div className="flex flex-wrap items-center gap-3">
            <SkeletonLine width="140px" height="16px" className="h-4" />
            <div className="h-1 w-1 rounded-full bg-base-divider/30" />
            <SkeletonLine width="100px" height="16px" className="h-4" />
            <div className="h-1 w-1 rounded-full bg-base-divider/30" />
            <SkeletonLine width="80px" height="16px" className="h-4" />
          </div>
        </div>

        {/* Action buttons row */}
        <div className="mt-3 flex justify-between items-center border-t border-base-divider pt-3">
          <div className="flex items-center gap-2">
            <SkeletonLine width="120px" height="32px" className="h-8 rounded-full" />
          </div>
          <div className="flex items-center gap-2">
            <SkeletonLine width="32px" height="32px" className="h-8 w-8 rounded-full" />
            <SkeletonLine width="32px" height="32px" className="h-8 w-8 rounded-full" />
            <SkeletonLine width="80px" height="32px" className="h-8 rounded-full" />
          </div>
        </div>
      </div>
    </SkeletonScreen>
  );
}

