import { DAY_ORDER } from './utils/dates.mjs';
import {
  normalizeGroceryInput,
  normalizeHouseholdName,
  normalizeInviteCode,
  normalizeLocationName,
  normalizeMealInput,
} from './utils/validators.mjs';

const DAY_SET = new Set(DAY_ORDER);
const HOUSEHOLDS = 'households';

function serverTimestamp() {
  return window.firebase.firestore.FieldValue.serverTimestamp();
}

function arrayUnion(value) {
  return window.firebase.firestore.FieldValue.arrayUnion(value);
}

function householdRef(db, householdId) {
  return db.collection(HOUSEHOLDS).doc(householdId);
}

function householdCollection(db) {
  return db.collection(HOUSEHOLDS);
}

function memberCollection(db, householdId) {
  return householdRef(db, householdId).collection('members');
}

function weekDocRef(db, householdId, weekId) {
  return householdRef(db, householdId).collection('weeks').doc(weekId);
}

function dayCollection(db, householdId, weekId) {
  return weekDocRef(db, householdId, weekId).collection('days');
}

function groceryCollection(db, householdId) {
  return householdRef(db, householdId).collection('groceryItems');
}

function locationCollection(db, householdId) {
  return householdRef(db, householdId).collection('locations');
}

function activityCollection(db, householdId) {
  return householdRef(db, householdId).collection('activity');
}

function memberPayload(user, role, joinCode = null) {
  return {
    uid: user.uid,
    email: user.email ?? null,
    displayName: user.displayName ?? user.email ?? 'Unknown member',
    photoURL: user.photoURL ?? null,
    role,
    joinCode,
    joinedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };
}

function mapHousehold(doc) {
  const data = doc.data();
  return {
    id: doc.id,
    name: data.name ?? 'Unnamed household',
    ownerUid: data.ownerUid ?? null,
    inviteCode: data.inviteCode ?? '',
    memberUids: Array.isArray(data.memberUids) ? data.memberUids : [],
    createdAt: data.createdAt ?? null,
  };
}

function mapMember(doc) {
  const data = doc.data();
  return {
    uid: doc.id,
    displayName: data.displayName ?? data.email ?? doc.id,
    email: data.email ?? null,
    photoURL: data.photoURL ?? null,
    role: data.role ?? 'member',
  };
}

function mapGroceryItem(doc) {
  const data = doc.data();

  return {
    id: doc.id,
    name: data.name ?? '',
    quantity: data.quantity ?? null,
    notes: data.notes ?? null,
    locationId: data.locationId ?? null,
    personTag: data.personTag ?? null,
    mealDayId: data.mealDayId ?? null,
    completed: Boolean(data.completed),
    createdAt: data.createdAt ?? null,
    updatedAt: data.updatedAt ?? null,
    createdBy: data.createdBy ?? null,
    updatedBy: data.updatedBy ?? null,
  };
}

function mapLocation(doc) {
  const data = doc.data();

  return {
    id: doc.id,
    name: data.name ?? doc.id,
    createdAt: data.createdAt ?? null,
  };
}

function mapActivity(doc) {
  const data = doc.data();

  return {
    id: doc.id,
    actorName: data.actorName ?? 'Someone',
    message: data.message ?? '',
    createdAt: data.createdAt ?? null,
    type: data.type ?? 'info',
  };
}

export function generateInviteCode(length = 6) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';

  for (let index = 0; index < length; index += 1) {
    const position = Math.floor(Math.random() * alphabet.length);
    code += alphabet[position];
  }

  return code;
}

async function addActivity(db, householdId, user, type, message) {
  return activityCollection(db, householdId).add({
    actorUid: user.uid,
    actorName: user.displayName ?? user.email ?? 'Unknown',
    type,
    message,
    createdAt: serverTimestamp(),
  });
}

export async function createHousehold(db, user, rawHouseholdName) {
  const householdName = normalizeHouseholdName(rawHouseholdName);
  const inviteCode = generateInviteCode();
  const household = householdCollection(db).doc();
  const member = memberCollection(db, household.id).doc(user.uid);
  const batch = db.batch();

  batch.set(household, {
    name: householdName,
    ownerUid: user.uid,
    memberUids: [user.uid],
    inviteCode,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(member, memberPayload(user, 'owner', inviteCode));
  await batch.commit();

  await addActivity(db, household.id, user, 'household', `Created household \"${householdName}\".`);

  return household.id;
}

export async function joinHousehold(db, user, rawHouseholdId, rawInviteCode) {
  const householdId = (rawHouseholdId ?? '').trim();
  const inviteCode = normalizeInviteCode(rawInviteCode);

  if (!householdId) {
    throw new Error('Household id is required.');
  }

  const ref = householdRef(db, householdId);

  await db.runTransaction(async (transaction) => {
    const snapshot = await transaction.get(ref);

    if (!snapshot.exists) {
      throw new Error('Household not found.');
    }

    const data = snapshot.data();
    if ((data.inviteCode ?? '').toUpperCase() !== inviteCode) {
      throw new Error('Invite code does not match.');
    }

    transaction.set(memberCollection(db, householdId).doc(user.uid), memberPayload(user, 'member', inviteCode), {
      merge: true,
    });

    transaction.update(ref, {
      memberUids: arrayUnion(user.uid),
      updatedAt: serverTimestamp(),
    });
  });

  await addActivity(db, householdId, user, 'member', 'Joined the household.');
}

export async function listUserHouseholds(db, uid) {
  const snapshot = await householdCollection(db).where('memberUids', 'array-contains', uid).get();

  return snapshot.docs
    .map(mapHousehold)
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function listenMembers(db, householdId, callback, onError) {
  return memberCollection(db, householdId).onSnapshot(
    (snapshot) => {
      const members = snapshot.docs
        .map(mapMember)
        .sort((left, right) => {
          if (left.role === right.role) {
            return left.displayName.localeCompare(right.displayName);
          }

          return left.role === 'owner' ? -1 : 1;
        });

      callback(members);
    },
    onError,
  );
}

export function listenWeekDays(db, householdId, weekId, callback, onError) {
  return dayCollection(db, householdId, weekId).onSnapshot(
    (snapshot) => {
      callback(
        snapshot.docs.map((doc) => ({
          dayId: doc.id,
          ...doc.data(),
        })),
      );
    },
    onError,
  );
}

export async function saveMealForDay(db, householdId, weekId, dayId, input, user) {
  if (!DAY_SET.has(dayId)) {
    throw new Error('Invalid day id.');
  }

  const meal = normalizeMealInput(input);
  const batch = db.batch();
  const weekRef = weekDocRef(db, householdId, weekId);
  const dayRef = dayCollection(db, householdId, weekId).doc(dayId);

  batch.set(
    weekRef,
    {
      weekStartIso: weekId,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    },
    { merge: true },
  );

  batch.set(
    dayRef,
    {
      mealName: meal.mealName,
      cookUid: meal.cookUid,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    },
    { merge: true },
  );

  await batch.commit();

  const readableMealName = meal.mealName || 'Cleared meal';
  await addActivity(db, householdId, user, 'meal', `${readableMealName} (${dayId})`);
}

export function listenGroceryItems(db, householdId, callback, onError) {
  return groceryCollection(db, householdId).onSnapshot(
    (snapshot) => {
      callback(snapshot.docs.map(mapGroceryItem));
    },
    onError,
  );
}

export async function addGroceryItem(db, householdId, input, user) {
  const item = normalizeGroceryInput(input);
  const doc = groceryCollection(db, householdId).doc();

  await doc.set({
    ...item,
    createdBy: user.uid,
    updatedBy: user.uid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await addActivity(db, householdId, user, 'grocery', `Added ${item.name} to grocery list.`);

  return doc.id;
}

export async function setGroceryItemCompleted(db, householdId, itemId, completed, user) {
  await groceryCollection(db, householdId).doc(itemId).set(
    {
      completed: Boolean(completed),
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    },
    { merge: true },
  );

  const verb = completed ? 'Completed' : 'Reopened';
  await addActivity(db, householdId, user, 'grocery', `${verb} a grocery item.`);
}

export async function deleteGroceryItem(db, householdId, itemId, user) {
  await groceryCollection(db, householdId).doc(itemId).delete();
  await addActivity(db, householdId, user, 'grocery', 'Removed a grocery item.');
}

export function listenLocations(db, householdId, callback, onError) {
  return locationCollection(db, householdId).onSnapshot(
    (snapshot) => {
      const locations = snapshot.docs.map(mapLocation).sort((left, right) => left.name.localeCompare(right.name));
      callback(locations);
    },
    onError,
  );
}

export async function addLocation(db, householdId, rawLocationName, user) {
  const locationName = normalizeLocationName(rawLocationName);
  const exists = await locationCollection(db, householdId)
    .where('name', '==', locationName)
    .limit(1)
    .get();

  if (!exists.empty) {
    throw new Error('Location already exists.');
  }

  await locationCollection(db, householdId).add({
    name: locationName,
    createdBy: user.uid,
    createdAt: serverTimestamp(),
  });

  await addActivity(db, householdId, user, 'location', `Added location ${locationName}.`);
}

export function listenActivity(db, householdId, callback, onError, limit = 15) {
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
