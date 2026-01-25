"use client";

import React, { useMemo } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ApiKnight } from "../types";

const MAX_KNIGHTS_ALLOWED = 12;

type KnightSelectorModalProps = {
  availableKnights: ApiKnight[];
  selectedKnights: ApiKnight[];
  onToggle: (knight: ApiKnight) => void;
  onRemove: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  isLoading: boolean;
  seatError?: string | null;
  requiredCount: number;
};

export function KnightSelectorModal({
  availableKnights,
  selectedKnights,
  onToggle,
  onRemove,
  search,
  onSearchChange,
  isLoading,
  seatError,
  requiredCount,
}: KnightSelectorModalProps) {
  const filteredKnights = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return availableKnights;
    }
    return availableKnights.filter((knight) => {
      return [knight.name, knight.role, knight.goal].some((field) => field.toLowerCase().includes(term));
    });
  }, [availableKnights, search]);

  return (
    <section
      className="rounded-[28px] border border-emerald-500/30 bg-[rgba(6,24,35,0.85)] p-6"
      style={{ animation: "contentRise 600ms ease-out 0.42s both" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[0.6rem] uppercase tracking-[0.35em] text-emerald-500/80">Seat your Knights</p>
          <h3 className="mt-2 text-xl font-semibold text-white">Select board members</h3>
          <p className="text-sm text-emerald-100/70">
            Choose at least {requiredCount} Knights (max {MAX_KNIGHTS_ALLOWED}). They will inherit their exact prompts, models, and guardrails.
          </p>
        </div>
        <div className="text-right text-xs text-emerald-100/70">
          <p>{selectedKnights.length} selected</p>
          <p>{availableKnights.length} available</p>
        </div>
      </div>

      {seatError ? <p className="mt-3 text-sm text-rose-300">{seatError}</p> : null}

      <div className="mt-4">
        {selectedKnights.length === 0 ? (
          <p className="text-sm text-emerald-100/65">No Knights seated yet.</p>
        ) : (
          <div className="flex flex-wrap gap-3">
            {selectedKnights.map((knight) => (
              <button
                key={knight.id}
                type="button"
                onClick={() => onRemove(knight.id)}
                className="group flex items-center gap-2 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-emerald-200 transition hover:border-emerald-400/70 hover:bg-emerald-500/20"
                aria-label={`Remove ${knight.name}`}
              >
                {knight.name}
                <span className="text-[0.6rem] uppercase tracking-[0.3em] text-emerald-300/70">{knight.role}</span>
                <X className="h-3 w-3 text-emerald-200" aria-hidden="true" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 space-y-4">
        <label className="flex items-center gap-3 rounded-full border border-emerald-500/25 bg-[rgba(6,24,35,0.8)] px-4 py-2 text-sm text-white/80">
          <span className="text-[0.65rem] uppercase tracking-[0.3em] text-emerald-100/50">Search</span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Filter by name, role, or goal"
            className="w-full bg-transparent text-sm text-white placeholder:text-white/40 focus:outline-none"
          />
        </label>
        {isLoading ? (
          <p className="text-sm text-emerald-100/70">Loading Knights…</p>
        ) : filteredKnights.length === 0 ? (
          <p className="text-sm text-emerald-100/70">No Knights match that search.</p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filteredKnights.map((knight) => {
              const isSelected = selectedKnights.some((item) => item.id === knight.id);
              return (
                <button
                  key={knight.id}
                  type="button"
                  onClick={() => onToggle(knight)}
                  className={cn(
                    "rounded-2xl border px-4 py-3 text-left transition",
                    isSelected
                      ? "border-emerald-500/70 bg-emerald-500/10 text-white"
                      : "border-emerald-500/20 bg-[rgba(6,24,35,0.85)] text-white/80 hover:border-emerald-500/40",
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-base font-semibold">{knight.name}</p>
                      <p className="text-xs uppercase tracking-[0.28em] text-white/60">{knight.role}</p>
                    </div>
                    <span
                      className={cn(
                        "text-xs font-semibold uppercase tracking-[0.3em]",
                        isSelected ? "text-emerald-300" : "text-white/50",
                      )}
                    >
                      {isSelected ? "Seated" : "Seat"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-white/70 line-clamp-2">{knight.goal}</p>
                  <p className="mt-1 text-[0.65rem] uppercase tracking-[0.3em] text-white/40">
                    Model: {knight.model} · Temp {knight.temperature.toFixed(1)}
                  </p>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}

