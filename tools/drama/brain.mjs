// The brain for the drama tools on the command line: DeepSeek, OpenAI-compatible.
// The website uses lib/deepseek.ts (same env, same prices); this is its twin for
// scripts that cannot import TypeScript with path aliases.
//   DEEPSEEK_API_KEY   required
//   DEEPSEEK_MODEL     default deepseek-flash   (DeepSeek-V4.1-Flash-1017 is served under this name)
//   DEEPSEEK_BASE_URL  default https://api.deepseek.com
// Read .env.local yourself: `node --env-file=.env.local tools/drama/<tool>.mjs`.
export const MODEL = process.env.DEEPSEEK_MODEL || "deepseek-flash";
const BASE = (process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com").replace(/\/+$/, "");
/** USD per million tokens, peak-hour cache-miss prices (the dearest case). */
export const USD_PER_M = { input: 0.3, output: 1.2 };

export const configured = () => Boolean(process.env.DEEPSEEK_API_KEY);

/** One chat completion. `json` asks for a JSON object (say "JSON" in the prompt). Returns { text, usage, usd }. */
export async function chat({ system, user, messages, json = false, maxTokens = 8000, temperature = 0.8, timeoutMs = 240_000 }) {
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) throw new Error("DEEPSEEK_API_KEY is not set — run with `node --env-file=.env.local …` once the key is in .env.local.");
  const msgs = messages ?? [...(system ? [{ role: "system", content: system }] : []), { role: "user", content: user }];
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(`${BASE}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: MODEL, messages: msgs, temperature, max_tokens: maxTokens, stream: false, ...(json ? { response_format: { type: "json_object" } } : {}) }),
      signal: ctl.signal,
    });
  } finally { clearTimeout(t); }
  const body = await res.text();
  if (!res.ok) throw new Error(`DeepSeek ${res.status}: ${body.slice(0, 300)}`);
  const data = JSON.parse(body);
  const input = data.usage?.prompt_tokens ?? 0, output = data.usage?.completion_tokens ?? 0;
  return {
    text: data.choices?.[0]?.message?.content ?? "",
    finish: data.choices?.[0]?.finish_reason ?? "",
    usage: { input, output },
    usd: +((input * USD_PER_M.input + output * USD_PER_M.output) / 1e6).toFixed(5),
  };
}

/** Parse a JSON answer, forgiving a ```json fence. */
export function parseJson(text) {
  const m = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  return JSON.parse((m ? m[1] : text).trim());
}
