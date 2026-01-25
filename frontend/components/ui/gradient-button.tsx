import { cn } from "@/lib/utils";
import Link from "next/link";
import type { ReactNode } from "react";

type GradientButtonVariant = "primary" | "gold" | "ghost";
type GradientButtonSize = "sm" | "md" | "lg";

type BaseButtonProps = {
  variant?: GradientButtonVariant;
  size?: GradientButtonSize;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
};

type ButtonProps = BaseButtonProps & {
  type?: "button" | "submit" | "reset";
  onClick?: () => void;
  href?: never;
} & Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "type" | "onClick" | "disabled" | "className" | "children">;

type LinkProps = BaseButtonProps & {
  href: string;
  type?: never;
  onClick?: never;
};

type GradientButtonProps = ButtonProps | LinkProps;

const variantStyles: Record<GradientButtonVariant, string> = {
  primary:
    "bg-gradient-to-r from-[#47d1c1] to-[#6366f1] text-[#071225] transition hover:from-[#5ee7d4] hover:to-[#818cf8] disabled:cursor-not-allowed disabled:bg-[rgba(9,27,47,0.65)] disabled:text-white/40",
  gold: "bg-gold-500/90 text-navy-900 transition hover:bg-gold-500 disabled:cursor-not-allowed disabled:opacity-60",
  ghost:
    "border border-slate-200/25 text-slate-100 transition hover:border-gold-500 hover:text-gold-200 disabled:cursor-not-allowed disabled:opacity-60",
};

const sizeStyles: Record<GradientButtonSize, string> = {
  sm: "px-4 py-2 text-xs",
  md: "px-5 py-2 text-xs",
  lg: "px-6 py-3 text-xs",
};

export function GradientButton({
  variant = "primary",
  size = "md",
  children,
  className,
  disabled,
  ...props
}: GradientButtonProps) {
  const baseStyles = "inline-flex items-center justify-center rounded-full font-semibold uppercase tracking-[0.3em] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/60";

  const combinedClassName = cn(
    baseStyles,
    variantStyles[variant],
    sizeStyles[size],
    className,
  );

  if ("href" in props && props.href) {
    return (
      <Link href={props.href} className={combinedClassName}>
        {children}
      </Link>
    );
  }

  const { type, onClick, ...restProps } = props;
  
  return (
    <button
      type={type ?? "button"}
      onClick={onClick}
      disabled={disabled}
      className={combinedClassName}
      {...restProps}
    >
      {children}
    </button>
  );
}

