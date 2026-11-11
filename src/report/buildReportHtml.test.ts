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
  state: null,
  landlord_email: null,
  portal_url: null,
  sent_at: Date.UTC(2026, 0, 4, 9),
  sent_channel: 'email',
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
  receipts: { [photo(1, 1).sha256]: Date.UTC(2026, 0, 2, 11, 5) }, // the other photos are pending
  verificationCode: 'abcdef012345',
});

test('matches the snapshot', () => {
  expect(buildReportHtml(fixture(), { formatDate })).toMatchSnapshot();
});

test('Spanish: same document with translated labels and lang="es"; user text stays as typed', () => {
  const html = buildReportHtml(fixture(), { formatDate, lang: 'es' });
  expect(html).toMatchSnapshot();
  expect(html).toContain('<html lang="es">');
  expect(html).toContain('<h1>Informe de inspección de entrada</h1>');
  expect(html).toContain('<td>Dañado</td>');
  expect(html).toContain('No es asesoramiento legal.');
  expect(html).toContain('Countertops'); // item names are user data
  expect(html).not.toMatch(/Move-in inspection report|Not recorded|Receipt pending/);
});

test('photo cards are inline blocks, since WebKit print ignores break-inside on flex items and splits them', () => {
  const html = buildReportHtml(fixture(), { formatDate });
  expect(html).toMatch(/\.card \{[^}]*display: inline-block;[^}]*break-inside: avoid;/);
  expect(html).not.toMatch(/\.grid \{[^}]*display: flex/);
});

test('the footer carries the "Not legal advice" disclaimer', () => {
  expect(buildReportHtml(fixture(), { formatDate })).toContain('<footer><p>Not legal advice.</p>');
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

test('a drawn tenant signature renders as inline SVG next to the typed name', () => {
  const data = fixture();
  data.acknowledgement = { ...data.acknowledgement!, tenantSignature: 'M10 20L30 40' };
  const html = buildReportHtml(data, { formatDate });
  expect(html).toContain('<p>Tenant: Ana Ruiz<svg class="sig"');
  expect(html).toContain('<path d="M10 20L30 40"');
});

test('a malicious signature value is dropped, not rendered raw', () => {
  const data = fixture();
  data.acknowledgement = { ...data.acknowledgement!, tenantSignature: 'M0 0L1 1"/><script>alert(1)</script>' };
  const html = buildReportHtml(data, { formatDate });
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<svg');
  expect(html).toContain('<p>Tenant: Ana Ruiz</p>');
});

test('a photo with a receipt shows its server time, the others show "Receipt pending"', () => {
  const html = buildReportHtml(fixture(), { formatDate });
  expect(html.match(/Server time: /g)).toHaveLength(1);
  expect(html).toContain(`<div>${formatDate(Date.UTC(2026, 0, 2, 10, 1))}</div><div>Server time: ${formatDate(Date.UTC(2026, 0, 2, 11, 5))}</div>`);
  expect(html.match(/Receipt pending/g)).toHaveLength(5);
});

test('the cover shows the verification code and URL, or "Verification pending", or nothing without photos', () => {
  const data = fixture();
  expect(buildReportHtml(data, { formatDate })).toContain(
    '<dt>Verification</dt><dd>Verification code: abcdef012345<br>unscratched.app/v/abcdef012345</dd>',
  );
  data.verificationCode = null;
  const pending = buildReportHtml(data, { formatDate });
  expect(pending).toContain('<dt>Verification</dt><dd>Verification pending</dd>');
  expect(pending).not.toContain('Verification code');
  data.rooms = [];
  expect(buildReportHtml(data, { formatDate })).not.toContain('Verification');
});

test('the cover shows when and how the report was sent to the landlord, or nothing before it is sent', () => {
  const data = fixture();
  expect(buildReportHtml(data, { formatDate })).toContain(`<dt>Sent to landlord</dt><dd>${formatDate(Date.UTC(2026, 0, 4, 9))} by email</dd>`);
  data.inspection = { ...inspection, sent_at: Date.UTC(2026, 0, 5), sent_channel: 'portal' };
  expect(buildReportHtml(data, { formatDate })).toContain('by landlord portal</dd>');
  data.inspection = { ...inspection, sent_at: null, sent_channel: null };
  expect(buildReportHtml(data, { formatDate })).not.toContain('Sent to landlord');
});

test('the default formatter produces a date string', () => {
  expect(buildReportHtml(fixture())).toContain('2026');
});

test('buildReportHtml.ts does not import expo or react-native', () => {
  const src = readFileSync(join(__dirname, 'buildReportHtml.ts'), 'utf8');
  expect(src).not.toMatch(/from ['"](expo|react-native)/);
  expect(src).not.toMatch(/require\(['"](expo|react-native)/);
});
