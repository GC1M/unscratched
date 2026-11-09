import type { Item, Room } from '@/db/types';

/** The next item without a condition after `afterId` (wrapping to the start), or null if all are checked. */
export function nextUnchecked(items: Item[], afterId: number): Item | null {
  const at = items.findIndex((i) => i.id === afterId);
  const ordered = at < 0 ? items : [...items.slice(at + 1), ...items.slice(0, at + 1)];
  return ordered.find((i) => i.id !== afterId && i.condition == null) ?? null;
}

/** The first room that still has an unchecked item (an empty room counts as unfinished), or null. */
export function nextRoom(rooms: Room[], items: Item[]): Room | null {
  return (
    rooms.find((room) => {
      const own = items.filter((i) => i.room_id === room.id);
      return own.length === 0 || own.some((i) => i.condition == null);
    }) ?? null
  );
}
