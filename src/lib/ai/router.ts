import Anthropic from "@anthropic-ai/sdk";
import Groq from "groq-sdk";
import type { DiffChange, RiskResult } from "@/types/diff";

export interface AIAnalysis {
  provider: "anthropic" | "groq";
  summary: string;
  recommendations: string[];
}

const PROMPT = (input: { changes: DiffChange[]; risk: RiskResult }) =>
  [
    "You are an API compatibility reviewer.",
    "Analyze the deterministic changes below. Do not invent changes that are not present.",
    "Return strict JSON with keys: summary (string), recommendations (string[]).",
    "Keep the summary under 80 words and recommendations to at most 4 items.",
    JSON.stringify({ risk: input.risk, changes: input.changes }),
  ].join("\n\n");

function parseResponse(text: string, provider: AIAnalysis["provider"]): AIAnalysis {
  try {
    const parsed = JSON.parse(text) as { summary?: unknown; recommendations?: unknown };
    return {
      provider,
      summary: typeof parsed.summary === "string" ? parsed.summary : "AI returned an invalid summary.",
      recommendations: Array.isArray(parsed.recommendations)
        ? parsed.recommendations.filter((i): i is string => typeof i === "string").slice(0, 4)
        : [],
    };
  } catch {
    return {
      provider,
      summary: text.slice(0, 600),
      recommendations: ["Review the deterministic diff before shipping the API change."],
    };
  }
}

async function analyzeWithGroq(input: { changes: DiffChange[]; risk: RiskResult }): Promise<AIAnalysis> {
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const response = await client.chat.completions.create({
    model: process.env.GROQ_MODEL ?? "qwen/qwen3.8-27b",
    max_tokens: 600,
    temperature: 0,
    response_format: { type: "json_object" },
    messages: [{ role: "user", content: PROMPT(input) }],
  });
  return parseResponse(response.choices[0]?.message?.content ?? "", "groq");
}

async function analyzeWithClaude(input: { changes: DiffChange[]; risk: RiskResult }): Promise<AIAnalysis> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514",
    max_tokens: 600,
    temperature: 0,
    messages: [{ role: "user", content: PROMPT(input) }],
  });
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return parseResponse(text, "anthropic");
}

export async function analyzeWithAI(input: { changes: DiffChange[]; risk: RiskResult }): Promise<AIAnalysis> {
  if (process.env.GROQ_API_KEY) return analyzeWithGroq(input);
  if (process.env.ANTHROPIC_API_KEY) return analyzeWithClaude(input);
  return {
    provider: "groq",
    summary: "No AI provider configured. Deterministic analysis is complete; add GROQ_API_KEY or ANTHROPIC_API_KEY to enable AI explanations.",
    recommendations: [
      "Review CRITICAL/HIGH changes first.",
      "Confirm removed properties and type changes with downstream consumers.",
    ],
  };
}
