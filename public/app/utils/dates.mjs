export const DAY_ORDER = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
];

const DAY_MS = 24 * 60 * 60 * 1000;

function asUtcDate(value) {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }

  if (typeof value === 'string') {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) {
      throw new Error('Date string must be in YYYY-MM-DD format.');
    }
    const [, year, month, day] = match;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  }

  throw new Error('Date value must be a Date or YYYY-MM-DD string.');
}

export function toIsoDate(value) {
  return asUtcDate(value).toISOString().slice(0, 10);
}

export function getWeekStartIso(value = new Date()) {
  const date = asUtcDate(value);
  const day = date.getUTCDay();
  const distanceFromMonday = (day + 6) % 7;
  const monday = new Date(date.getTime() - distanceFromMonday * DAY_MS);
  return toIsoDate(monday);
}

export function addDaysIso(isoDate, dayOffset) {
  const date = asUtcDate(isoDate);
  const shifted = new Date(date.getTime() + Number(dayOffset) * DAY_MS);
  return toIsoDate(shifted);
}

export function shiftWeekIso(weekStartIso, weekOffset) {
  return addDaysIso(weekStartIso, Number(weekOffset) * 7);
}

export function buildWeekDays(weekStartIso) {
  return DAY_ORDER.map((dayId, index) => {
    const dateIso = addDaysIso(weekStartIso, index);
    const date = asUtcDate(dateIso);
    const label = new Intl.DateTimeFormat(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    }).format(date);

    return {
      dayId,
      dateIso,
      label,
    };
  });
}

export function weekRangeLabel(weekStartIso) {
  const start = asUtcDate(weekStartIso);
  const end = asUtcDate(addDaysIso(weekStartIso, 6));
  const formatter = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });

  return `${formatter.format(start)} - ${formatter.format(end)}`;
}
