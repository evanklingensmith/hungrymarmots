function lower(value) {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

export function collectPersonTags(items) {
  const seen = new Map();

  items.forEach((item) => {
    if (!item || !item.personTag) {
      return;
    }

    const normalized = item.personTag.trim();
    if (!normalized) {
      return;
    }

    const key = normalized.toLowerCase();
    if (!seen.has(key)) {
      seen.set(key, normalized);
    }
  });

  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

export function filterGroceryItems(items, filters = {}) {
  const locationId = Object.prototype.hasOwnProperty.call(filters, 'locationId')
    ? filters.locationId
    : 'all';
  const personTag = Object.prototype.hasOwnProperty.call(filters, 'personTag')
    ? filters.personTag
    : 'all';
  const status = Object.prototype.hasOwnProperty.call(filters, 'status') ? filters.status : 'open';

  return items.filter((item) => {
    if (!item) {
      return false;
    }

    const itemLocationId = Object.prototype.hasOwnProperty.call(item, 'locationId') ? item.locationId : null;
    if (locationId !== 'all' && itemLocationId !== locationId) {
      return false;
    }

    if (personTag !== 'all' && lower(item.personTag) !== lower(personTag)) {
      return false;
    }

    if (status === 'open' && item.completed) {
      return false;
    }

    if (status === 'done' && !item.completed) {
      return false;
    }

    return true;
  });
}

export function sortGroceryItems(items) {
  return [...items].sort((left, right) => {
    if (left.completed !== right.completed) {
      return left.completed ? 1 : -1;
    }

    return left.name.localeCompare(right.name);
  });
}

export function describeGroceryItem(item, locationsById = new Map()) {
  const details = [];

  if (item.quantity) {
    details.push(item.quantity);
  }

  if (item.locationId && locationsById.has(item.locationId)) {
    details.push(locationsById.get(item.locationId));
  }

  if (item.personTag) {
    details.push(`For ${item.personTag}`);
  }

  if (item.mealDayId) {
    details.push(`Linked to ${item.mealDayId}`);
  }

  return details.join(' | ');
}
