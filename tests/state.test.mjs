import { assert, test } from './test-harness.mjs';

import { DAY_ORDER } from '../public/app/utils/dates.mjs';
import { createEmptyWeekPlan, mergeDayDocs, weekIdFromStart } from '../public/app/utils/state.mjs';

test('createEmptyWeekPlan initializes every day', () => {
  const plan = createEmptyWeekPlan();

  assert.deepStrictEqual(Object.keys(plan), DAY_ORDER);
  DAY_ORDER.forEach((dayId) => {
    assert.deepStrictEqual(plan[dayId], {
      mealName: '',
      cookUid: null,
      updatedAt: null,
      updatedBy: null,
    });
  });
});

test('mergeDayDocs overlays known day docs and ignores unknown ids', () => {
  const merged = mergeDayDocs([
    { dayId: 'monday', mealName: 'Soup', cookUid: 'u1', updatedBy: 'u1' },
    { dayId: 'holiday', mealName: 'Ignore me' },
  ]);

  assert.strictEqual(merged.monday.mealName, 'Soup');
  assert.strictEqual(merged.monday.cookUid, 'u1');
  assert.strictEqual(merged.tuesday.mealName, '');
  assert.strictEqual(merged.holiday, undefined);
});

test('weekIdFromStart uses stable week ids', () => {
  assert.strictEqual(weekIdFromStart('2026-02-09'), '2026-02-09');
});
