import { forwardRef, type HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type BadgeVariant = "default" | "secondary" | "outline";

const variantStyles: Record<BadgeVariant, string> = {
  default:
    "border border-gold-500/30 bg-gold-500/10 text-gold-500",
  secondary:
    "border border-base-divider/60 bg-base-panel/80 text-base-subtext",
  outline:
    "border border-base-divider bg-transparent text-base-text",
};

type BadgeProps = HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
};

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = "default", ...props }, ref) => {
    return (
      <span
        ref={ref}
        className={cn(
          "inline-flex w-fit items-center gap-2 rounded-full px-3 py-[0.35rem] text-[0.65rem] font-semibold uppercase tracking-[0.32em]",
          variantStyles[variant],
          className,
        )}
        {...props}
      />
    );
  },
);

Badge.displayName = "Badge";
