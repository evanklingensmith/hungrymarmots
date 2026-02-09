import { DAY_ORDER } from './dates.mjs';

const DAY_SET = new Set(DAY_ORDER);

function coalesce(value, fallback) {
  return value === undefined || value === null ? fallback : value;
}

function normalizeEaterUids(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === 'string' ? entry.trim() : ''))
    .filter((entry) => entry.length > 0);
}

function normalizeIngredientPlan(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return null;
      }

      const name = typeof entry.name === 'string' ? entry.name.trim() : '';
      if (!name) {
        return null;
      }

      const ingredientId = typeof entry.ingredientId === 'string' ? entry.ingredientId.trim() : '';
      const storeId = typeof entry.storeId === 'string' ? entry.storeId.trim() : '';

      return {
        ingredientId: ingredientId || null,
        name,
        needToBuy: Boolean(entry.needToBuy),
        storeId: storeId || null,
      };
    })
    .filter(Boolean);
}

function emptyDay() {
  return {
    mealId: null,
    mealTitle: null,
    cookUid: null,
    eaterUids: [],
    notes: '',
    ingredientPlan: [],
    updatedAt: null,
    updatedBy: null,
  };
}

export function createEmptyWeekPlan() {
  const plan = {};

  DAY_ORDER.forEach((dayId) => {
    plan[dayId] = emptyDay();
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
      mealId: coalesce(dayDoc.mealId, null),
      mealTitle: coalesce(dayDoc.mealTitle, null),
      cookUid: coalesce(dayDoc.cookUid, null),
      eaterUids: normalizeEaterUids(dayDoc.eaterUids),
      notes: coalesce(dayDoc.notes, ''),
      ingredientPlan: normalizeIngredientPlan(dayDoc.ingredientPlan),
      updatedAt: coalesce(dayDoc.updatedAt, null),
      updatedBy: coalesce(dayDoc.updatedBy, null),
    };
  });

  return merged;
}

export function weekIdFromStart(weekStartIso) {
  return weekStartIso;
}
