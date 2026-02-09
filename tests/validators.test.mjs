import { assert, test } from './test-harness.mjs';

import {
  normalizeGroceryInput,
  normalizeHouseholdName,
  normalizeInviteCode,
  normalizeLocationName,
  normalizeMealInput,
} from '../public/app/utils/validators.mjs';

test('normalizeHouseholdName trims and validates length', () => {
  assert.strictEqual(normalizeHouseholdName('  Home Base  '), 'Home Base');
  assert.throws(() => normalizeHouseholdName(''), /required/i);
  assert.throws(() => normalizeHouseholdName('x'.repeat(61)), /60/);
});

test('normalizeInviteCode uppercases and validates format', () => {
  assert.strictEqual(normalizeInviteCode(' ab12 '), 'AB12');
  assert.throws(() => normalizeInviteCode('abc'), /4-12/);
  assert.throws(() => normalizeInviteCode('abc!'), /4-12/);
});

test('normalizeMealInput allows empty clear payload and cook selection', () => {
  assert.deepStrictEqual(normalizeMealInput({ mealName: '  Tacos ', cookUid: ' user_1 ' }), {
    mealName: 'Tacos',
    cookUid: 'user_1',
  });

  assert.deepStrictEqual(normalizeMealInput({ mealName: ' ', cookUid: '' }), {
    mealName: '',
    cookUid: null,
  });

  assert.throws(() => normalizeMealInput({ mealName: 'x'.repeat(121) }), /120/);
});

test('normalizeGroceryInput validates required fields and optional refs', () => {
  assert.deepStrictEqual(
    normalizeGroceryInput({
      name: '  Milk ',
      quantity: ' 1 gal ',
      notes: ' low fat ',
      locationId: 'store_1',
      personTag: 'Alex',
      mealDayId: 'monday',
      completed: true,
    }),
    {
      name: 'Milk',
      quantity: '1 gal',
      notes: 'low fat',
      locationId: 'store_1',
      personTag: 'Alex',
      mealDayId: 'monday',
      completed: true,
    },
  );

  assert.throws(() => normalizeGroceryInput({ name: '' }), /required/i);
  assert.throws(() => normalizeGroceryInput({ name: 'Bread', mealDayId: 'holiday' }), /one of monday-sunday/i);
});

test('normalizeLocationName validates location labels', () => {
  assert.strictEqual(normalizeLocationName(' Costco '), 'Costco');
  assert.throws(() => normalizeLocationName(''), /required/i);
  assert.throws(() => normalizeLocationName('x'.repeat(41)), /40/);
});
