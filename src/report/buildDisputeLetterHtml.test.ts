import { readFileSync } from 'fs';
import { join } from 'path';

import type { Condition, Inspection, Item } from '@/db/types';

import { buildDisputeLetterHtml } from './buildDisputeLetterHtml';
import type { Comparison, ComparisonItem } from './comparison';
import { isWorsened } from './comparison';

// Local calendar date: the due date is a local midnight, so a UTC format would shift it a day in some time zones.
const formatDate = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

const side = (name: string, condition: Condition | null, note: string | null = null) => ({
  item: { id: 0, room_id: 0, name, condition, note, sort: 0 } as Item,
  photos: [],
});

const pairItem = (name: string, before: Condition | null | undefined, after: Condition | null | undefined, note: string | null = null): ComparisonItem => ({
  name,
  moveIn: before === undefined ? null : side(name, before),
  moveOut: after === undefined ? null : side(name, after, note),
  worsened: isWorsened(before ?? null, after ?? null),
});

const inspection = (over: Partial<Inspection>): Inspection => ({
  id: 1,
  address: '12 Elm St',
  unit: '4B',
  kind: 'move_in',
  started_at: Date.UTC(2026, 0, 2, 10),
  finished_at: Date.UTC(2026, 0, 2, 11),
  tenant_name: 'Sam Renter',
  landlord_name: 'Pat Owner',
  linked_move_in_id: null,
  move_out_date: null,
  state: null,
  landlord_email: null,
  portal_url: null,
  sent_at: null,
  sent_channel: null,
  deposit_split: null,
  ...over,
});

const fixture = (): Comparison => ({
  moveIn: inspection({}),
  moveOut: inspection({ id: 2, kind: 'move_out', started_at: Date.UTC(2027, 0, 2, 10), finished_at: Date.UTC(2027, 0, 2, 11), linked_move_in_id: 1, move_out_date: new Date(2027, 0, 1, 12).getTime(), state: 'CA' }),
  rooms: [
    {
      name: 'Kitchen',
      items: [
        pairItem('Oven', 'good', 'damaged', 'Scorch mark on door'),
        pairItem('Sink', 'fair', 'good'),
        pairItem('Floor', 'fair', 'fair'),
        pairItem('Toaster', 'good', undefined),
        pairItem('Tub', null, 'damaged'),
      ],
    },
    { name: 'Bath', items: [pairItem('Mirror', 'good', 'fair')] },
  ],
  thumbnails: {},
  worsenedCount: 2,
  generatedAt: Date.UTC(2027, 0, 3, 9),
  receipts: {},
  moveInCode: null,
  moveOutCode: 'abcdef012345',
});

test('snapshot of the full letter', () => {
  expect(buildDisputeLetterHtml(fixture(), { formatDate })).toMatchSnapshot();
});

test('Spanish: snapshot, translated letter text and placeholders', () => {
  const html = buildDisputeLetterHtml(fixture(), { formatDate, lang: 'es' });
  expect(html).toMatchSnapshot();
  expect(html).toContain('<html lang="es">');
  expect(html).toContain('<strong>No es asesoramiento legal.</strong>');
  expect(html).toContain('[Monto del depósito]');
  expect(html).toContain('Atentamente,');
  expect(html).not.toMatch(/Dear |Sincerely|Deposit amount/);
});

test('lists every flagged item with room, conditions, and note, and nothing else in the table', () => {
  const html = buildDisputeLetterHtml(fixture(), { formatDate });
  const rows = html.match(/<tr><td>.*<\/tr>/g);
  expect(rows).toEqual([
    '<tr><td>Kitchen</td><td>Oven</td><td>Good</td><td>Damaged</td><td>Scorch mark on door</td></tr>',
    '<tr><td>Bath</td><td>Mirror</td><td>Good</td><td>Fair</td><td></td></tr>',
  ]);
  expect(html).toContain('marks 2 items as being in worse condition');
  expect(html).toContain('2 items were recorded in the same or better condition'); // Sink and Floor; Toaster and Tub lack a side
});

test('fills in names, property, and dates, and brackets what the app does not know', () => {
  const html = buildDisputeLetterHtml(fixture(), { formatDate });
  expect(html).toContain('Not legal advice.');
  expect(html).toContain('Dear Pat Owner,');
  expect(html).toContain('Sincerely,<br>Sam Renter');
  expect(html).toContain('Return of security deposit for 12 Elm St, Unit 4B');
  expect(html).toContain('moved in on 2026-01-02. I moved out on 2027-01-01.');
  expect(html).toContain('<p>2027-01-03</p>');
  for (const label of ['Deposit amount', 'Landlord mailing address', 'Forwarding address']) expect(html).toContain(`[${label}]`);
  expect(html).toContain('verification code abcdef012345 at unscratched.app/v/abcdef012345');

  const c = fixture();
  c.moveIn = { ...c.moveIn, tenant_name: null, landlord_name: null };
  c.moveOut = { ...c.moveOut, tenant_name: ' ', landlord_name: null, move_out_date: null, finished_at: null, unit: null };
  c.moveOutCode = null;
  const blank = buildDisputeLetterHtml(c, { formatDate });
  expect(blank).toContain('[Your name]');
  expect(blank).toContain('Dear <span class="placeholder">[Landlord or manager name]</span>,');
  expect(blank).toContain('[Move-out date]');
  expect(blank).toContain('deposit for 12 Elm St</strong>');
  expect(blank).not.toContain('verification code');
});

test('cites the state deposit deadline and source, handles rows without a deadline, and skips an unknown state', () => {
  const html = buildDisputeLetterHtml(fixture(), { formatDate });
  expect(html).toContain('<p>In California, landlords generally have 21 days after move-out to return the deposit.');
  expect(html).toMatch(/By that rule the deposit is due around 2027-01-22\. Source: https:\/\/leginfo\.legislature\.ca\.gov\/faces\/codes_displaySection\.xhtml\?lawCode=CIV&amp;sectionNum=1950\.5\.<\/p>/);

  const c = fixture();
  c.moveOut = { ...c.moveOut, state: 'ky' };
  const ky = buildDisputeLetterHtml(c, { formatDate });
  expect(ky).toContain('In Kentucky, there is no simple deposit-return deadline.');
  expect(ky).not.toContain('due around');
  expect(ky).toContain('Source: https://apps.legislature.ky.gov/');

  for (const state of [null, 'ZZ']) {
    c.moveOut = { ...c.moveOut, state };
    const none = buildDisputeLetterHtml(c, { formatDate });
    expect(none).not.toContain('Source:');
    expect(none).not.toContain('landlords generally have');
  }
});

test('says so when nothing got worse', () => {
  const c = fixture();
  c.rooms = [{ name: 'Kitchen', items: [pairItem('Sink', 'fair', 'good')] }];
  const html = buildDisputeLetterHtml(c, { formatDate });
  expect(html).toContain('shows no item in worse condition');
  expect(html).toContain('One item was recorded in the same or better condition');
  expect(html).not.toContain('<table>');
});

test('escapes user text everywhere it appears', () => {
  const c = fixture();
  c.moveOut = { ...c.moveOut, address: '<b>12 Elm</b>', unit: '"&', tenant_name: '<i>Sam</i>', landlord_name: "O'Brien" };
  c.rooms[0].name = '<script>alert(1)</script>';
  c.rooms[0].items[0].name = '<img src=x onerror=alert(1)>';
  c.rooms[0].items[0].moveOut!.item.note = '<script>steal()</script>';
  const html = buildDisputeLetterHtml(c, { formatDate });
  expect(html).not.toContain('<script>');
  expect(html).not.toContain('<b>');
  expect(html).not.toContain('<i>');
  expect(html).not.toContain('<img');
  expect(html).toContain('&lt;b&gt;12 Elm&lt;/b&gt;, Unit &quot;&amp;');
  expect(html).toContain('Dear O&#39;Brien,');
  expect(html).toContain('<td>&lt;script&gt;alert(1)&lt;/script&gt;</td><td>&lt;img src=x onerror=alert(1)&gt;</td>');
  expect(html).toContain('<td>&lt;script&gt;steal()&lt;/script&gt;</td>');
});

test('the default formatter produces a date string', () => {
  expect(buildDisputeLetterHtml(fixture())).toContain('2027');
});

test('buildDisputeLetterHtml.ts does not import expo or react-native', () => {
  const src = readFileSync(join(__dirname, 'buildDisputeLetterHtml.ts'), 'utf8');
  expect(src).not.toMatch(/from ['"](expo|react-native)/);
});
