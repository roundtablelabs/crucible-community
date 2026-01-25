import { NextResponse } from "next/server";

// Map our model names to OpenRouter model IDs
// Note: These IDs may need to be updated based on actual OpenRouter model availability
const MODEL_ID_MAP: Record<string, string> = {
  "GPT-5.1": "openai/gpt-4o", // Fallback - update when GPT-5.1 is available
  "GPT-5.2": "openai/gpt-4o", // Fallback - update when GPT-5.2 is available
  "Claude Sonnet 4.5": "anthropic/claude-3.5-sonnet", // Update when 4.5 is available
  "DeepSeek-R1": "deepseek/deepseek-r1",
  "Gemini 2.5 Pro": "google/gemini-2.0-flash-exp", // Update to exact model ID
  "Grok 4": "x-ai/grok-beta", // Update when Grok 4 is available
};

interface OpenRouterModel {
  id: string;
  name: string;
  context_length: number;
  pricing: {
    prompt: string;
    completion: string;
    request?: string;
  };
  architecture?: {
    input_modalities?: string[];
    output_modalities?: string[];
  };
}

interface OpenRouterResponse {
  data: OpenRouterModel[];
}

// Convert context length to our context size scale
function getContextSize(contextLength: number): "very-large" | "large" | "medium" | "small" {
  if (contextLength >= 1000000) return "very-large";
  if (contextLength >= 200000) return "large";
  if (contextLength >= 32000) return "medium";
  return "small";
}

// Convert pricing to cost efficiency
function getCostEfficiency(
  promptPrice: string,
  completionPrice: string
): "high" | "medium" | "low" {
  const prompt = parseFloat(promptPrice) || 0;
  const completion = parseFloat(completionPrice) || 0;
  const avgPrice = (prompt + completion) / 2;

  // Rough thresholds based on typical pricing (per 1M tokens)
  if (avgPrice < 1) return "high"; // Very cheap
  if (avgPrice < 10) return "medium"; // Moderate
  return "low"; // Expensive
}

// Estimate reasoning depth based on model characteristics
function getReasoningDepth(model: OpenRouterModel): "high" | "medium" | "low" {
  // Premium reasoning models typically have "reasoning" in supported parameters
  // or are known reasoning models
  const reasoningModels = ["gpt-5.2", "deepseek-r1", "gemini-2.5-pro"];
  const modelId = model.id.toLowerCase();
  
  if (reasoningModels.some((m) => modelId.includes(m))) {
    return "high";
  }
  
  // Models with very large context are often reasoning-focused
  if (model.context_length >= 200000) {
    return "high";
  }
  
  return "medium";
}

// Estimate speed based on model characteristics
function getSpeed(model: OpenRouterModel): "fast" | "medium" | "slow" {
  // Smaller/faster models typically have lower context windows
  // and lower pricing (they're optimized for speed)
  if (model.context_length < 100000 && parseFloat(model.pricing.prompt) < 2) {
    return "fast";
  }
  
  // Very large context models are typically slower
  if (model.context_length >= 1000000) {
    return "slow";
  }
  
  return "medium";
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const modelNames = searchParams.get("models")?.split(",") || [];

    if (modelNames.length === 0) {
      return NextResponse.json(
        { error: "No models specified" },
        { status: 400 }
      );
    }

    // Fetch all models from OpenRouter
    const response = await fetch("https://openrouter.ai/api/v1/models", {
      headers: {
        "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || (typeof window !== "undefined" ? window.location.origin : ""),
        "X-Title": "Crucible",
      },
    });

    if (!response.ok) {
      throw new Error(`OpenRouter API error: ${response.status}`);
    }

    const data = (await response.json()) as OpenRouterResponse;
    const models = data.data || [];

    // Map our model names to OpenRouter data
    const capabilitiesMap: Record<string, {
      reasoningDepth: "high" | "medium" | "low";
      contextSize: "very-large" | "large" | "medium" | "small";
      speed: "fast" | "medium" | "slow";
      costEfficiency: "high" | "medium" | "low";
    }> = {};

    for (const modelName of modelNames) {
      const openRouterId = MODEL_ID_MAP[modelName];
      if (!openRouterId) {
        // Use defaults if model not found
        capabilitiesMap[modelName] = {
          reasoningDepth: "medium",
          contextSize: "medium",
          speed: "medium",
          costEfficiency: "medium",
        };
        continue;
      }

      const model = models.find((m) => m.id === openRouterId);
      if (!model) {
        // Use defaults if model not found in OpenRouter
        capabilitiesMap[modelName] = {
          reasoningDepth: "medium",
          contextSize: "medium",
          speed: "medium",
          costEfficiency: "medium",
        };
        continue;
      }

      capabilitiesMap[modelName] = {
        reasoningDepth: getReasoningDepth(model),
        contextSize: getContextSize(model.context_length),
        speed: getSpeed(model),
        costEfficiency: getCostEfficiency(
          model.pricing.prompt,
          model.pricing.completion
        ),
      };
    }

    return NextResponse.json({ capabilities: capabilitiesMap });
  } catch (error) {
    console.error("Error fetching OpenRouter model data:", error);
    return NextResponse.json(
      { error: "Failed to fetch model capabilities" },
      { status: 500 }
    );
  }
}

