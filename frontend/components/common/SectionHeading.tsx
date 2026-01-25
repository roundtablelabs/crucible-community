import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  className?: string;
  children?: ReactNode;
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  className,
  children,
}: SectionHeadingProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4",
        align === "center" ? "text-center" : "text-left",
        className,
      )}
    >
      {eyebrow ? (
        <span className="text-xs font-semibold uppercase tracking-[0.32em] text-gold-500">
          {eyebrow}
        </span>
      ) : null}
      <h2 className="text-2xl font-semibold text-base-text md:text-3xl">
        {title}
      </h2>
      {description ? (
        <p className="max-w-2xl text-base text-base-subtext">{description}</p>
      ) : null}
      {children}
    </div>
  );
}
