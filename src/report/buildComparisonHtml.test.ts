import { readFileSync } from 'fs';
import { join } from 'path';

import type { Condition, Item, Photo } from '@/db/types';

import { buildComparisonHtml } from './buildComparisonHtml';
import type { Comparison, ComparisonItem } from './comparison';
import { isWorsened } from './comparison';

const formatDate = (ms: number) => new Date(ms).toISOString();

const photo = (id: number): Photo => ({
  id,
  item_id: id,
  file_uri: `photos/${id}.jpg`,
  sha256: `${String(id).repeat(12)}abcdef`.padEnd(64, '0'),
  captured_at: Date.UTC(2026, 0, 2, 10, id),
  width: 4000,
  height: 3000,
  source: 'camera',
});

const side = (name: string, condition: Condition | null, photos: Photo[]) => ({
  item: { id: 0, room_id: 0, name, condition, note: null, sort: 0 } as Item,
  photos,
});

const pairItem = (name: string, before: Condition | null | undefined, after: Condition | null | undefined, inPhotos: Photo[] = [], outPhotos: Photo[] = []): ComparisonItem => ({
  name,
  moveIn: before === undefined ? null : side(name, before, inPhotos),
  moveOut: after === undefined ? null : side(name, after, outPhotos),
  worsened: isWorsened(before ?? null, after ?? null),
});

const fixture = (): Comparison => ({
  moveIn: {
    id: 1,
    address: '12 Elm St',
    unit: '4B',
    kind: 'move_in',
    started_at: Date.UTC(2026, 0, 2, 10),
    finished_at: Date.UTC(2026, 0, 2, 11),
    tenant_name: null,
    landlord_name: null,
    linked_move_in_id: null,
    move_out_date: null,
  },
  moveOut: {
    id: 2,
    address: '12 Elm St',
    unit: '4B',
    kind: 'move_out',
    started_at: Date.UTC(2027, 0, 2, 10),
    finished_at: Date.UTC(2027, 0, 2, 11),
    tenant_name: null,
    landlord_name: null,
    linked_move_in_id: 1,
    move_out_date: null,
  },
  rooms: [
    {
      name: 'Kitchen',
      items: [
        pairItem('Oven', 'good', 'damaged', [photo(1)], [photo(2), photo(3)]),
        pairItem('Sink', 'fair', 'good', [photo(4)], [photo(5)]),
        pairItem('Floor', 'fair', 'fair'),
        pairItem('Toaster', 'good', undefined),
        pairItem('Fridge', undefined, 'damaged'),
        pairItem('Tub', null, 'damaged'),
      ],
    },
  ],
  thumbnails: { 1: 'data:image/jpeg;base64,AAA', 2: 'data:image/jpeg;base64,BBB', 4: 'data:image/jpeg;base64,DDD', 5: 'data:image/jpeg;base64,EEE' },
  worsenedCount: 1,
  generatedAt: Date.UTC(2027, 0, 3, 9),
});

test('snapshot of the full comparison document', () => {
  expect(buildComparisonHtml(fixture(), { formatDate })).toMatchSnapshot();
});

test('exactly the worsened items are highlighted and labelled "Worse" in text', () => {
  const html = buildComparisonHtml(fixture(), { formatDate });
  const worseRows = html.match(/<tr class="worse">.*<\/tr>/g) ?? [];
  expect(worseRows).toEqual(['<tr class="worse"><td>Oven</td><td>Good</td><td>Damaged</td><td>Worse</td></tr>']);
  expect(html.match(/>Worse</g)).toHaveLength(1);
  expect(html).toContain('<h3>Oven (Worse)</h3>');
  expect(html).toContain('<tr><td>Sink</td><td>Fair</td><td>Good</td><td>Better</td></tr>');
  expect(html).toContain('<tr><td>Floor</td><td>Fair</td><td>Fair</td><td>Same</td></tr>');
  expect(html).toContain('<tr><td>Toaster</td><td>Good</td><td>Not in move-out</td><td>Not in move-out</td></tr>');
  expect(html).toContain('<tr><td>Fridge</td><td>Not in move-in</td><td>Damaged</td><td>Not in move-in</td></tr>');
  expect(html).toContain('<tr><td>Tub</td><td>Not recorded</td><td>Damaged</td><td>Not recorded</td></tr>');
});

test('cover, photo pairs, and footer', () => {
  const c = fixture();
  const html = buildComparisonHtml(c, { formatDate });
  expect(html).toContain('<dt>Address</dt><dd>12 Elm St</dd>');
  expect(html).toContain('<dt>Unit</dt><dd>4B</dd>');
  expect(html).toContain(`<dt>Move-in finished</dt><dd>${formatDate(c.moveIn.finished_at!)}</dd>`);
  expect(html).toContain(`<dt>Move-out finished</dt><dd>${formatDate(c.moveOut.finished_at!)}</dd>`);
  expect(html).toContain('<dt>Worsened items</dt><dd>1</dd>');
  // Oven has 1 move-in and 2 move-out photos: 2 pairs, the second with an empty move-in slot.
  expect(html.match(/class="pair"/g)).toHaveLength(3);
  expect(html).toContain('No move-in photo');
  expect(html).toContain('Photo unavailable'); // photo 3 has no thumbnail
  for (const id of [1, 2, 3, 4, 5]) expect(html).toContain(`SHA-256: ${photo(id).sha256.slice(0, 12)}`);
  expect(html.indexOf('Oven - move-in')).toBeLessThan(html.indexOf('Oven - move-out'));
  expect(html).toContain('Not legal advice.');
  expect(html).toContain('Made with Unscratched (free)');
});

test('escapes user text on the cover, in room and item names, and in img alt', () => {
  const c = fixture();
  c.moveOut = { ...c.moveOut, address: '<b>12 Elm</b>', unit: '"&' };
  c.rooms[0].name = '<script>alert(1)</script>';
  c.rooms[0].items[0].name = '" onerror="alert(1)';
  const html = buildComparisonHtml(c, { formatDate });
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<b>');
  expect(html).not.toContain('" onerror="');
  expect(html).toContain('&lt;b&gt;12 Elm&lt;/b&gt;');
  expect(html).toContain('<dd>&quot;&amp;</dd>');
  expect(html).toContain('<h2>&lt;script&gt;alert(1)&lt;/script&gt;</h2>');
  expect(html).toContain('alt="&quot; onerror=&quot;alert(1) - move-in"');
  expect(buildComparisonHtml(c, { formatDate })).toMatchSnapshot();
});

test('the default formatter produces a date string', () => {
  expect(buildComparisonHtml(fixture())).toContain('2027');
});

test('buildComparisonHtml.ts and comparison.ts do not import expo or react-native', () => {
  for (const f of ['buildComparisonHtml.ts', 'comparison.ts']) {
    const src = readFileSync(join(__dirname, f), 'utf8');
    expect(src).not.toMatch(/from ['"](expo|react-native)/);
    expect(src).not.toMatch(/require\(['"](expo|react-native)/);
  }
});
