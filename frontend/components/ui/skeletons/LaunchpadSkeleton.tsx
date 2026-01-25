"use client";

import { SkeletonScreen, SkeletonLine, SkeletonBox, SkeletonCircle } from "../SkeletonScreen";

export function LaunchpadSkeleton() {
  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      <div className="relative z-10 container-box flex flex-col gap-10 py-12">
        {/* Back button skeleton */}
        <div className="mb-2">
          <SkeletonLine width="120px" height="32px" className="h-8 rounded-full" />
        </div>

        {/* Header skeleton */}
        <header>
          <SkeletonLine width="400px" height="48px" className="h-12 mb-3" />
          <SkeletonLine width="600px" height="24px" className="h-6" />
        </header>

        {/* Step labels skeleton */}
        <section className="flex flex-wrap gap-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="inline-flex min-w-[160px] flex-1 items-center justify-between gap-3 rounded-full border border-gold-900/50 px-4 py-2"
            >
              <SkeletonLine width="80px" height="16px" className="h-4" />
              <SkeletonCircle size={16} />
            </div>
          ))}
        </section>

        {/* Main section skeleton */}
        <section className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          {/* Left: Intake assistant */}
          <div className="rounded-[26px] border border-slate-200/20 p-6">
            <div className="flex items-center gap-3 mb-6">
              <SkeletonCircle size={48} />
              <SkeletonLine width="120px" height="16px" className="h-4" />
            </div>

            {/* Chat area or start buttons skeleton */}
            <div className="space-y-4 rounded-2xl border border-dashed border-gold-500/35 bg-[rgba(20,18,12,0.6)] p-6">
              <div>
                <SkeletonLine width="250px" height="20px" className="h-5 mb-2" />
                <SkeletonLine width="400px" height="16px" className="h-4" />
              </div>
              <div className="flex flex-wrap gap-3">
                <SkeletonLine width="100px" height="36px" className="h-9 rounded-full" />
                <SkeletonLine width="140px" height="36px" className="h-9 rounded-full" />
              </div>
            </div>
          </div>

          {/* Right: Status and transcript */}
          <div className="flex flex-col gap-6">
            {/* Current status card */}
            <div className="rounded-[26px] border border-slate-200/20 p-5">
              <SkeletonLine width="100px" height="14px" className="h-3.5 mb-3" />
              <div className="flex items-center gap-3">
                <SkeletonCircle size={10} />
                <SkeletonLine width="200px" height="20px" className="h-5" />
              </div>
              <SkeletonLine width="100%" height="16px" className="h-4 mt-3" />
              <SkeletonLine width="80%" height="16px" className="h-4 mt-2" />
            </div>

            {/* Transcript card */}
            <div className="rounded-[26px] border border-gold-500/20 p-5">
              <SkeletonLine width="80px" height="14px" className="h-3.5 mb-3" />
              <div className="space-y-2">
                <SkeletonLine width="100%" height="16px" className="h-4" />
                <SkeletonLine width="90%" height="16px" className="h-4" />
                <SkeletonLine width="95%" height="16px" className="h-4" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export function LaunchpadSummarySkeleton() {
  return (
    <section className="rounded-[28px] border border-teal-400/30 bg-[rgba(10,26,40,0.78)] px-6 py-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <SkeletonLine width="120px" height="14px" className="h-3.5 mb-2" />
          <SkeletonLine width="200px" height="28px" className="h-7" />
        </div>
        <div className="flex gap-3">
          <SkeletonLine width="150px" height="36px" className="h-9 rounded-full" />
          <SkeletonLine width="120px" height="36px" className="h-9 rounded-full" />
          <SkeletonLine width="110px" height="36px" className="h-9 rounded-full" />
        </div>
      </div>
      <div className="mt-4 space-y-3">
        <SkeletonLine width="100%" height="16px" className="h-4" />
        <SkeletonLine width="100%" height="16px" className="h-4" />
        <SkeletonLine width="95%" height="16px" className="h-4" />
        <SkeletonLine width="90%" height="16px" className="h-4" />
      </div>
    </section>
  );
}

export function LaunchpadModeratorBriefSkeleton() {
  return (
    <section className="space-y-6 rounded-[28px] border border-emerald-500/35 px-6 py-6">
      <div className="flex items-center gap-3">
        <SkeletonCircle size={40} />
        <div>
          <SkeletonLine width="150px" height="14px" className="h-3.5 mb-2" />
          <SkeletonLine width="200px" height="28px" className="h-7" />
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-emerald-500/18 bg-[rgba(6,24,35,0.7)] p-4">
          <SkeletonLine width="100px" height="14px" className="h-3.5 mb-2" />
          <SkeletonLine width="100%" height="16px" className="h-4" />
          <SkeletonLine width="90%" height="16px" className="h-4 mt-2" />
        </div>
        <div className="rounded-2xl border border-emerald-500/18 bg-[rgba(6,24,35,0.7)] p-4">
          <SkeletonLine width="120px" height="14px" className="h-3.5 mb-2" />
          <SkeletonLine width="100%" height="16px" className="h-4" />
          <SkeletonLine width="85%" height="16px" className="h-4 mt-2" />
        </div>
      </div>

      <div className="rounded-2xl border border-emerald-500/18 bg-[rgba(6,24,35,0.7)] p-4">
        <SkeletonLine width="120px" height="14px" className="h-3.5 mb-3" />
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-2">
              <SkeletonCircle size={6} />
              <SkeletonLine width="90%" height="16px" className="h-4" />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-emerald-500/18 bg-[rgba(6,24,35,0.7)] p-4">
        <SkeletonLine width="150px" height="14px" className="h-3.5 mb-3" />
        <div className="flex flex-wrap items-center gap-2">
          {[1, 2, 3, 4].map((i) => (
            <SkeletonLine key={i} width="100px" height="32px" className="h-8 rounded-full" />
          ))}
        </div>
      </div>
    </section>
  );
}

