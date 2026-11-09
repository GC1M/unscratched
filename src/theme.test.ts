import { palettes, type Colors } from './theme';

jest.mock('@/db/client', () => ({ getDb: jest.fn() }));
jest.mock('@/db/repo', () => ({}));

// WCAG 2.x relative luminance and contrast ratio for #RRGGBB.
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

type Pair = [keyof Colors, keyof Colors];

// Foreground on background, as used for text in the app (4.5:1).
const text: Pair[] = [
  ['ink', 'plaster'], // titles, body
  ['ink', 'paper'], // row titles, field values, secondary buttons
  ['ink60', 'plaster'], // section labels, subtitles, placeholders
  ['ink60', 'paper'], // row meta, placeholders in fields
  ['onInk', 'ink'], // primary button label
  ['damaged', 'paper'], // danger button, damaged tally
  ['damaged', 'plaster'], // form errors
  ['fairInk', 'paper'], // fair tally
  ['good', 'goodBg'], // selected condition chips
  ['fairInk', 'fairBg'],
  ['damaged', 'damagedBg'],
];

// Non-text glyphs that carry meaning (3:1): condition marks, the delete minus, the active page dot.
const glyphs: Pair[] = [
  ['good', 'paper'],
  ['fair', 'paper'],
  ['damaged', 'paper'],
  ['ink60', 'paper'], // hollow "not checked" mark, reorder arrows
  ['good', 'goodBg'],
  ['fair', 'fairBg'],
  ['damaged', 'damagedBg'],
  ['onInk', 'damaged'],
  ['ink', 'plaster'],
];
// ink30 is left out on purpose: it only draws decoration that repeats other cues
// (row chevrons, the outline around an ink60 "+", inactive page dots).

describe.each(['light', 'dark'] as const)('%s palette', (scheme) => {
  const c = palettes[scheme];
  test.each(text)('%s text on %s is at least 4.5:1', (fg, bg) => {
    expect(contrast(c[fg], c[bg])).toBeGreaterThanOrEqual(4.5);
  });
  test.each(glyphs)('%s glyph on %s is at least 3:1', (fg, bg) => {
    expect(contrast(c[fg], c[bg])).toBeGreaterThanOrEqual(3);
  });
});

test('contrast() matches known WCAG values', () => {
  expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5);
  expect(contrast('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2);
});
