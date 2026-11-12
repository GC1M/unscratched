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

const COMMON_UK = ['Walls', 'Floor', 'Ceiling', 'Windows', 'Doors', 'Plug sockets and switches', 'Light fittings', 'Radiators'];

const UK_TEMPLATES: TemplateRoom[] = [
  { name: 'Kitchen', items: [...COMMON_UK, 'Worktops', 'Cupboards', 'Sink and taps', 'Extractor fan'] },
  { name: 'Bathroom', items: [...COMMON_UK, 'Toilet', 'Basin and taps', 'Bath or shower', 'Mirror', 'Extractor fan'] },
  { name: 'Bedroom', items: [...COMMON_UK, 'Wardrobe'] },
  { name: 'Lounge', items: [...COMMON_UK] },
  { name: 'Hall and landing', items: ['Walls', 'Floor', 'Ceiling', 'Stairs and banister', 'Light fittings', 'Smoke alarm and carbon monoxide alarm'] },
  { name: 'Garden', items: ['Front door and lock', 'Garden and fencing', 'Bins', 'Exterior walls and windows'] },
  { name: 'Appliances', items: ['Fridge-freezer', 'Hob and oven', 'Dishwasher', 'Microwave', 'Washing machine', 'Boiler'] },
  { name: 'Meter readings', items: ['Electricity meter', 'Gas meter', 'Water meter'] },
];

const CA_TEMPLATES: TemplateRoom[] = [
  { name: 'Entryway or mudroom', items: ['Walls', 'Floor', 'Ceiling', 'Doors', 'Closet', 'Light fixtures', 'Smoke and carbon monoxide detector'] },
  { name: 'Kitchen', items: [...COMMON, 'Countertops', 'Cabinets', 'Sink and faucet'] },
  { name: 'Bathroom', items: [...COMMON, 'Toilet', 'Sink and faucet', 'Tub or shower', 'Mirror', 'Exhaust fan'] },
  { name: 'Bedroom', items: [...COMMON, 'Closet'] },
  { name: 'Living room', items: [...COMMON] },
  { name: 'Hallway', items: ['Walls', 'Floor', 'Ceiling', 'Light fixtures'] },
  { name: 'Exterior', items: [...COMMON, 'Storm windows', 'Front door and lock', 'Patio or balcony'] },
  { name: 'Utilities', items: ['Furnace or HVAC', 'Hot water tank', 'Baseboard heaters', 'Electrical panel'] },
  { name: 'Appliances', items: ['Fridge', 'Stove and oven', 'Dishwasher', 'Microwave', 'Washer and dryer'] },
];

export type Region = 'US' | 'UK' | 'CA';

export const REGION_CURRENCY: Record<Region, string> = { US: 'USD', UK: 'GBP', CA: 'CAD' };

export const REGION_TEMPLATES: Record<Region, TemplateRoom[]> = { US: ROOM_TEMPLATES, UK: UK_TEMPLATES, CA: CA_TEMPLATES };

export interface ExpandedRoom {
  name: string;
  sort: number;
  items: { name: string; sort: number }[];
}

export function expandTemplate(names?: string[], region: Region = 'US'): ExpandedRoom[] {
  const templates = REGION_TEMPLATES[region];
  const rooms = names
    ? names.map((n) => templates.find((t) => t.name === n) ?? { name: n, items: DEFAULT_ITEMS })
    : templates;
  return rooms.map((r, sort) => ({
    name: r.name,
    sort,
    items: r.items.map((name, i) => ({ name, sort: i })),
  }));
}
