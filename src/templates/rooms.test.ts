import { ROOM_TEMPLATES, expandTemplate } from './rooms';

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
});
