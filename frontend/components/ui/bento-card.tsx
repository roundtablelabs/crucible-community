"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type BentoCardSize = "sm" | "md" | "lg" | "xl";

type BentoCardProps = {
  children: ReactNode;
  size?: BentoCardSize;
  className?: string;
  asChild?: boolean;
};

const sizeStyles: Record<BentoCardSize, string> = {
  sm: "col-span-1 row-span-1",
  md: "col-span-1 sm:col-span-2 row-span-1",
  lg: "col-span-1 row-span-1 sm:row-span-2",
  xl: "col-span-1 sm:col-span-2 row-span-1 sm:row-span-2",
};

export function BentoCard({ children, size = "sm", className, asChild = false }: BentoCardProps) {
  if (asChild) {
    return (
      <div className={cn(sizeStyles[size], "motion-safe:animate-in motion-safe:fade-in", className)}>
        {children}
      </div>
    );
  }

  return (
    <div
      className={cn(
        sizeStyles[size],
        "motion-safe:animate-in motion-safe:fade-in",
        "transition-shadow duration-300",
        "hover:shadow-lg",
        className,
      )}
      style={{
        animationDelay: "var(--bento-delay, 0ms)",
      }}
    >
      {children}
    </div>
  );
}

