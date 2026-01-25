/**
 * Crucible Community Edition
 * Copyright (C) 2025 Roundtable Labs Pty Ltd
 * 
 * Licensed under AGPL-3.0. See LICENSE file for details.
 */

"use client";

import { cn } from "@/lib/utils";

type OpenRouterIconProps = {
  className?: string;
  size?: number;
};

export function OpenRouterIcon({ className, size = 24 }: OpenRouterIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 512 512"
      xmlns="http://www.w3.org/2000/svg"
      className={cn("fill-current", className)}
      aria-label="OpenRouter"
    >
      <g clipPath="url(#clip0_205_3)">
        <path
          d="M3 248.945C18 248.945 76 236 106 219C136 202 136 202 198 158C276.497 102.293 332 120.945 423 120.945"
          strokeWidth="90"
          stroke="currentColor"
          fill="none"
        />
        <path
          d="M511 121.5L357.25 210.268L357.25 32.7324L511 121.5Z"
          fill="currentColor"
        />
        <path
          d="M0 249C15 249 73 261.945 103 278.945C133 295.945 133 295.945 195 339.945C273.497 395.652 329 377 420 377"
          strokeWidth="90"
          stroke="currentColor"
          fill="none"
        />
        <path
          d="M508 376.445L354.25 287.678L354.25 465.213L508 376.445Z"
          fill="currentColor"
        />
      </g>
      <defs>
        <clipPath id="clip0_205_3">
          <rect width="512" height="512" fill="white" />
        </clipPath>
      </defs>
    </svg>
  );
}
