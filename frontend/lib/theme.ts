export type ThemeChoice = "system" | "light" | "dark";

const THEME_STORAGE_KEY = "rt:theme";
const THEME_ATTRIBUTE = "data-theme";

function getSystemTheme(): "light" | "dark" {
  if (typeof window === "undefined") {
    return "dark";
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function applyTheme(theme: "light" | "dark") {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.setAttribute(THEME_ATTRIBUTE, theme);
}

export function getStoredTheme(): ThemeChoice | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "system" || stored === "light" || stored === "dark") {
      return stored;
    }
  } catch {
    // Ignore errors
  }
  return null;
}

export function setTheme(choice: ThemeChoice): void {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // Ignore storage errors
  }

  const effectiveTheme = choice === "system" ? getSystemTheme() : choice;
  applyTheme(effectiveTheme);

  // Listen for system theme changes if using system preference
  if (choice === "system" && typeof window !== "undefined") {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      applyTheme(e.matches ? "dark" : "light");
    };
    mediaQuery.addEventListener("change", handleChange);
  }
}

export function initTheme(): void {
  const choice = getStoredTheme() ?? "system";
  setTheme(choice);
}
