import { assert, test } from './test-harness.mjs';

import {
  LOCAL_MODE_USER,
  addGroceryItem,
  addLocation,
  createLocalContext,
  deleteGroceryItem,
  listUserHouseholds,
  listenGroceryItems,
  listenLocations,
  listenMembers,
  listenWeekDays,
  saveMealForDay,
  setGroceryItemCompleted,
} from '../public/app/local-data.mjs';

function createMemoryStorage() {
  const values = {};

  return {
    getItem: (key) => {
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
    setItem: (key, value) => {
      values[key] = String(value);
    },
    removeItem: (key) => {
      delete values[key];
    },
  };
}

test('createLocalContext bootstraps one local household and member', async () => {
  const storage = createMemoryStorage();
  const context = createLocalContext(LOCAL_MODE_USER, { storage });
  const households = await listUserHouseholds(context, LOCAL_MODE_USER.uid);

  assert.strictEqual(households.length, 1);
  assert.strictEqual(households[0].name, 'Local household');

  let members = [];
  const unsubscribe = listenMembers(context, households[0].id, (nextMembers) => {
    members = nextMembers;
  });

  assert.strictEqual(members.length, 1);
  assert.strictEqual(members[0].uid, LOCAL_MODE_USER.uid);
  assert.strictEqual(members[0].role, 'owner');

  unsubscribe();
});

test('local planner and grocery listeners update after mutations', async () => {
  const storage = createMemoryStorage();
  const context = createLocalContext(LOCAL_MODE_USER, { storage });
  const households = await listUserHouseholds(context, LOCAL_MODE_USER.uid);
  const householdId = households[0].id;

  let weekDocs = [];
  const unsubscribeWeek = listenWeekDays(context, householdId, '2026-02-09', (docs) => {
    weekDocs = docs;
  });

  await saveMealForDay(
    context,
    householdId,
    '2026-02-09',
    'monday',
    { mealName: 'Tacos', cookUid: '' },
    LOCAL_MODE_USER,
  );

  const monday = weekDocs.find((doc) => doc.dayId === 'monday');
  assert.ok(monday);
  assert.strictEqual(monday.mealName, 'Tacos');

  let grocery = [];
  const unsubscribeGrocery = listenGroceryItems(context, householdId, (items) => {
    grocery = items;
  });

  const itemId = await addGroceryItem(
    context,
    householdId,
    {
      name: 'Milk',
      quantity: '1 gal',
      notes: '',
      locationId: '',
      personTag: '',
      mealDayId: 'monday',
    },
    LOCAL_MODE_USER,
  );

  assert.strictEqual(grocery.length, 1);
  assert.strictEqual(grocery[0].name, 'Milk');

  await setGroceryItemCompleted(context, householdId, itemId, true, LOCAL_MODE_USER);
  assert.strictEqual(grocery[0].completed, true);

  await deleteGroceryItem(context, householdId, itemId, LOCAL_MODE_USER);
  assert.strictEqual(grocery.length, 0);

  unsubscribeWeek();
  unsubscribeGrocery();
});

test('local data persists to shared storage', async () => {
  const storage = createMemoryStorage();

  const contextA = createLocalContext(LOCAL_MODE_USER, { storage });
  const householdsA = await listUserHouseholds(contextA, LOCAL_MODE_USER.uid);
  const householdIdA = householdsA[0].id;

  await addLocation(contextA, householdIdA, 'Costco', LOCAL_MODE_USER);

  const contextB = createLocalContext(LOCAL_MODE_USER, { storage });
  const householdsB = await listUserHouseholds(contextB, LOCAL_MODE_USER.uid);
  const householdIdB = householdsB[0].id;

  let locations = [];
  const unsubscribe = listenLocations(contextB, householdIdB, (nextLocations) => {
    locations = nextLocations;
  });

  assert.strictEqual(locations.length, 1);
  assert.strictEqual(locations[0].name, 'Costco');

  unsubscribe();
});
