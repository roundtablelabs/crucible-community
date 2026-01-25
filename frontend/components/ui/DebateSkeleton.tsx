"use client";

import { SkeletonScreen, SkeletonLine, SkeletonBox, SkeletonCircle } from "./SkeletonScreen";

export function DebateSkeleton() {
  return (
    <SkeletonScreen className="space-y-6 p-6">
      {/* Header skeleton */}
      <div className="space-y-3">
        <SkeletonLine width="60%" />
        <SkeletonLine width="40%" />
      </div>

      {/* Phase indicator skeleton */}
      <div className="flex items-center gap-4">
        <SkeletonCircle size={32} />
        <SkeletonLine width="200px" />
      </div>

      {/* Knights skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="space-y-3 p-4 border border-base-700 rounded-lg">
            <div className="flex items-center gap-3">
              <SkeletonCircle size={40} />
              <SkeletonLine width="120px" />
            </div>
            <SkeletonLine width="100%" />
            <SkeletonLine width="80%" />
            <SkeletonLine width="90%" />
          </div>
        ))}
      </div>

      {/* Debate content skeleton */}
      <div className="space-y-4">
        <SkeletonBox height="200px" className="w-full" />
        <SkeletonBox height="150px" className="w-full" />
      </div>
    </SkeletonScreen>
  );
}

export function SessionListSkeleton() {
  return (
    <SkeletonScreen className="space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="p-4 border border-base-700 rounded-lg space-y-3">
          <SkeletonLine width="70%" />
          <SkeletonLine width="50%" />
          <SkeletonLine width="30%" />
        </div>
      ))}
    </SkeletonScreen>
  );
}

