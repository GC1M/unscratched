import type { Condition, Inspection } from '@/db/types';

import type { ReportData, ReportItem } from './types';

export interface ComparisonItem {
  name: string;
  moveIn: ReportItem | null; // null: not in the move-in
  moveOut: ReportItem | null; // null: not in the move-out
  worsened: boolean;
}
export interface ComparisonRoom { name: string; items: ComparisonItem[]; }
export interface Comparison {
  moveIn: Inspection;
  moveOut: Inspection;
  rooms: ComparisonRoom[];
  thumbnails: Record<number, string>; // photo ids are unique across inspections, so both sides share one map
  worsenedCount: number;
  generatedAt: number;
  receipts: Record<string, number>; // both sides merged; hashes are global
  moveInCode: string | null;
  moveOutCode: string | null;
}

const RANK: Record<Condition, number> = { good: 0, fair: 1, damaged: 2 };

/** True only when both conditions are recorded and the move-out one ranks worse. */
export function isWorsened(before: Condition | null, after: Condition | null): boolean {
  return before != null && after != null && RANK[after] > RANK[before];
}

/** Pairs a with b: same name and sort first, then same name. Order: a's order, then b's leftovers. */
function pair<T>(a: T[], b: T[], key: (t: T) => { name: string; sort: number }): [T | null, T | null][] {
  const match = new Map<number, number>(); // a index -> b index
  const used = new Set<number>();
  for (const sameSort of [true, false]) {
    a.forEach((x, i) => {
      if (match.has(i)) return;
      const kx = key(x);
      const j = b.findIndex((y, j) => !used.has(j) && key(y).name === kx.name && (!sameSort || key(y).sort === kx.sort));
      if (j >= 0) {
        match.set(i, j);
        used.add(j);
      }
    });
  }
  return [
    ...a.map((x, i): [T, T | null] => [x, match.has(i) ? b[match.get(i)!] : null]),
    ...b.filter((_, j) => !used.has(j)).map((y): [null, T] => [null, y]),
  ];
}

/** Pure: pairs rooms by name then sort, items by name then sort within the room, and flags worsening. */
export function buildComparison(moveIn: ReportData, moveOut: ReportData): Comparison {
  const rooms = pair(moveIn.rooms, moveOut.rooms, (r) => r.room).map(([a, b]) => ({
    name: (a ?? b)!.room.name,
    items: pair(a?.items ?? [], b?.items ?? [], (i) => i.item).map(([x, y]) => ({
      name: (x ?? y)!.item.name,
      moveIn: x,
      moveOut: y,
      worsened: isWorsened(x?.item.condition ?? null, y?.item.condition ?? null),
    })),
  }));
  return {
    moveIn: moveIn.inspection,
    moveOut: moveOut.inspection,
    rooms,
    thumbnails: { ...moveIn.thumbnails, ...moveOut.thumbnails },
    worsenedCount: rooms.reduce((n, r) => n + r.items.filter((i) => i.worsened).length, 0),
    generatedAt: moveOut.generatedAt,
    receipts: { ...moveIn.receipts, ...moveOut.receipts },
    moveInCode: moveIn.verificationCode,
    moveOutCode: moveOut.verificationCode,
  };
}
