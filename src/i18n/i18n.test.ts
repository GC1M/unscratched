import { en } from './en';
import { es } from './es';
import { langOf, translate } from './index';

const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();

test('Spanish has every English key, non-empty, with the same placeholders', () => {
  expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  for (const key of Object.keys(en) as (keyof typeof en)[]) {
    expect([key, es[key].trim().length > 0]).toEqual([key, true]);
    expect([key, placeholders(es[key])]).toEqual([key, placeholders(en[key])]);
  }
});

test('t fills placeholders once, leaves unknown ones, and does not expand placeholders inside values', () => {
  expect(translate('en', 'common.continueWith', { name: 'Kitchen' })).toBe('Continue with Kitchen');
  expect(translate('es', 'common.ofRooms', { done: 1, total: 3 })).toBe('1 de 3 habitaciones');
  expect(translate('en', 'common.continueWith')).toBe('Continue with {name}');
  expect(translate('en', 'common.continueWith', { name: '{name} $& {x}' })).toBe('Continue with {name} $& {x}');
});

test('langOf maps Spanish locales to es and everything else to en', () => {
  expect(langOf('es-MX')).toBe('es');
  expect(langOf('es')).toBe('es');
  expect(langOf('ES-419')).toBe('es');
  expect(langOf('en-GB')).toBe('en');
  expect(langOf('fr-FR')).toBe('en');
});
