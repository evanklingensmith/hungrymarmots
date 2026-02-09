import { DAY_ORDER } from './dates.mjs';

const DAY_SET = new Set(DAY_ORDER);

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

export function normalizeHouseholdName(value) {
  const name = asTrimmedString(value);

  if (!name) {
    throw new Error('Household name is required.');
  }

  if (name.length > 60) {
    throw new Error('Household name must be 60 characters or less.');
  }

  return name;
}

export function normalizeInviteCode(value) {
  const code = asTrimmedString(value).toUpperCase();

  if (!/^[A-Z0-9]{4,12}$/.test(code)) {
    throw new Error('Invite code must be 4-12 letters or numbers.');
  }

  return code;
}

export function normalizeMealInput(input) {
  const safeInput = input || {};
  const mealName = asTrimmedString(safeInput.mealName);
  const cookUid = asTrimmedString(safeInput.cookUid);

  if (mealName.length > 120) {
    throw new Error('Meal name must be 120 characters or less.');
  }

  return {
    mealName,
    cookUid: cookUid || null,
  };
}

export function normalizeGroceryInput(input) {
  const safeInput = input || {};
  const name = asTrimmedString(safeInput.name);
  const quantity = asTrimmedString(safeInput.quantity);
  const notes = asTrimmedString(safeInput.notes);
  const locationId = asTrimmedString(safeInput.locationId);
  const personTag = asTrimmedString(safeInput.personTag);
  const mealDayId = asTrimmedString(safeInput.mealDayId);
  const completed = Boolean(safeInput.completed);

  if (!name) {
    throw new Error('Item name is required.');
  }

  if (name.length > 80) {
    throw new Error('Item name must be 80 characters or less.');
  }

  if (quantity.length > 24) {
    throw new Error('Quantity must be 24 characters or less.');
  }

  if (notes.length > 240) {
    throw new Error('Notes must be 240 characters or less.');
  }

  if (personTag.length > 50) {
    throw new Error('Person tag must be 50 characters or less.');
  }

  if (mealDayId && !DAY_SET.has(mealDayId)) {
    throw new Error('Meal day must be one of monday-sunday.');
  }

  return {
    name,
    quantity: quantity || null,
    notes: notes || null,
    locationId: locationId || null,
    personTag: personTag || null,
    mealDayId: mealDayId || null,
    completed,
  };
}

export function normalizeLocationName(value) {
  const locationName = asTrimmedString(value);

  if (!locationName) {
    throw new Error('Location name is required.');
  }

  if (locationName.length > 40) {
    throw new Error('Location name must be 40 characters or less.');
  }

  return locationName;
}
