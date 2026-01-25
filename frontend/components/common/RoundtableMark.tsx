"use client";

import { useState } from "react";

type RoundtableMarkTheme = "dark" | "light" | "mono-white" | "mono-black";

type RoundtableMarkProps = {
  size?: number;
  theme?: RoundtableMarkTheme;
  showFocal?: boolean;
  className?: string;
};

export function RoundtableMark({
  size = 24,
  theme = "dark",
  showFocal = false,
  className,
}: RoundtableMarkProps) {
  // Note: theme and showFocal props are kept for backward compatibility
  // but are not applied to the static SVG file
  const [imgError, setImgError] = useState(false);
  
  // Fallback to text if image fails to load
  if (imgError) {
    return (
      <div
        className={className}
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: size * 0.6,
          fontWeight: "bold",
          color: "currentColor",
        }}
        aria-label="Crucible mark"
      >
        R
      </div>
    );
  }
  
  // Use regular img tag for better subdomain compatibility
  // Next.js Image component can have issues with SVGs on subdomains
  return (
    <img
      src="/logos/roundtable-mark.svg"
      alt="Crucible mark"
      width={size}
      height={size}
      className={className}
      style={{ display: "block", width: size, height: size }}
      onError={() => {
        if (process.env.NODE_ENV === "development") {
          console.error("Failed to load logo at /logos/roundtable-mark.svg");
        }
        setImgError(true);
      }}
      onLoad={() => {
        // Logo loaded successfully
      }}
    />
  );
}
