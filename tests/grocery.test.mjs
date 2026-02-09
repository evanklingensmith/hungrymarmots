import { assert, test } from './test-harness.mjs';

import { collectPersonTags, describeGroceryItem, filterGroceryItems, sortGroceryItems } from '../public/app/utils/grocery.mjs';

const sampleItems = [
  {
    id: '1',
    name: 'Apples',
    locationId: 'loc_a',
    personTag: 'Alex',
    completed: false,
    mealDayId: 'monday',
  },
  {
    id: '2',
    name: 'Bread',
    locationId: 'loc_b',
    personTag: 'Sam',
    completed: true,
    mealDayId: 'tuesday',
  },
  {
    id: '3',
    name: 'Carrots',
    locationId: 'loc_a',
    personTag: 'alex',
    completed: false,
    mealDayId: null,
  },
];

test('collectPersonTags deduplicates case-insensitively', () => {
  assert.deepStrictEqual(collectPersonTags(sampleItems), ['Alex', 'Sam']);
});

test('filterGroceryItems applies location, person, and status filters', () => {
  assert.strictEqual(filterGroceryItems(sampleItems, { locationId: 'loc_a', personTag: 'all', status: 'all' }).length, 2);
  assert.strictEqual(filterGroceryItems(sampleItems, { locationId: 'all', personTag: 'alex', status: 'all' }).length, 2);
  assert.strictEqual(filterGroceryItems(sampleItems, { locationId: 'all', personTag: 'all', status: 'open' }).length, 2);
  assert.strictEqual(filterGroceryItems(sampleItems, { locationId: 'all', personTag: 'all', status: 'done' }).length, 1);
});

test('sortGroceryItems keeps open items first and sorts by name', () => {
  const sorted = sortGroceryItems(sampleItems);
  assert.deepStrictEqual(sorted.map((item) => item.name), ['Apples', 'Carrots', 'Bread']);
});

test('describeGroceryItem joins item metadata', () => {
  const description = describeGroceryItem(sampleItems[0], new Map([['loc_a', 'Costco']]));
  assert.ok(/Costco/.test(description));
  assert.ok(/For Alex/.test(description));
  assert.ok(/monday/.test(description));
});
