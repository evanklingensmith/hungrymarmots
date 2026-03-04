# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Hungry Marmots is a Firebase-hosted SPA for household meal planning, grocery lists, and pantry tracking. Built with vanilla JavaScript (ES6 modules), Firebase Auth (Google sign-in), and Firestore.

## Commands

- **Run tests:** `npm test`
- **Deploy:** Push to `main` triggers GitHub Actions CI/CD (Firebase Hosting). Manual deploy via `./deploy-hosting-with-version.sh`.
- **Node version:** v24.13.0 (see `.nvmrc`)

## Architecture

### Frontend (all in `public/`)

No build step — plain ES modules served directly by Firebase Hosting.

- `index.html` — single HTML entry point with all markup and styles
- `app/main.mjs` — application logic, UI rendering, state management, event handling (~1800 lines)
- `app/data.mjs` — remote Firestore data layer (CRUD operations, queries, sync)
- `app/local-data.mjs` — localStorage fallback with identical API surface to `data.mjs`
- `app/firebase.mjs` — Firebase SDK initialization
- `app/utils/` — pure utility modules (dates, validators, grocery sorting, state)

### Dual Data Backends

The app runs in two modes with the same API:
- **Remote mode:** Firestore + Firebase Auth (when SDK available and user signed in)
- **Local mode:** localStorage only (fallback, key `weektable.local.v2`)

### Firestore Data Model

Hierarchy: `users/{uid}`, `households/{householdId}` with subcollections `members`, `weeks/{weekId}/days/{dayId}`, `groceryItems`, `stores`, `meals`, `pantryItems`, `activity`.

- Week IDs are ISO dates (`YYYY-MM-DD`, Monday-start)
- Day IDs are lowercase day names (`monday`–`sunday`)
- Documents use a versioned envelope pattern: `{ data: {...}, meta: { version, baseVersion, updatedAt, updatedBy } }` for conflict detection
- Full schema documented in `FIREBASE_BACKEND_REFERENCE.md`

### Security Rules

`firestore.rules` enforces member-only access via `memberUids` array checks, owner immutability, invite-code join validation, and append-only activity logs.

### Sync & Conflicts

Client tracks a monotonic write counter in localStorage (`weektable.sync.clientCounter`). Pending writes tracked per document path with 15-second timeout. Conflicts resolved as `'server'` (accept remote) or `'local'` (retry).

## Testing

Custom test harness in `tests/test-harness.mjs` using Node.js `assert`. Tests are pure unit tests for utility modules — no browser or Firebase dependency.

```
tests/
  dates.test.mjs
  validators.test.mjs
  grocery.test.mjs
  state.test.mjs
  local-data.test.mjs
```

Run a single test file: `node tests/dates.test.mjs` (each file imports and runs independently via the harness).

## Key Conventions

- ES modules throughout (`"type": "module"` in package.json, `.mjs` extensions)
- Firebase compat SDKs (v12.9.0) loaded from CDN in `index.html`, not bundled
- Validation limits defined in `public/app/utils/validators.mjs` and mirrored in `firestore.rules`
- Product roadmap and vision in `plan.md`
