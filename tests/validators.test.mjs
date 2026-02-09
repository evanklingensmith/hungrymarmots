import { assert, test } from './test-harness.mjs';

import {
  normalizeGroceryItemInput,
  normalizeHouseholdName,
  normalizeInviteCode,
  normalizeMealDraft,
  normalizeWeekDayInput,
  normalizeStoreName,
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

test('normalizeStoreName validates store labels', () => {
  assert.strictEqual(normalizeStoreName(' Costco '), 'Costco');
  assert.throws(() => normalizeStoreName(''), /required/i);
  assert.throws(() => normalizeStoreName('x'.repeat(51)), /50/);
});

test('normalizeMealDraft validates title, tags, and ingredients', () => {
  const result = normalizeMealDraft({
    title: ' Lemon Chicken ',
    description: ' quick and easy ',
    tags: 'quick, weeknight, QUICK',
    ingredients: [
      { name: ' Lemon ', usuallyNeedToBuy: true, defaultStoreId: 'store_1' },
      { name: 'Chicken', usuallyNeedToBuy: false, defaultStoreId: '' },
    ],
  });

  assert.strictEqual(result.title, 'Lemon Chicken');
  assert.deepStrictEqual(result.tags, ['quick', 'weeknight']);
  assert.strictEqual(result.ingredients.length, 2);
  assert.strictEqual(result.ingredients[0].name, 'Lemon');
  assert.strictEqual(result.ingredients[0].usuallyNeedToBuy, true);
  assert.strictEqual(result.ingredients[0].defaultStoreId, 'store_1');

  assert.throws(() => normalizeMealDraft({ title: ' ', ingredients: [] }), /required/i);
  assert.throws(() => normalizeMealDraft({ title: 'x'.repeat(121), ingredients: [] }), /120/);
});

test('normalizeWeekDayInput normalizes optional meal plan values', () => {
  const result = normalizeWeekDayInput({
    mealId: ' meal_1 ',
    mealTitle: ' Tacos ',
    cookUid: ' cook_1 ',
    eaterUids: [' eater_1 ', ' eater_2 ', 'eater_1'],
    notes: ' family dinner ',
    ingredientPlan: [
      { ingredientId: 'ing_1', name: ' Tortillas ', needToBuy: true, storeId: 'store_1' },
      { ingredientId: '', name: 'Salsa', needToBuy: false, storeId: '' },
    ],
  });

  assert.strictEqual(result.mealId, 'meal_1');
  assert.strictEqual(result.mealTitle, 'Tacos');
  assert.strictEqual(result.cookUid, 'cook_1');
  assert.deepStrictEqual(result.eaterUids, ['eater_1', 'eater_2']);
  assert.strictEqual(result.notes, 'family dinner');
  assert.strictEqual(result.ingredientPlan.length, 2);
  assert.strictEqual(result.ingredientPlan[0].name, 'Tortillas');

  assert.throws(() => normalizeWeekDayInput({ mealTitle: 'x'.repeat(121), eaterUids: [], notes: '', ingredientPlan: [] }), /120/);
  assert.throws(() => normalizeWeekDayInput({ mealTitle: '', eaterUids: [], notes: '', ingredientPlan: [{ name: '' }] }), /needs a name/i);
});

test('normalizeGroceryItemInput validates required fields and optional store/notes', () => {
  assert.deepStrictEqual(
    normalizeGroceryItemInput({
      name: '  Milk ',
      quantity: ' 1 gal ',
      notes: ' low fat ',
      storeId: 'store_1',
      completed: true,
    }),
    {
      name: 'Milk',
      quantity: '1 gal',
      notes: 'low fat',
      storeId: 'store_1',
      completed: true,
    },
  );

  assert.throws(() => normalizeGroceryItemInput({ name: '' }), /required/i);
  assert.throws(() => normalizeGroceryItemInput({ name: 'Milk', notes: 'x'.repeat(241) }), /240/);
});
