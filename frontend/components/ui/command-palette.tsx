"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  Search,
  LayoutDashboard,
  ScrollText,
  Users,
  Rocket,
  Radio,
  Plus,
  FileDown,
  Settings,
  X,
  Command,
} from "lucide-react";
import * as DialogPrimitive from "@radix-ui/react-dialog";

type CommandAction = {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  shortcut?: string;
  action: () => void;
  keywords?: string[];
};

type CommandGroup = {
  label: string;
  commands: CommandAction[];
};

type CommandPaletteProps = {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function CommandPalette({ open: controlledOpen, onOpenChange }: CommandPaletteProps) {
  const router = useRouter();
  const [internalOpen, setInternalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const isOpen = controlledOpen ?? internalOpen;
  const setIsOpen = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    if (onOpenChange) {
      // If controlled, call onOpenChange with the resolved boolean value
      const resolvedValue = typeof value === "function" ? value(isOpen) : value;
      onOpenChange(resolvedValue);
    } else {
      // If uncontrolled, use the state setter which accepts function or boolean
      setInternalOpen(value);
    }
  }, [onOpenChange, isOpen]);

  const commands: CommandGroup[] = useMemo(
    () => [
      {
        label: "Navigation",
        commands: [
          {
            id: "dashboard",
            label: "Go to Dashboard",
            icon: LayoutDashboard,
            shortcut: "D",
            action: () => router.push("/app"),
            keywords: ["dashboard", "home", "boardroom"],
          },
          {
            id: "sessions",
            label: "Go to Sessions",
            icon: ScrollText,
            shortcut: "S",
            action: () => router.push("/app/sessions"),
            keywords: ["sessions", "decision log", "history"],
          },
          {
            id: "knights",
            label: "Go to Knights",
            icon: Users,
            shortcut: "K",
            action: () => router.push("/app/knights"),
            keywords: ["knights", "library", "experts"],
          },
          {
            id: "launchpad",
            label: "Go to Launchpad",
            icon: Rocket,
            shortcut: "L",
            action: () => router.push("/app/launchpad"),
            keywords: ["launchpad", "start", "new session"],
          },
          {
            id: "live",
            label: "Go to Live Session",
            icon: Radio,
            shortcut: "V",
            action: () => router.push("/app/live"),
            keywords: ["live", "session", "debate"],
          },
        ],
      },
      {
        label: "Actions",
        commands: [
          {
            id: "new-session",
            label: "Start new session",
            icon: Plus,
            shortcut: "N",
            action: () => router.push("/app/launchpad"),
            keywords: ["new", "start", "create", "session"],
          },
          {
            id: "create-knight",
            label: "Create knight",
            icon: Users,
            shortcut: "C",
            action: () => router.push("/app/knights"),
            keywords: ["create", "knight", "expert"],
          },
          {
            id: "settings",
            label: "Open settings",
            icon: Settings,
            shortcut: "⌘,",
            action: () => router.push("/app/settings"),
            keywords: ["settings", "preferences", "config"],
          },
        ],
      },
    ],
    [router],
  );

  const filteredCommands = useMemo(() => {
    if (!searchQuery.trim()) {
      return commands;
    }

    const query = searchQuery.toLowerCase();
    return commands
      .map((group) => ({
        ...group,
        commands: group.commands.filter(
          (cmd) =>
            cmd.label.toLowerCase().includes(query) ||
            cmd.keywords?.some((keyword) => keyword.toLowerCase().includes(query)),
        ),
      }))
      .filter((group) => group.commands.length > 0);
  }, [commands, searchQuery]);

  const allFilteredCommands = useMemo(
    () => filteredCommands.flatMap((group) => group.commands),
    [filteredCommands],
  );

  const handleSelect = useCallback(
    (command: CommandAction) => {
      setIsOpen(false);
      setSearchQuery("");
      setSelectedIndex(0);
      // Small delay to allow menu closing animation to complete before navigation
      setTimeout(() => {
        command.action();
      }, 200);
    },
    [setIsOpen],
  );

  useEffect(() => {
    if (!isOpen) {
      setSearchQuery("");
      setSelectedIndex(0);
      return;
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        setIsOpen((prev) => !prev);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setIsOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((prev) => (prev + 1) % allFilteredCommands.length);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((prev) => (prev - 1 + allFilteredCommands.length) % allFilteredCommands.length);
      } else if (event.key === "Enter") {
        event.preventDefault();
        if (allFilteredCommands[selectedIndex]) {
          handleSelect(allFilteredCommands[selectedIndex]);
        }
      } else if (event.key === "Escape") {
        event.preventDefault();
        setIsOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, allFilteredCommands, selectedIndex, handleSelect, setIsOpen]);

  return (
    <DialogPrimitive.Root open={isOpen} onOpenChange={setIsOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in" />
        <DialogPrimitive.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-top-4"
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <DialogPrimitive.Title className="sr-only">Command Palette</DialogPrimitive.Title>
          <div
            className="rounded-2xl border shadow-lg"
            style={{
              background: "var(--rt-panel-elevated)",
              borderColor: "var(--rt-border-strong)",
              boxShadow: "var(--rt-shadow-elevated)",
            }}
          >
            <div className="flex items-center gap-3 border-b px-4 py-3" style={{ borderColor: "var(--rt-border)" }}>
              <Search className="h-4 w-4 text-[color:var(--rt-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setSelectedIndex(0);
                }}
                placeholder="Type a command or search..."
                className="flex-1 bg-transparent text-sm text-[color:var(--rt-text)] outline-none placeholder:text-[color:var(--rt-muted)]"
                autoFocus
              />
              <kbd className="hidden items-center gap-1 rounded border px-2 py-1 text-xs font-mono sm:flex" style={{ borderColor: "var(--rt-border)" }}>
                <Command className="h-3 w-3" />
                K
              </kbd>
            </div>

            <div className="max-h-[400px] overflow-y-auto p-2">
              {filteredCommands.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <p className="text-sm text-[color:var(--rt-muted)]">No commands found</p>
                  <p className="mt-1 text-xs text-[color:var(--rt-subtext)]">Try a different search term</p>
                </div>
              ) : (
                filteredCommands.map((group, groupIndex) => {
                  let commandIndex = 0;
                  filteredCommands.slice(0, groupIndex).forEach((g) => {
                    commandIndex += g.commands.length;
                  });

                  return (
                    <div key={group.label} className="mb-4 last:mb-0">
                      <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-[0.32em] text-[color:var(--rt-muted)]">
                        {group.label}
                      </p>
                      <div className="space-y-1">
                        {group.commands.map((command) => {
                          const index = commandIndex++;
                          const isSelected = index === selectedIndex;
                          const Icon = command.icon;

                          return (
                            <button
                              key={command.id}
                              type="button"
                              onClick={() => handleSelect(command)}
                              className={cn(
                                "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors",
                                isSelected
                                  ? "bg-[color:var(--rt-accent-100)] text-[color:var(--rt-accent-700)]"
                                  : "text-[color:var(--rt-text)] hover:bg-[color:var(--rt-surface-2)]",
                              )}
                            >
                              <Icon className="h-4 w-4 flex-shrink-0" />
                              <span className="flex-1">{command.label}</span>
                              {command.shortcut && (
                                <kbd className="hidden rounded border px-2 py-0.5 text-xs font-mono sm:inline-block" style={{ borderColor: "var(--rt-border)" }}>
                                  {command.shortcut}
                                </kbd>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

