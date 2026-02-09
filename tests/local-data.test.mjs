import { assert, test } from './test-harness.mjs';

import {
  LOCAL_MODE_USER,
  addGroceryItem,
  addStore,
  createHousehold,
  createLocalContext,
  createMeal,
  getDefaultHouseholdId,
  listUserHouseholds,
  listenActivity,
  listenGroceryItems,
  listenMembers,
  listenPantryItems,
  listenStores,
  listenWeekDays,
  movePantryItem,
  saveWeekDayPlan,
  setGroceryItemCompleted,
  undoActivity,
} from '../public/app/local-data.mjs';

function createMemoryStorage() {
  const values = {};

  return {
    getItem: (key) => (Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null),
    setItem: (key, value) => {
      values[key] = String(value);
    },
    removeItem: (key) => {
      delete values[key];
    },
  };
}

test('createLocalContext starts without a household and stores defaults after create', async () => {
  const storage = createMemoryStorage();
  const context = createLocalContext(LOCAL_MODE_USER, { storage });

  const before = await listUserHouseholds(context, LOCAL_MODE_USER.uid);
  assert.strictEqual(before.length, 0);

  const createdHouseholdId = await createHousehold(context, LOCAL_MODE_USER, 'Maple Street');
  const after = await listUserHouseholds(context, LOCAL_MODE_USER.uid);

  assert.strictEqual(after.length, 1);
  assert.strictEqual(after[0].id, createdHouseholdId);

  const defaultHouseholdId = await getDefaultHouseholdId(context, LOCAL_MODE_USER.uid);
  assert.strictEqual(defaultHouseholdId, createdHouseholdId);

  let members = [];
  const unsubscribe = listenMembers(context, createdHouseholdId, (nextMembers) => {
    members = nextMembers;
  });

  assert.strictEqual(members.length, 1);
  assert.strictEqual(members[0].uid, LOCAL_MODE_USER.uid);
  assert.strictEqual(members[0].role, 'owner');

  unsubscribe();
});

test('weekly day plan creates grocery items and checked grocery items flow into pantry', async () => {
  const storage = createMemoryStorage();
  const context = createLocalContext(LOCAL_MODE_USER, { storage });
  const householdId = await createHousehold(context, LOCAL_MODE_USER, 'Main House');

  const storeId = await addStore(context, householdId, 'Costco', LOCAL_MODE_USER);
  const mealId = await createMeal(
    context,
    householdId,
    {
      title: 'Tacos',
      description: 'Taco night',
      tags: ['weekly'],
      ingredients: [
        { name: 'Tortillas', usuallyNeedToBuy: true, defaultStoreId: storeId },
        { name: 'Salsa', usuallyNeedToBuy: false, defaultStoreId: storeId },
      ],
    },
    LOCAL_MODE_USER,
  );

  let weekDays = [];
  let groceryItems = [];
  let pantryItems = [];

  const unsubs = [
    listenWeekDays(context, householdId, '2026-02-09', (docs) => {
      weekDays = docs;
    }),
    listenGroceryItems(context, householdId, (items) => {
      groceryItems = items;
    }),
    listenPantryItems(context, householdId, (items) => {
      pantryItems = items;
    }),
  ];

  await saveWeekDayPlan(
    context,
    householdId,
    '2026-02-09',
    'monday',
    {
      mealId,
      mealTitle: 'Tacos',
      cookUid: LOCAL_MODE_USER.uid,
      eaterUids: [LOCAL_MODE_USER.uid],
      notes: 'Family dinner',
      ingredientPlan: [
        { ingredientId: 'ing_a', name: 'Tortillas', needToBuy: true, storeId },
        { ingredientId: 'ing_b', name: 'Salsa', needToBuy: false, storeId },
      ],
    },
    LOCAL_MODE_USER,
  );

  const monday = weekDays.find((entry) => entry.dayId === 'monday');
  assert.ok(monday);
  assert.strictEqual(monday.mealTitle, 'Tacos');
  assert.strictEqual(groceryItems.length, 1);
  assert.strictEqual(groceryItems[0].name, 'Tortillas');

  await setGroceryItemCompleted(context, householdId, groceryItems[0].id, true, LOCAL_MODE_USER);
  assert.strictEqual(pantryItems.length, 1);
  assert.strictEqual(pantryItems[0].section, 'weekly');

  await setGroceryItemCompleted(context, householdId, groceryItems[0].id, false, LOCAL_MODE_USER);
  assert.strictEqual(pantryItems.length, 0);

  unsubs.forEach((unsubscribe) => unsubscribe());
});

test('local history supports undo for grocery and pantry actions', async () => {
  const storage = createMemoryStorage();
  const context = createLocalContext(LOCAL_MODE_USER, { storage });
  const householdId = await createHousehold(context, LOCAL_MODE_USER, 'History Home');

  let stores = [];
  let grocery = [];
  let pantry = [];
  let history = [];

  const unsubs = [
    listenStores(context, householdId, (items) => {
      stores = items;
    }),
    listenGroceryItems(context, householdId, (items) => {
      grocery = items;
    }),
    listenPantryItems(context, householdId, (items) => {
      pantry = items;
    }),
    listenActivity(context, householdId, (items) => {
      history = items;
    }),
  ];

  await addStore(context, householdId, 'Trader Joe\'s', LOCAL_MODE_USER);
  assert.strictEqual(stores.length, 1);

  const groceryItemId = await addGroceryItem(
    context,
    householdId,
    {
      name: 'Milk',
      notes: '2%',
      storeId: stores[0].id,
    },
    LOCAL_MODE_USER,
  );

  assert.strictEqual(grocery.length, 1);

  const addEvent = history.find((entry) => entry.scope === 'grocery' && entry.action === 'add' && !entry.undone);
  assert.ok(addEvent);

  await undoActivity(context, householdId, addEvent.id, LOCAL_MODE_USER);
  assert.strictEqual(grocery.length, 0);

  const secondItemId = await addGroceryItem(
    context,
    householdId,
    {
      name: 'Eggs',
      notes: '',
      storeId: stores[0].id,
    },
    LOCAL_MODE_USER,
  );

  await setGroceryItemCompleted(context, householdId, secondItemId, true, LOCAL_MODE_USER);
  assert.strictEqual(pantry.length, 1);

  await movePantryItem(context, householdId, pantry[0].id, 'other', LOCAL_MODE_USER);
  assert.strictEqual(pantry[0].section, 'other');

  const moveEvent = history.find((entry) => entry.scope === 'pantry' && entry.action === 'move' && !entry.undone);
  assert.ok(moveEvent);

  await undoActivity(context, householdId, moveEvent.id, LOCAL_MODE_USER);
  assert.strictEqual(pantry[0].section, 'weekly');

  unsubs.forEach((unsubscribe) => unsubscribe());

  assert.notStrictEqual(groceryItemId, secondItemId);
});

test('local data persists to shared storage across contexts', async () => {
  const storage = createMemoryStorage();

  const contextA = createLocalContext(LOCAL_MODE_USER, { storage });
  const householdId = await createHousehold(contextA, LOCAL_MODE_USER, 'Persisted');
  await addStore(contextA, householdId, 'Costco', LOCAL_MODE_USER);

  const contextB = createLocalContext(LOCAL_MODE_USER, { storage });

  const households = await listUserHouseholds(contextB, LOCAL_MODE_USER.uid);
  assert.strictEqual(households.length, 1);

  let stores = [];
  const unsubscribe = listenStores(contextB, householdId, (nextStores) => {
    stores = nextStores;
  });

  assert.strictEqual(stores.length, 1);
  assert.strictEqual(stores[0].name, 'Costco');

  unsubscribe();
});
