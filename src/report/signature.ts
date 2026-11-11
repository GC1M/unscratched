/** A drawn stroke: the touch points from finger down to finger up, in pad coordinates. */
export type Stroke = { x: number; y: number }[];

// Strokes are normalized to this box, so the path is independent of the pad's on-screen size.
export const SIGNATURE_WIDTH = 300;
export const SIGNATURE_HEIGHT = 100;

// Exactly what strokesToPath emits: integer moves and lines, a lone point as "l0 0". Anything else is refused.
const PATH = /^(?:M\d{1,3} \d{1,3}(?:l0 0|(?:L\d{1,3} \d{1,3})+))+$/;

const scale = (v: number, from: number, to: number) => Math.round(Math.min(Math.max((v / from) * to, 0), to));

/** Compact SVG path data for the strokes drawn on a width x height pad, or null when nothing was drawn. */
export function strokesToPath(strokes: Stroke[], width: number, height: number): string | null {
  const path = strokes
    .filter((s) => s.length)
    .map((s) => {
      const [first, ...rest] = s.map((p) => `${scale(p.x, width, SIGNATURE_WIDTH)} ${scale(p.y, height, SIGNATURE_HEIGHT)}`);
      return `M${first}${rest.length ? rest.map((p) => `L${p}`).join('') : 'l0 0'}`;
    })
    .join('');
  return path || null;
}

/** Standalone SVG for a path from strokesToPath. Returns null for anything else, so it can never inject markup. */
export function signatureSvg(path: string | null | undefined): string | null {
  if (!path || !PATH.test(path)) return null;
  return `<svg class="sig" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIGNATURE_WIDTH} ${SIGNATURE_HEIGHT}"><path d="${path}" fill="none" stroke="#111" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
