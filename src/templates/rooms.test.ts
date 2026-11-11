import { REGION_TEMPLATES, ROOM_TEMPLATES, expandTemplate } from './rooms';

describe('expandTemplate', () => {
  it('expands every template room in order with sequential sorts', () => {
    const out = expandTemplate();
    expect(out.map((r) => r.name)).toEqual([
      'Kitchen', 'Bathroom', 'Bedroom', 'Living room', 'Hallway', 'Exterior', 'Appliances',
    ]);
    out.forEach((room, i) => {
      expect(room.sort).toBe(i);
      expect(room.items.map((x) => x.name)).toEqual(ROOM_TEMPLATES[i].items);
      expect(room.items.map((x) => x.sort)).toEqual(room.items.map((_, j) => j));
    });
  });

  it('honors the given name order', () => {
    expect(expandTemplate(['Bedroom', 'Kitchen']).map((r) => [r.name, r.sort])).toEqual([
      ['Bedroom', 0],
      ['Kitchen', 1],
    ]);
  });

  it('returns no rooms for an empty list', () => {
    expect(expandTemplate([])).toEqual([]);
  });

  it('gives unknown names the default items', () => {
    const [room] = expandTemplate(['Garage']);
    expect(room.name).toBe('Garage');
    expect(room.items).toEqual([
      { name: 'Walls', sort: 0 },
      { name: 'Floor', sort: 1 },
      { name: 'Ceiling', sort: 2 },
    ]);
  });

  it('is deterministic and does not leak mutations into the templates', () => {
    const snapshot = JSON.parse(JSON.stringify(ROOM_TEMPLATES));
    const a = expandTemplate();
    expect(expandTemplate()).toEqual(a);
    a[0].items.push({ name: 'x', sort: 99 });
    a[0].name = 'Changed';
    expandTemplate(['Garage'])[0].items.pop();
    expect(ROOM_TEMPLATES).toEqual(snapshot);
    expect(expandTemplate()).not.toEqual(a);
  });

  it('defaults to the US templates', () => {
    expect(expandTemplate(undefined, 'US')).toEqual(expandTemplate());
  });

  it('expands the UK templates with UK vocabulary', () => {
    const out = expandTemplate(undefined, 'UK');
    expect(out.map((r) => r.name)).toEqual([
      'Kitchen', 'Bathroom', 'Bedroom', 'Lounge', 'Hall and landing', 'Garden', 'Appliances', 'Meter readings',
    ]);
    out.forEach((room, i) => {
      expect(room.sort).toBe(i);
      expect(room.items.map((x) => x.name)).toEqual(REGION_TEMPLATES.UK[i].items);
    });
    const items = out.flatMap((r) => r.items.map((x) => x.name));
    expect(items).toEqual(expect.arrayContaining(['Radiators', 'Fridge-freezer', 'Hob and oven', 'Boiler', 'Extractor fan']));
    expect(items).not.toContain('Refrigerator');
  });

  it('expands the Canada templates', () => {
    const out = expandTemplate(undefined, 'CA');
    expect(out.map((r) => r.name)).toEqual([
      'Entryway or mudroom', 'Kitchen', 'Bathroom', 'Bedroom', 'Living room', 'Hallway', 'Exterior', 'Utilities', 'Appliances',
    ]);
    out.forEach((room, i) => expect(room.items.map((x) => x.name)).toEqual(REGION_TEMPLATES.CA[i].items));
    expect(out.find((r) => r.name === 'Utilities')?.items.map((x) => x.name)).toEqual(
      expect.arrayContaining(['Furnace or HVAC', 'Hot water tank', 'Baseboard heaters']),
    );
  });

  it('looks up named rooms in the given region', () => {
    const [lounge, kitchen, den] = expandTemplate(['Lounge', 'Kitchen', 'Den'], 'UK');
    expect(lounge.items.map((x) => x.name)).toEqual(REGION_TEMPLATES.UK[3].items);
    expect(kitchen.items.map((x) => x.name)).toContain('Worktops');
    expect(den.items.map((x) => x.name)).toEqual(['Walls', 'Floor', 'Ceiling']);
    expect(expandTemplate(['Lounge'], 'US')[0].items.map((x) => x.name)).toEqual(['Walls', 'Floor', 'Ceiling']);
  });
});
