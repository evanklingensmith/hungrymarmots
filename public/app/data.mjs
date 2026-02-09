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
const CLIENT_ID_STORAGE_KEY = 'weektable.sync.clientId';
const CLIENT_COUNTER_STORAGE_KEY = 'weektable.sync.clientCounter';
const CONFLICT_BACKUP_STORAGE_KEY = 'weektable.sync.conflictBackup';
const WRITE_DEBOUNCE_MS = 600;

function serverTimestamp() {
  return window.firebase.firestore.FieldValue.serverTimestamp();
}

function arrayUnion(value) {
  return window.firebase.firestore.FieldValue.arrayUnion(value);
}

function increment(step = 1) {
  return window.firebase.firestore.FieldValue.increment(step);
}

function copy(value) {
  if (value === undefined) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value));
}

function nowIso() {
  return new Date().toISOString();
}

function safeStorage() {
  try {
    return typeof globalThis !== 'undefined' ? globalThis.localStorage ?? null : null;
  } catch (error) {
    return null;
  }
}

function randomId(prefix = 'id') {
  const randomPart = Math.random().toString(36).slice(2, 10);
  const timePart = Date.now().toString(36);
  return `${prefix}-${timePart}-${randomPart}`;
}

function loadClientId(storage) {
  if (!storage) {
    return randomId('client');
  }

  const existing = storage.getItem(CLIENT_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const created = randomId('client');
  storage.setItem(CLIENT_ID_STORAGE_KEY, created);
  return created;
}

function loadClientCounter(storage) {
  if (!storage) {
    return 0;
  }

  const raw = storage.getItem(CLIENT_COUNTER_STORAGE_KEY);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function persistClientCounter(storage, value) {
  if (!storage) {
    return;
  }

  storage.setItem(CLIENT_COUNTER_STORAGE_KEY, String(value));
}

function normalizeMeta(meta) {
  const source = meta && typeof meta === 'object' ? meta : {};
  const version = Number(source.version);
  const baseVersion = Number(source.baseVersion);
  const clientCounter = Number(source.clientCounter);

  return {
    version: Number.isFinite(version) && version >= 0 ? version : 0,
    baseVersion: Number.isFinite(baseVersion) && baseVersion >= 0 ? baseVersion : 0,
    updatedBy: typeof source.updatedBy === 'string' ? source.updatedBy : null,
    clientCounter: Number.isFinite(clientCounter) && clientCounter >= 0 ? clientCounter : null,
    updatedAt: source.updatedAt ?? null,
  };
}

function unwrapVersionedDoc(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const hasEnvelope = source.data && typeof source.data === 'object';

  if (hasEnvelope) {
    return {
      data: source.data,
      updatedAt: source.updatedAt ?? null,
      meta: normalizeMeta(source.meta),
      hasEnvelope: true,
    };
  }

  return {
    data: source,
    updatedAt: source.updatedAt ?? null,
    meta: normalizeMeta(source.meta),
    hasEnvelope: false,
  };
}

const storage = safeStorage();
const syncState = {
  storage,
  clientId: loadClientId(storage),
  clientCounter: loadClientCounter(storage),
  knownVersions: new Map(),
  pendingWrites: new Map(),
  conflictsByPath: new Map(),
  listeners: new Set(),
  debouncedWrites: new Map(),
  conflictSequence: 0,
};

function nextClientCounter() {
  syncState.clientCounter += 1;
  persistClientCounter(syncState.storage, syncState.clientCounter);
  return syncState.clientCounter;
}

function knownVersion(docPath) {
  return syncState.knownVersions.get(docPath) ?? 0;
}

function rememberVersion(docPath, meta) {
  if (!Number.isFinite(meta.version) || meta.version < 0) {
    return;
  }

  const previous = knownVersion(docPath);
  if (meta.version > previous) {
    syncState.knownVersions.set(docPath, meta.version);
  }
}

function snapshotConflicts() {
  const conflicts = Array.from(syncState.conflictsByPath.values())
    .map((conflict) => copy(conflict))
    .sort((left, right) => String(left.createdAt).localeCompare(String(right.createdAt)));

  return {
    clientId: syncState.clientId,
    pendingWrites: syncState.pendingWrites.size,
    count: conflicts.length,
    conflicts,
  };
}

function persistConflictBackup() {
  if (!syncState.storage) {
    return;
  }

  if (!syncState.conflictsByPath.size) {
    syncState.storage.removeItem(CONFLICT_BACKUP_STORAGE_KEY);
    return;
  }

  const payload = {
    updatedAt: nowIso(),
    conflicts: Array.from(syncState.conflictsByPath.values()).map((conflict) => copy(conflict)),
  };
  syncState.storage.setItem(CONFLICT_BACKUP_STORAGE_KEY, JSON.stringify(payload));
}

function notifySyncListeners() {
  const snapshot = snapshotConflicts();

  syncState.listeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch (error) {
      console.error(error);
    }
  });
}

function clearConflict(docPath, options = {}) {
  if (!syncState.conflictsByPath.delete(docPath)) {
    return;
  }

  if (options.notify !== false) {
    persistConflictBackup();
    notifySyncListeners();
  }
}

function clearPendingWrite(docPath, options = {}) {
  const pending = syncState.pendingWrites.get(docPath);
  if (!pending) {
    return;
  }

  if (pending.timer) {
    clearTimeout(pending.timer);
  }

  syncState.pendingWrites.delete(docPath);

  if (options.notify !== false) {
    notifySyncListeners();
  }
}

function trackConflict(docPath, pending, remote, reason = 'remote-update') {
  const previous = syncState.conflictsByPath.get(docPath);

  const conflict = {
    id: previous?.id ?? `sync-conflict-${++syncState.conflictSequence}`,
    docPath,
    reason,
    createdAt: previous?.createdAt ?? nowIso(),
    updatedAt: nowIso(),
    local: {
      data: copy(pending.localData),
      baseVersion: pending.baseVersion,
      clientCounter: pending.clientCounter,
      queuedAt: pending.queuedAt,
    },
    remote: {
      data: copy(remote.data),
      meta: copy(remote.meta),
      observedAt: nowIso(),
    },
  };

  syncState.conflictsByPath.set(docPath, conflict);
  persistConflictBackup();
  notifySyncListeners();
}

function shouldTrackConflict(pending, observedMeta, docMetadata) {
  if (!pending) {
    return false;
  }

  if (docMetadata?.hasPendingWrites) {
    return false;
  }

  if (!observedMeta.updatedBy || observedMeta.updatedBy === syncState.clientId) {
    return false;
  }

  if (!Number.isFinite(observedMeta.version)) {
    return true;
  }

  return observedMeta.version > pending.baseVersion;
}

function maybeAcknowledgePending(docPath, observedMeta) {
  const pending = syncState.pendingWrites.get(docPath);
  if (!pending) {
    return;
  }

  const isOwnWrite =
    observedMeta.updatedBy === syncState.clientId
    && Number.isFinite(observedMeta.clientCounter)
    && observedMeta.clientCounter >= pending.clientCounter;

  if (!isOwnWrite) {
    return;
  }

  clearPendingWrite(docPath, { notify: false });
  clearConflict(docPath, { notify: false });
  persistConflictBackup();
  notifySyncListeners();
}

function observeDoc(docPath, rawData, docMetadata) {
  const parsed = unwrapVersionedDoc(rawData);
  rememberVersion(docPath, parsed.meta);
  maybeAcknowledgePending(docPath, parsed.meta);

  const pending = syncState.pendingWrites.get(docPath);
  if (shouldTrackConflict(pending, parsed.meta, docMetadata)) {
    trackConflict(docPath, pending, parsed);
  }

  return parsed;
}

function trackPendingWrite(docPath, localData, baseVersion, retry) {
  const pending = {
    docPath,
    localData: copy(localData),
    baseVersion,
    clientCounter: nextClientCounter(),
    queuedAt: nowIso(),
    retry,
    timer: null,
  };

  pending.timer = setTimeout(() => {
    if (syncState.pendingWrites.get(docPath)?.clientCounter !== pending.clientCounter) {
      return;
    }

    trackConflict(
      docPath,
      pending,
      {
        data: {},
        meta: {
          version: knownVersion(docPath),
          baseVersion,
          updatedBy: null,
          clientCounter: null,
          updatedAt: null,
        },
      },
      'write-timeout',
    );
  }, 15000);

  syncState.pendingWrites.set(docPath, pending);
  notifySyncListeners();
  return pending;
}

async function applyVersionedWrite(docRef, localData, options = {}) {
  const merge = options.merge !== false;
  const docPath = docRef.path;
  const baseVersion = Number.isFinite(options.baseVersionOverride)
    ? options.baseVersionOverride
    : knownVersion(docPath);

  const retry = async (nextBaseVersion) => {
    const retryOptions = {
      ...options,
      baseVersionOverride: Number.isFinite(nextBaseVersion) ? nextBaseVersion : undefined,
    };
    return applyVersionedWrite(docRef, localData, retryOptions);
  };

  const pending = trackPendingWrite(docPath, localData, baseVersion, retry);

  const persistedData =
    typeof options.buildPersistedData === 'function' ? options.buildPersistedData(localData) : localData;

  const payload = {
    data: persistedData,
    updatedAt: serverTimestamp(),
    meta: {
      version: increment(1),
      baseVersion,
      updatedAt: serverTimestamp(),
      updatedBy: syncState.clientId,
      clientCounter: pending.clientCounter,
    },
  };

  try {
    await docRef.set(payload, { merge });
  } catch (error) {
    const activePending = syncState.pendingWrites.get(docPath);
    if (activePending && activePending.clientCounter === pending.clientCounter) {
      clearPendingWrite(docPath, { notify: false });
      clearConflict(docPath, { notify: false });
      persistConflictBackup();
      notifySyncListeners();
    }
    throw error;
  }
}

function scheduleVersionedWrite(docRef, localData, options = {}) {
  if (!options.debounce) {
    return applyVersionedWrite(docRef, localData, options);
  }

  const docPath = docRef.path;

  return new Promise((resolve, reject) => {
    const existing = syncState.debouncedWrites.get(docPath) ?? {
      docRef,
      localData,
      options,
      timer: null,
      resolvers: [],
      rejecters: [],
    };

    existing.docRef = docRef;
    existing.localData = localData;
    existing.options = options;
    existing.resolvers.push(resolve);
    existing.rejecters.push(reject);

    if (existing.timer) {
      clearTimeout(existing.timer);
    }

    existing.timer = setTimeout(async () => {
      syncState.debouncedWrites.delete(docPath);
      try {
        await applyVersionedWrite(existing.docRef, existing.localData, existing.options);
        existing.resolvers.forEach((nextResolve) => nextResolve());
      } catch (error) {
        existing.rejecters.forEach((nextReject) => nextReject(error));
      }
    }, WRITE_DEBOUNCE_MS);

    syncState.debouncedWrites.set(docPath, existing);
  });
}

function clearSyncStateForDoc(docPath) {
  clearPendingWrite(docPath, { notify: false });
  clearConflict(docPath, { notify: false });
  syncState.knownVersions.delete(docPath);
  const debounced = syncState.debouncedWrites.get(docPath);
  if (debounced?.timer) {
    clearTimeout(debounced.timer);
  }
  syncState.debouncedWrites.delete(docPath);
  persistConflictBackup();
  notifySyncListeners();
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
  const observed = observeDoc(doc.ref.path, doc.data(), doc.metadata);
  const data = observed.data;

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
    updatedAt: data.updatedAt ?? observed.updatedAt ?? null,
    createdBy: data.createdBy ?? null,
    updatedBy: data.updatedBy ?? null,
    syncMeta: observed.meta,
  };
}

function mapLocation(doc) {
  const observed = observeDoc(doc.ref.path, doc.data(), doc.metadata);
  const data = observed.data;

  return {
    id: doc.id,
    name: data.name ?? doc.id,
    createdAt: data.createdAt ?? null,
    syncMeta: observed.meta,
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

export function getSyncConflictState() {
  return snapshotConflicts();
}

export function subscribeSyncConflicts(callback) {
  if (typeof callback !== 'function') {
    return () => {};
  }

  syncState.listeners.add(callback);
  callback(snapshotConflicts());

  return () => {
    syncState.listeners.delete(callback);
  };
}

export async function resolveSyncConflicts(_db, strategy = 'server') {
  const conflicts = Array.from(syncState.conflictsByPath.values());
  if (!conflicts.length) {
    return { resolved: 0, remaining: 0 };
  }

  let resolved = 0;

  for (const conflict of conflicts) {
    const pending = syncState.pendingWrites.get(conflict.docPath);

    if (strategy === 'local' && pending && typeof pending.retry === 'function') {
      const remoteVersion = Number(conflict.remote?.meta?.version);
      clearPendingWrite(conflict.docPath, { notify: false });
      clearConflict(conflict.docPath, { notify: false });

      try {
        await pending.retry(Number.isFinite(remoteVersion) ? remoteVersion : undefined);
        resolved += 1;
      } catch (error) {
        trackConflict(
          conflict.docPath,
          pending,
          {
            data: conflict.remote?.data ?? {},
            meta: conflict.remote?.meta ?? {
              version: knownVersion(conflict.docPath),
              baseVersion: pending.baseVersion,
              updatedBy: null,
              clientCounter: null,
              updatedAt: null,
            },
          },
          'retry-failed',
        );
      }

      continue;
    }

    clearPendingWrite(conflict.docPath, { notify: false });
    clearConflict(conflict.docPath, { notify: false });

    const remoteVersion = Number(conflict.remote?.meta?.version);
    if (Number.isFinite(remoteVersion) && remoteVersion >= 0) {
      syncState.knownVersions.set(conflict.docPath, remoteVersion);
    }

    resolved += 1;
  }

  persistConflictBackup();
  notifySyncListeners();

  return {
    resolved,
    remaining: syncState.conflictsByPath.size,
  };
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

  await addActivity(db, household.id, user, 'household', `Created household "${householdName}".`);

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
        snapshot.docs.map((doc) => {
          const observed = observeDoc(doc.ref.path, doc.data(), doc.metadata);
          const data = observed.data;

          return {
            dayId: doc.id,
            mealName: data.mealName ?? '',
            cookUid: data.cookUid ?? null,
            updatedAt: data.updatedAt ?? observed.updatedAt ?? null,
            updatedBy: data.updatedBy ?? null,
            syncMeta: observed.meta,
          };
        }),
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
  const weekRef = weekDocRef(db, householdId, weekId);
  const dayRef = dayCollection(db, householdId, weekId).doc(dayId);

  await weekRef.set(
    {
      weekStartIso: weekId,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid,
    },
    { merge: true },
  );

  const dayData = {
    mealName: meal.mealName,
    cookUid: meal.cookUid,
    updatedBy: user.uid,
  };

  await scheduleVersionedWrite(dayRef, dayData, {
    merge: true,
    debounce: true,
    buildPersistedData: (localData) => ({
      ...localData,
      updatedAt: serverTimestamp(),
    }),
  });

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

  const itemData = {
    ...item,
    createdBy: user.uid,
    updatedBy: user.uid,
  };

  await scheduleVersionedWrite(doc, itemData, {
    merge: true,
    buildPersistedData: (localData) => ({
      ...localData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  });

  await addActivity(db, householdId, user, 'grocery', `Added ${item.name} to grocery list.`);

  return doc.id;
}

export async function setGroceryItemCompleted(db, householdId, itemId, completed, user) {
  const docRef = groceryCollection(db, householdId).doc(itemId);
  const patch = {
    completed: Boolean(completed),
    updatedBy: user.uid,
  };

  await scheduleVersionedWrite(docRef, patch, {
    merge: true,
    buildPersistedData: (localData) => ({
      ...localData,
      updatedAt: serverTimestamp(),
    }),
  });

  const verb = completed ? 'Completed' : 'Reopened';
  await addActivity(db, householdId, user, 'grocery', `${verb} a grocery item.`);
}

export async function deleteGroceryItem(db, householdId, itemId, user) {
  const docRef = groceryCollection(db, householdId).doc(itemId);
  clearSyncStateForDoc(docRef.path);
  await docRef.delete();
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
  const [legacyExists, envelopeExists] = await Promise.all([
    locationCollection(db, householdId)
      .where('name', '==', locationName)
      .limit(1)
      .get(),
    locationCollection(db, householdId)
      .where('data.name', '==', locationName)
      .limit(1)
      .get(),
  ]);

  if (!legacyExists.empty || !envelopeExists.empty) {
    throw new Error('Location already exists.');
  }

  const doc = locationCollection(db, householdId).doc();
  const locationData = {
    name: locationName,
    createdBy: user.uid,
  };

  await scheduleVersionedWrite(doc, locationData, {
    merge: true,
    buildPersistedData: (localData) => ({
      ...localData,
      createdAt: serverTimestamp(),
    }),
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
