"use client";

import { SkeletonScreen, SkeletonLine, SkeletonBox, SkeletonCircle } from "../SkeletonScreen";
import { GlassCard } from "../glass-card";
import { BentoGrid } from "../bento-grid";
import { BentoCard } from "../bento-card";

export function BoardroomSkeleton() {
  return (
    <div className="container-box space-y-8">
      {/* Header skeleton */}
      <header className="flex flex-col gap-6 rounded-3xl border-b-2 border-gold-500/30 border-x border-t border-base-divider bg-base-panel p-6 shadow-soft lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-2">
          <SkeletonLine width="200px" height="32px" className="h-8" />
          <SkeletonLine width="400px" height="20px" className="h-5" />
        </div>
      </header>

      {/* BentoGrid skeleton */}
      <div className="relative">
        <BentoGrid columns={2} className="relative gap-6">
          <BentoCard size="xl" asChild>
            <GlassCard variant="elevated" className="px-8 py-8">
              {/* Header */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <SkeletonLine width="120px" height="14px" className="h-3.5 mb-2" />
                  <SkeletonLine width="300px" height="28px" className="h-7" />
                </div>
                <SkeletonCircle size={32} />
              </div>

              {/* Content grid */}
              <div className="mt-6 grid gap-8 items-stretch lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)]">
                {/* Left: Intake assistant */}
                <div className="flex h-full items-start gap-5">
                  <SkeletonCircle size={48} />
                  <div className="flex-1 space-y-5 h-full">
                    {/* Chat area skeleton */}
                    <div className="space-y-3">
                      <SkeletonBox height="200px" className="w-full rounded-2xl" />
                      <div className="flex gap-3 items-end">
                        <SkeletonLine width="100%" height="40px" className="h-10 rounded-xl" />
                        <SkeletonLine width="80px" height="40px" className="h-10 rounded-full" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Guide moderator */}
                <div className="space-y-3 h-full">
                  <div className="flex h-full flex-col rounded-2xl border border-gold-500/20 bg-[rgba(20,18,12,0.78)] space-y-3 p-4">
                    <SkeletonLine width="140px" height="20px" className="h-5" />
                    <SkeletonLine width="100%" height="16px" className="h-4" />
                    <SkeletonLine width="90%" height="16px" className="h-4" />
                    <SkeletonLine width="80%" height="16px" className="h-4" />
                    <SkeletonLine width="200px" height="36px" className="h-9 rounded-full mt-auto" />
                  </div>
                </div>
              </div>
            </GlassCard>
          </BentoCard>
        </BentoGrid>
      </div>

      {/* Quick Access Cards skeleton */}
      <div className="space-y-4">
        <div className="grid gap-3 lg:grid-cols-[0.7fr_1fr] lg:items-start">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {[1, 2].map((i) => (
              <GlassCard key={i} variant="elevated" className="flex flex-col p-4">
                <div className="flex items-center gap-3">
                  <SkeletonCircle size={40} />
                  <SkeletonLine width="100px" height="20px" className="h-5" />
                </div>
              </GlassCard>
            ))}
          </div>
          <GlassCard variant="elevated" className="flex w-full flex-col p-4">
            <div className="flex items-center gap-3">
              <SkeletonCircle size={40} />
              <div className="flex-1 min-w-0">
                <SkeletonLine width="150px" height="20px" className="h-5 mb-2" />
                <SkeletonLine width="120px" height="16px" className="h-4" />
              </div>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

