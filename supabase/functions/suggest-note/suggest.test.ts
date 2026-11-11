/**
 * @jest-environment node
 */
import { DAILY_LIMIT, handle, MAX_CAPTION, MAX_IMAGE_BYTES, MODEL, parseBody, parseSuggestion, type Deps } from './suggest';

const installId = '0f8b6a52-3c1d-4e7a-9b2f-5d6c7e8f9a0b';
// "/9j/" (FF D8 FF) then filler: a valid JPEG prefix as far as the function checks.
const jpeg = (bytes: number) => Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(bytes - 3, 1)]).toString('base64');
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]).toString('base64');

describe('parseSuggestion', () => {
  it('reads plain JSON', () => {
    expect(parseSuggestion('{"caption":"Scuff on lower wall","severity":"minor"}')).toEqual({ caption: 'Scuff on lower wall', severity: 'minor' });
  });

  it('reads JSON wrapped in prose and a code fence', () => {
    const text = 'Here you go:\n```json\n{ "caption": "Clean,  intact\\nfloor", "severity": "None" }\n```\nHope that helps.';
    expect(parseSuggestion(text)).toEqual({ caption: 'Clean, intact floor', severity: 'none' });
  });

  it('clamps a long caption to the limit', () => {
    const s = parseSuggestion(JSON.stringify({ caption: 'crack '.repeat(60), severity: 'major' }))!;
    expect(s.caption).toHaveLength(MAX_CAPTION);
    expect(s.caption.endsWith('…')).toBe(true);
    expect(s.severity).toBe('major');
  });

  it.each([
    ['no JSON', 'The wall looks fine.'],
    ['broken JSON', '{"caption": "x", "severity": '],
    ['unknown severity', '{"caption":"x","severity":"severe"}'],
    ['empty caption', '{"caption":"   ","severity":"none"}'],
    ['non-string caption', '{"caption":3,"severity":"none"}'],
    ['missing severity', '{"caption":"x"}'],
    ['null', 'null'],
  ])('returns null for %s', (_, text) => {
    expect(parseSuggestion(text)).toBeNull();
  });
});

describe('parseBody', () => {
  it('accepts a small JPEG', () => {
    const image = jpeg(1000);
    expect(parseBody({ install_id: installId, image })).toEqual({ installId, image });
  });

  it('accepts an image exactly at the limit and rejects one byte over with 413', () => {
    expect(parseBody({ install_id: installId, image: jpeg(MAX_IMAGE_BYTES) })).not.toHaveProperty('error');
    expect(parseBody({ install_id: installId, image: jpeg(MAX_IMAGE_BYTES + 1) })).toMatchObject({ status: 413 });
  });

  it.each([
    ['non-JPEG', { install_id: installId, image: png }],
    ['non-base64', { install_id: installId, image: '/9j/!!!!' }],
    ['bad install id', { install_id: 'abc', image: jpeg(10) }],
    ['uppercase install id', { install_id: installId.toUpperCase(), image: jpeg(10) }],
    ['extra keys', { install_id: installId, image: jpeg(10), note: 'x' }],
    ['missing image', { install_id: installId }],
    ['array body', []],
    ['null body', null],
  ])('rejects %s with 400', (_, body) => {
    expect(parseBody(body)).toMatchObject({ status: 400, error: expect.any(String) });
  });
});

describe('handle', () => {
  const reply = (text: string, extra: object = {}) =>
    jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text }], ...extra }) }));
  const deps = (over: Partial<Deps> = {}): Deps => ({
    bumpUsage: jest.fn(async () => 1),
    apiKey: 'test-key',
    fetchFn: reply('{"caption":"Small chip on counter edge","severity":"minor"}') as never,
    ...over,
  });
  const body = { install_id: installId, image: jpeg(100) };

  it('returns the parsed suggestion and sends the image to the model', async () => {
    const d = deps();
    expect(await handle(body, d)).toEqual({ status: 200, body: { caption: 'Small chip on counter edge', severity: 'minor' } });
    expect(d.bumpUsage).toHaveBeenCalledWith(installId);
    const [url, init] = (d.fetchFn as jest.Mock).mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.headers['x-api-key']).toBe('test-key');
    const sent = JSON.parse(init.body);
    expect(sent.model).toBe(MODEL);
    expect(sent.messages[0].content[0].source).toEqual({ type: 'base64', media_type: 'image/jpeg', data: body.image });
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('rejects oversized images before counting or calling the model', async () => {
    const d = deps();
    expect((await handle({ install_id: installId, image: jpeg(MAX_IMAGE_BYTES + 1) }, d)).status).toBe(413);
    expect(d.bumpUsage).not.toHaveBeenCalled();
    expect(d.fetchFn).not.toHaveBeenCalled();
  });

  it('allows the daily limit and rejects the next request with 429 without calling the model', async () => {
    const atLimit = deps({ bumpUsage: jest.fn(async () => DAILY_LIMIT) });
    expect((await handle(body, atLimit)).status).toBe(200);
    const over = deps({ bumpUsage: jest.fn(async () => DAILY_LIMIT + 1) });
    expect((await handle(body, over)).status).toBe(429);
    expect(over.fetchFn).not.toHaveBeenCalled();
  });

  it('returns 503 without an API key', async () => {
    expect((await handle(body, deps({ apiKey: null }))).status).toBe(503);
  });

  it('returns 500 when the usage table fails', async () => {
    expect((await handle(body, deps({ bumpUsage: jest.fn(async () => Promise.reject(new Error('db'))) }))).status).toBe(500);
  });

  it.each([
    ['an HTTP error', jest.fn(async () => ({ ok: false, status: 529, json: async () => ({}) }))],
    ['a refusal', reply('', { stop_reason: 'refusal', content: [] })],
    ['an unparseable reply', reply('I cannot tell from this photo.')],
    ['a network failure', jest.fn(async () => Promise.reject(new Error('timeout')))],
  ])('returns 502 on %s', async (_, fetchFn) => {
    expect((await handle(body, deps({ fetchFn: fetchFn as never }))).status).toBe(502);
  });
});
