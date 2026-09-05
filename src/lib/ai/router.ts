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

const AI_TIMEOUT_MS = 20_000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("AI provider timed out")), ms),
    ),
  ]);
}

async function analyzeWithGroq(input: { changes: DiffChange[]; risk: RiskResult }): Promise<AIAnalysis> {
  const client = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const response = await withTimeout(
    client.chat.completions.create({
      model: process.env.GROQ_MODEL ?? "llama-3.3-70b-versatile",
      max_tokens: 600,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: PROMPT(input) }],
    }),
    AI_TIMEOUT_MS,
  );
  return parseResponse(response.choices[0]?.message?.content ?? "", "groq");
}

async function analyzeWithClaude(input: { changes: DiffChange[]; risk: RiskResult }): Promise<AIAnalysis> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await withTimeout(
    client.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514",
      max_tokens: 600,
      temperature: 0,
      messages: [{ role: "user", content: PROMPT(input) }],
    }),
    AI_TIMEOUT_MS,
  );
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  return parseResponse(text, "anthropic");
}

/**
 * Attempts AI analysis. Returns null on any failure so the deterministic
 * diff result is always returned to the caller regardless of AI availability.
 * Never exposes provider API keys or internal error details.
 */
export async function analyzeWithAI(
  input: { changes: DiffChange[]; risk: RiskResult },
): Promise<AIAnalysis | null> {
  if (!process.env.GROQ_API_KEY && !process.env.ANTHROPIC_API_KEY) return null;
  try {
    if (process.env.GROQ_API_KEY) return await analyzeWithGroq(input);
    if (process.env.ANTHROPIC_API_KEY) return await analyzeWithClaude(input);
  } catch {
    // AI failure must never crash the analysis — return null silently.
    // The caller will surface "AI explanation unavailable" to the user.
  }
  return null;
}
