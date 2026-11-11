import { signatureSvg, strokesToPath } from './signature';

test('no strokes, or only empty ones, is null', () => {
  expect(strokesToPath([], 600, 200)).toBeNull();
  expect(strokesToPath([[], []], 600, 200)).toBeNull();
});

test('a single point is a dot', () => {
  expect(strokesToPath([[{ x: 300, y: 100 }]], 600, 200)).toBe('M150 50l0 0');
});

test('normalizes to the 300 x 100 box, rounds, and clamps points dragged off the pad', () => {
  const strokes = [
    [{ x: 0, y: 0 }, { x: 101.3, y: 50.6 }, { x: 700, y: -20 }],
    [{ x: 600, y: 200 }],
  ];
  expect(strokesToPath(strokes, 600, 200)).toBe('M0 0L51 25L300 0M300 100l0 0');
});

test('signatureSvg wraps a valid path', () => {
  expect(signatureSvg('M0 0L51 25M300 100l0 0')).toBe(
    '<svg class="sig" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 100"><path d="M0 0L51 25M300 100l0 0" fill="none" stroke="#111" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  );
});

test('signatureSvg refuses anything strokesToPath would not produce', () => {
  for (const bad of [null, undefined, '', 'M0 0', 'M0 0L1 1"/><script>alert(1)</script>', 'M0 0 L1 1', 'M-1 0l0 0', 'M0.5 0l0 0', 'M0 0L1 1\n'])
    expect(signatureSvg(bad)).toBeNull();
});
