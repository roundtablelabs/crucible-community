type KnightCardProps = {
  name: string;
  role: string;
  model: string;
  temperature: number;
  prompt: string;
};

const toneFromTemperature = (temperature: number) => {
  if (temperature <= 0.4) return "Guarded";
  if (temperature <= 1.0) return "Balanced";
  return "Bold";
};

const formatTemperature = (temperature: number) => (Math.round(temperature * 10) / 10).toFixed(1);

export function KnightCard({ name, role, model, temperature, prompt }: KnightCardProps) {
  const toneLabel = toneFromTemperature(temperature);
  const temperatureLabel = formatTemperature(temperature);
  return (
    <article className="rounded-3xl border border-base-divider bg-base-panel p-6 shadow-soft">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-base-text">{name}</h3>
          <p className="text-sm text-base-subtext">Role: {role}</p>
        </div>
        <span className="rounded-full border border-steel-300 bg-steel-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-base-subtext">
          {toneLabel}
        </span>
      </div>
      <div className="mt-4 rounded-xl bg-base-bg/70 p-4 text-xs uppercase tracking-[0.26em] text-base-subtext">
        Model: {model}
      </div>
      <p className="mt-3 text-xs uppercase tracking-[0.22em] text-base-subtext">Temperature: {temperatureLabel}</p>
      <p className="mt-4 text-sm text-base-subtext">{prompt}</p>
    </article>
  );
}
