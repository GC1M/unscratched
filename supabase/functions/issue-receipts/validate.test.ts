import { MAX_HASHES, parseBody, shapeReceipts } from './validate';

const a = 'a'.repeat(64);
const b = '0123456789abcdef'.repeat(4);

describe('parseBody', () => {
  it('accepts a valid body', () => {
    expect(parseBody({ hashes: [a, b] })).toEqual({ hashes: [a, b] });
  });

  it('dedupes duplicate hashes, keeping request order', () => {
    expect(parseBody({ hashes: [b, a, b, a] })).toEqual({ hashes: [b, a] });
  });

  it('accepts exactly 500 items', () => {
    expect(parseBody({ hashes: Array(MAX_HASHES).fill(a) })).toEqual({ hashes: [a] });
  });

  it.each([
    ['empty array', { hashes: [] }],
    ['more than 500 items', { hashes: Array(MAX_HASHES + 1).fill(a) }],
    ['non-hex', { hashes: ['g'.repeat(64)] }],
    ['too short', { hashes: ['a'.repeat(63)] }],
    ['too long', { hashes: ['a'.repeat(65)] }],
    ['uppercase hex', { hashes: ['A'.repeat(64)] }],
    ['non-string item', { hashes: [42] }],
    ['extra keys', { hashes: [a], name: 'x' }],
    ['missing hashes', {}],
    ['non-array hashes', { hashes: a }],
    ['array body', [a]],
    ['null body', null],
    ['string body', a],
  ])('rejects %s', (_, body) => {
    expect(parseBody(body)).toEqual({ error: expect.any(String) });
  });
});

describe('shapeReceipts', () => {
  it('returns one receipt per unique hash in request order with ISO server_time', () => {
    const rows = [
      { id: 'id-a', sha256: a, server_time: '2026-11-09T12:00:00.123456+00:00' },
      { id: 'id-b', sha256: b, server_time: '2026-01-02T03:04:05+00:00' },
    ];
    const { hashes } = parseBody({ hashes: [b, a, b] }) as { hashes: string[] };
    expect(shapeReceipts(hashes, rows)).toEqual([
      { sha256: b, receipt_id: 'id-b', server_time: '2026-01-02T03:04:05.000Z' },
      { sha256: a, receipt_id: 'id-a', server_time: '2026-11-09T12:00:00.123Z' },
    ]);
  });

  it('throws when a requested hash has no row', () => {
    expect(() => shapeReceipts([a], [])).toThrow();
  });
});
