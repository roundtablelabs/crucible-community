import OpenAI from "openai";

let openaiClient: OpenAI | null = null;

export function getOpenAI(): OpenAI {
  if (openaiClient) {
    return openaiClient;
  }

  const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
  
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY or OPENROUTER_API_KEY must be set in environment variables"
    );
  }

  const baseURL = process.env.OPENROUTER_BASE_URL || process.env.OPENAI_BASE_URL;
  
  openaiClient = new OpenAI({
    apiKey,
    baseURL: baseURL || "https://api.openai.com/v1",
    defaultHeaders: process.env.OPENROUTER_API_KEY
      ? {
          "HTTP-Referer": process.env.OPENROUTER_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : ""),
          "X-Title": process.env.OPENROUTER_APP_TITLE || "Crucible",
        }
      : undefined,
  });

  return openaiClient;
}
