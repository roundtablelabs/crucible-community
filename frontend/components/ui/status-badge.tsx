import { cn } from "@/lib/utils";
import { RadioTower, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

type StatusBadgeStatus = "live" | "offline" | "completed" | "error" | "connected" | "verified" | "running";

type StatusBadgeProps = {
  status: StatusBadgeStatus;
  children?: ReactNode;
  icon?: ReactNode;
  className?: string;
};

const statusStyles: Record<StatusBadgeStatus, { container: string; iconContainer?: string; defaultIcon?: ReactNode }> = {
  live: {
    container: "border-emerald-400/60 bg-emerald-400/10 text-emerald-100",
    iconContainer: "bg-emerald-500/20 text-emerald-300",
    defaultIcon: <RadioTower className="h-4 w-4" aria-hidden="true" />,
  },
  offline: {
    container: "border-rose-500/60 bg-rose-500/10 text-rose-100",
    iconContainer: "bg-rose-500/20 text-rose-300",
  },
  completed: {
    container: "border-emerald-400/60 bg-emerald-400/10 text-emerald-200",
    iconContainer: "bg-emerald-500",
  },
  error: {
    container: "border-danger-700/30 text-danger-100 bg-danger-100/5",
    iconContainer: "bg-danger-700",
  },
  running: {
    container: "border-info-700/30 text-info-100 bg-info-100/5",
    iconContainer: "bg-info-700",
  },
  connected: {
    container: "border-emerald-300/60 text-emerald-200",
  },
  verified: {
    container: "border-emerald-300/60 text-emerald-200",
    defaultIcon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />,
  },
};

export function StatusBadge({ status, children, icon, className }: StatusBadgeProps) {
  const style = statusStyles[status];
  const displayIcon = icon ?? style.defaultIcon;
  const hasIconContainer = style.iconContainer && (status === "live" || status === "offline");

  // For live/offline, use the special layout with icon container
  if (hasIconContainer) {
    return (
      <div
        className={cn(
          "flex items-center gap-2 rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.32em]",
          style.container,
          className,
        )}
        aria-live="polite"
      >
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-full", style.iconContainer)}>
          {displayIcon}
        </span>
        {children && <span>{children}</span>}
      </div>
    );
  }

  // For other statuses, use simpler layout with optional dot or icon
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[0.65rem] font-semibold uppercase tracking-[0.3em]",
        style.container,
        className,
      )}
    >
      {displayIcon && !style.iconContainer && displayIcon}
      {style.iconContainer && <span className={cn("h-1.5 w-1.5 rounded-full", style.iconContainer)} />}
      {children}
    </span>
  );
}

