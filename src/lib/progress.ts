import type { Item, Room } from '@/db/types';

export interface Progress {
  roomsDone: number;
  roomsTotal: number;
  itemsDone: number;
  itemsTotal: number;
}

/**
 * An item is done when it has a condition. A room is done when it has at least one item and every
 * item is done; an empty room is NOT done, since nothing in it has been inspected yet.
 */
export function progress(rooms: Room[], items: Item[]): Progress {
  const roomsDone = rooms.filter((room) => {
    const own = items.filter((i) => i.room_id === room.id);
    return own.length > 0 && own.every((i) => i.condition != null);
  }).length;
  return {
    roomsDone,
    roomsTotal: rooms.length,
    itemsDone: items.filter((i) => i.condition != null).length,
    itemsTotal: items.length,
  };
}
