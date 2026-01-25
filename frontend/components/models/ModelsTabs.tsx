"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { 
  FiAlertTriangle, 
  FiExternalLink, 
  FiShield,
  FiZap,
  FiClock,
  FiDollarSign,
  FiLayers
} from "react-icons/fi";

import { 
  RiOpenaiFill,
  RiGeminiFill,
  RiAnthropicFill,
} from "react-icons/ri";

export type ModelCapabilities = {
  reasoningDepth: "high" | "medium" | "low";
  contextSize: "very-large" | "large" | "medium" | "small";
  speed: "fast" | "medium" | "slow";
  costEfficiency: "high" | "medium" | "low";
};

export type ProviderModel = {
  name: string;
  focus: string;
  bestAgentRole?: string;
  why: string[];
  domains: string[];
  capabilities?: ModelCapabilities;
};

export type Provider = {
  name: string;
  slug: string;
  tagline: string;
  overview: string;
  siteHref: string;
  models: ProviderModel[];
  accentColor?: string;
};

type ModelsTabsProps = {
  providers: Provider[];
};

export default function ModelsTabs({ providers }: ModelsTabsProps) {
  const items = useMemo(() => providers ?? [], [providers]);
  const [activeSlug, setActiveSlug] = useState(() => items[0]?.slug ?? "");
  const [activeModelName, setActiveModelName] = useState(
    () => items[0]?.models[0]?.name ?? "",
  );

  const toDomId = (value: string) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, "-");

  useEffect(() => {
    if (!items.length) {
      return;
    }
    if (!items.some((entry) => entry.slug === activeSlug)) {
      setActiveSlug(items[0].slug);
    }
  }, [items, activeSlug]);
  const activeProvider =
    items.find((entry) => entry.slug === activeSlug) ?? items[0];

  useEffect(() => {
    const fallback = activeProvider?.models[0]?.name ?? "";
    if (!fallback) {
      setActiveModelName("");
      return;
    }
    if (!activeProvider?.models.some((model) => model.name === activeModelName)) {
      setActiveModelName(fallback);
    }
  }, [activeProvider, activeModelName]);

  if (!activeProvider) {
    return null;
  }

  const activeModel =
    activeProvider.models.find((model) => model.name === activeModelName) ??
    activeProvider.models[0];

  if (!activeModel) {
    return null;
  }

  const requiresReview =
    Boolean(activeProvider) &&
    activeProvider?.slug === "deepseek";
  
  const hasDataResidencyWarning = activeProvider?.slug === "deepseek";

  // Provider-specific accent colors
  const getProviderColor = (slug: string) => {
    const colors: Record<string, string> = {
      openai: "from-emerald-500/20 via-emerald-500/10",
      anthropic: "from-purple-500/20 via-purple-500/10",
      deepseek: "from-blue-500/20 via-blue-500/10",
      gemini: "from-cyan-500/20 via-cyan-500/10",
      xai: "from-rose-500/20 via-rose-500/10",
    };
    return colors[slug] || "from-gold-500/20 via-gold-500/10";
  };

  const providerColor = getProviderColor(activeProvider.slug);

  // Provider icon component
  const ProviderIcon = ({ slug, className }: { slug: string; className?: string }) => {
    const iconProps = { className };
    
    const icons: Record<string, React.ReactElement | null> = {
      openai: <RiOpenaiFill {...iconProps} />,
      anthropic: <RiAnthropicFill {...iconProps} />,
      gemini: <RiGeminiFill {...iconProps} />,
      deepseek: null, // No icon to avoid legal issues
      xai: null, // No icon to avoid legal issues
    };
    return icons[slug] || null;
  };

  // Capability indicator component
  const CapabilityIndicator = ({ 
    label, 
    value, 
    icon: Icon 
  }: { 
    label: string; 
    value: string; 
    icon: typeof FiZap;
  }) => {
    const getValueColor = (val: string) => {
      if (val === "high" || val === "very-large" || val === "fast") {
        return "text-emerald-400";
      }
      if (val === "medium" || val === "large") {
        return "text-amber-400";
      }
      return "text-base-subtext/60";
    };

    return (
      <div className="flex items-center gap-2 rounded-lg border border-base-divider/40 bg-base-panel/50 px-2.5 py-1.5">
        <Icon className="h-3.5 w-3.5 text-base-subtext/70" />
        <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-base-subtext/70">
          {label}:
        </span>
        <span className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${getValueColor(value)}`}>
          {value}
        </span>
      </div>
    );
  };

  return (
    <>
      <div className="space-y-6 pb-12">
        <div
          role="tablist"
          aria-label="Model providers"
          className="flex gap-2 overflow-x-auto border-b border-base-divider/70 pb-2 scrollbar-hide md:scrollbar-default"
          style={{ scrollSnapType: 'x mandatory' }}
        >
          {items.map(({ slug, name }) => {
            const isActive = slug === activeProvider.slug;
            const tabProviderColor = getProviderColor(slug);
            return (
              <button
                key={slug}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-controls={`${slug}-panel`}
                className={`relative flex min-w-[120px] flex-shrink-0 cursor-pointer items-center justify-center rounded-t-2xl border border-base-divider/60 border-b-0 px-3 py-2.5 text-xs font-semibold uppercase tracking-[0.18em] transition-all duration-300 md:min-w-[120px] md:px-4 ${
                  isActive
                    ? `bg-gradient-to-br ${tabProviderColor} to-base-panel text-base-text shadow-soft`
                    : "bg-base-bg/60 text-base-subtext hover:bg-base-bg hover:text-base-text"
                }`}
                onClick={() => setActiveSlug(slug)}
                style={{ scrollSnapAlign: 'start' }}
              >
                {(() => {
                  const icon = <ProviderIcon slug={slug} className="h-4 w-4" />;
                  const isDeepSeek = slug === "deepseek";
                  return icon ? (
                    <>
                      <span className="mr-2 flex-shrink-0">
                        {icon}
                      </span>
                      {name}
                      {isDeepSeek && (
                        <FiShield className="ml-1.5 h-3 w-3 text-amber-400/80" />
                      )}
                    </>
                  ) : (
                    <>
                      {name}
                      {isDeepSeek && (
                        <FiShield className="ml-1.5 h-3 w-3 text-amber-400/80" />
                      )}
                    </>
                  );
                })()}
                {isActive ? (
                  <span
                    aria-hidden
                    className="absolute bottom-0 h-1 w-[55%] rounded-t-full bg-gold-500/70 transition-all duration-300"
                  />
                ) : null}
              </button>
            );
          })}
        </div>

        {hasDataResidencyWarning && (
          <div className="rounded-2xl border border-amber-400/30 bg-gradient-to-br from-amber-400/5 via-amber-400/3 to-transparent p-4">
            <div className="flex items-start gap-3">
              <FiShield className="h-5 w-5 text-amber-400/80 flex-shrink-0 mt-0.5" />
              <div className="flex-1 space-y-2">
                <p className="text-sm font-semibold text-amber-300/90">
                  Data Residency Notice
                </p>
                <p className="text-xs leading-relaxed text-base-subtext/90">
                  DeepSeek processes data in China, which may be subject to Chinese data protection laws (PIPL). This may not meet enterprise compliance requirements. DeepSeek is optional and can be disabled upon request.{" "}
                  <Link 
                    href="/legal/privacy#special-notice-deepseek-subprocessor-data-residency"
                    className="text-amber-400/90 underline hover:text-amber-300 transition-colors"
                  >
                    See Privacy Policy for details
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        )}
        <section className="provider-overview rounded-3xl border border-base-divider/60 bg-base-bg/85 p-4 shadow-soft transition-all duration-300 md:p-6">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="space-y-2">
              <span className="text-xs font-semibold uppercase tracking-[0.32em] text-gold-500">
                Provider Overview
              </span>
              <p className="max-w-4xl text-sm text-base-subtext/90 md:text-base">
                {activeProvider.overview}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start">
              <Link
                href={activeProvider.siteHref}
                aria-label={`Visit ${activeProvider.name} official site`}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gold-500/60 text-gold-500/80 transition hover:bg-gold-500/10 hover:text-gold-400"
              >
                <FiExternalLink className="h-4 w-4" />
              </Link>
              {hasDataResidencyWarning ? (
                <span 
                  title="Data Residency Notice: DeepSeek processes data in China. See Privacy Policy for details."
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-amber-400/40 bg-amber-400/10 text-amber-400/80">
                  <FiShield className="h-4 w-4" />
                </span>
              ) : requiresReview ? (
                <span 
                  title="Please review their official website"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-amber-400/60 bg-amber-400/10 text-amber-400">
                  <FiAlertTriangle className="h-4 w-4" />
                </span>
              ) : (
                <span
                  title="No training on your data"
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-emerald-400/40 text-emerald-400/80"
                >
                  <FiShield className="h-4 w-4" />
                </span>
              )}
            </div>
          </div>
        </section>

        <div className="grid gap-6 md:grid-cols-[minmax(0,0.4fr)_minmax(0,1.6fr)]">
          {/* Mobile: Horizontal scrollable model selector */}
          <nav
            role="tablist"
            aria-label={`${activeProvider.name} models`}
            aria-orientation="horizontal"
            className="flex gap-2 overflow-x-auto border-b border-base-divider/70 pb-4 md:hidden"
            style={{ scrollSnapType: 'x mandatory' }}
          >
            {activeProvider.models.map((model) => {
              const isActive = model.name === activeModel.name;
              return (
                <button
                  key={model.name}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`${activeProvider.slug}-${toDomId(model.name)}-panel`}
                  className={`flex flex-shrink-0 items-center justify-center rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.22em] transition-all duration-300 ${
                    isActive
                      ? `bg-gradient-to-r ${providerColor} to-transparent text-base-text shadow-soft`
                      : "text-base-subtext hover:bg-base-panel/70 hover:text-base-text"
                  }`}
                  onClick={() => setActiveModelName(model.name)}
                  style={{ scrollSnapAlign: 'start' }}
                >
                  {model.name}
                </button>
              );
            })}
          </nav>
          
          {/* Desktop: Vertical model selector */}
          <nav
            role="tablist"
            aria-label={`${activeProvider.name} models`}
            aria-orientation="vertical"
            className="hidden flex-col items-start gap-2 border-l-2 border-base-divider/70 pl-4 md:flex"
          >
            {activeProvider.models.map((model) => {
              const isActive = model.name === activeModel.name;
              return (
                <button
                  key={model.name}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`${activeProvider.slug}-${toDomId(model.name)}-panel`}
                  className={`relative flex w-full flex-col items-start gap-1.5 rounded-xl border px-3 py-2.5 text-left transition-all duration-300 ${
                    isActive
                      ? `border-gold-500/40 bg-gradient-to-r ${providerColor} to-transparent text-base-text shadow-soft`
                      : "border-base-divider/40 bg-base-panel/30 text-base-subtext hover:border-base-divider/60 hover:bg-base-panel/50 hover:text-base-text"
                  }`}
                  onClick={() => setActiveModelName(model.name)}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-[0.22em]">
                      {model.name}
                    </span>
                    {isActive && (
                      <div className="absolute -left-[18px] h-2 w-2 rounded-full bg-gold-500 shadow-sm" />
                    )}
                  </div>
                  {model.bestAgentRole && (
                    <span className="text-[10px] font-medium normal-case leading-tight text-base-subtext/70">
                      {model.bestAgentRole}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>

          <div id={`${activeProvider.slug}-panel`} className="space-y-6">
            <article
              id={`${activeProvider.slug}-${toDomId(activeModel.name)}-panel`}
              role="tabpanel"
              className="model-card relative overflow-hidden rounded-3xl p-4 transition-all duration-300 md:p-8"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-3xl border border-white/20"
              />
              <div className="relative space-y-6">
                <header className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-xs font-semibold uppercase tracking-[0.32em] text-gold-500">
                      Model Snapshot
                    </span>
                    <div className="flex items-center gap-2">
                      {hasDataResidencyWarning && (
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/40 bg-amber-400/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-300/90">
                          <FiShield className="h-3 w-3" />
                          Data Residency
                        </span>
                      )}
                      {activeModel.bestAgentRole ? (
                        <span className="role-highlight text-xs font-semibold uppercase tracking-[0.28em] text-gold-500">
                          {activeModel.bestAgentRole}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <h3 className="text-2xl font-semibold text-base-text md:text-3xl">
                    {activeModel.name}
                  </h3>
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-base-subtext/70">
                    {activeModel.focus}
                  </p>
                  {activeModel.domains.length ? (
                    <ul className="mt-3 flex flex-wrap gap-2">
                      {activeModel.domains.map((domain) => (
                        <li
                          key={domain}
                          className="rounded-full border border-base-divider/60 bg-base-panel/80 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-base-subtext"
                        >
                          {domain}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  
                  {activeModel.capabilities && (
                    <div className="mt-4 grid grid-cols-2 gap-2 md:flex md:flex-wrap">
                      <CapabilityIndicator 
                        label="Reasoning" 
                        value={activeModel.capabilities.reasoningDepth} 
                        icon={FiZap}
                      />
                      <CapabilityIndicator 
                        label="Context" 
                        value={activeModel.capabilities.contextSize} 
                        icon={FiLayers}
                      />
                      <CapabilityIndicator 
                        label="Speed" 
                        value={activeModel.capabilities.speed} 
                        icon={FiClock}
                      />
                      <CapabilityIndicator 
                        label="Cost" 
                        value={activeModel.capabilities.costEfficiency} 
                        icon={FiDollarSign}
                      />
                    </div>
                  )}
                </header>

                <section className="space-y-4 rounded-2xl border border-base-divider/30 bg-base-panel/30 p-4 md:p-5">
                  <p className="text-xs font-semibold uppercase tracking-[0.28em] text-gold-500">
                    Why this model?
                  </p>
                  <ul className="flex list-none flex-col gap-3.5 pl-0">
                    {activeModel.why.map((item, index) => (
                      <li 
                        key={index}
                        className="relative flex items-start gap-3 text-sm leading-relaxed text-base-subtext/95 before:mt-1.5 before:flex before:h-1.5 before:w-1.5 before:shrink-0 before:rounded-full before:bg-gold-500/60 before:content-['']"
                      >
                        <span className="flex-1">{item}</span>
                      </li>
                    ))}
                  </ul>
                </section>

              </div>
            </article>
          </div>
        </div>
      </div>

      <style jsx global>{`
        .role-highlight {
          position: relative;
          display: inline-flex;
          align-items: center;
          gap: 0.5rem;
          padding-bottom: 0.2rem;
        }

        .role-highlight::before {
          content: "";
          position: absolute;
          inset: auto 0 0;
          height: 1px;
          border-radius: 9999px;
          background: rgba(99, 62, 175, 0.35);
        }

        .role-highlight::after {
          content: "";
          position: absolute;
          inset: auto 0 0;
          height: 2px;
          border-radius: 9999px;
          background: linear-gradient(
            90deg,
            rgba(99, 62, 175, 0.1) 0%,
            rgba(99, 62, 175, 0.65) 50%,
            rgba(99, 62, 175, 0.1) 100%
          );
          background-size: 200% 100%;
          animation: role-highlight-shimmer 3s ease-in-out infinite;
        }

        @keyframes role-highlight-shimmer {
          0% {
            background-position: 0% 50%;
          }
          50% {
            background-position: 100% 50%;
          }
          100% {
            background-position: 0% 50%;
          }
        }

        .provider-overview {
          animation: fadeIn 0.4s ease-in-out;
        }

        .model-card {
          animation: fadeIn 0.4s ease-in-out;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}
