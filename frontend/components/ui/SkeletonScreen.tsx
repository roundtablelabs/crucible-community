"use client";

import { cn } from "@/lib/utils";

interface SkeletonScreenProps {
  className?: string;
  children?: React.ReactNode;
}

export function SkeletonScreen({ className, children }: SkeletonScreenProps) {
  return (
    <div className={cn("animate-pulse", className)}>
      {children}
    </div>
  );
}

export function SkeletonLine({ className, width, height }: { className?: string; width?: string; height?: string }) {
  return (
    <div
      className={cn("h-4 bg-base-divider/30 rounded", className)}
      style={{ ...(width ? { width } : {}), ...(height ? { height } : {}) }}
    />
  );
}

export function SkeletonBox({ className, height }: { className?: string; height?: string }) {
  return (
    <div
      className={cn("bg-base-divider/30 rounded", className)}
      style={height ? { height } : undefined}
    />
  );
}

export function SkeletonCircle({ size = 40, className }: { size?: number; className?: string }) {
  return (
    <div
      className={cn("bg-base-divider/30 rounded-full", className)}
      style={{ width: size, height: size }}
    />
  );
}

