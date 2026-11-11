// Pure logic for the verify page. No DOM access, so jest can test it from the repo root.

const CODE_RE = /^[0-9a-f]{12,64}$/;

export function toHex(buffer) {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function isValidCode(code) {
  return typeof code === 'string' && CODE_RE.test(code);
}

// Code comes from `?code=` or the last segment of `/v/<code>`. Returns null when absent or invalid.
export function parseCode(pathname, search) {
  const fromQuery = new URLSearchParams(search).get('code');
  if (fromQuery !== null) return isValidCode(fromQuery) ? fromQuery : null;
  const match = /^\/v\/([^/]+)\/?$/.exec(pathname);
  return match && isValidCode(match[1]) ? match[1] : null;
}

// Viewer's local time, with the time zone name, e.g. "November 9, 2026 at 3:04:05 PM Central Standard Time".
export function formatTime(iso) {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'long',
  });
}

// kind: 'code' | 'photo'. result: { status: 'found', serverTime } | { status: 'notfound' } | { status: 'error' }
export function message(kind, result) {
  if (result.status === 'found') {
    const when = formatTime(result.serverTime);
    return kind === 'photo'
      ? `This photo existed on the server at ${when}.`
      : `This inspection's photo set was registered on the server at ${when}.`;
  }
  if (result.status === 'notfound') {
    return kind === 'photo' ? 'No receipt found for this photo.' : 'No receipt found for this code.';
  }
  return 'Could not reach the verification server. Please try again later.';
}

function rpc(name, body, config, fetchImpl) {
  return fetchImpl(`${config.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: config.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${config.SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(body),
  });
}

// Calls the lookup_receipt RPC. Only the hash (or its prefix) is sent.
export async function lookup(hash, config, fetchImpl = fetch) {
  try {
    const res = await rpc('lookup_receipt', { p_hash: hash }, config, fetchImpl);
    if (!res.ok) return { status: 'error' };
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0
      ? { status: 'found', serverTime: rows[0].server_time }
      : { status: 'notfound' };
  } catch {
    return { status: 'error' };
  }
}

// Acknowledgement links carry the full manifest hash, so nobody can acknowledge by guessing a short code.
const HASH_RE = /^[0-9a-f]{64}$/;

// Hash comes from `?h=` or `/a/<hash>`. Returns null when absent or invalid.
export function parseAckHash(pathname, search) {
  const fromQuery = new URLSearchParams(search).get('h');
  if (fromQuery !== null) return HASH_RE.test(fromQuery) ? fromQuery : null;
  const match = /^\/a\/([^/]+)\/?$/.exec(pathname);
  return match && HASH_RE.test(match[1]) ? match[1] : null;
}

// Same rule as the acknowledge_report RPC: 1 to 100 characters after trimming, no control characters.
export function cleanName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  return trimmed.length >= 1 && trimmed.length <= 100 && !/[\u0000-\u001f\u007f]/.test(trimmed) ? trimmed : null;
}

// result: { status: 'acknowledged', name, at } | { status: 'notfound' | 'full' | 'invalid' | 'error' }
export async function acknowledge(hash, name, config, fetchImpl = fetch) {
  try {
    const res = await rpc('acknowledge_report', { p_hash: hash, p_name: name }, config, fetchImpl);
    const body = await res.json();
    if (res.ok && Array.isArray(body) && body[0]) {
      return { status: 'acknowledged', name: body[0].landlord_name, at: body[0].acknowledged_at };
    }
    const byCode = { P0002: 'notfound', 54000: 'full', 22023: 'invalid' };
    return { status: byCode[body?.code] ?? 'error' };
  } catch {
    return { status: 'error' };
  }
}

// Existing acknowledgements for one full hash, oldest first; null when the server could not be reached.
export async function lookupAcknowledgements(hash, config, fetchImpl = fetch) {
  try {
    const res = await rpc('lookup_acknowledgements', { p_hash: hash }, config, fetchImpl);
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? rows.map((r) => ({ name: r.landlord_name, at: r.acknowledged_at })) : null;
  } catch {
    return null;
  }
}

export function ackMessage(result) {
  switch (result.status) {
    case 'acknowledged':
      return `Acknowledged by ${result.name} at ${formatTime(result.at)}.`;
    case 'notfound':
      return 'No report found for this link. Ask the tenant for a new one.';
    case 'full':
      return 'This report has already been acknowledged the maximum number of times.';
    case 'invalid':
      return 'Enter your name (up to 100 characters).';
    default:
      return 'Could not reach the server. Please try again later.';
  }
}
