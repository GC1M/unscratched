import { escapeHtml } from './escapeHtml';

test('escapes the five HTML special characters', () => {
  expect(escapeHtml(`<a href="x">Tom & Jerry's</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;Tom &amp; Jerry&#39;s&lt;/a&gt;');
});

test('escapes an ampersand once, not twice', () => {
  expect(escapeHtml('&amp;')).toBe('&amp;amp;');
});

test('leaves plain text alone', () => {
  expect(escapeHtml('Living room, wall 2')).toBe('Living room, wall 2');
});
