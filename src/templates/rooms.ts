import type { TemplateRoom } from '../db/types';

const COMMON = ['Walls', 'Floor', 'Ceiling', 'Windows', 'Doors', 'Outlets and switches', 'Light fixtures'];
const DEFAULT_ITEMS = ['Walls', 'Floor', 'Ceiling'];

export const ROOM_TEMPLATES: TemplateRoom[] = [
  { name: 'Kitchen', items: [...COMMON, 'Countertops', 'Cabinets', 'Sink and faucet'] },
  { name: 'Bathroom', items: [...COMMON, 'Toilet', 'Sink and faucet', 'Tub or shower', 'Mirror', 'Exhaust fan'] },
  { name: 'Bedroom', items: [...COMMON, 'Closet'] },
  { name: 'Living room', items: [...COMMON] },
  { name: 'Hallway', items: ['Walls', 'Floor', 'Ceiling', 'Light fixtures', 'Smoke detector'] },
  { name: 'Exterior', items: [...COMMON, 'Front door and lock', 'Patio or balcony'] },
  { name: 'Appliances', items: ['Refrigerator', 'Stove and oven', 'Dishwasher', 'Microwave', 'Washer and dryer'] },
];

export interface ExpandedRoom {
  name: string;
  sort: number;
  items: { name: string; sort: number }[];
}

export function expandTemplate(names?: string[]): ExpandedRoom[] {
  const rooms = names
    ? names.map((n) => ROOM_TEMPLATES.find((t) => t.name === n) ?? { name: n, items: DEFAULT_ITEMS })
    : ROOM_TEMPLATES;
  return rooms.map((r, sort) => ({
    name: r.name,
    sort,
    items: r.items.map((name, i) => ({ name, sort: i })),
  }));
}
