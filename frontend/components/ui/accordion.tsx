import { ReactNode } from "react";
import { cn } from "@/lib/utils";

type AccordionProps = {
  children: ReactNode;
  className?: string;
  type?: "single" | "multiple";
  collapsible?: boolean;
};

export function Accordion({ children, className }: AccordionProps) {
  return <div className={cn(className)}>{children}</div>;
}

type AccordionItemProps = {
  value: string;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
};

export function AccordionItem({
  children,
  className,
  defaultOpen,
}: AccordionItemProps) {
  return (
    <details className={cn("group overflow-hidden transition", className)} open={defaultOpen}>
      {children}
    </details>
  );
}

type AccordionTriggerProps = {
  children: ReactNode;
  className?: string;
};

export function AccordionTrigger({
  children,
  className,
}: AccordionTriggerProps) {
  return (
    <summary
      className={cn(
        "flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-left text-base-text outline-none [&::-webkit-details-marker]:hidden",
        className,
      )}
    >
      {children}
    </summary>
  );
}

type AccordionContentProps = {
  children: ReactNode;
  className?: string;
};

export function AccordionContent({
  children,
  className,
}: AccordionContentProps) {
  return (
    <div className={cn("border-t border-base-divider/60 px-5 py-4", className)}>
      {children}
    </div>
  );
}
