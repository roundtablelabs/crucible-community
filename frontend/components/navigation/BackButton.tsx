"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type BackButtonProps = {
  href?: string;
  label?: string;
  className?: string;
  onClick?: () => void;
};

export function BackButton({ href, label = "Back", className, onClick }: BackButtonProps) {
  const router = useRouter();

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (href) {
      router.push(href);
    } else {
      router.back();
    }
  };

  const content = (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        "inline-flex items-center gap-2 text-sm text-base-subtext transition hover:text-base-text",
        className
      )}
      aria-label={`${label} - navigate back`}
    >
      <ArrowLeft className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      {label}
    </button>
  );

  // If href is provided and no onClick, use Link for better SEO and prefetching
  if (href && !onClick) {
    return (
      <Link
        href={href}
        className={cn(
          "inline-flex items-center gap-2 text-sm text-base-subtext transition hover:text-base-text",
          className
        )}
        aria-label={`${label} - navigate back`}
      >
        <ArrowLeft className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
        {label}
      </Link>
    );
  }

  return content;
}






















