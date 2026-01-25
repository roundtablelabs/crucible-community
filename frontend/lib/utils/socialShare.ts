/**
 * Social media sharing utilities
 * Supports Twitter, LinkedIn, Facebook sharing with platform-specific optimization
 * 
 * Note: Sharing TO LinkedIn (using their share API) is allowed and compliant.
 * This is different from promoting LinkedIn verification.
 */

export type SharePlatform = "twitter" | "linkedin" | "facebook" | "copy" | "email";

export interface ShareOptions {
  url: string;
  title?: string;
  text?: string;
  twitterText?: string; // Platform-specific text
  linkedinText?: string;
  facebookText?: string;
  hashtags?: string[];
  via?: string; // Twitter username
  imageUrl?: string;
}

/**
 * Generate platform-optimized share text
 */
export function generateShareText(
  platform: SharePlatform,
  options: ShareOptions
): string {
  const { title, text, hashtags, via } = options;
  const hashtagStr = hashtags && hashtags.length > 0 ? ` ${hashtags.map((h) => `#${h}`).join(" ")}` : "";
  const viaStr = via && platform === "twitter" ? ` via @${via}` : "";

  // Platform-specific character limits and formatting
  switch (platform) {
    case "twitter":
      // Twitter: ~280 characters (URLs count as ~23)
      const twitterText = options.twitterText || text || title || "";
      // Calculate available space: 280 total - 23 for URL - hashtags - via - some buffer
      const urlLength = options.url.length > 23 ? 23 : options.url.length;
      const twitterMax = 280 - urlLength - hashtagStr.length - viaStr.length - 5; // -5 for spaces and buffer
      // Don't truncate if text is already optimized for Twitter
      if (options.twitterText && twitterText.length <= twitterMax) {
        return `${twitterText}${hashtagStr}${viaStr}`.trim();
      }
      return `${twitterText.slice(0, twitterMax)}${hashtagStr}${viaStr}`.trim();

    case "linkedin":
      // LinkedIn: No strict limit, but ~300-600 chars work best
      const linkedinText = options.linkedinText || text || title || "";
      return `${linkedinText}${hashtagStr}`.trim();

    case "facebook":
      // Facebook: Similar to LinkedIn
      const facebookText = options.facebookText || text || title || "";
      return `${facebookText}${hashtagStr}`.trim();

    case "copy":
      // For copy to clipboard - include full text
      return `${text || title || ""}${hashtagStr}${viaStr} ${options.url}`.trim();

    default:
      return text || title || "";
  }
}

/**
 * Generate share URL for a platform
 */
export function generateShareUrl(platform: SharePlatform, options: ShareOptions): string {
  const shareText = generateShareText(platform, options);
  const encodedUrl = encodeURIComponent(options.url);
  const encodedText = encodeURIComponent(shareText);
  const encodedTitle = options.title ? encodeURIComponent(options.title) : "";

  switch (platform) {
    case "twitter":
      const hashtags = options.hashtags?.map((h) => h.replace("#", "")).join(",") || "";
      const via = options.via ? `&via=${options.via}` : "";
      const hashtagParam = hashtags ? `&hashtags=${encodeURIComponent(hashtags)}` : "";
      return `https://twitter.com/intent/tweet?text=${encodedText}&url=${encodedUrl}${hashtagParam}${via}`;

    case "linkedin":
      // LinkedIn share API - sharing TO LinkedIn is allowed
      return `https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}${encodedTitle ? `&title=${encodedTitle}` : ""}`;

    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}${encodedText ? `&quote=${encodedText}` : ""}`;

    case "copy":
      // Return empty string for copy - handled separately
      return "";

    default:
      return "";
  }
}

/**
 * Copy text to clipboard with focus handling
 */
async function copyToClipboard(text: string): Promise<boolean> {
  try {
    // Ensure document is focused
    if (document.hasFocus && !document.hasFocus()) {
      window.focus();
    }
    
    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    
    // Fallback: use execCommand for older browsers
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    
    try {
      const successful = document.execCommand("copy");
      document.body.removeChild(textArea);
      return successful;
    } catch (err) {
      document.body.removeChild(textArea);
      throw err;
    }
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.error("Failed to copy to clipboard:", err);
    }
    return false;
  }
}

/**
 * Open share dialog for a platform
 */
export async function openShareDialog(platform: SharePlatform, options: ShareOptions): Promise<void> {
  if (platform === "copy") {
    const text = generateShareText(platform, options);
    await copyToClipboard(text);
    return;
  }

  const shareUrl = generateShareUrl(platform, options);
  if (shareUrl) {
    window.open(shareUrl, "_blank", "width=600,height=400,noopener,noreferrer");
  }
}

/**
 * Generate share options for a debate result
 */
export function generateDebateShareOptions(session: {
  id: string;
  topic?: string;
  recommendation?: string;
  agents?: Array<{ name: string }>;
}): ShareOptions {
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const sessionUrl = `${baseUrl}/app/sessions/${session.id}/output`;
  const question = session.topic || "AI debate";
  const recommendation = session.recommendation ? `\n\nRecommendation: ${session.recommendation.slice(0, 150)}...` : "";
  const agents = session.agents && session.agents.length > 0 
    ? `\n\nAgents: ${session.agents.map((a) => a.name).join(", ")}`
    : "";
  
  // Platform-specific share text
  const shareText = `Just completed an AI debate on "${question}"${recommendation}\n\nPowered by Crucible`;
  
  // Twitter-optimized text (shorter, more engaging, single line for better display)
  const recommendationPreview = session.recommendation 
    ? session.recommendation.slice(0, 120).replace(/\n/g, ' ').trim()
    : 'See the full analysis';
  const questionPreview = question.length > 80 ? question.slice(0, 80) + '...' : question;
  const twitterText = `🤖 AI Debate: "${questionPreview}" ${recommendationPreview}${session.recommendation && session.recommendation.length > 120 ? '...' : ''}`;
  
  // LinkedIn-optimized text (professional, detailed)
  const linkedinRecommendation = session.recommendation 
    ? session.recommendation.slice(0, 250).replace(/\n/g, ' ').trim()
    : 'The AI agents analyzed the question from multiple perspectives.';
  const linkedinText = `I just completed an AI-powered debate on "${question}" using Crucible.\n\nKey Insight: ${linkedinRecommendation}${session.recommendation && session.recommendation.length > 250 ? '...' : ''}\n\nThis demonstrates how AI can help with strategic decision-making by bringing diverse viewpoints together.`;
  
  // Facebook-optimized text (conversational, engaging)
  const facebookRecommendation = session.recommendation 
    ? session.recommendation.slice(0, 180).replace(/\n/g, ' ').trim()
    : 'The AI agents had a fascinating discussion from multiple angles.';
  const facebookText = `Just ran an AI debate on "${question}" using Crucible! 🤖\n\nHere's what the AI concluded: ${facebookRecommendation}${session.recommendation && session.recommendation.length > 180 ? '...' : ''}\n\nCheck out the full debate and see how AI can help with complex decisions!`;

  return {
    url: sessionUrl,
    title: `AI Debate: ${question}`,
    text: shareText, // Default text
    twitterText, // Platform-specific
    linkedinText,
    facebookText,
    hashtags: ["Crucible", "AIDebate", "DecisionMaking"],
    imageUrl: `${baseUrl}/api/sessions/${session.id}/share?image=1`,
  };
}

