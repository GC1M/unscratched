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

// Calls the lookup_receipt RPC. Only the hash (or its prefix) is sent.
export async function lookup(hash, config, fetchImpl = fetch) {
  try {
    const res = await fetchImpl(`${config.SUPABASE_URL}/rest/v1/rpc/lookup_receipt`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${config.SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ p_hash: hash }),
    });
    if (!res.ok) return { status: 'error' };
    const rows = await res.json();
    return Array.isArray(rows) && rows.length > 0
      ? { status: 'found', serverTime: rows[0].server_time }
      : { status: 'notfound' };
  } catch {
    return { status: 'error' };
  }
}
