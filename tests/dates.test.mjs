import { assert, test } from './test-harness.mjs';

import {
  DAY_ORDER,
  addDaysIso,
  buildWeekDays,
  getWeekStartIso,
  shiftWeekIso,
  toIsoDate,
  weekRangeLabel,
} from '../public/app/utils/dates.mjs';

test('toIsoDate normalizes Date and string inputs', () => {
  assert.strictEqual(toIsoDate('2026-02-09'), '2026-02-09');
  assert.strictEqual(toIsoDate(new Date(Date.UTC(2026, 1, 9))), '2026-02-09');
});

test('getWeekStartIso returns Monday for mid-week date', () => {
  assert.strictEqual(getWeekStartIso('2026-02-12'), '2026-02-09');
  assert.strictEqual(getWeekStartIso('2026-02-09'), '2026-02-09');
});

test('addDaysIso and shiftWeekIso move dates in UTC safely', () => {
  assert.strictEqual(addDaysIso('2026-02-09', 6), '2026-02-15');
  assert.strictEqual(shiftWeekIso('2026-02-09', -1), '2026-02-02');
  assert.strictEqual(shiftWeekIso('2026-02-09', 1), '2026-02-16');
});

test('buildWeekDays includes seven ordered days', () => {
  const days = buildWeekDays('2026-02-09');

  assert.strictEqual(days.length, 7);
  assert.deepStrictEqual(
    days.map((entry) => entry.dayId),
    DAY_ORDER,
  );
  assert.strictEqual(days[0].dateIso, '2026-02-09');
  assert.strictEqual(days[6].dateIso, '2026-02-15');
});

test('weekRangeLabel returns compact label', () => {
  const label = weekRangeLabel('2026-02-09');
  assert.ok(/Feb/.test(label));
  assert.ok(/9/.test(label));
});
