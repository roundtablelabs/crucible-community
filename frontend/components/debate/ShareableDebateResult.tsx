"use client";

import { useState, useEffect } from "react";
import { Share2, Copy, Check, Users, MessageSquare, Mail } from "lucide-react";
import { generateDebateShareOptions, openShareDialog, type SharePlatform } from "@/lib/utils/socialShare";
import { getApiBaseUrl } from "@/lib/api/client";
import { useAuth } from "@/components/providers/AuthProvider";

type DebateParticipant = {
  name: string;
  role?: string;
};

type ShareableDebateResultProps = {
  sessionId: string;
  topic?: string;
  recommendation?: string;
  participants?: DebateParticipant[];
  variant?: "modal" | "inline" | "compact";
  onShare?: (platform: SharePlatform) => void;
};

export function ShareableDebateResult({
  sessionId,
  topic,
  recommendation,
  participants = [],
  variant = "modal",
  onShare,
}: ShareableDebateResultProps) {
  const [showShareMenu, setShowShareMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [isGeneratingToken, setIsGeneratingToken] = useState(false);
  const { token } = useAuth();

  // Generate share token on demand when user wants to share
  const ensureShareToken = async () => {
    if (shareToken) return shareToken;
    if (isGeneratingToken) return null;
    
    await generateShareToken();
    return shareToken;
  };

  const generateShareToken = async () => {
    if (!token || isGeneratingToken) return;
    
    setIsGeneratingToken(true);
    try {
      const baseUrl = getApiBaseUrl();
      const jwtToken = token.includes('.') && token.split('.').length === 3 
        ? token 
        : await (await import("@/lib/auth/client-token")).ensureJWTToken(token);
      
      if (!jwtToken) {
        console.error("Failed to get JWT token for share token generation");
        return;
      }

      const response = await fetch(`${baseUrl}/sessions/${sessionId}/share-token?expires_days=30`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${jwtToken}`,
          "Content-Type": "application/json",
        },
      });

      if (response.ok) {
        const data = await response.json();
        setShareToken(data.token);
      } else {
        console.error("Failed to generate share token:", await response.text());
      }
    } catch (error) {
      console.error("Error generating share token:", error);
    } finally {
      setIsGeneratingToken(false);
    }
  };

  const getShareUrl = () => {
    const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
    if (shareToken) {
      return `${baseUrl}/app/sessions/${sessionId}/shared/${shareToken}`;
    }
    // Fallback to regular URL if token not available
    return `${baseUrl}/app/sessions/${sessionId}/output`;
  };

  const shareOptions = generateDebateShareOptions({
    id: sessionId,
    topic,
    recommendation,
    agents: participants.map((p) => ({ name: p.name })),
  });

  // Override URL with shared URL if token is available
  const finalShareOptions = {
    ...shareOptions,
    url: getShareUrl(),
  };

  const handleShare = async (platform: SharePlatform | "email", event?: React.MouseEvent) => {
    // Prevent default to maintain focus
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    
    if (platform === "email") {
      // Ensure token is generated before email share
      await ensureShareToken();
      handleEmailShare();
      return;
    }

    // Ensure token is generated before sharing
    await ensureShareToken();
    
    // For copy, ensure we maintain focus
    if (platform === "copy") {
      // Focus the window/document before copying
      if (window.focus) {
        window.focus();
      }
      
      // Use requestAnimationFrame to ensure focus is set before copying
      requestAnimationFrame(async () => {
        await openShareDialog(platform, finalShareOptions);

        // Call custom handler if provided
        if (onShare) {
          onShare(platform);
        }

        // Handle copy feedback
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
          setShowShareMenu(false);
        }, 2000);
      });
    } else {
      await openShareDialog(platform, finalShareOptions);

      // Call custom handler if provided
      if (onShare) {
        onShare(platform);
      }

      setShowShareMenu(false);
    }
  };

  const handleEmailShare = () => {
    const shareUrl = getShareUrl();
    const question = topic || "AI debate";
    const recommendationText = recommendation 
      ? `\n\nRecommendation: ${recommendation.slice(0, 150)}...` 
      : "";
    const agents = participants.length > 0 
      ? `\n\nAgents: ${participants.map((p) => p.name).join(", ")}`
      : "";
    
    const subject = encodeURIComponent(`AI Debate: ${question}`);
    const body = encodeURIComponent(
      `I wanted to share this AI debate result with you:\n\n` +
      `Question: ${question}${recommendationText}${agents}\n\n` +
      `View the full debate: ${shareUrl}\n\n` +
      `Powered by Crucible`
    );
    
    window.location.href = `mailto:?subject=${subject}&body=${body}`;

    if (onShare) {
      onShare("email" as SharePlatform);
    }

    setShowShareMenu(false);
  };

  const shareButtons = [
    {
      platform: "email" as "email",
      label: "Email",
      icon: Mail,
      color: "hover:border-blue-500/60 hover:text-blue-400",
    },
    {
      platform: "copy" as SharePlatform,
      label: copied ? "Copied!" : "Copy Link",
      icon: copied ? Check : Copy,
      color: copied ? "border-emerald-500/60 text-emerald-400" : "hover:border-gold-500/60 hover:text-gold-500",
    },
  ];

  // Extract key insights from recommendation
  const keyInsight = recommendation
    ? recommendation.length > 200
      ? `${recommendation.slice(0, 200)}...`
      : recommendation
    : "AI-powered debate completed";

  if (variant === "inline") {
    return (
      <div className="flex items-center gap-2">
        {shareButtons.map(({ platform, label, icon: Icon, color }) => (
          <button
            key={platform}
            type="button"
            onClick={(e) => handleShare(platform as SharePlatform | "email", e)}
            className={`inline-flex items-center gap-2 rounded-full border border-base-divider/60 bg-base-bg/80 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.22em] text-base-subtext transition ${color}`}
            aria-label={`Share on ${label}`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>
    );
  }

  if (variant === "compact") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-base-subtext">Share</span>
        {shareButtons.map(({ platform, label, icon: Icon, color }) => (
          <button
            key={platform}
            type="button"
            onClick={(e) => handleShare(platform as SharePlatform | "email", e)}
            className={`inline-flex items-center justify-center rounded border border-base-divider/60 bg-base-bg/80 p-1.5 text-base-subtext transition ${color}`}
            aria-label={`Share on ${label}`}
            title={label}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setShowShareMenu(!showShareMenu)}
        className="inline-flex items-center gap-2 rounded-full border border-base-divider/60 bg-base-bg/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.24em] text-base-subtext transition hover:border-gold-500/60 hover:text-gold-500"
        aria-label="Share debate result"
      >
        <Share2 className="h-4 w-4" aria-hidden="true" />
        Share Debate
      </button>

      {showShareMenu && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setShowShareMenu(false)}
            aria-hidden="true"
          />

          {/* Share Menu */}
          <div className="absolute right-0 top-full mt-2 z-50 w-72 rounded-2xl border border-base-divider/60 bg-base-panel/95 p-2 shadow-[0_24px_50px_rgba(0,0,0,0.35)] backdrop-blur-sm">
            <div className="space-y-1">
              {shareButtons.map(({ platform, label, icon: Icon, color }) => (
                <button
                  key={platform}
                  type="button"
                  onClick={(e) => handleShare(platform as SharePlatform | "email", e)}
                  className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-base-text transition ${color} hover:bg-base-bg/80`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </div>

            {/* Debate Preview */}
            <div className="mt-3 pt-3 border-t border-base-divider/40">
              <div className="rounded-xl border border-base-divider/40 bg-base-bg/80 p-3 text-xs space-y-3">
                {topic && (
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <MessageSquare className="h-3.5 w-3.5 text-gold-500" />
                      <p className="font-semibold text-base-text">Question</p>
                    </div>
                    <p className="text-base-subtext/80 line-clamp-2">{topic}</p>
                  </div>
                )}

                {keyInsight && (
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="h-3.5 w-3.5 text-gold-500" />
                      <p className="font-semibold text-base-text">Key Insight</p>
                    </div>
                    <p className="text-base-subtext/80 line-clamp-3">{keyInsight}</p>
                  </div>
                )}

                {participants.length > 0 && (
                  <div>
                    <p className="font-semibold text-base-text mb-1">Participants</p>
                    <div className="flex flex-wrap gap-1">
                      {participants.slice(0, 3).map((participant) => (
                        <span
                          key={`participant-${participant.name}-${participants.indexOf(participant)}`}
                          className="inline-flex items-center rounded-full border border-base-divider/40 bg-base-panel/80 px-2 py-0.5 text-[0.65rem] text-base-subtext/80"
                        >
                          {participant.name}
                        </span>
                      ))}
                      {participants.length > 3 && (
                        <span 
                          key="participants-more"
                          className="inline-flex items-center rounded-full border border-base-divider/40 bg-base-panel/80 px-2 py-0.5 text-[0.65rem] text-base-subtext/80"
                        >
                          +{participants.length - 3} more
                        </span>
                      )}
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-base-divider/30">
                  <p className="text-[0.65rem] uppercase tracking-[0.22em] text-base-subtext/60">
                    Powered by Crucible
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

