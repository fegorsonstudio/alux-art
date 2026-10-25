import "server-only";

/**
 * DeepSeek is the BRAIN of Alux Micro Drama (owner, 2026-10-25): the model
 * that writes stories, breaks episodes into scenes and writes picture prompts.
 * It replaces ChatGPT in the Higgsfield workflow we learnt from
 * (tools/drama/skills/). Images stay on fal (fal-ai/nano-banana-2/edit).
 *
 * The API is OpenAI-compatible. The owner asked for "deepseek-v4.1-flash-1017":
 * DeepSeek serves that version under the name `deepseek-flash`
 * (api-docs.deepseek.com/quick_start/pricing, read 2026-10-25). Set
 * DEEPSEEK_MODEL to pin another name.
 *
 *   DEEPSEEK_API_KEY   required — nothing here runs without it
 *   DEEPSEEK_MODEL     default deepseek-flash
 *   DEEPSEEK_BASE_URL  default https://api.deepseek.com
 *
 * Every call reports the tokens it used and what they cost, so the budget
 * (lib/drama/budget.ts) can be checked against real spend.
 */

export const DEEPSEEK_DEFAULT_MODEL = "deepseek-flash";
const BASE = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");

/** USD per million tokens, peak-hour cache-miss prices — the dearest case, so estimates never run under. */
export const DEEPSEEK_USD_PER_M = { input: 0.3, output: 1.2 } as const;

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type ChatResult = {
  text: string;
  model: string;
  usage: { input: number; output: number };
  usd: number;
  finish: string;
};

export class DeepSeekError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`DeepSeek ${status}: ${body.slice(0, 300)}`);
    this.status = status;
    this.body = body;
  }
}

export const deepseekConfigured = () => Boolean(process.env.DEEPSEEK_API_KEY);

/**
 * One chat completion. `json: true` asks the model for a JSON object (the
 * prompt must say "JSON" somewhere, as the API requires) and the text is the
 * raw JSON string — parse it with `parseJson` below, which forgives a stray
 * code fence.
 */
export async function deepseekChat(opts: {
  messages: ChatMessage[];
  json?: boolean;
  maxTokens?: number;
  temperature?: number;
  model?: string;
  timeoutMs?: number;
}): Promise<ChatResult> {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY is not set — add it to .env.local before the brain can run.");
  const model = opts.model || process.env.DEEPSEEK_MODEL || DEEPSEEK_DEFAULT_MODEL;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), opts.timeoutMs ?? 180_000);
  let res: Response;
  try {
    res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: opts.messages,
        temperature: opts.temperature ?? 0.8,
        max_tokens: opts.maxTokens ?? 8000,
        ...(opts.json ? { response_format: { type: "json_object" } } : {}),
        stream: false,
      }),
      signal: ctl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
  const body = await res.text();
  if (!res.ok) throw new DeepSeekError(res.status, body);
  const data = JSON.parse(body) as {
    model?: string;
    choices?: { message?: { content?: string }; finish_reason?: string }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  const text = data.choices?.[0]?.message?.content ?? "";
  const input = data.usage?.prompt_tokens ?? 0;
  const output = data.usage?.completion_tokens ?? 0;
  return {
    text,
    model: data.model ?? model,
    usage: { input, output },
    usd: +((input * DEEPSEEK_USD_PER_M.input + output * DEEPSEEK_USD_PER_M.output) / 1e6).toFixed(5),
    finish: data.choices?.[0]?.finish_reason ?? "",
  };
}

/** Parse a model's JSON answer, tolerating a ```json fence around it. */
export function parseJson<T = unknown>(text: string): T {
  const m = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const raw = (m ? m[1] : text).trim();
  return JSON.parse(raw) as T;
}
