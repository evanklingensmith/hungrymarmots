import { DAY_ORDER } from './dates.mjs';

const DAY_SET = new Set(DAY_ORDER);

function asTrimmedString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(values) {
  if (Array.isArray(values)) {
    return values;
  }

  if (typeof values === 'string') {
    return values.split(',');
  }

  return [];
}

function dedupeCaseInsensitive(values) {
  const seen = new Set();
  const output = [];

  values.forEach((value) => {
    const normalized = asTrimmedString(value);
    if (!normalized) {
      return;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return;
    }

    seen.add(key);
    output.push(normalized);
  });

  return output;
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

export function normalizeStoreName(value) {
  const storeName = asTrimmedString(value);

  if (!storeName) {
    throw new Error('Store name is required.');
  }

  if (storeName.length > 50) {
    throw new Error('Store name must be 50 characters or less.');
  }

  return storeName;
}

export function normalizeLocationName(value) {
  return normalizeStoreName(value);
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

export function normalizeMealDraft(input) {
  const safeInput = input || {};
  const title = asTrimmedString(safeInput.title);
  const description = asTrimmedString(safeInput.description);
  const tags = dedupeCaseInsensitive(normalizeStringArray(safeInput.tags));
  const ingredients = Array.isArray(safeInput.ingredients) ? safeInput.ingredients : [];

  if (!title) {
    throw new Error('Meal title is required.');
  }

  if (title.length > 120) {
    throw new Error('Meal title must be 120 characters or less.');
  }

  if (description.length > 1000) {
    throw new Error('Meal description must be 1000 characters or less.');
  }

  tags.forEach((tag) => {
    if (tag.length > 32) {
      throw new Error('Meal tags must be 32 characters or less.');
    }
  });

  const normalizedIngredients = ingredients.map((ingredient) => {
    const name = asTrimmedString(ingredient?.name);
    if (!name) {
      throw new Error('Every ingredient needs a name.');
    }

    if (name.length > 80) {
      throw new Error('Ingredient names must be 80 characters or less.');
    }

    const ingredientId = asTrimmedString(ingredient?.id);
    const defaultStoreId = asTrimmedString(ingredient?.defaultStoreId);

    return {
      id: ingredientId || null,
      name,
      usuallyNeedToBuy: Boolean(ingredient?.usuallyNeedToBuy),
      defaultStoreId: defaultStoreId || null,
    };
  });

  return {
    title,
    description,
    tags,
    ingredients: normalizedIngredients,
  };
}

export function normalizeWeekDayInput(input) {
  const safeInput = input || {};
  const mealId = asTrimmedString(safeInput.mealId);
  const mealTitle = asTrimmedString(safeInput.mealTitle);
  const cookUid = asTrimmedString(safeInput.cookUid);
  const notes = typeof safeInput.notes === 'string' ? safeInput.notes.trim() : '';
  const eaterUids = dedupeCaseInsensitive(Array.isArray(safeInput.eaterUids) ? safeInput.eaterUids : []);
  const ingredientPlan = Array.isArray(safeInput.ingredientPlan) ? safeInput.ingredientPlan : [];

  if (mealTitle.length > 120) {
    throw new Error('Meal title must be 120 characters or less.');
  }

  if (notes.length > 1000) {
    throw new Error('Notes must be 1000 characters or less.');
  }

  const normalizedIngredientPlan = ingredientPlan.map((entry) => {
    const name = asTrimmedString(entry?.name);
    if (!name) {
      throw new Error('Every planned ingredient needs a name.');
    }

    if (name.length > 80) {
      throw new Error('Planned ingredient names must be 80 characters or less.');
    }

    const ingredientId = asTrimmedString(entry?.ingredientId);
    const storeId = asTrimmedString(entry?.storeId);

    return {
      ingredientId: ingredientId || null,
      name,
      needToBuy: Boolean(entry?.needToBuy),
      storeId: storeId || null,
    };
  });

  return {
    mealId: mealId || null,
    mealTitle: mealTitle || null,
    cookUid: cookUid || null,
    eaterUids,
    notes,
    ingredientPlan: normalizedIngredientPlan,
  };
}

export function normalizeGroceryItemInput(input) {
  const safeInput = input || {};
  const name = asTrimmedString(safeInput.name);
  const quantity = asTrimmedString(safeInput.quantity);
  const notes = asTrimmedString(safeInput.notes);
  const storeId = asTrimmedString(safeInput.storeId || safeInput.locationId);
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

  return {
    name,
    quantity: quantity || null,
    notes: notes || null,
    storeId: storeId || null,
    completed,
  };
}

export function normalizeGroceryInput(input) {
  return normalizeGroceryItemInput(input);
}

export function normalizePantrySection(value) {
  const section = asTrimmedString(value).toLowerCase();

  if (!section) {
    return 'weekly';
  }

  if (section !== 'weekly' && section !== 'other') {
    throw new Error('Pantry section must be weekly or other.');
  }

  return section;
}

export function normalizePantryItemInput(input) {
  const safeInput = input || {};
  const name = asTrimmedString(safeInput.name);
  const section = normalizePantrySection(safeInput.section);

  if (!name) {
    throw new Error('Pantry item name is required.');
  }

  if (name.length > 80) {
    throw new Error('Pantry item name must be 80 characters or less.');
  }

  return {
    name,
    section,
  };
}

export function normalizeMealDay(value) {
  const day = asTrimmedString(value).toLowerCase();

  if (!DAY_SET.has(day)) {
    throw new Error('Meal day must be one of monday-sunday.');
  }

  return day;
}
