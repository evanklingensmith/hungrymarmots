# Weekly Meals App: Top-Level User-Focused Plan

## 1) Product vision
Help households plan weekly meals together and turn that plan into a shared grocery workflow that is clear, fast, and low-friction.

## 2) Primary users
- Household planner: usually creates most meals and coordinates shopping.
- Household contributor: adds meals, claims cooking days, and updates groceries.
- Shopper: uses the grocery list in-store and checks off items.

## 3) Core user outcomes
- "I can see what we are eating each day this week."
- "I can quickly add or change meals with my household."
- "Our grocery list stays in sync with the meal plan."
- "I can organize groceries by store/location."
- "I can tag who an item is for and link it to a meal when useful."

## 4) MVP scope (user-facing)
### A. Account and access
- Sign in with Google account only.
- Create or join a shared household/group.
- All data is visible only to members of that household.

### B. Weekly meal planning
- Weekly board view (Mon-Sun) with day-by-day meal slots.
- Add/edit/remove meals on each day.
- Optional assignment fields (for example: who is cooking).
- Quick duplicate/copy from previous week.

### C. Shared grocery list
- One shared list per household (with optional week context).
- Add/remove/check off items.
- Each item supports:
  - Name, quantity, optional notes.
  - Optional location/store tag (for example: Costco, Trader Joe's).
  - Optional link to a planned meal.
  - Optional person tag (who requested or item is for).
- Filter by location, person, and completion state.

### D. Collaboration essentials
- Real-time updates for meal plan and grocery list.
- Basic activity visibility ("who changed what" can be simple in MVP).

## 5) Information architecture (top-level screens)
- Login (Google sign-in).
- Household selection/onboarding (create or join).
- Weekly planner screen.
- Grocery list screen.
- Basic settings screen (household members, locations, profile).

## 6) Technical plan (Firebase-first)
### Frontend
- Single Page App hosted on Firebase Hosting.
- Client-side routing with SPA rewrite to `index.html`.

### Backend/data
- Firestore as primary database for households, plans, and grocery data.
- Firebase Authentication with Google provider.

### Suggested Firestore model (high-level)
- `users/{uid}`
- `households/{householdId}`
- `households/{householdId}/members/{uid}`
- `households/{householdId}/weeks/{weekId}`
- `households/{householdId}/weeks/{weekId}/days/{dayId}`
- `households/{householdId}/groceryItems/{itemId}`
- `households/{householdId}/locations/{locationId}`

## 7) Security and trust basics
- Require authenticated users for all app access.
- Firestore rules restrict reads/writes to household members only.
- Validate that linked meal or person references belong to same household.

## 8) Delivery roadmap (top-level)
### Phase 1: Foundation
- Firebase project setup, hosting, auth, Firestore rules, base SPA shell.

### Phase 2: Meal planner MVP
- Weekly day-by-day planner CRUD with shared household context.

### Phase 3: Grocery MVP
- Shared grocery items with add/remove/check-off, location config, and filters.

### Phase 4: Linkages and polish
- Optional meal linkage, person tagging, activity hints, UX refinements.

## 9) Success metrics
- Weekly active households.
- Number of meal entries per household per week.
- Number of grocery items completed per week.
- Percentage of grocery items linked to meals (adoption of linkage feature).
- 7-day retention for newly created households.

## 10) Open decisions to finalize early
- Single household per user vs multiple households.
- One grocery list per week vs one ongoing list with week filters.
- Exact meal granularity (single meal per day vs breakfast/lunch/dinner slots).
