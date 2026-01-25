"use client";

import { SkeletonScreen, SkeletonLine, SkeletonBox, SkeletonCircle } from "../SkeletonScreen";
import { GlassCard } from "../glass-card";

export function SettingsSkeleton() {
  return (
    <div className="container-box space-y-8">
      {/* Header skeleton */}
      <GlassCard variant="elevated" className="p-6 !border-gold-500/30">
        <div className="space-y-2">
          <SkeletonLine width="200px" height="32px" className="h-8" />
          <SkeletonLine width="600px" height="20px" className="h-5" />
        </div>
      </GlassCard>

      {/* Two column section skeleton */}
      <section className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {/* Left column - Account basics */}
        <GlassCard variant="default" className="space-y-6 p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="space-y-2">
              <SkeletonLine width="120px" height="12px" className="h-3" />
              <SkeletonLine width="180px" height="28px" className="h-7" />
            </div>
            <SkeletonLine width="140px" height="24px" className="h-6 rounded-full" />
          </div>

          {/* Name and email inputs */}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <SkeletonLine width="80px" height="16px" className="h-4" />
              <SkeletonBox height="48px" className="w-full rounded-2xl" />
            </div>
            <div className="space-y-2">
              <SkeletonLine width="90px" height="16px" className="h-4" />
              <SkeletonBox height="48px" className="w-full rounded-2xl" />
            </div>
          </div>

          {/* Sign-in providers */}
          <div className="space-y-4 rounded-[28px] border border-base-divider bg-base-bg/40 p-5">
            <SkeletonLine width="140px" height="12px" className="h-3" />
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3 rounded-2xl border border-base-divider bg-base-bg/40 px-4 py-3">
                <SkeletonCircle size={36} />
                <div className="flex-1 space-y-2">
                  <SkeletonLine width="150px" height="20px" className="h-5" />
                  <SkeletonLine width="200px" height="16px" className="h-4" />
                </div>
                <SkeletonLine width="90px" height="32px" className="h-8 rounded-full" />
              </div>
            ))}
          </div>

          {/* Info tile */}
          <div className="rounded-2xl border border-base-divider bg-base-bg/40 p-4">
            <div className="flex items-start gap-3">
              <SkeletonCircle size={20} />
              <div className="flex-1 space-y-2">
                <SkeletonLine width="180px" height="20px" className="h-5" />
                <SkeletonLine width="100%" height="16px" className="h-4" />
              </div>
            </div>
          </div>
        </GlassCard>

        {/* Right column - Privacy controls */}
        <GlassCard variant="default" className="space-y-6 p-6">
          <div className="space-y-2">
            <SkeletonLine width="180px" height="28px" className="h-7" />
            <SkeletonLine width="100%" height="16px" className="h-4" />
            <SkeletonLine width="90%" height="16px" className="h-4" />
          </div>

          {/* Toggle cards */}
          {[1, 2].map((i) => (
            <div key={i} className="flex items-start gap-4 rounded-[28px] border border-base-divider bg-base-bg/40 px-4 py-4">
              <div className="flex-1 space-y-2">
                <SkeletonLine width="200px" height="20px" className="h-5" />
                <SkeletonLine width="100%" height="16px" className="h-4" />
              </div>
              <SkeletonBox height="24px" className="w-12 rounded-full" />
            </div>
          ))}

          {/* Account deletion section */}
          <div className="space-y-4 rounded-[28px] border border-rose-400/40 bg-[rgba(60,8,18,0.9)] p-5">
            <div className="flex items-center gap-2">
              <SkeletonCircle size={16} />
              <SkeletonLine width="140px" height="16px" className="h-4" />
            </div>
            <SkeletonLine width="100%" height="16px" className="h-4" />
            <SkeletonLine width="90%" height="16px" className="h-4" />
            <div className="rounded-2xl border border-rose-300/30 bg-rose-900/20 px-3 py-2">
              <SkeletonLine width="80%" height="16px" className="h-4" />
            </div>
            <SkeletonLine width="120px" height="32px" className="h-8 rounded-full" />
          </div>
        </GlassCard>
      </section>

      {/* Model Provider Preferences skeleton */}
      <GlassCard variant="default" className="space-y-6 p-6">
        <div className="space-y-2">
          <SkeletonLine width="250px" height="28px" className="h-7" />
          <SkeletonLine width="100%" height="16px" className="h-4" />
          <SkeletonLine width="90%" height="16px" className="h-4" />
        </div>

        {/* Provider grid skeleton */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <SkeletonBox height="20px" className="w-5 rounded" />
              <SkeletonLine width="80px" height="20px" className="h-5" />
            </div>
          ))}
        </div>
      </GlassCard>
    </div>
  );
}

