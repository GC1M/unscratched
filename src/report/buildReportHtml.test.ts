import { readFileSync } from 'fs';
import { join } from 'path';

import type { Inspection, Item, Photo } from '@/db/types';

import { buildReportHtml } from './buildReportHtml';
import type { ReportData } from './types';

const formatDate = (ms: number) => new Date(ms).toISOString();

const inspection: Inspection = {
  id: 1,
  address: '12 Elm St',
  unit: '4B',
  kind: 'move_in',
  started_at: Date.UTC(2026, 0, 2, 10),
  finished_at: Date.UTC(2026, 0, 2, 11),
  tenant_name: 'Ana Ruiz',
  landlord_name: 'Bob Lee',
  linked_move_in_id: null,
  move_out_date: null,
};

const item = (id: number, room_id: number, name: string, condition: Item['condition'], note: string | null = null): Item => ({
  id,
  room_id,
  name,
  condition,
  note,
  sort: id,
});

const photo = (id: number, item_id: number): Photo => ({
  id,
  item_id,
  file_uri: `photos/${id}.jpg`,
  sha256: `${String(id).repeat(12)}abcdef`.padEnd(64, '0'),
  captured_at: Date.UTC(2026, 0, 2, 10, id),
  width: 4000,
  height: 3000,
  source: 'camera',
});

const fixture = (): ReportData => ({
  inspection,
  rooms: [
    {
      room: { id: 1, inspection_id: 1, name: 'Kitchen', sort: 0 },
      items: [
        { item: item(1, 1, 'Countertops', 'good'), photos: [photo(1, 1), photo(2, 1)] },
        { item: item(2, 1, 'Oven', 'damaged', 'Door hinge loose\nBurn mark on glass'), photos: [photo(3, 2)] },
      ],
    },
    {
      room: { id: 2, inspection_id: 1, name: 'Bathroom', sort: 1 },
      items: [
        { item: item(3, 2, 'Sink', 'fair'), photos: [photo(4, 3)] },
        { item: item(4, 2, 'Mirror', null), photos: [] },
      ],
    },
    {
      room: { id: 3, inspection_id: 1, name: 'Bedroom', sort: 2 },
      items: [{ item: item(5, 3, 'Carpet', 'good'), photos: [photo(5, 5), photo(6, 5)] }],
    },
  ],
  thumbnails: { 1: 'data:image/jpeg;base64,AAA', 2: 'data:image/jpeg;base64,BBB', 3: 'data:image/jpeg;base64,CCC', 4: 'data:image/jpeg;base64,DDD', 5: 'data:image/jpeg;base64,EEE' },
  acknowledgement: { tenantName: 'Ana Ruiz', landlordName: null, date: Date.UTC(2026, 0, 2, 12) },
  generatedAt: Date.UTC(2026, 0, 3),
});

test('matches the snapshot', () => {
  expect(buildReportHtml(fixture(), { formatDate })).toMatchSnapshot();
});

test('contains every item name, condition label, and hash prefix', () => {
  const data = fixture();
  const html = buildReportHtml(data, { formatDate });
  for (const { items } of data.rooms) {
    for (const { item: it, photos } of items) {
      expect(html).toContain(it.name);
      for (const p of photos) expect(html).toContain(`SHA-256: ${p.sha256.slice(0, 12)}`);
    }
  }
  for (const label of ['Good', 'Fair', 'Damaged', 'Not recorded']) expect(html).toContain(`<td>${label}</td>`);
  expect(html).toContain('Door hinge loose<br>Burn mark on glass');
  expect(html).toContain('Move-in inspection report');
});

test('escapes user text in notes and on the cover', () => {
  const data = fixture();
  data.rooms[0].items[0].item.note = `<script>alert(1)</script> & "x"`;
  data.inspection = { ...inspection, address: '<b>12 Elm</b>' };
  const html = buildReportHtml(data, { formatDate });
  expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; &quot;x&quot;');
  expect(html).not.toContain('<script>');
  expect(html).toContain('&lt;b&gt;12 Elm&lt;/b&gt;');
  expect(html).not.toContain('<b>');
});

test('escapes item names inside the img alt attribute', () => {
  const data = fixture();
  data.rooms[0].items[0].item.name = '" onerror="alert(1)';
  const html = buildReportHtml(data, { formatDate });
  expect(html).not.toContain('" onerror="');
  expect(html).toContain('alt="&quot; onerror=&quot;alert(1) - photo 1"');
});

test('a missing thumbnail renders "Photo unavailable"', () => {
  const html = buildReportHtml(fixture(), { formatDate });
  expect(html.match(/Photo unavailable/g)).toHaveLength(1);
});

test('blank signature lines when acknowledgement is null; move-out title and unfinished date', () => {
  const data = fixture();
  data.acknowledgement = null;
  data.inspection = { ...inspection, kind: 'move_out', finished_at: null };
  const html = buildReportHtml(data, { formatDate });
  expect(html).toContain('Move-out inspection report');
  expect(html).toContain('Tenant: <span class="blank"></span>');
  expect(html).toContain('Landlord or manager: <span class="blank"></span>');
  expect(html).toContain(`on ${formatDate(data.generatedAt)}.`);
});

test('the default formatter produces a date string', () => {
  expect(buildReportHtml(fixture())).toContain('2026');
});

test('buildReportHtml.ts does not import expo or react-native', () => {
  const src = readFileSync(join(__dirname, 'buildReportHtml.ts'), 'utf8');
  expect(src).not.toMatch(/from ['"](expo|react-native)/);
  expect(src).not.toMatch(/require\(['"](expo|react-native)/);
});
