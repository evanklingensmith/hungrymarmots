# HungryMarmots Backend Reference

This document is the backend contract for the `hungrymarmots` project in this repository.

## 1) Project + Environment

- Firebase project ID: `hungrymarmots` (`.firebaserc`).
- Firestore database: `(default)` in location `nam5` (`firebase.json`).
- Hosting root: `public/` with SPA rewrite to `/index.html` (`firebase.json`).
- Firestore indexes: none currently declared (`firestore.indexes.json`).

## 2) Firebase Runtime Boot Contract

`public/index.html` loads Firebase compat SDKs and init endpoints:

- `/__/firebase/12.9.0/firebase-app-compat.js`
- `/__/firebase/12.9.0/firebase-auth-compat.js`
- `/__/firebase/12.9.0/firebase-firestore-compat.js`
- `/__/firebase/init.js`

Runtime config source order:

1. `window.firebaseConfig` from `/__/firebase/init.js` (Firebase Hosting injection).
2. Static fallback object in `public/index.html` if Hosting injection is unavailable.

Remote mode only enables when these config keys are present:

- `apiKey`
- `authDomain`
- `projectId`
- `appId`

Additional runtime behavior (`public/app/firebase.mjs`):

- Auth domain is rewritten to current non-localhost hostname for custom-domain sign-in.
- Auth persistence is set to `LOCAL` when available.
- Firestore offline persistence is enabled with `{ synchronizeTabs: true }` when supported.
- Google sign-in uses popup first, then redirect fallback for popup-blocking environments.

## 3) Runtime Modes (App Behavior)

The app supports two data backends behind the same API surface (`public/app/main.mjs`):

- `remote` mode: Firestore + Firebase Auth (`public/app/data.mjs`).
- `local` mode: browser-only storage (`public/app/local-data.mjs`).

Mode switching rules:

- If Firebase SDK/config is unavailable, app stays in local mode.
- If Firebase is available but user is signed out, app still runs in local mode.
- Signing in switches to remote mode.

## 4) Firestore Topology

All collaborative data is household-scoped.

```text
users/{uid}
households/{householdId}
households/{householdId}/members/{uid}
households/{householdId}/weeks/{weekId}
households/{householdId}/weeks/{weekId}/days/{dayId}
households/{householdId}/groceryItems/{itemId}
households/{householdId}/locations/{locationId}
households/{householdId}/activity/{activityId}
```

Notes:

- UI uses `weekId = YYYY-MM-DD` Monday-start ISO dates (`weekIdFromStart`, `getWeekStartIso`).
- Valid `dayId` values: `monday` through `sunday`.

## 5) Firestore Document Contracts

### 5.1 `households/{householdId}`

```ts
{
  name: string,           // <= 60
  ownerUid: string,
  memberUids: string[],   // includes owner + members
  inviteCode: string,     // 4-12 chars
  createdAt: Timestamp,
  updatedAt: Timestamp,
}
```

### 5.2 `households/{householdId}/members/{uid}`

```ts
{
  uid: string,            // doc id matches auth uid
  email: string | null,
  displayName: string,    // <= 100
  photoURL: string | null,
  role: 'owner' | 'member',
  joinCode: string,       // must match household inviteCode on create
  joinedAt: Timestamp,
  updatedAt: Timestamp,
}
```

### 5.3 `households/{householdId}/weeks/{weekId}`

Used as a lightweight week marker.

```ts
{
  weekStartIso: string,   // set by app to weekId
  updatedAt: Timestamp,
  updatedBy: string,      // auth uid
}
```

### 5.4 Versioned Envelope (used by day, grocery, location docs)

Current remote writes use a versioned envelope for conflict detection.

```ts
type VersionMeta = {
  version: number,        // int >= 0, incremented server-side
  baseVersion: number,    // int >= 0
  updatedAt?: Timestamp,
  updatedBy: string,      // client id (not auth uid)
  clientCounter: number,  // int >= 0
};

type VersionedDoc<T> = {
  data: T,
  updatedAt?: Timestamp,
  meta: VersionMeta,
};
```

Rules also allow legacy non-envelope payloads for compatibility.

### 5.5 `households/{householdId}/weeks/{weekId}/days/{dayId}`

`data` payload:

```ts
{
  mealName?: string | null,   // <= 120
  cookUid?: string | null,    // must reference a member if set
  updatedAt?: Timestamp,
  updatedBy?: string,         // auth uid when written by app
}
```

### 5.6 `households/{householdId}/groceryItems/{itemId}`

`data` payload:

```ts
{
  name: string,               // required, <= 80
  quantity?: string | null,   // <= 24
  notes?: string | null,      // <= 240
  locationId?: string | null, // must reference location doc if set
  personTag?: string | null,  // <= 50
  personUid?: string | null,  // allowed by rules (not currently set by UI)
  mealDayId?: string | null,  // monday..sunday
  completed?: boolean,
  createdBy?: string | null,
  updatedBy?: string,         // must match request.auth.uid when present
  createdAt?: Timestamp,
  updatedAt?: Timestamp,
}
```

### 5.7 `households/{householdId}/locations/{locationId}`

`data` payload:

```ts
{
  name: string,          // required, <= 40
  createdBy: string,     // request.auth.uid
  createdAt?: Timestamp,
}
```

### 5.8 `households/{householdId}/activity/{activityId}`

```ts
{
  actorUid: string,      // must equal request.auth.uid
  actorName: string,     // 1..100
  type: string,          // 1..40
  message: string,       // 1..180
  createdAt: Timestamp,
}
```

Activity is append-only: create allowed, update/delete denied.

## 6) Security Rules Summary

`firestore.rules` enforces:

- Signed-in required for all remote access.
- Household membership gate for all reads/writes under `households/{householdId}`.
- Self-join flow allowed only when member doc `joinCode` equals household `inviteCode` in same request.
- Household owner cannot be changed by update.
- `members/{uid}` create is self-only (`uid == request.auth.uid`).
- `weeks/{weekId}/days/{dayId}` writes require valid day id and valid meal schema.
- Grocery/location writes validate shape, sizes, and reference integrity.

## 7) Sync + Conflict Semantics (Remote Data Layer)

Remote sync behavior in `public/app/data.mjs`:

- Local sync identity is persisted in localStorage key `weektable.sync.clientId`.
- Monotonic client write counter is persisted in `weektable.sync.clientCounter`.
- Pending writes and conflicts are tracked per document path.
- Meal day writes are debounced (`600ms`) to reduce write volume.
- If a pending write is not acknowledged within `15s`, conflict reason `write-timeout` is created.
- Conflict backup snapshot is stored in localStorage key `weektable.sync.conflictBackup`.

Conflict resolution API:

- `resolveSyncConflicts(..., 'server')`: drop local pending state and accept remote state.
- `resolveSyncConflicts(..., 'local')`: retry local pending write using latest remote version as base.

## 8) Local-Only Storage Contract

Local mode is implemented in `public/app/local-data.mjs` and persisted to localStorage key `weektable.local.v1`.

State shape:

```ts
{
  households: Household[],
  membersByHousehold: Record<householdId, Record<uid, Member>>,
  weeksByHousehold: Record<householdId, Record<weekId, Record<dayId, MealDay>>>,
  groceryByHousehold: Record<householdId, Record<itemId, GroceryItem>>,
  locationsByHousehold: Record<householdId, Record<locationId, Location>>,
  activityByHousehold: Record<householdId, Record<activityId, Activity>>,
}
```

Bootstrap defaults:

- Default household id: `local-household`
- Default invite code: `LOCAL1`
- Local-mode user id: `local-user`

Local mode reports no sync conflicts (`count = 0`).

## 9) Input Validation Limits (Client-Side)

From `public/app/utils/validators.mjs`:

- Household name: required, max 60.
- Invite code: `^[A-Z0-9]{4,12}$`.
- Meal name: max 120.
- Grocery name: required, max 80.
- Quantity: max 24.
- Notes: max 240.
- Person tag: max 50.
- Location name: required, max 40.
- `mealDayId`: must be one of monday-sunday.

These validations align with Firestore rule limits and should be preserved by any interoperating writer.

## 10) Interop Guidance

For external services writing this backend:

1. Authenticate as a Firebase user that is a member of the target household.
2. Keep `memberUids` and `members/{uid}` consistent on join/create flows.
3. Prefer versioned envelope writes (`data` + `meta`) for days, grocery items, and locations.
4. Respect field length/reference constraints enforced in rules.
5. Write activity records as append-only events.
