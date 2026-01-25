export function ComingSoonBadge({ text = "Q1 2026" }: { text?: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-gold-500/30 bg-gold-500/10 px-2 py-0.5 text-xs font-semibold uppercase tracking-[0.16em] text-gold-500">
      {text}
    </span>
  );
}














