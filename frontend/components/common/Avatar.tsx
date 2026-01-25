import { cn } from "@/lib/utils";

const COLORS = [
  "bg-navy-900 text-base-panel",
  "bg-gold-500 text-navy-900",
  "bg-steel-700 text-base-panel",
  "bg-steel-500 text-base-panel",
];

type AvatarProps = {
  name: string;
  className?: string;
};

export function Avatar({ name, className }: AvatarProps) {
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "AI";

  const color = COLORS[initials.charCodeAt(0) % COLORS.length];

  return (
    <span
      className={cn(
        "flex h-10 w-10 items-center justify-center rounded-full text-sm font-semibold",
        color,
        className,
      )}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
