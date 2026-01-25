"use client";

import { useEffect, useState } from "react";
import { initTheme, setTheme, type ThemeChoice, getStoredTheme } from "@/lib/theme";
import { Moon, Sun, Monitor } from "lucide-react";

const LABELS: Record<ThemeChoice, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export function ThemeToggle() {
  const [choice, setChoice] = useState<ThemeChoice>(getStoredTheme() ?? "system");

  useEffect(() => {
    initTheme();
  }, []);

  function cycle() {
    const order: ThemeChoice[] = ["system", "light", "dark"];
    const next = order[(order.indexOf(choice) + 1) % order.length];
    setChoice(next);
    setTheme(next);
  }

  const Icon = choice === "system" ? Monitor : choice === "light" ? Sun : Moon;

  return (
    <button
      onClick={cycle}
      aria-label={`Theme: ${LABELS[choice]}`}
      className="inline-flex items-center gap-2 rounded-full border border-base-divider px-3 py-2 text-sm text-base-subtext transition hover:border-navy-900 hover:text-base-text"
    >
      <Icon className="h-4 w-4" />
      <span className="hidden sm:inline">{LABELS[choice]}</span>
    </button>
  );
}
