import { DAY_ORDER } from './utils/dates.mjs';
import {
  normalizeGroceryInput,
  normalizeHouseholdName,
  normalizeInviteCode,
  normalizeLocationName,
  normalizeMealInput,
} from './utils/validators.mjs';

const DAY_SET = new Set(DAY_ORDER);
const STORAGE_KEY = 'weektable.local.v1';
const DEFAULT_HOUSEHOLD_ID = 'local-household';
const DEFAULT_INVITE_CODE = 'LOCAL1';

export const LOCAL_MODE_USER = Object.freeze({
  uid: 'local-user',
  displayName: 'You (Local)',
  email: null,
  photoURL: null,
});

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix) {
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${time}-${random}`;
}

function copy(value) {
  return JSON.parse(JSON.stringify(value));
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
    if (!parsed || !Array.isArray(parsed.households)) {
      return null;
    }

    return parsed;
  } catch (error) {
    console.warn('Failed to load local data', error);
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
    console.warn('Failed to save local data', error);
  }
}

function createDefaultHousehold(user) {
  return {
    id: DEFAULT_HOUSEHOLD_ID,
    name: 'Local household',
    ownerUid: user.uid,
    inviteCode: DEFAULT_INVITE_CODE,
    memberUids: [user.uid],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
}

function createDefaultState(user) {
  const household = createDefaultHousehold(user);

  return {
    households: [household],
    membersByHousehold: {
      [household.id]: {
        [user.uid]: {
          uid: user.uid,
          email: user.email,
          displayName: user.displayName,
          photoURL: user.photoURL,
          role: 'owner',
          joinCode: household.inviteCode,
          joinedAt: nowIso(),
          updatedAt: nowIso(),
        },
      },
    },
    weeksByHousehold: {
      [household.id]: {},
    },
    groceryByHousehold: {
      [household.id]: {},
    },
    locationsByHousehold: {
      [household.id]: {},
    },
    activityByHousehold: {
      [household.id]: {},
    },
  };
}

function normalizeStateShape(state, user) {
  const normalized = state && typeof state === 'object' ? state : {};

  if (!Array.isArray(normalized.households)) {
    normalized.households = [];
  }

  if (!normalized.membersByHousehold || typeof normalized.membersByHousehold !== 'object') {
    normalized.membersByHousehold = {};
  }

  if (!normalized.weeksByHousehold || typeof normalized.weeksByHousehold !== 'object') {
    normalized.weeksByHousehold = {};
  }

  if (!normalized.groceryByHousehold || typeof normalized.groceryByHousehold !== 'object') {
    normalized.groceryByHousehold = {};
  }

  if (!normalized.locationsByHousehold || typeof normalized.locationsByHousehold !== 'object') {
    normalized.locationsByHousehold = {};
  }

  if (!normalized.activityByHousehold || typeof normalized.activityByHousehold !== 'object') {
    normalized.activityByHousehold = {};
  }

  if (!normalized.households.length) {
    normalized.households.push(createDefaultHousehold(user));
  }

  normalized.households.forEach((household) => {
    ensureHouseholdContainers(normalized, household.id);
  });

  return normalized;
}

function ensureCollection(map, key) {
  if (!map[key]) {
    map[key] = {};
  }
  return map[key];
}

function ensureHouseholdContainers(state, householdId) {
  ensureCollection(state.membersByHousehold, householdId);
  ensureCollection(state.weeksByHousehold, householdId);
  ensureCollection(state.groceryByHousehold, householdId);
  ensureCollection(state.locationsByHousehold, householdId);
  ensureCollection(state.activityByHousehold, householdId);
}

function membersForHousehold(state, householdId) {
  ensureHouseholdContainers(state, householdId);

  const members = Object.values(state.membersByHousehold[householdId]);

  members.sort((left, right) => {
    if (left.role === right.role) {
      return String(left.displayName).localeCompare(String(right.displayName));
    }

    return left.role === 'owner' ? -1 : 1;
  });

  return copy(members);
}

function weekDaysForHousehold(state, householdId, weekId) {
  ensureHouseholdContainers(state, householdId);

  const week = state.weeksByHousehold[householdId][weekId] || {};

  return DAY_ORDER.filter((dayId) => week[dayId]).map((dayId) => {
    const day = week[dayId];
    return {
      dayId,
      mealName: day.mealName,
      cookUid: day.cookUid,
      updatedAt: day.updatedAt,
      updatedBy: day.updatedBy,
    };
  });
}

function groceryForHousehold(state, householdId) {
  ensureHouseholdContainers(state, householdId);

  return Object.values(state.groceryByHousehold[householdId]).map((item) => copy(item));
}

function locationsForHousehold(state, householdId) {
  ensureHouseholdContainers(state, householdId);

  const locations = Object.values(state.locationsByHousehold[householdId]).map((location) => copy(location));
  locations.sort((left, right) => left.name.localeCompare(right.name));
  return locations;
}

function activityForHousehold(state, householdId, limit) {
  ensureHouseholdContainers(state, householdId);

  const items = Object.values(state.activityByHousehold[householdId]).map((activity) => copy(activity));

  items.sort((left, right) => {
    return String(right.createdAt).localeCompare(String(left.createdAt));
  });

  return items.slice(0, limit);
}

function addActivity(state, householdId, user, type, message) {
  const id = makeId('activity');
  ensureHouseholdContainers(state, householdId);

  state.activityByHousehold[householdId][id] = {
    id,
    actorUid: user.uid,
    actorName: user.displayName || user.email || 'Local user',
    type,
    message,
    createdAt: nowIso(),
  };
}

function notify(listeners, kind, householdId, weekId) {
  listeners[kind].forEach((listener) => {
    if (listener.householdId !== householdId) {
      return;
    }

    if (kind === 'week' && listener.weekId !== weekId) {
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

function listHouseholdsForUser(state, uid) {
  return state.households
    .filter((household) => {
      return Array.isArray(household.memberUids) && household.memberUids.indexOf(uid) >= 0;
    })
    .map((household) => copy(household))
    .sort((left, right) => left.name.localeCompare(right.name));
}

function ensureContextUserMembership(context) {
  const state = context.state;

  if (!listHouseholdsForUser(state, context.user.uid).length) {
    const household = createDefaultHousehold(context.user);
    state.households.push(household);
    ensureHouseholdContainers(state, household.id);
    state.membersByHousehold[household.id][context.user.uid] = {
      uid: context.user.uid,
      email: context.user.email,
      displayName: context.user.displayName,
      photoURL: context.user.photoURL,
      role: 'owner',
      joinCode: household.inviteCode,
      joinedAt: nowIso(),
      updatedAt: nowIso(),
    };
  }
}

function persist(context) {
  saveStoredState(context.storage, context.state);
}

function emitHouseholdData(context, householdId, weekId) {
  notify(context.listeners, 'members', householdId);
  notify(context.listeners, 'grocery', householdId);
  notify(context.listeners, 'locations', householdId);
  notify(context.listeners, 'activity', householdId);

  if (weekId) {
    notify(context.listeners, 'week', householdId, weekId);
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

  const loadedState = loadStoredState(storage);
  const state = normalizeStateShape(loadedState || createDefaultState(normalizedUser), normalizedUser);

  const context = {
    user: normalizedUser,
    storage,
    state,
    listeners: {
      members: [],
      week: [],
      grocery: [],
      locations: [],
      activity: [],
    },
  };

  ensureContextUserMembership(context);
  persist(context);

  return context;
}

export async function listUserHouseholds(context, uid) {
  return listHouseholdsForUser(context.state, uid);
}

export async function createHousehold(context, user, rawHouseholdName) {
  const householdName = normalizeHouseholdName(rawHouseholdName);
  const householdId = makeId('local-household');
  const inviteCode = `LC${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const household = {
    id: householdId,
    name: householdName,
    ownerUid: user.uid,
    inviteCode,
    memberUids: [user.uid],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  context.state.households.push(household);
  ensureHouseholdContainers(context.state, householdId);

  context.state.membersByHousehold[householdId][user.uid] = {
    uid: user.uid,
    email: user.email || null,
    displayName: user.displayName || user.email || 'Local user',
    photoURL: user.photoURL || null,
    role: 'owner',
    joinCode: inviteCode,
    joinedAt: nowIso(),
    updatedAt: nowIso(),
  };

  addActivity(context.state, householdId, user, 'household', `Created household "${householdName}".`);
  persist(context);

  return householdId;
}

export async function joinHousehold(context, user, rawHouseholdId, rawInviteCode) {
  const householdId = String(rawHouseholdId || '').trim();
  const inviteCode = normalizeInviteCode(rawInviteCode);

  if (!householdId) {
    throw new Error('Household id is required.');
  }

  const household = context.state.households.find((candidate) => candidate.id === householdId);

  if (!household) {
    throw new Error('Household not found.');
  }

  if (String(household.inviteCode || '').toUpperCase() !== inviteCode) {
    throw new Error('Invite code does not match.');
  }

  if (household.memberUids.indexOf(user.uid) < 0) {
    household.memberUids.push(user.uid);
  }

  ensureHouseholdContainers(context.state, householdId);

  context.state.membersByHousehold[householdId][user.uid] = {
    uid: user.uid,
    email: user.email || null,
    displayName: user.displayName || user.email || 'Local user',
    photoURL: user.photoURL || null,
    role: 'member',
    joinCode: inviteCode,
    joinedAt: nowIso(),
    updatedAt: nowIso(),
  };

  household.updatedAt = nowIso();
  addActivity(context.state, householdId, user, 'member', 'Joined the household.');
  persist(context);
  emitHouseholdData(context, householdId);
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

export async function saveMealForDay(context, householdId, weekId, dayId, input, user) {
  if (!DAY_SET.has(dayId)) {
    throw new Error('Invalid day id.');
  }

  const meal = normalizeMealInput(input);
  ensureHouseholdContainers(context.state, householdId);

  if (!context.state.weeksByHousehold[householdId][weekId]) {
    context.state.weeksByHousehold[householdId][weekId] = {};
  }

  context.state.weeksByHousehold[householdId][weekId][dayId] = {
    mealName: meal.mealName,
    cookUid: meal.cookUid,
    updatedAt: nowIso(),
    updatedBy: user.uid,
  };

  addActivity(
    context.state,
    householdId,
    user,
    'meal',
    `${meal.mealName || 'Cleared meal'} (${dayId})`,
  );

  persist(context);
  notify(context.listeners, 'week', householdId, weekId);
  notify(context.listeners, 'activity', householdId);
}

export function listenGroceryItems(context, householdId, callback, onError) {
  return registerListener(context.listeners.grocery, {
    householdId,
    onError,
    push: () => {
      callback(groceryForHousehold(context.state, householdId));
    },
  });
}

export async function addGroceryItem(context, householdId, input, user) {
  const item = normalizeGroceryInput(input);
  const id = makeId('grocery');
  ensureHouseholdContainers(context.state, householdId);

  context.state.groceryByHousehold[householdId][id] = {
    id,
    name: item.name,
    quantity: item.quantity,
    notes: item.notes,
    locationId: item.locationId,
    personTag: item.personTag,
    mealDayId: item.mealDayId,
    completed: item.completed,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdBy: user.uid,
    updatedBy: user.uid,
  };

  addActivity(context.state, householdId, user, 'grocery', `Added ${item.name} to grocery list.`);

  persist(context);
  notify(context.listeners, 'grocery', householdId);
  notify(context.listeners, 'activity', householdId);

  return id;
}

export async function setGroceryItemCompleted(context, householdId, itemId, completed, user) {
  ensureHouseholdContainers(context.state, householdId);

  const item = context.state.groceryByHousehold[householdId][itemId];
  if (!item) {
    throw new Error('Grocery item not found.');
  }

  item.completed = Boolean(completed);
  item.updatedAt = nowIso();
  item.updatedBy = user.uid;

  const verb = completed ? 'Completed' : 'Reopened';
  addActivity(context.state, householdId, user, 'grocery', `${verb} a grocery item.`);

  persist(context);
  notify(context.listeners, 'grocery', householdId);
  notify(context.listeners, 'activity', householdId);
}

export async function deleteGroceryItem(context, householdId, itemId, user) {
  ensureHouseholdContainers(context.state, householdId);

  delete context.state.groceryByHousehold[householdId][itemId];
  addActivity(context.state, householdId, user, 'grocery', 'Removed a grocery item.');

  persist(context);
  notify(context.listeners, 'grocery', householdId);
  notify(context.listeners, 'activity', householdId);
}

export function listenLocations(context, householdId, callback, onError) {
  return registerListener(context.listeners.locations, {
    householdId,
    onError,
    push: () => {
      callback(locationsForHousehold(context.state, householdId));
    },
  });
}

export async function addLocation(context, householdId, rawLocationName, user) {
  const locationName = normalizeLocationName(rawLocationName);
  ensureHouseholdContainers(context.state, householdId);

  const existing = Object.values(context.state.locationsByHousehold[householdId]).find((location) => {
    return location.name === locationName;
  });

  if (existing) {
    throw new Error('Location already exists.');
  }

  const id = makeId('location');

  context.state.locationsByHousehold[householdId][id] = {
    id,
    name: locationName,
    createdAt: nowIso(),
    createdBy: user.uid,
  };

  addActivity(context.state, householdId, user, 'location', `Added location ${locationName}.`);

  persist(context);
  notify(context.listeners, 'locations', householdId);
  notify(context.listeners, 'activity', householdId);
}

export function listenActivity(context, householdId, callback, onError, limit = 15) {
  return registerListener(context.listeners.activity, {
    householdId,
    onError,
    push: () => {
      callback(activityForHousehold(context.state, householdId, limit));
    },
  });
}
