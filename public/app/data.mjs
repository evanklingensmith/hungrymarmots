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
const HOUSEHOLDS = 'households';

function serverTimestamp() {
  return window.firebase.firestore.FieldValue.serverTimestamp();
}

function arrayUnion(value) {
  return window.firebase.firestore.FieldValue.arrayUnion(value);
}

function householdCollection(db) {
  return db.collection(HOUSEHOLDS);
}

function householdRef(db, householdId) {
  return householdCollection(db).doc(householdId);
}

function userRef(db, uid) {
  return db.collection('users').doc(uid);
}

function memberCollection(db, householdId) {
  return householdRef(db, householdId).collection('members');
}

function storeCollection(db, householdId) {
  return householdRef(db, householdId).collection('stores');
}

function mealCollection(db, householdId) {
  return householdRef(db, householdId).collection('meals');
}

function weekDayRef(db, householdId, weekId, dayId) {
  return householdRef(db, householdId).collection('weeks').doc(weekId).collection('days').doc(dayId);
}

function weekDayCollection(db, householdId, weekId) {
  return householdRef(db, householdId).collection('weeks').doc(weekId).collection('days');
}

function groceryCollection(db, householdId) {
  return householdRef(db, householdId).collection('groceryItems');
}

function pantryCollection(db, householdId) {
  return householdRef(db, householdId).collection('pantryItems');
}

function activityCollection(db, householdId) {
  return householdRef(db, householdId).collection('activity');
}

function pantryIdFromGrocery(itemId) {
  return `auto-${itemId}`;
}

function boundedIdentityText(value, max, fallback) {
  const text = String(value || '').trim();
  if (text) {
    return text.slice(0, max);
  }

  return fallback;
}

function actorName(user) {
  return boundedIdentityText(user.displayName || user.email, 100, 'Unknown user');
}

function mapHousehold(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    name: data.name || 'Unnamed household',
    ownerUid: data.ownerUid || null,
    memberUids: Array.isArray(data.memberUids) ? data.memberUids : [],
    inviteCode: data.inviteCode || '',
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

function mapMember(doc) {
  const data = doc.data() || {};
  return {
    uid: doc.id,
    displayName: data.displayName || data.email || doc.id,
    email: data.email || null,
    photoURL: data.photoURL || null,
    role: data.role || 'member',
  };
}

function mapStore(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    name: data.name || doc.id,
    createdBy: data.createdBy || null,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

function mapMeal(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    title: data.title || '',
    description: data.description || '',
    tags: Array.isArray(data.tags) ? data.tags : [],
    ingredients: Array.isArray(data.ingredients)
      ? data.ingredients
          .map((ingredient) => {
            if (!ingredient || typeof ingredient !== 'object') {
              return null;
            }

            const name = typeof ingredient.name === 'string' ? ingredient.name : '';
            if (!name) {
              return null;
            }

            return {
              id: typeof ingredient.id === 'string' && ingredient.id ? ingredient.id : null,
              name,
              usuallyNeedToBuy: Boolean(ingredient.usuallyNeedToBuy),
              defaultStoreId:
                typeof ingredient.defaultStoreId === 'string' && ingredient.defaultStoreId
                  ? ingredient.defaultStoreId
                  : null,
            };
          })
          .filter(Boolean)
      : [],
    createdBy: data.createdBy || null,
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
  };
}

function mapWeekDay(doc) {
  const data = doc.data() || {};
  return {
    dayId: doc.id,
    mealId: data.mealId || null,
    mealTitle: data.mealTitle || null,
    cookUid: data.cookUid || null,
    eaterUids: Array.isArray(data.eaterUids) ? data.eaterUids : [],
    notes: data.notes || '',
    ingredientPlan: Array.isArray(data.ingredientPlan)
      ? data.ingredientPlan
          .map((entry) => {
            if (!entry || typeof entry !== 'object') {
              return null;
            }

            const name = typeof entry.name === 'string' ? entry.name : '';
            if (!name) {
              return null;
            }

            return {
              ingredientId: typeof entry.ingredientId === 'string' && entry.ingredientId ? entry.ingredientId : null,
              name,
              needToBuy: Boolean(entry.needToBuy),
              storeId: typeof entry.storeId === 'string' && entry.storeId ? entry.storeId : null,
            };
          })
          .filter(Boolean)
      : [],
    updatedBy: data.updatedBy || null,
    updatedAt: data.updatedAt || null,
  };
}

function mapGroceryItem(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    householdId: data.householdId || null,
    name: data.name || '',
    quantity: data.quantity || null,
    notes: data.notes || null,
    storeId: data.storeId || null,
    completed: Boolean(data.completed),
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    createdBy: data.createdBy || null,
    updatedBy: data.updatedBy || null,
    sourceWeekId: data.sourceWeekId || null,
    sourceDayId: data.sourceDayId || null,
    sourceMealId: data.sourceMealId || null,
    autoGeneratedFromMeal: Boolean(data.autoGeneratedFromMeal),
  };
}

function mapPantryItem(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    name: data.name || '',
    section: data.section === 'other' ? 'other' : 'weekly',
    sourceGroceryItemId: data.sourceGroceryItemId || null,
    autoFromGrocery: Boolean(data.autoFromGrocery),
    createdAt: data.createdAt || null,
    updatedAt: data.updatedAt || null,
    createdBy: data.createdBy || null,
    updatedBy: data.updatedBy || null,
  };
}

function mapActivity(doc) {
  const data = doc.data() || {};
  return {
    id: doc.id,
    actorUid: data.actorUid || null,
    actorName: data.actorName || 'Someone',
    scope: data.scope || 'system',
    action: data.action || 'info',
    message: data.message || '',
    undo: data.undo || null,
    undone: Boolean(data.undone),
    undoneBy: data.undoneBy || null,
    undoneAt: data.undoneAt || null,
    createdAt: data.createdAt || null,
  };
}

function memberPayload(user, role, joinCode) {
  return {
    uid: user.uid,
    email: user.email || null,
    displayName: boundedIdentityText(user.displayName || user.email, 100, 'Unknown member'),
    photoURL: user.photoURL || null,
    role,
    joinCode,
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

async function addActivity(db, householdId, user, scope, action, message, undo = null) {
  try {
    await activityCollection(db, householdId).add({
      actorUid: user.uid,
      actorName: actorName(user),
      scope,
      action,
      message,
      undo: undo || null,
      undone: false,
      undoneBy: null,
      undoneAt: null,
      createdAt: serverTimestamp(),
    });
  } catch (error) {
    // Activity logging is best-effort; do not block primary user actions.
    console.warn('Failed to write household activity entry', error);
  }
}

export async function listUserHouseholds(db, uid) {
  const snapshot = await householdCollection(db).where('memberUids', 'array-contains', uid).get();

  return snapshot.docs
    .map(mapHousehold)
    .sort((left, right) => String(left.name).localeCompare(String(right.name)));
}

export async function getHousehold(db, householdId) {
  const normalizedId = String(householdId || '').trim();
  if (!normalizedId) {
    return null;
  }

  const doc = await householdRef(db, normalizedId).get();
  if (!doc.exists) {
    return null;
  }

  return mapHousehold(doc);
}

export async function getDefaultHouseholdId(db, uid) {
  const doc = await userRef(db, uid).get();
  if (!doc.exists) {
    return null;
  }

  const data = doc.data() || {};
  return typeof data.defaultHouseholdId === 'string' && data.defaultHouseholdId ? data.defaultHouseholdId : null;
}

export async function setDefaultHouseholdId(db, uid, householdId) {
  await userRef(db, uid).set(
    {
      defaultHouseholdId: householdId || null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

export async function ensureHouseholdMembership(db, householdId, user, householdHint = null) {
  const normalizedHouseholdId = String(householdId || '').trim();
  if (!normalizedHouseholdId || !user?.uid) {
    return;
  }

  let household = householdHint && typeof householdHint === 'object' ? householdHint : null;

  if (!household || typeof household.inviteCode !== 'string' || !household.inviteCode) {
    const householdDoc = await householdRef(db, normalizedHouseholdId).get();
    if (!householdDoc.exists) {
      throw new Error('Household not found.');
    }

    household = mapHousehold(householdDoc);
  }

  if (typeof household.inviteCode !== 'string' || !household.inviteCode) {
    throw new Error('Household invite code is missing.');
  }

  const role = household.ownerUid === user.uid ? 'owner' : 'member';

  await memberCollection(db, normalizedHouseholdId)
    .doc(user.uid)
    .set(memberPayload(user, role, household.inviteCode), { merge: true });
}

export function generateInviteCode(length = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let value = '';

  for (let index = 0; index < length; index += 1) {
    const offset = Math.floor(Math.random() * alphabet.length);
    value += alphabet[offset];
  }

  return value;
}

export async function createHousehold(db, user, rawHouseholdName) {
  const householdName = normalizeHouseholdName(rawHouseholdName);
  const inviteCode = generateInviteCode();
  const household = householdCollection(db).doc();
  await household.set({
    name: householdName,
    ownerUid: user.uid,
    memberUids: [user.uid],
    inviteCode,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  try {
    await memberCollection(db, household.id).doc(user.uid).set(memberPayload(user, 'owner', inviteCode));
  } catch (error) {
    console.warn('Failed to write owner membership profile during household create', error);
  }

  try {
    await userRef(db, user.uid).set(
      {
        defaultHouseholdId: household.id,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } catch (error) {
    console.warn('Failed to store default household id during household create', error);
  }

  await addActivity(db, household.id, user, 'system', 'household-created', `Created household "${householdName}".`);

  return household.id;
}

export async function joinHousehold(db, user, rawHouseholdId, rawInviteCode) {
  const householdId = String(rawHouseholdId || '').trim();
  const inviteCode = normalizeInviteCode(rawInviteCode);

  if (!householdId) {
    throw new Error('Household id is required.');
  }

  const household = householdRef(db, householdId);

  await db.runTransaction(async (transaction) => {
    const householdDoc = await transaction.get(household);

    if (!householdDoc.exists) {
      throw new Error('Household not found.');
    }

    const data = householdDoc.data() || {};
    if (String(data.inviteCode || '').toUpperCase() !== inviteCode) {
      throw new Error('Invite code does not match.');
    }

    transaction.set(memberCollection(db, householdId).doc(user.uid), memberPayload(user, 'member', inviteCode), {
      merge: true,
    });

    transaction.update(household, {
      memberUids: arrayUnion(user.uid),
      updatedAt: serverTimestamp(),
    });

    transaction.set(
      userRef(db, user.uid),
      {
        defaultHouseholdId: householdId,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });

  await addActivity(db, householdId, user, 'system', 'household-join', 'Joined household.');
}

export function listenMembers(db, householdId, callback, onError) {
  return memberCollection(db, householdId).onSnapshot(
    (snapshot) => {
      const members = snapshot.docs
        .map(mapMember)
        .sort((left, right) => {
          if (left.role !== right.role) {
            return left.role === 'owner' ? -1 : 1;
          }

          return String(left.displayName).localeCompare(String(right.displayName));
        });

      callback(members);
    },
    onError,
  );
}

export function listenStores(db, householdId, callback, onError) {
  return storeCollection(db, householdId).onSnapshot(
    (snapshot) => {
      callback(
        snapshot.docs
          .map(mapStore)
          .sort((left, right) => String(left.name).localeCompare(String(right.name))),
      );
    },
    onError,
  );
}

export function listenLocations(db, householdId, callback, onError) {
  return listenStores(db, householdId, callback, onError);
}

export function listenMeals(db, householdId, callback, onError) {
  return mealCollection(db, householdId).onSnapshot(
    (snapshot) => {
      callback(
        snapshot.docs
          .map(mapMeal)
          .sort((left, right) => String(left.title).localeCompare(String(right.title))),
      );
    },
    onError,
  );
}

export function listenWeekDays(db, householdId, weekId, callback, onError) {
  return weekDayCollection(db, householdId, weekId).onSnapshot(
    (snapshot) => {
      const mapped = snapshot.docs.map(mapWeekDay);
      const byId = new Map(mapped.map((entry) => [entry.dayId, entry]));

      callback(
        DAY_ORDER.map((dayId) => {
          return byId.get(dayId) || {
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
        }),
      );
    },
    onError,
  );
}

export async function addStore(db, householdId, rawStoreName, user) {
  const storeName = normalizeStoreName(rawStoreName);

  const snapshot = await storeCollection(db, householdId).get();
  const existing = snapshot.docs.map(mapStore).find((store) => {
    return String(store.name).toLowerCase() === storeName.toLowerCase();
  });

  if (existing) {
    throw new Error('Store already exists.');
  }

  const doc = storeCollection(db, householdId).doc();

  await doc.set({
    name: storeName,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await addActivity(db, householdId, user, 'grocery', 'store-add', `Added store ${storeName}.`);

  return doc.id;
}

export async function addLocation(db, householdId, rawLocationName, user) {
  return addStore(db, householdId, rawLocationName, user);
}

export async function removeStore(db, householdId, storeId, user) {
  const store = await storeCollection(db, householdId).doc(storeId).get();
  if (!store.exists) {
    throw new Error('Store not found.');
  }

  const storeData = mapStore(store);

  await store.ref.delete();

  const [meals, groceryItems, weekCollections] = await Promise.all([
    mealCollection(db, householdId).get(),
    groceryCollection(db, householdId).where('storeId', '==', storeId).get(),
    householdRef(db, householdId).collection('weeks').get(),
  ]);

  const batch = db.batch();

  meals.docs.forEach((mealDoc) => {
    const meal = mapMeal(mealDoc);
    if (!meal.ingredients.some((ingredient) => ingredient.defaultStoreId === storeId)) {
      return;
    }

    const nextIngredients = meal.ingredients.map((ingredient) => {
      if (ingredient.defaultStoreId === storeId) {
        return {
          ...ingredient,
          defaultStoreId: null,
        };
      }

      return ingredient;
    });

    batch.set(
      mealDoc.ref,
      {
        ingredients: nextIngredients,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });

  groceryItems.docs.forEach((groceryDoc) => {
    batch.set(
      groceryDoc.ref,
      {
        storeId: null,
        updatedBy: user.uid,
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  });

  const daySnapshots = await Promise.all(
    weekCollections.docs.map((weekDoc) => {
      return weekDoc.ref.collection('days').get();
    }),
  );

  daySnapshots.forEach((daySnapshot) => {
    daySnapshot.docs.forEach((dayDoc) => {
      const data = dayDoc.data() || {};
      if (!Array.isArray(data.ingredientPlan)) {
        return;
      }

      const hasStore = data.ingredientPlan.some((entry) => entry && entry.storeId === storeId);
      if (!hasStore) {
        return;
      }

      const nextPlan = data.ingredientPlan
        .map((entry) => {
          if (!entry || typeof entry !== 'object') {
            return null;
          }

          if (entry.storeId === storeId) {
            return {
              ...entry,
              storeId: null,
            };
          }

          return entry;
        })
        .filter(Boolean);

      batch.set(
        dayDoc.ref,
        {
          ingredientPlan: nextPlan,
          updatedBy: user.uid,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
    });
  });

  await batch.commit();

  await addActivity(db, householdId, user, 'grocery', 'store-remove', `Removed store ${storeData.name}.`);
}

export async function createMeal(db, householdId, input, user) {
  const meal = normalizeMealDraft(input);
  const doc = mealCollection(db, householdId).doc();

  await doc.set({
    title: meal.title,
    description: meal.description,
    tags: meal.tags,
    ingredients: meal.ingredients.map((ingredient) => ({
      id: ingredient.id || mealCollection(db, householdId).doc().id,
      name: ingredient.name,
      usuallyNeedToBuy: ingredient.usuallyNeedToBuy,
      defaultStoreId: ingredient.defaultStoreId,
    })),
    createdBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await addActivity(db, householdId, user, 'weekly', 'meal-add', `Added meal ${meal.title}.`);

  return doc.id;
}

function groceryItemFromIngredient(householdId, weekId, dayId, mealId, ingredient, user) {
  return {
    householdId,
    name: ingredient.name,
    quantity: null,
    notes: null,
    storeId: ingredient.storeId || null,
    completed: false,
    createdBy: user.uid,
    updatedBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    sourceWeekId: weekId,
    sourceDayId: dayId,
    sourceMealId: mealId || null,
    autoGeneratedFromMeal: true,
  };
}

export async function saveWeekDayPlan(db, householdId, weekId, dayId, input, user) {
  if (!DAY_SET.has(dayId)) {
    throw new Error('Invalid day id.');
  }

  const payload = normalizeWeekDayInput(input);

  await weekDayRef(db, householdId, weekId, dayId).set(
    {
      mealId: payload.mealId,
      mealTitle: payload.mealTitle,
      cookUid: payload.cookUid,
      eaterUids: payload.eaterUids,
      notes: payload.notes,
      ingredientPlan: payload.ingredientPlan,
      updatedBy: user.uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  const allGrocery = await groceryCollection(db, householdId).get();
  const toReplace = allGrocery.docs.filter((doc) => {
    const data = doc.data() || {};
    return data.autoGeneratedFromMeal && data.sourceWeekId === weekId && data.sourceDayId === dayId;
  });

  const batch = db.batch();

  toReplace.forEach((doc) => {
    batch.delete(doc.ref);
    batch.delete(pantryCollection(db, householdId).doc(pantryIdFromGrocery(doc.id)));
  });

  payload.ingredientPlan
    .filter((entry) => entry.needToBuy)
    .forEach((entry) => {
      const doc = groceryCollection(db, householdId).doc();
      batch.set(doc, groceryItemFromIngredient(householdId, weekId, dayId, payload.mealId, entry, user));
    });

  await batch.commit();

  const mealLabel = payload.mealTitle || 'No meal set';
  await addActivity(db, householdId, user, 'weekly', 'day-update', `${dayId}: ${mealLabel}`);
}

export async function saveMealForDay(db, householdId, weekId, dayId, input, user) {
  const normalized = normalizeMealInput(input);

  return saveWeekDayPlan(
    db,
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

export function listenGroceryItems(db, householdId, callback, onError) {
  return groceryCollection(db, householdId).onSnapshot(
    (snapshot) => {
      callback(
        snapshot.docs
          .map(mapGroceryItem)
          .sort((left, right) => String(left.name).localeCompare(String(right.name))),
      );
    },
    onError,
  );
}

export async function addGroceryItem(db, householdId, input, user) {
  const item = normalizeGroceryItemInput(input);
  const doc = groceryCollection(db, householdId).doc();

  await doc.set({
    householdId,
    name: item.name,
    quantity: item.quantity,
    notes: item.notes,
    storeId: item.storeId,
    completed: item.completed,
    createdBy: user.uid,
    updatedBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    sourceWeekId: input?.sourceWeekId || null,
    sourceDayId: input?.sourceDayId || null,
    sourceMealId: input?.sourceMealId || null,
    autoGeneratedFromMeal: Boolean(input?.autoGeneratedFromMeal),
  });

  if (item.completed) {
    await pantryCollection(db, householdId)
      .doc(pantryIdFromGrocery(doc.id))
      .set({
        name: item.name,
        section: 'weekly',
        sourceGroceryItemId: doc.id,
        autoFromGrocery: true,
        createdBy: user.uid,
        updatedBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
  }

  await addActivity(db, householdId, user, 'grocery', 'add', `Added ${item.name}.`, {
    type: 'delete-grocery',
    itemId: doc.id,
  });

  return doc.id;
}

export async function setGroceryItemCompleted(db, householdId, itemId, completed, user) {
  const docRef = groceryCollection(db, householdId).doc(itemId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new Error('Grocery item not found.');
  }

  const item = mapGroceryItem(doc);
  const previousCompleted = Boolean(item.completed);
  const nextCompleted = Boolean(completed);

  const batch = db.batch();

  batch.set(
    docRef,
    {
      completed: nextCompleted,
      updatedBy: user.uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  const pantryRef = pantryCollection(db, householdId).doc(pantryIdFromGrocery(itemId));

  if (nextCompleted) {
    batch.set(
      pantryRef,
      {
        name: item.name,
        section: 'weekly',
        sourceGroceryItemId: itemId,
        autoFromGrocery: true,
        createdBy: user.uid,
        updatedBy: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
  } else {
    batch.delete(pantryRef);
  }

  await batch.commit();

  await addActivity(
    db,
    householdId,
    user,
    'grocery',
    nextCompleted ? 'check' : 'uncheck',
    nextCompleted
      ? `Checked off ${item.name} (added to weekly pantry).`
      : `Unchecked ${item.name} (removed from weekly pantry).`,
    {
      type: 'set-grocery-completed',
      itemId,
      completed: previousCompleted,
    },
  );
}

export async function deleteGroceryItem(db, householdId, itemId, user) {
  const docRef = groceryCollection(db, householdId).doc(itemId);
  const doc = await docRef.get();

  if (!doc.exists) {
    throw new Error('Grocery item not found.');
  }

  const item = mapGroceryItem(doc);

  const batch = db.batch();
  batch.delete(docRef);
  batch.delete(pantryCollection(db, householdId).doc(pantryIdFromGrocery(itemId)));
  await batch.commit();

  await addActivity(db, householdId, user, 'grocery', 'remove', `Removed ${item.name}.`, {
    type: 'restore-grocery',
    item,
  });
}

export function listenPantryItems(db, householdId, callback, onError) {
  return pantryCollection(db, householdId).onSnapshot(
    (snapshot) => {
      callback(
        snapshot.docs
          .map(mapPantryItem)
          .sort((left, right) => {
            if (left.section !== right.section) {
              return left.section === 'weekly' ? -1 : 1;
            }

            return String(left.name).localeCompare(String(right.name));
          }),
      );
    },
    onError,
  );
}

export async function movePantryItem(db, householdId, itemId, rawSection, user) {
  const section = normalizePantrySection(rawSection);
  const pantryRef = pantryCollection(db, householdId).doc(itemId);
  const doc = await pantryRef.get();

  if (!doc.exists) {
    throw new Error('Pantry item not found.');
  }

  const item = mapPantryItem(doc);
  if (item.section === section) {
    return;
  }

  await pantryRef.set(
    {
      section,
      updatedBy: user.uid,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await addActivity(db, householdId, user, 'pantry', 'move', `Moved ${item.name} to ${section}.`, {
    type: 'set-pantry-section',
    itemId,
    section: item.section,
  });
}

export async function deletePantryItem(db, householdId, itemId, user) {
  const pantryRef = pantryCollection(db, householdId).doc(itemId);
  const doc = await pantryRef.get();

  if (!doc.exists) {
    throw new Error('Pantry item not found.');
  }

  const item = mapPantryItem(doc);

  await pantryRef.delete();

  await addActivity(db, householdId, user, 'pantry', 'remove', `Removed ${item.name} from pantry.`, {
    type: 'restore-pantry',
    item,
  });
}

export function listenActivity(db, householdId, callback, onError, limit = 100) {
  return activityCollection(db, householdId)
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .onSnapshot(
      (snapshot) => {
        callback(snapshot.docs.map(mapActivity));
      },
      onError,
    );
}

async function applyUndo(db, householdId, payload, user) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('This history entry cannot be undone.');
  }

  const type = payload.type;

  switch (type) {
    case 'delete-grocery': {
      const itemId = String(payload.itemId || '');
      if (!itemId) {
        return;
      }

      const batch = db.batch();
      batch.delete(groceryCollection(db, householdId).doc(itemId));
      batch.delete(pantryCollection(db, householdId).doc(pantryIdFromGrocery(itemId)));
      await batch.commit();
      return;
    }

    case 'restore-grocery': {
      const item = payload.item;
      if (!item || !item.id) {
        return;
      }

      const groceryRef = groceryCollection(db, householdId).doc(item.id);
      const batch = db.batch();

      batch.set(groceryRef, {
        householdId: item.householdId || householdId,
        name: item.name || '',
        quantity: item.quantity || null,
        notes: item.notes || null,
        storeId: item.storeId || null,
        completed: Boolean(item.completed),
        createdBy: item.createdBy || user.uid,
        updatedBy: user.uid,
        createdAt: item.createdAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
        sourceWeekId: item.sourceWeekId || null,
        sourceDayId: item.sourceDayId || null,
        sourceMealId: item.sourceMealId || null,
        autoGeneratedFromMeal: Boolean(item.autoGeneratedFromMeal),
      });

      if (item.completed) {
        batch.set(
          pantryCollection(db, householdId).doc(pantryIdFromGrocery(item.id)),
          {
            name: item.name,
            section: 'weekly',
            sourceGroceryItemId: item.id,
            autoFromGrocery: true,
            createdBy: user.uid,
            updatedBy: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      }

      await batch.commit();
      return;
    }

    case 'set-grocery-completed': {
      const itemId = String(payload.itemId || '');
      if (!itemId) {
        return;
      }

      const completed = Boolean(payload.completed);
      const groceryRef = groceryCollection(db, householdId).doc(itemId);
      const doc = await groceryRef.get();
      if (!doc.exists) {
        return;
      }

      const item = mapGroceryItem(doc);
      const batch = db.batch();

      batch.set(
        groceryRef,
        {
          completed,
          updatedBy: user.uid,
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );

      const pantryRef = pantryCollection(db, householdId).doc(pantryIdFromGrocery(itemId));

      if (completed) {
        batch.set(
          pantryRef,
          {
            name: item.name,
            section: 'weekly',
            sourceGroceryItemId: itemId,
            autoFromGrocery: true,
            createdBy: user.uid,
            updatedBy: user.uid,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      } else {
        batch.delete(pantryRef);
      }

      await batch.commit();
      return;
    }

    case 'restore-pantry': {
      const item = payload.item;
      if (!item || !item.id) {
        return;
      }

      await pantryCollection(db, householdId)
        .doc(item.id)
        .set({
          name: item.name || '',
          section: item.section === 'other' ? 'other' : 'weekly',
          sourceGroceryItemId: item.sourceGroceryItemId || null,
          autoFromGrocery: Boolean(item.autoFromGrocery),
          createdBy: item.createdBy || user.uid,
          updatedBy: user.uid,
          createdAt: item.createdAt || serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      return;
    }

    case 'delete-pantry': {
      const itemId = String(payload.itemId || '');
      if (!itemId) {
        return;
      }

      await pantryCollection(db, householdId).doc(itemId).delete();
      return;
    }

    case 'set-pantry-section': {
      const itemId = String(payload.itemId || '');
      const section = normalizePantrySection(payload.section);
      if (!itemId) {
        return;
      }

      await pantryCollection(db, householdId)
        .doc(itemId)
        .set(
          {
            section,
            updatedBy: user.uid,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      return;
    }

    default:
      throw new Error('Unknown undo action.');
  }
}

export async function undoActivity(db, householdId, activityId, user) {
  const activityRef = activityCollection(db, householdId).doc(activityId);
  const activityDoc = await activityRef.get();

  if (!activityDoc.exists) {
    throw new Error('History entry not found.');
  }

  const activity = mapActivity(activityDoc);

  if (activity.undone) {
    throw new Error('History entry is already undone.');
  }

  if (!activity.undo) {
    throw new Error('This history entry cannot be undone.');
  }

  await applyUndo(db, householdId, activity.undo, user);

  await activityRef.set(
    {
      undone: true,
      undoneBy: user.uid,
      undoneAt: serverTimestamp(),
    },
    { merge: true },
  );

  await addActivity(db, householdId, user, activity.scope || 'system', 'undo', `Undid: ${activity.message}`);
}

export function getSyncConflictState() {
  return {
    clientId: null,
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
