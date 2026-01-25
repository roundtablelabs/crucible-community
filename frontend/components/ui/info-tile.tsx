import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type InfoTileProps = {
  icon: ReactNode;
  title: string;
  value?: string | number;
  description?: string;
  variant?: "stat" | "info";
  className?: string;
};

export function InfoTile({
  icon,
  title,
  value,
  description,
  variant = "stat",
  className,
}: InfoTileProps) {
  // Stat variant: Used for summary cards with large numbers (Sessions page)
  if (variant === "stat") {
    return (
      <div
        className={cn(
          "rounded-2xl border border-white/10 bg-white/5 px-5 py-4 text-left shadow-soft backdrop-blur",
          className,
        )}
      >
        <div className="flex items-center gap-3 text-xs uppercase tracking-[0.32em] text-base-muted">
          {icon}
          {title}
        </div>
        {value !== undefined && (
          <p className="mt-3 text-3xl font-semibold text-white">{value}</p>
        )}
        {description && <p className="mt-1 text-sm text-base-muted">{description}</p>}
      </div>
    );
  }

  // Info variant: Used for feature info cards (Settings page)
  return (
    <div
      className={cn(
        "rounded-[28px] border border-slate-200/20 bg-[rgba(5,12,24,0.85)] p-5 text-sm text-slate-200/80",
        className,
      )}
    >
      <div className="flex items-center gap-3 text-white">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200/20 bg-slate-100/5">
          {icon}
        </span>
        <p className="font-semibold">{title}</p>
      </div>
      {description && <p className="mt-2 text-xs text-slate-200/70">{description}</p>}
    </div>
  );
}

