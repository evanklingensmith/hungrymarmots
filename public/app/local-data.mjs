import { DAY_ORDER } from './utils/dates.mjs';
import {
  normalizeGroceryItemInput,
  normalizeHouseholdName,
  normalizeInviteCode,
  normalizeMealDraft,
  normalizeMealInput,
  normalizePantrySection,
  normalizeStoreName,
  normalizeWeekDayInput,
} from './utils/validators.mjs';

const DAY_SET = new Set(DAY_ORDER);
const STORAGE_KEY = 'weektable.local.v2';

export const LOCAL_MODE_USER = Object.freeze({
  uid: 'local-user',
  displayName: 'Local user',
  email: null,
  photoURL: null,
});

function nowIso() {
  return new Date().toISOString();
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function makeId(prefix) {
  const random = Math.random().toString(36).slice(2, 9);
  const time = Date.now().toString(36);
  return `${prefix}-${time}-${random}`;
}

function hasStorage() {
  try {
    return typeof globalThis !== 'undefined' && Boolean(globalThis.localStorage);
  } catch (error) {
    return false;
  }
}

function loadStoredState(storage) {
  if (!storage) {
    return null;
  }

  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    console.warn('Failed to load local app state', error);
    return null;
  }
}

function saveStoredState(storage, state) {
  if (!storage) {
    return;
  }

  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.warn('Failed to persist local app state', error);
  }
}

function createEmptyState() {
  return {
    households: [],
    userDefaults: {},
    membersByHousehold: {},
    storesByHousehold: {},
    mealsByHousehold: {},
    weeksByHousehold: {},
    groceryByHousehold: {},
    pantryByHousehold: {},
    activityByHousehold: {},
  };
}

function ensureCollection(map, key) {
  if (!map[key]) {
    map[key] = {};
  }

  return map[key];
}

function ensureHouseholdContainers(state, householdId) {
  ensureCollection(state.membersByHousehold, householdId);
  ensureCollection(state.storesByHousehold, householdId);
  ensureCollection(state.mealsByHousehold, householdId);
  ensureCollection(state.weeksByHousehold, householdId);
  ensureCollection(state.groceryByHousehold, householdId);
  ensureCollection(state.pantryByHousehold, householdId);
  ensureCollection(state.activityByHousehold, householdId);
}

function normalizeStateShape(state) {
  const normalized = state && typeof state === 'object' ? state : createEmptyState();

  if (!Array.isArray(normalized.households)) {
    normalized.households = [];
  }

  if (!normalized.userDefaults || typeof normalized.userDefaults !== 'object') {
    normalized.userDefaults = {};
  }

  if (!normalized.membersByHousehold || typeof normalized.membersByHousehold !== 'object') {
    normalized.membersByHousehold = {};
  }

  if (!normalized.storesByHousehold || typeof normalized.storesByHousehold !== 'object') {
    normalized.storesByHousehold = {};
  }

  if (!normalized.mealsByHousehold || typeof normalized.mealsByHousehold !== 'object') {
    normalized.mealsByHousehold = {};
  }

  if (!normalized.weeksByHousehold || typeof normalized.weeksByHousehold !== 'object') {
    normalized.weeksByHousehold = {};
  }

  if (!normalized.groceryByHousehold || typeof normalized.groceryByHousehold !== 'object') {
    normalized.groceryByHousehold = {};
  }

  if (!normalized.pantryByHousehold || typeof normalized.pantryByHousehold !== 'object') {
    normalized.pantryByHousehold = {};
  }

  if (!normalized.activityByHousehold || typeof normalized.activityByHousehold !== 'object') {
    normalized.activityByHousehold = {};
  }

  normalized.households.forEach((household) => {
    if (!household || !household.id) {
      return;
    }

    ensureHouseholdContainers(normalized, household.id);
  });

  return normalized;
}

function listHouseholdsForUser(state, uid) {
  return state.households
    .filter((household) => {
      return Array.isArray(household.memberUids) && household.memberUids.includes(uid);
    })
    .map((household) => copy(household))
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));
}

function defaultStateForUser(state, uid) {
  const defaults = state.userDefaults[uid];
  if (defaults && typeof defaults === 'object') {
    return defaults;
  }

  state.userDefaults[uid] = {
    defaultHouseholdId: null,
  };

  return state.userDefaults[uid];
}

function userInHousehold(state, householdId, uid) {
  const household = state.households.find((entry) => entry.id === householdId);
  return Boolean(household && Array.isArray(household.memberUids) && household.memberUids.includes(uid));
}

function resolveDefaultHouseholdId(state, uid) {
  const defaults = defaultStateForUser(state, uid);
  const candidate = typeof defaults.defaultHouseholdId === 'string' ? defaults.defaultHouseholdId : null;

  if (candidate && userInHousehold(state, candidate, uid)) {
    return candidate;
  }

  const households = listHouseholdsForUser(state, uid);
  return households.length ? households[0].id : null;
}

function setDefaultHousehold(state, uid, householdId) {
  const defaults = defaultStateForUser(state, uid);
  defaults.defaultHouseholdId = householdId || null;
}

function registerListener(bucket, descriptor) {
  bucket.push(descriptor);
  descriptor.push();

  return () => {
    const index = bucket.indexOf(descriptor);
    if (index >= 0) {
      bucket.splice(index, 1);
    }
  };
}

function notifyListeners(context, kind, householdId, options = {}) {
  const hasWeekFilter = Object.prototype.hasOwnProperty.call(options, 'weekId');
  const weekId = hasWeekFilter ? options.weekId : null;

  context.listeners[kind].forEach((listener) => {
    if (listener.householdId !== householdId) {
      return;
    }

    if (kind === 'week' && hasWeekFilter && listener.weekId !== weekId) {
      return;
    }

    try {
      listener.push();
    } catch (error) {
      if (typeof listener.onError === 'function') {
        listener.onError(error);
      } else {
        console.error(error);
      }
    }
  });
}

function emitHousehold(context, householdId, weekId = null) {
  notifyListeners(context, 'members', householdId);
  notifyListeners(context, 'stores', householdId);
  notifyListeners(context, 'meals', householdId);
  notifyListeners(context, 'grocery', householdId);
  notifyListeners(context, 'pantry', householdId);
  notifyListeners(context, 'activity', householdId);

  if (weekId) {
    notifyListeners(context, 'week', householdId, { weekId });
  }
}

function persist(context) {
  saveStoredState(context.storage, context.state);
}

function ensureAccess(context, householdId, uid = context.user.uid) {
  if (!userInHousehold(context.state, householdId, uid)) {
    throw new Error('You do not have access to this household.');
  }
}

function displayName(user) {
  return user.displayName || user.email || 'Local user';
}

function addActivity(state, householdId, user, scope, action, message, undo = null) {
  const id = makeId('activity');
  ensureHouseholdContainers(state, householdId);

  state.activityByHousehold[householdId][id] = {
    id,
    actorUid: user.uid,
    actorName: displayName(user),
    scope,
    action,
    message,
    undo,
    undone: false,
    undoneBy: null,
    undoneAt: null,
    createdAt: nowIso(),
  };

  return id;
}

function membersForHousehold(state, householdId) {
  ensureHouseholdContainers(state, householdId);

  return Object.values(state.membersByHousehold[householdId])
    .map((member) => copy(member))
    .sort((left, right) => {
      if (left.role !== right.role) {
        return left.role === 'owner' ? -1 : 1;
      }

      return String(left.displayName).localeCompare(String(right.displayName));
    });
}

function storesForHousehold(state, householdId) {
  ensureHouseholdContainers(state, householdId);

  return Object.values(state.storesByHousehold[householdId])
    .map((store) => copy(store))
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));
}

function mealsForHousehold(state, householdId) {
  ensureHouseholdContainers(state, householdId);

  return Object.values(state.mealsByHousehold[householdId])
    .map((meal) => copy(meal))
    .sort((left, right) => String(left.title).localeCompare(String(right.title)));
}

function groceryItemsForHousehold(state, householdId) {
  ensureHouseholdContainers(state, householdId);

  return Object.values(state.groceryByHousehold[householdId])
    .map((item) => copy(item))
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));
}

function pantryItemsForHousehold(state, householdId) {
  ensureHouseholdContainers(state, householdId);

  return Object.values(state.pantryByHousehold[householdId])
    .map((item) => copy(item))
    .sort((left, right) => {
      if (left.section !== right.section) {
        return left.section === 'weekly' ? -1 : 1;
      }

      return String(left.name).localeCompare(String(right.name));
    });
}

function activityForHousehold(state, householdId, limit = 100) {
  ensureHouseholdContainers(state, householdId);

  return Object.values(state.activityByHousehold[householdId])
    .map((entry) => copy(entry))
    .sort((left, right) => String(right.createdAt).localeCompare(String(left.createdAt)))
    .slice(0, limit);
}

function weekDaysForHousehold(state, householdId, weekId) {
  ensureHouseholdContainers(state, householdId);

  const week = state.weeksByHousehold[householdId][weekId] || {};

  return DAY_ORDER.map((dayId) => {
    const day = week[dayId];

    if (!day) {
      return {
        dayId,
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

    return {
      dayId,
      mealId: day.mealId || null,
      mealTitle: day.mealTitle || null,
      cookUid: day.cookUid || null,
      eaterUids: Array.isArray(day.eaterUids) ? copy(day.eaterUids) : [],
      notes: day.notes || '',
      ingredientPlan: Array.isArray(day.ingredientPlan) ? copy(day.ingredientPlan) : [],
      updatedAt: day.updatedAt || null,
      updatedBy: day.updatedBy || null,
    };
  });
}

function pantryIdFromGrocery(itemId) {
  return `auto-${itemId}`;
}

function removePantryForGrocery(state, householdId, itemId) {
  const pantryId = pantryIdFromGrocery(itemId);
  delete state.pantryByHousehold[householdId][pantryId];
}

function upsertPantryForGrocery(state, householdId, groceryItem, user) {
  const pantryId = pantryIdFromGrocery(groceryItem.id);

  state.pantryByHousehold[householdId][pantryId] = {
    id: pantryId,
    name: groceryItem.name,
    section: 'weekly',
    sourceGroceryItemId: groceryItem.id,
    autoFromGrocery: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy: user.uid,
    updatedBy: user.uid,
  };
}

function putGroceryItem(context, householdId, item) {
  ensureHouseholdContainers(context.state, householdId);
  context.state.groceryByHousehold[householdId][item.id] = item;
}

function removeAutoMealGroceryForDay(state, householdId, weekId, dayId) {
  const groceryMap = state.groceryByHousehold[householdId];
  const ids = Object.keys(groceryMap).filter((itemId) => {
    const item = groceryMap[itemId];
    return item.autoGeneratedFromMeal && item.sourceWeekId === weekId && item.sourceDayId === dayId;
  });

  ids.forEach((itemId) => {
    delete groceryMap[itemId];
    removePantryForGrocery(state, householdId, itemId);
  });

  return ids.length;
}

function createGroceryItemFromIngredient(householdId, weekId, dayId, mealId, ingredient, user) {
  const id = makeId('grocery');

  return {
    id,
    householdId,
    name: ingredient.name,
    quantity: null,
    notes: null,
    storeId: ingredient.storeId || null,
    completed: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy: user.uid,
    updatedBy: user.uid,
    sourceWeekId: weekId,
    sourceDayId: dayId,
    sourceMealId: mealId || null,
    autoGeneratedFromMeal: true,
  };
}

function normalizeUndoPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  return copy(payload);
}

function applyUndoPayload(context, householdId, payload, user) {
  const undo = normalizeUndoPayload(payload);

  if (!undo || !undo.type) {
    throw new Error('This action cannot be undone.');
  }

  ensureHouseholdContainers(context.state, householdId);

  switch (undo.type) {
    case 'delete-grocery': {
      const itemId = String(undo.itemId || '');
      if (itemId) {
        delete context.state.groceryByHousehold[householdId][itemId];
        removePantryForGrocery(context.state, householdId, itemId);
      }
      return;
    }

    case 'restore-grocery': {
      const item = undo.item;
      if (!item || !item.id) {
        return;
      }

      context.state.groceryByHousehold[householdId][item.id] = {
        ...copy(item),
        updatedAt: nowIso(),
        updatedBy: user.uid,
      };

      if (item.completed) {
        upsertPantryForGrocery(context.state, householdId, item, user);
      }
      return;
    }

    case 'set-grocery-completed': {
      const itemId = String(undo.itemId || '');
      const completed = Boolean(undo.completed);
      const item = context.state.groceryByHousehold[householdId][itemId];
      if (!item) {
        return;
      }

      item.completed = completed;
      item.updatedAt = nowIso();
      item.updatedBy = user.uid;

      if (completed) {
        upsertPantryForGrocery(context.state, householdId, item, user);
      } else {
        removePantryForGrocery(context.state, householdId, itemId);
      }

      return;
    }

    case 'restore-pantry': {
      const item = undo.item;
      if (!item || !item.id) {
        return;
      }

      context.state.pantryByHousehold[householdId][item.id] = {
        ...copy(item),
        updatedAt: nowIso(),
        updatedBy: user.uid,
      };
      return;
    }

    case 'delete-pantry': {
      const itemId = String(undo.itemId || '');
      if (itemId) {
        delete context.state.pantryByHousehold[householdId][itemId];
      }
      return;
    }

    case 'set-pantry-section': {
      const itemId = String(undo.itemId || '');
      const section = normalizePantrySection(undo.section);
      const item = context.state.pantryByHousehold[householdId][itemId];
      if (!item) {
        return;
      }

      item.section = section;
      item.updatedAt = nowIso();
      item.updatedBy = user.uid;
      return;
    }

    default:
      throw new Error('Unknown undo action.');
  }
}

export function createLocalContext(user = LOCAL_MODE_USER, options = {}) {
  const normalizedUser = {
    uid: user.uid || LOCAL_MODE_USER.uid,
    displayName: user.displayName || LOCAL_MODE_USER.displayName,
    email: Object.prototype.hasOwnProperty.call(user, 'email') ? user.email : LOCAL_MODE_USER.email,
    photoURL: Object.prototype.hasOwnProperty.call(user, 'photoURL') ? user.photoURL : LOCAL_MODE_USER.photoURL,
  };

  const storage = Object.prototype.hasOwnProperty.call(options, 'storage')
    ? options.storage
    : hasStorage()
      ? globalThis.localStorage
      : null;

  const loaded = loadStoredState(storage);
  const state = normalizeStateShape(loaded || createEmptyState());

  const context = {
    user: normalizedUser,
    storage,
    state,
    listeners: {
      members: [],
      stores: [],
      meals: [],
      week: [],
      grocery: [],
      pantry: [],
      activity: [],
    },
  };

  defaultStateForUser(context.state, normalizedUser.uid);
  persist(context);

  return context;
}

export async function listUserHouseholds(context, uid) {
  return listHouseholdsForUser(context.state, uid);
}

export async function getDefaultHouseholdId(context, uid) {
  return resolveDefaultHouseholdId(context.state, uid);
}

export async function setDefaultHouseholdId(context, uid, householdId) {
  if (householdId && !userInHousehold(context.state, householdId, uid)) {
    throw new Error('Cannot set default household that you are not a member of.');
  }

  setDefaultHousehold(context.state, uid, householdId || null);
  persist(context);
}

function createMemberPayload(user, role, joinCode) {
  return {
    uid: user.uid,
    email: user.email || null,
    displayName: displayName(user),
    photoURL: user.photoURL || null,
    role,
    joinCode,
    joinedAt: nowIso(),
    updatedAt: nowIso(),
  };
}

export async function createHousehold(context, user, rawHouseholdName) {
  const householdName = normalizeHouseholdName(rawHouseholdName);
  const householdId = makeId('household');
  const inviteCode = Math.random().toString(36).slice(2, 8).toUpperCase();

  const household = {
    id: householdId,
    name: householdName,
    ownerUid: user.uid,
    memberUids: [user.uid],
    inviteCode,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  context.state.households.push(household);
  ensureHouseholdContainers(context.state, householdId);
  context.state.membersByHousehold[householdId][user.uid] = createMemberPayload(user, 'owner', inviteCode);

  setDefaultHousehold(context.state, user.uid, householdId);

  addActivity(
    context.state,
    householdId,
    user,
    'system',
    'household-created',
    `Created household "${householdName}".`,
    null,
  );

  persist(context);
  emitHousehold(context, householdId);

  return householdId;
}

export async function joinHousehold(context, user, rawHouseholdId, rawInviteCode) {
  const householdId = String(rawHouseholdId || '').trim();
  const inviteCode = normalizeInviteCode(rawInviteCode);

  if (!householdId) {
    throw new Error('Household id is required.');
  }

  const household = context.state.households.find((entry) => entry.id === householdId);
  if (!household) {
    throw new Error('Household not found.');
  }

  if (String(household.inviteCode || '').toUpperCase() !== inviteCode) {
    throw new Error('Invite code does not match.');
  }

  if (!household.memberUids.includes(user.uid)) {
    household.memberUids.push(user.uid);
  }

  ensureHouseholdContainers(context.state, householdId);
  context.state.membersByHousehold[householdId][user.uid] = createMemberPayload(user, 'member', inviteCode);
  household.updatedAt = nowIso();

  setDefaultHousehold(context.state, user.uid, householdId);

  addActivity(context.state, householdId, user, 'system', 'household-join', 'Joined household.', null);

  persist(context);
  emitHousehold(context, householdId);
}

export function listenMembers(context, householdId, callback, onError) {
  return registerListener(context.listeners.members, {
    householdId,
    onError,
    push: () => {
      callback(membersForHousehold(context.state, householdId));
    },
  });
}

export function listenStores(context, householdId, callback, onError) {
  return registerListener(context.listeners.stores, {
    householdId,
    onError,
    push: () => {
      callback(storesForHousehold(context.state, householdId));
    },
  });
}

export function listenLocations(context, householdId, callback, onError) {
  return listenStores(context, householdId, callback, onError);
}

export function listenMeals(context, householdId, callback, onError) {
  return registerListener(context.listeners.meals, {
    householdId,
    onError,
    push: () => {
      callback(mealsForHousehold(context.state, householdId));
    },
  });
}

export function listenWeekDays(context, householdId, weekId, callback, onError) {
  return registerListener(context.listeners.week, {
    householdId,
    weekId,
    onError,
    push: () => {
      callback(weekDaysForHousehold(context.state, householdId, weekId));
    },
  });
}

export function listenGroceryItems(context, householdId, callback, onError) {
  return registerListener(context.listeners.grocery, {
    householdId,
    onError,
    push: () => {
      callback(groceryItemsForHousehold(context.state, householdId));
    },
  });
}

export function listenPantryItems(context, householdId, callback, onError) {
  return registerListener(context.listeners.pantry, {
    householdId,
    onError,
    push: () => {
      callback(pantryItemsForHousehold(context.state, householdId));
    },
  });
}

export function listenActivity(context, householdId, callback, onError, limit = 100) {
  return registerListener(context.listeners.activity, {
    householdId,
    onError,
    push: () => {
      callback(activityForHousehold(context.state, householdId, limit));
    },
  });
}

export async function addStore(context, householdId, rawStoreName, user) {
  ensureAccess(context, householdId, user.uid);
  const storeName = normalizeStoreName(rawStoreName);

  const existing = Object.values(context.state.storesByHousehold[householdId]).find((store) => {
    return String(store.name).toLowerCase() === storeName.toLowerCase();
  });

  if (existing) {
    throw new Error('Store already exists.');
  }

  const id = makeId('store');

  context.state.storesByHousehold[householdId][id] = {
    id,
    name: storeName,
    createdBy: user.uid,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  addActivity(context.state, householdId, user, 'grocery', 'store-add', `Added store ${storeName}.`, null);

  persist(context);
  notifyListeners(context, 'stores', householdId);
  notifyListeners(context, 'activity', householdId);

  return id;
}

export async function addLocation(context, householdId, rawLocationName, user) {
  return addStore(context, householdId, rawLocationName, user);
}

export async function removeStore(context, householdId, storeId, user) {
  ensureAccess(context, householdId, user.uid);
  ensureHouseholdContainers(context.state, householdId);

  const stores = context.state.storesByHousehold[householdId];
  const store = stores[storeId];

  if (!store) {
    throw new Error('Store not found.');
  }

  delete stores[storeId];

  Object.values(context.state.mealsByHousehold[householdId]).forEach((meal) => {
    meal.ingredients = Array.isArray(meal.ingredients)
      ? meal.ingredients.map((ingredient) => {
        if (ingredient.defaultStoreId === storeId) {
          return {
            ...ingredient,
            defaultStoreId: null,
          };
        }

        return ingredient;
      })
      : [];
  });

  Object.values(context.state.groceryByHousehold[householdId]).forEach((item) => {
    if (item.storeId === storeId) {
      item.storeId = null;
      item.updatedAt = nowIso();
      item.updatedBy = user.uid;
    }
  });

  Object.values(context.state.weeksByHousehold[householdId]).forEach((week) => {
    Object.values(week).forEach((day) => {
      if (!Array.isArray(day.ingredientPlan)) {
        return;
      }

      day.ingredientPlan = day.ingredientPlan.map((entry) => {
        if (entry.storeId === storeId) {
          return {
            ...entry,
            storeId: null,
          };
        }

        return entry;
      });
    });
  });

  addActivity(context.state, householdId, user, 'grocery', 'store-remove', `Removed store ${store.name}.`, null);

  persist(context);
  notifyListeners(context, 'stores', householdId);
  notifyListeners(context, 'meals', householdId);
  notifyListeners(context, 'week', householdId);
  notifyListeners(context, 'grocery', householdId);
  notifyListeners(context, 'activity', householdId);
}

export async function createMeal(context, householdId, input, user) {
  ensureAccess(context, householdId, user.uid);
  const meal = normalizeMealDraft(input);
  ensureHouseholdContainers(context.state, householdId);

  const id = makeId('meal');

  context.state.mealsByHousehold[householdId][id] = {
    id,
    title: meal.title,
    description: meal.description,
    tags: meal.tags,
    ingredients: meal.ingredients.map((ingredient) => ({
      id: ingredient.id || makeId('ingredient'),
      name: ingredient.name,
      usuallyNeedToBuy: ingredient.usuallyNeedToBuy,
      defaultStoreId: ingredient.defaultStoreId,
    })),
    createdBy: user.uid,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  addActivity(context.state, householdId, user, 'weekly', 'meal-add', `Added meal ${meal.title}.`, null);

  persist(context);
  notifyListeners(context, 'meals', householdId);
  notifyListeners(context, 'activity', householdId);

  return id;
}

export async function saveWeekDayPlan(context, householdId, weekId, dayId, input, user) {
  ensureAccess(context, householdId, user.uid);

  if (!DAY_SET.has(dayId)) {
    throw new Error('Invalid day id.');
  }

  const payload = normalizeWeekDayInput(input);
  ensureHouseholdContainers(context.state, householdId);

  if (!context.state.weeksByHousehold[householdId][weekId]) {
    context.state.weeksByHousehold[householdId][weekId] = {};
  }

  const previousDay = context.state.weeksByHousehold[householdId][weekId][dayId]
    ? copy(context.state.weeksByHousehold[householdId][weekId][dayId])
    : null;

  context.state.weeksByHousehold[householdId][weekId][dayId] = {
    mealId: payload.mealId,
    mealTitle: payload.mealTitle,
    cookUid: payload.cookUid,
    eaterUids: payload.eaterUids,
    notes: payload.notes,
    ingredientPlan: payload.ingredientPlan,
    updatedAt: nowIso(),
    updatedBy: user.uid,
  };

  removeAutoMealGroceryForDay(context.state, householdId, weekId, dayId);

  payload.ingredientPlan
    .filter((entry) => entry.needToBuy)
    .forEach((entry) => {
      const groceryItem = createGroceryItemFromIngredient(
        householdId,
        weekId,
        dayId,
        payload.mealId,
        entry,
        user,
      );
      putGroceryItem(context, householdId, groceryItem);
    });

  const mealLabel = payload.mealTitle || 'No meal set';
  const previousLabel = previousDay?.mealTitle || null;

  if (previousLabel !== mealLabel) {
    addActivity(context.state, householdId, user, 'weekly', 'day-update', `${dayId}: ${mealLabel}`, null);
  }

  persist(context);
  notifyListeners(context, 'week', householdId, { weekId });
  notifyListeners(context, 'grocery', householdId);
  notifyListeners(context, 'pantry', householdId);
  notifyListeners(context, 'activity', householdId);
}

export async function saveMealForDay(context, householdId, weekId, dayId, input, user) {
  const normalized = normalizeMealInput(input);
  return saveWeekDayPlan(
    context,
    householdId,
    weekId,
    dayId,
    {
      mealId: null,
      mealTitle: normalized.mealName || null,
      cookUid: normalized.cookUid,
      eaterUids: [],
      notes: '',
      ingredientPlan: [],
    },
    user,
  );
}

export async function addGroceryItem(context, householdId, input, user) {
  ensureAccess(context, householdId, user.uid);
  const item = normalizeGroceryItemInput(input);
  ensureHouseholdContainers(context.state, householdId);

  const id = makeId('grocery');
  const payload = {
    id,
    householdId,
    name: item.name,
    quantity: item.quantity,
    notes: item.notes,
    storeId: item.storeId,
    completed: item.completed,
    createdBy: user.uid,
    updatedBy: user.uid,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    sourceWeekId: input?.sourceWeekId || null,
    sourceDayId: input?.sourceDayId || null,
    sourceMealId: input?.sourceMealId || null,
    autoGeneratedFromMeal: Boolean(input?.autoGeneratedFromMeal),
  };

  context.state.groceryByHousehold[householdId][id] = payload;

  if (payload.completed) {
    upsertPantryForGrocery(context.state, householdId, payload, user);
  }

  addActivity(
    context.state,
    householdId,
    user,
    'grocery',
    'add',
    `Added ${payload.name}.`,
    {
      type: 'delete-grocery',
      itemId: id,
    },
  );

  persist(context);
  notifyListeners(context, 'grocery', householdId);
  notifyListeners(context, 'pantry', householdId);
  notifyListeners(context, 'activity', householdId);

  return id;
}

export async function setGroceryItemCompleted(context, householdId, itemId, completed, user) {
  ensureAccess(context, householdId, user.uid);
  ensureHouseholdContainers(context.state, householdId);

  const item = context.state.groceryByHousehold[householdId][itemId];
  if (!item) {
    throw new Error('Grocery item not found.');
  }

  const previousCompleted = Boolean(item.completed);
  const nextCompleted = Boolean(completed);

  item.completed = nextCompleted;
  item.updatedAt = nowIso();
  item.updatedBy = user.uid;

  if (nextCompleted) {
    upsertPantryForGrocery(context.state, householdId, item, user);
  } else {
    removePantryForGrocery(context.state, householdId, itemId);
  }

  const message = nextCompleted
    ? `Checked off ${item.name} (added to weekly pantry).`
    : `Unchecked ${item.name} (removed from weekly pantry).`;

  addActivity(
    context.state,
    householdId,
    user,
    'grocery',
    nextCompleted ? 'check' : 'uncheck',
    message,
    {
      type: 'set-grocery-completed',
      itemId,
      completed: previousCompleted,
    },
  );

  persist(context);
  notifyListeners(context, 'grocery', householdId);
  notifyListeners(context, 'pantry', householdId);
  notifyListeners(context, 'activity', householdId);
}

export async function deleteGroceryItem(context, householdId, itemId, user) {
  ensureAccess(context, householdId, user.uid);
  ensureHouseholdContainers(context.state, householdId);

  const item = context.state.groceryByHousehold[householdId][itemId];
  if (!item) {
    throw new Error('Grocery item not found.');
  }

  delete context.state.groceryByHousehold[householdId][itemId];
  removePantryForGrocery(context.state, householdId, itemId);

  addActivity(
    context.state,
    householdId,
    user,
    'grocery',
    'remove',
    `Removed ${item.name}.`,
    {
      type: 'restore-grocery',
      item,
    },
  );

  persist(context);
  notifyListeners(context, 'grocery', householdId);
  notifyListeners(context, 'pantry', householdId);
  notifyListeners(context, 'activity', householdId);
}

export async function movePantryItem(context, householdId, itemId, rawSection, user) {
  ensureAccess(context, householdId, user.uid);
  ensureHouseholdContainers(context.state, householdId);

  const section = normalizePantrySection(rawSection);
  const item = context.state.pantryByHousehold[householdId][itemId];

  if (!item) {
    throw new Error('Pantry item not found.');
  }

  if (item.section === section) {
    return;
  }

  const previousSection = item.section;
  item.section = section;
  item.updatedAt = nowIso();
  item.updatedBy = user.uid;

  addActivity(
    context.state,
    householdId,
    user,
    'pantry',
    'move',
    `Moved ${item.name} to ${section}.`,
    {
      type: 'set-pantry-section',
      itemId,
      section: previousSection,
    },
  );

  persist(context);
  notifyListeners(context, 'pantry', householdId);
  notifyListeners(context, 'activity', householdId);
}

export async function deletePantryItem(context, householdId, itemId, user) {
  ensureAccess(context, householdId, user.uid);
  ensureHouseholdContainers(context.state, householdId);

  const item = context.state.pantryByHousehold[householdId][itemId];
  if (!item) {
    throw new Error('Pantry item not found.');
  }

  delete context.state.pantryByHousehold[householdId][itemId];

  addActivity(
    context.state,
    householdId,
    user,
    'pantry',
    'remove',
    `Removed ${item.name} from pantry.`,
    {
      type: 'restore-pantry',
      item,
    },
  );

  persist(context);
  notifyListeners(context, 'pantry', householdId);
  notifyListeners(context, 'activity', householdId);
}

export async function undoActivity(context, householdId, activityId, user) {
  ensureAccess(context, householdId, user.uid);
  ensureHouseholdContainers(context.state, householdId);

  const entry = context.state.activityByHousehold[householdId][activityId];

  if (!entry) {
    throw new Error('History entry not found.');
  }

  if (entry.undone) {
    throw new Error('History entry is already undone.');
  }

  if (!entry.undo) {
    throw new Error('This history entry cannot be undone.');
  }

  applyUndoPayload(context, householdId, entry.undo, user);

  entry.undone = true;
  entry.undoneBy = user.uid;
  entry.undoneAt = nowIso();

  addActivity(context.state, householdId, user, entry.scope || 'system', 'undo', `Undid: ${entry.message}`, null);

  persist(context);
  notifyListeners(context, 'grocery', householdId);
  notifyListeners(context, 'pantry', householdId);
  notifyListeners(context, 'activity', householdId);
}

export function getSyncConflictState() {
  return {
    clientId: LOCAL_MODE_USER.uid,
    pendingWrites: 0,
    count: 0,
    conflicts: [],
  };
}

export function subscribeSyncConflicts(callback) {
  if (typeof callback === 'function') {
    callback(getSyncConflictState());
  }

  return () => {};
}

export async function resolveSyncConflicts() {
  return {
    resolved: 0,
    remaining: 0,
  };
}
