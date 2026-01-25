import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

type DocCardProps = {
  title: string;
  description: string;
  href: string;
  className?: string;
  badge?: ReactNode;
};

export function DocCard({ title, description, href, className, badge }: DocCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col gap-3 rounded-2xl border border-base-divider/60 bg-base-panel p-6 transition hover:-translate-y-1 hover:border-gold-500/40",
        className
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-semibold text-base-text">{title}</h3>
            {badge}
          </div>
        </div>
        <ArrowRight className="h-5 w-5 text-base-subtext transition-transform group-hover:translate-x-1 group-hover:text-gold-500 shrink-0" />
      </div>
      <p className="text-sm text-base-subtext/90">{description}</p>
    </Link>
  );
}

