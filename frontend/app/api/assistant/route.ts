import { NextRequest, NextResponse } from "next/server";
import { getOpenAI } from "@/lib/openai";
import type { ConversationData, KnightRecommendation } from "@/features/sessions/types";

type AssistantRequest =
  | {
    step: "summarize";
    payload: ConversationData;
  }
  | {
    step: "recommend";
    payload: ConversationData;
  };

type AssistantResponse =
  | { summary: string }
  | { knights: KnightRecommendation[] };

const LOW_COST_MODEL = "gpt-4o-mini";

export async function POST(request: NextRequest) {
  let body: AssistantRequest;
  try {
    body = (await request.json()) as AssistantRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not configured" }, { status: 500 });
  }

  try {
    const client = getOpenAI();

    if (body.step === "summarize") {
      const response = await client.chat.completions.create({
        model: LOW_COST_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are a helpful assistant that rewrites meeting prep information into a concise summary the host can confirm.",
          },
          {
            role: "user",
            content: `Topic: ${body.payload.topic}\nGoal: ${body.payload.goal}\nConstraints: ${body.payload.constraints ||
              "None"}\nArtifacts: ${body.payload.artifacts.join(", ") || "None"}`,
          },
        ],
        temperature: 0.2,
        max_tokens: 300,
      });

      const summary = response.choices[0]?.message?.content?.trim() ?? "Summary unavailable.";
      const result: AssistantResponse = { summary };
      return NextResponse.json(result);
    }

    if (body.step === "recommend") {
      const response = await client.chat.completions.create({
        model: LOW_COST_MODEL,
        messages: [
          {
            role: "system",
            content:
              "You are an AI chief of staff who selects 3-5 AI Knights (specialist agents) for a roundtable session. Return a JSON object with a 'knights' key containing an array of knights. Each knight has id, name, role, and reason. Prefer official names when possible. Keep the list concise.",
          },
          {
            role: "user",
            content: `Topic: ${body.payload.topic}\nGoal: ${body.payload.goal}\nConstraints: ${body.payload.constraints ||
              "None"}\nArtifacts: ${body.payload.artifacts.join(", ") || "None"}\nSummary: ${body.payload.summary}`,
          },
        ],
        temperature: 0.4,
        max_tokens: 500,
        response_format: { type: "json_object" },
      });

      let knights: KnightRecommendation[] = [];
      const content = response.choices[0]?.message?.content;

      if (content) {
        try {
          const parsed = JSON.parse(content);
          // Handle both array root (if model ignores json_object constraint slightly) or object root
          const list = Array.isArray(parsed) ? parsed : parsed.knights || parsed.recommendations || [];

          if (Array.isArray(list)) {
            knights = list.map((knight: any) => ({
              id: knight.id ?? createId(),
              name: knight.name,
              role: knight.role,
              reason: knight.reason,
            }));
          }
        } catch (error) {
          console.error("Failed to parse knight recommendations", error);
        }
      }

      if (knights.length === 0) {
        knights = buildFallbackKnights(body.payload);
      }

      const result: AssistantResponse = {
        knights: knights.slice(0, 5),
      };
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unsupported step" }, { status: 400 });
  } catch (error) {
    console.error("Assistant API error", error);
    return NextResponse.json({ error: "Assistant request failed" }, { status: 500 });
  }
}

function createId() {
  return Math.random().toString(36).slice(2, 10);
}

function buildFallbackKnights(data: ConversationData): KnightRecommendation[] {
  const fallback: KnightRecommendation[] = [
    {
      id: "law_regulatory_v1",
      name: "Compliance Counsel",
      role: "Risk & Compliance",
      reason: "Balances constraints and ensures defensible decisions.",
    },
    {
      id: "macro_strategy_v1",
      name: "Market Strategist",
      role: "Strategy",
      reason: "Aligns the goal with broader market implications.",
    },
    {
      id: "delivery_ops_v1",
      name: "Delivery Ops",
      role: "Operations",
      reason: "Checks feasibility against current execution capacity.",
    },
  ];

  if (data.artifacts.some((item) => item.toLowerCase().includes("budget"))) {
    fallback.push({
      id: "finance_controller_v1",
      name: "Finance Controller",
      role: "Finance",
      reason: "Artifacts reference budget, so finance oversight is helpful.",
    });
  }

  return fallback;
}
