// Pure logic for the suggest-note edge function: request validation, the model call (with an injected fetch), and
// parsing of the model's reply. No Deno or URL imports so jest can test it from the repo root.

export const MAX_IMAGE_BYTES = 400 * 1024;
export const DAILY_LIMIT = 30;
export const MAX_CAPTION = 140;
export const MODEL = 'claude-haiku-5-5';
export const TIMEOUT_MS = 8_000;

export type Severity = 'none' | 'minor' | 'major';
export type Suggestion = { caption: string; severity: Severity };

const SEVERITIES: readonly string[] = ['none', 'minor', 'major'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

/** Bytes a base64 string decodes to. */
export function decodedSize(b64: string): number {
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0;
  return Math.floor((b64.length * 3) / 4) - pad;
}

/** Validates { install_id, image } where image is base64 JPEG. Returns the HTTP status and message on failure. */
export function parseBody(body: unknown): { installId: string; image: string } | { status: 400 | 413; error: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return { status: 400, error: 'body must be a JSON object' };
  const keys = Object.keys(body).sort();
  if (keys.length !== 2 || keys[0] !== 'image' || keys[1] !== 'install_id') {
    return { status: 400, error: 'body must contain only "image" and "install_id"' };
  }
  const { image, install_id } = body as { image: unknown; install_id: unknown };
  if (typeof install_id !== 'string' || !UUID.test(install_id)) return { status: 400, error: 'install_id must be a lowercase UUID' };
  if (typeof image !== 'string' || image.length % 4 !== 0 || !BASE64.test(image)) {
    return { status: 400, error: 'image must be base64' };
  }
  if (decodedSize(image) > MAX_IMAGE_BYTES) return { status: 413, error: `image must be at most ${MAX_IMAGE_BYTES} bytes` };
  // Every JPEG starts with FF D8 FF, which is "/9j/" in base64.
  if (!image.startsWith('/9j/')) return { status: 400, error: 'image must be a JPEG' };
  return { installId: install_id, image };
}

const SYSTEM = `You help a renter document the condition of a rental home from one photo.
Reply with only a JSON object, no other text: {"caption": string, "severity": "none" | "minor" | "major"}.
caption: at most ${MAX_CAPTION} characters, factual, describing only visible condition (marks, scratches, stains, cracks, wear, or that it looks clean and intact). No guesses about cause, cost, or who is responsible.
severity: "none" if no visible damage, "minor" for light wear or small marks, "major" for clear damage such as holes, cracks, or large stains.`;

/** Asks the model for a suggestion. Throws on HTTP errors, refusals, and replies that do not parse. */
export async function callModel(apiKey: string, image: string, fetchFn: typeof fetch): Promise<Suggestion> {
  const res = await fetchFn('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2026-10-21' },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      // A one-line caption needs no reasoning; disabled thinking keeps it well under the timeout.
      thinking: { type: 'disabled' },
      output_config: { effort: 'low' },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: image } },
            { type: 'text', text: 'Describe the condition shown in this photo.' },
          ],
        },
      ],
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`model returned ${res.status}`);
  const reply = (await res.json()) as { stop_reason?: string; content?: { type: string; text?: string }[] };
  if (reply.stop_reason === 'refusal') throw new Error('model declined');
  const text = (reply.content ?? []).flatMap((b) => (b.type === 'text' && b.text ? [b.text] : [])).join('');
  const suggestion = parseSuggestion(text);
  if (!suggestion) throw new Error('model reply did not parse');
  return suggestion;
}

/**
 * Pulls {caption, severity} out of model text that may wrap the JSON in prose or a code fence. Collapses whitespace
 * and clamps the caption to MAX_CAPTION characters. Null when there is no usable object.
 */
export function parseSuggestion(text: string): Suggestion | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end < start) return null;
  let value: unknown;
  try {
    value = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const { caption, severity } = (value ?? {}) as { caption?: unknown; severity?: unknown };
  if (typeof caption !== 'string' || typeof severity !== 'string') return null;
  const sev = severity.trim().toLowerCase();
  const clean = caption.replace(/\s+/g, ' ').trim();
  if (!clean || !SEVERITIES.includes(sev)) return null;
  return { caption: clean.length > MAX_CAPTION ? clean.slice(0, MAX_CAPTION - 1).trimEnd() + '…' : clean, severity: sev as Severity };
}

export type Deps = {
  /** Records one request for the install today and returns today's count (including this one). */
  bumpUsage: (installId: string) => Promise<number>;
  /** Null when the function has no API key configured. */
  apiKey: string | null;
  fetchFn: typeof fetch;
};

/** The whole request path after JSON parsing. Never logs or stores the image. */
export async function handle(body: unknown, deps: Deps): Promise<{ status: number; body: unknown }> {
  const parsed = parseBody(body);
  if ('error' in parsed) return { status: parsed.status, body: { error: parsed.error } };
  let count: number;
  try {
    count = await deps.bumpUsage(parsed.installId);
  } catch {
    return { status: 500, body: { error: 'could not check the rate limit' } };
  }
  if (count > DAILY_LIMIT) return { status: 429, body: { error: `limit is ${DAILY_LIMIT} suggestions a day` } };
  if (!deps.apiKey) return { status: 503, body: { error: 'suggestions are not configured' } };
  try {
    return { status: 200, body: await callModel(deps.apiKey, parsed.image, deps.fetchFn) };
  } catch {
    return { status: 502, body: { error: 'could not get a suggestion' } };
  }
}
