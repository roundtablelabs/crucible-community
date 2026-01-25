"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { GlassCard } from "@/components/ui/glass-card";
import { InlineLoading } from "@/components/ui/InlineLoading";
import { useAuth } from "@/components/providers/AuthProvider";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api/client";

type KnightDetail = {
  id: string;
  name: string;
  role: string;
  prompt: string | null;
  goal: string;
  backstory: string;
  model: string;
  websearch_enabled: boolean;
  author: { name: string };
  verified: boolean;
  temperature: number;
};

type ParticipantInfo = {
  id: string;
  name: string;
  data: KnightDetail | undefined;
  isLoading: boolean;
};

type AssignedModelInfo = {
  provider?: string;
  model?: string;
  role?: string;
};

type KnightHoverTooltipProps = {
  knightId: string;
  isVisible: boolean;
  position: { x: number; y: number; height?: number };
  assignedModel?: AssignedModelInfo | null;
};

function KnightHoverTooltip({ knightId, isVisible, position, assignedModel }: KnightHoverTooltipProps) {
  const { token } = useAuth();
  const { data: knight, isLoading, error } = useQuery<KnightDetail>({
    queryKey: ["knight", knightId],
    queryFn: async () => {
      return apiFetch<KnightDetail>(`/knights/${encodeURIComponent(knightId)}`, {
        token: token ?? undefined,
        credentials: "include",
      });
    },
    enabled: isVisible && !!knightId,
  });

  if (!isVisible || !knightId) return null;

  const tooltipWidth = 300;
  const estimatedTooltipHeight = 250; // Approximate height of the tooltip
  const padding = 10;
  
  let finalLeft = position.x;
  
  if (finalLeft < tooltipWidth + padding) {
    finalLeft = tooltipWidth + padding;
  }

  // Calculate element position
  const elementTop = position.y;
  const elementHeight = position.height || 86; // Default height if not provided
  const elementBottom = elementTop + elementHeight;
  const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  
  // Start by aligning tooltip with the top of the element
  let tooltipTop = elementTop;
  
  // Check if tooltip would go below viewport
  const tooltipBottom = tooltipTop + estimatedTooltipHeight;
  if (tooltipBottom > viewportHeight - padding) {
    // Shift up just enough to keep it visible, but keep it aligned with the element as much as possible
    tooltipTop = Math.max(padding, viewportHeight - estimatedTooltipHeight - padding);
    // Don't let it go above the element unless absolutely necessary
    if (tooltipTop > elementTop) {
      tooltipTop = elementTop;
    }
  }
  
  // Ensure tooltip doesn't go above viewport
  if (tooltipTop < padding) {
    tooltipTop = padding;
  }
  
  const transform = 'translateX(-100%)';

  return (
    <div
      className="fixed z-[100] pointer-events-none"
      style={{ 
        left: `${finalLeft}px`, 
        top: `${tooltipTop}px`,
        transform: transform,
        width: `${tooltipWidth}px`
      }}
    >
      <GlassCard variant="elevated" className="p-4 max-w-sm">
        {isLoading && (
          <InlineLoading size="md" text="Loading..." />
        )}
        {error && (
          <div className="text-sm text-rose-400">Failed to load knight details</div>
        )}
        {knight && (
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-semibold text-base-text">{knight.name}</h4>
              <p className="text-xs text-base-subtext">{knight.role}</p>
            </div>
            {knight.goal && (
              <div>
                <p className="text-xs font-medium text-base-subtext mb-1">Goal</p>
                <p className="text-xs text-base-text">{knight.goal}</p>
              </div>
            )}
            {knight.backstory && (
              <div>
                <p className="text-xs font-medium text-base-subtext mb-1">Backstory</p>
                <p className="text-xs text-base-text line-clamp-3">{knight.backstory}</p>
              </div>
            )}
            {knight.prompt && (
              <div>
                <p className="text-xs font-medium text-base-subtext mb-1">Prompt</p>
                <p className="text-xs text-base-text line-clamp-3">{knight.prompt}</p>
              </div>
            )}
            <div className="flex items-center gap-4 text-xs text-base-subtext pt-2 border-t border-base-divider">
              {assignedModel?.model ? (
                <div className="flex flex-col gap-1">
                  <span>Model: <span className="font-medium text-base-text">{assignedModel.model}</span></span>
                  {assignedModel.provider && (
                    <span className="text-[10px] text-base-subtext/70">Provider: {assignedModel.provider}</span>
                  )}
                  <span className="text-[10px] text-base-subtext/50 italic">(Auto-assigned for this session)</span>
                </div>
              ) : (
                <span>Model: {knight.model} <span className="text-[10px] text-base-subtext/50 italic">(default)</span></span>
              )}
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

type ParticipantDrawerProps = {
  isOpen: boolean;
  onClose: () => void;
  participants: ParticipantInfo[];
  hoveredKnightId: string | null;
  onHoverKnight: (knightId: string | null) => void;
  assignedModels?: Map<string, AssignedModelInfo> | null;
};

export function ParticipantDrawer({ isOpen, onClose, participants, hoveredKnightId, onHoverKnight, assignedModels }: ParticipantDrawerProps) {
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number; height?: number }>({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleMouseEnter = (e: React.MouseEvent, knightId: string) => {
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltipPosition({ x: rect.left, y: rect.top, height: rect.height });
    onHoverKnight(knightId);
  };

  const handleMouseLeave = () => {
    onHoverKnight(null);
  };

  if (!mounted) return null;

  const drawerContent = (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 transition-opacity"
          style={{ 
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            margin: 0,
            padding: 0
          }}
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={cn(
          "fixed right-0 top-0 h-full w-80 bg-base-panel border-l border-base-divider shadow-2xl z-50 transform transition-transform duration-300 ease-in-out",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
        style={{ position: 'fixed' }}
      >
        <GlassCard variant="elevated" className="h-full flex flex-col p-0">
          {/* Drawer Header */}
          <div className="flex items-center justify-between p-4 border-b border-base-divider">
            <h3 className="text-lg font-semibold text-base-text">Participants</h3>
            <button
              onClick={onClose}
              className="flex items-center justify-center p-1.5 rounded-md text-base-subtext hover:text-base-text hover:bg-base-bg/50 transition-colors min-h-[44px] min-w-[44px]"
              aria-label="Close drawer"
            >
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>

          {/* Participants List */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
            {participants.length === 0 ? (
              <p className="text-sm text-base-subtext">No participants found</p>
            ) : (
              participants.map((participant) => (
                <div
                  key={participant.id}
                  onMouseEnter={(e) => handleMouseEnter(e, participant.id)}
                  onMouseLeave={handleMouseLeave}
                  className="p-3 rounded-lg border border-base-divider bg-base-bg/40 hover:bg-base-bg/60 transition-colors cursor-pointer"
                >
                  <div className="flex flex-col gap-1">
                    <span className="text-sm font-medium text-base-text">
                      {participant.isLoading ? (
                        <InlineLoading size="sm" text="Loading..." />
                      ) : (
                        participant.name
                      )}
                    </span>
                    {participant.data?.role && (
                      <span className="text-xs text-base-subtext">{participant.data.role}</span>
                    )}
                    <span className="font-mono text-xs text-base-subtext/60">{participant.id}</span>
                    {(() => {
                      const assignedModel = assignedModels?.get(participant.id);
                      if (assignedModel?.model) {
                        return (
                          <span className="text-xs text-cyan-400/80 mt-1">
                            Model: {assignedModel.model}
                            {assignedModel.provider && ` (${assignedModel.provider})`}
                          </span>
                        );
                      }
                      return null;
                    })()}
                  </div>
                </div>
              ))
            )}
          </div>
        </GlassCard>
      </div>

      {/* Hover Tooltip - Outside drawer so it's not clipped */}
      <KnightHoverTooltip
        knightId={hoveredKnightId || ""}
        isVisible={!!hoveredKnightId}
        position={tooltipPosition}
        assignedModel={hoveredKnightId ? assignedModels?.get(hoveredKnightId) : null}
      />
    </>
  );

  return createPortal(drawerContent, document.body);
}

