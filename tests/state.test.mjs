import { assert, test } from './test-harness.mjs';

import { DAY_ORDER } from '../public/app/utils/dates.mjs';
import { createEmptyWeekPlan, mergeDayDocs, weekIdFromStart } from '../public/app/utils/state.mjs';

test('createEmptyWeekPlan initializes every day with weekly meal fields', () => {
  const plan = createEmptyWeekPlan();

  assert.deepStrictEqual(Object.keys(plan), DAY_ORDER);
  DAY_ORDER.forEach((dayId) => {
    assert.deepStrictEqual(plan[dayId], {
      mealId: null,
      mealTitle: null,
      cookUid: null,
      eaterUids: [],
      notes: '',
      ingredientPlan: [],
      updatedAt: null,
      updatedBy: null,
    });
  });
});

test('mergeDayDocs overlays known day docs and ignores unknown ids', () => {
  const merged = mergeDayDocs([
    {
      dayId: 'monday',
      mealId: 'meal_1',
      mealTitle: 'Soup',
      cookUid: 'u1',
      eaterUids: ['u1', 'u2'],
      notes: 'leftovers for lunch',
      ingredientPlan: [{ ingredientId: 'ing_1', name: 'Carrots', needToBuy: true, storeId: 'store_1' }],
      updatedBy: 'u1',
    },
    { dayId: 'holiday', mealTitle: 'Ignore me' },
  ]);

  assert.strictEqual(merged.monday.mealTitle, 'Soup');
  assert.strictEqual(merged.monday.cookUid, 'u1');
  assert.deepStrictEqual(merged.monday.eaterUids, ['u1', 'u2']);
  assert.strictEqual(merged.tuesday.mealTitle, null);
  assert.strictEqual(merged.holiday, undefined);
});

test('weekIdFromStart uses stable week ids', () => {
  assert.strictEqual(weekIdFromStart('2026-02-09'), '2026-02-09');
});
