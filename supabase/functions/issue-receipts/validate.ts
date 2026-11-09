// Pure request validation and response shaping for the issue-receipts edge function.
// No Deno or URL imports so jest can test it from the repo root.

export const MAX_HASHES = 500;
const HASH = /^[0-9a-f]{64}$/;

export type Receipt = { sha256: string; receipt_id: string; server_time: string };
export type ReceiptRow = { id: string; sha256: string; server_time: string };

// Returns the unique hashes in request order, or an error message for a 400.
export function parseBody(body: unknown): { hashes: string[] } | { error: string } {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { error: 'body must be a JSON object' };
  }
  const keys = Object.keys(body);
  if (keys.length !== 1 || keys[0] !== 'hashes') {
    return { error: 'body must contain only "hashes"' };
  }
  const hashes = (body as { hashes: unknown }).hashes;
  if (!Array.isArray(hashes)) return { error: 'hashes must be an array' };
  if (hashes.length < 1 || hashes.length > MAX_HASHES) {
    return { error: `hashes must have 1 to ${MAX_HASHES} items` };
  }
  if (!hashes.every((h) => typeof h === 'string' && HASH.test(h))) {
    return { error: 'each hash must be 64 lowercase hex characters' };
  }
  return { hashes: [...new Set(hashes as string[])] };
}

// One receipt per requested hash, in request order, with an ISO server_time.
export function shapeReceipts(hashes: string[], rows: ReceiptRow[]): Receipt[] {
  const byHash = new Map(rows.map((r) => [r.sha256, r]));
  return hashes.map((h) => {
    const row = byHash.get(h);
    if (!row) throw new Error('missing receipt row');
    return {
      sha256: h,
      receipt_id: row.id,
      server_time: new Date(row.server_time).toISOString(),
    };
  });
}
