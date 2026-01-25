import { cn } from "@/lib/utils";
import { forwardRef, type ReactNode } from "react";

type GlassCardVariant = "default" | "elevated" | "subtle";

type GlassCardProps = {
  variant?: GlassCardVariant;
  children: ReactNode;
  className?: string;
};

const variantStyles: Record<GlassCardVariant, string> = {
  default: "rounded-[28px] border border-slate-200/20 bg-[rgba(8,20,36,0.72)] shadow-[0_28px_70px_rgba(5,12,26,0.35)] backdrop-blur",
  elevated: "rounded-[28px] border border-slate-200/20 bg-[rgba(8,20,36,0.85)] shadow-[0_35px_110px_rgba(3,8,22,0.65)] backdrop-blur",
  subtle: "rounded-[28px] border border-slate-200/15 bg-[rgba(8,20,36,0.5)] shadow-[0_18px_40px_rgba(2,8,20,0.25)] backdrop-blur",
};

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ variant = "default", children, className }, ref) => {
    return (
      <div ref={ref} className={cn(variantStyles[variant], className)}>
        {children}
      </div>
    );
  },
);

GlassCard.displayName = "GlassCard";

