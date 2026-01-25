"use client";

import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type BentoGridProps = {
  children: ReactNode;
  className?: string;
  columns?: 1 | 2 | 3 | 4;
};

export function BentoGrid({ children, className, columns = 4 }: BentoGridProps) {
  const gridCols = {
    1: "grid-cols-1",
    2: "grid-cols-1 sm:grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
  };

  return (
    <div
      className={cn(
        "grid gap-4",
        gridCols[columns],
        className,
      )}
    >
      {children}
    </div>
  );
}

