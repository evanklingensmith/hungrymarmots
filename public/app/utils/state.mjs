import { DAY_ORDER } from './dates.mjs';

const DAY_SET = new Set(DAY_ORDER);

function coalesce(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

export function createEmptyWeekPlan() {
  const plan = {};

  DAY_ORDER.forEach((dayId) => {
    plan[dayId] = {
      mealName: '',
      cookUid: null,
      updatedAt: null,
      updatedBy: null,
    };
  });

  return plan;
}

export function mergeDayDocs(dayDocs) {
  const merged = createEmptyWeekPlan();

  dayDocs.forEach((dayDoc) => {
    if (!DAY_SET.has(dayDoc.dayId)) {
      return;
    }

    merged[dayDoc.dayId] = {
      mealName: coalesce(dayDoc.mealName, ''),
      cookUid: coalesce(dayDoc.cookUid, null),
      updatedAt: coalesce(dayDoc.updatedAt, null),
      updatedBy: coalesce(dayDoc.updatedBy, null),
    };
  });

  return merged;
}

export function weekIdFromStart(weekStartIso) {
  return weekStartIso;
}
