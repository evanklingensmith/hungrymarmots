import { getFirebaseServices, onAuthStateChanged, signInWithGoogle, signOutCurrentUser } from './firebase.mjs';
import * as localData from './local-data.mjs';
import * as remoteData from './data.mjs';
import { buildWeekDays, getWeekStartIso, shiftWeekIso, weekRangeLabel } from './utils/dates.mjs';
import { createEmptyWeekPlan, mergeDayDocs, weekIdFromStart } from './utils/state.mjs';
import { parseBulkMealJson } from './utils/validators.mjs';

const state = {
  services: null,
  remoteAvailable: false,
  pendingRemoteEntry: false,
  mode: null,
  dataApi: null,
  dataContext: null,
  localContext: null,
  authUser: null,
  user: null,
  households: [],
  activeHouseholdId: null,
  members: [],
  stores: [],
  meals: [],
  groceryItems: [],
  pantryItems: [],
  activity: [],
  weekStartIso: getWeekStartIso(),
  weekPlan: createEmptyWeekPlan(),
  activeTab: 'weekly',
  groceryView: 'list',
  pantryView: 'list',
  mealSearch: {
    text: '',
    tag: '',
    ingredient: '',
  },
  unsubs: [],
  weekUnsub: null,
  ensuredHouseholdMemberships: new Set(),
  householdModalLocked: false,
  mealModal: {
    open: false,
    mode: 'day',
    dayId: null,
  },
};

const elements = {};

function cacheElements() {
  elements.views = {
    login: document.getElementById('login-view'),
    app: document.getElementById('app-view'),
  };

  elements.status = document.getElementById('status-message');
  elements.modeBanner = document.getElementById('mode-banner');
  elements.error = document.getElementById('global-error');
  elements.loginHelper = document.getElementById('login-helper');

  elements.userName = document.getElementById('user-name');
  elements.userEmail = document.getElementById('user-email');

  elements.loginButton = document.getElementById('login-button');
  elements.localOnlyButton = document.getElementById('local-only-button');
  elements.authActionButton = document.getElementById('auth-action-button');
  elements.householdOpenButton = document.getElementById('household-open-button');
  elements.mainAppContent = document.getElementById('main-app-content');
  elements.householdGate = document.getElementById('household-gate');
  elements.householdGateStatus = document.getElementById('household-gate-status');
  elements.householdGateCreateForm = document.getElementById('household-gate-create-form');
  elements.householdGateNameInput = document.getElementById('household-gate-name');
  elements.householdGateJoinForm = document.getElementById('household-gate-join-form');
  elements.householdGateIdInput = document.getElementById('household-gate-id');
  elements.householdGateCodeInput = document.getElementById('household-gate-code');
  elements.householdDebugRun = document.getElementById('household-debug-run');
  elements.householdDebugLoadForm = document.getElementById('household-debug-load-form');
  elements.householdDebugHouseholdId = document.getElementById('household-debug-household-id');
  elements.householdDebugOutput = document.getElementById('household-debug-output');

  elements.tabButtons = Array.from(document.querySelectorAll('[data-tab-target]'));
  elements.tabPanels = {
    weekly: document.getElementById('weekly-panel'),
    grocery: document.getElementById('grocery-panel'),
    meals: document.getElementById('meals-panel'),
    pantry: document.getElementById('pantry-panel'),
  };

  elements.weekPrevButton = document.getElementById('week-prev');
  elements.weekNextButton = document.getElementById('week-next');
  elements.weekLabel = document.getElementById('week-label');
  elements.weeklyGrid = document.getElementById('weekly-grid');

  elements.groceryAddForm = document.getElementById('grocery-add-form');
  elements.groceryAddName = document.getElementById('grocery-add-name');
  elements.groceryAddNotes = document.getElementById('grocery-add-notes');
  elements.groceryAddStore = document.getElementById('grocery-add-store');
  elements.groceryStoresGrid = document.getElementById('grocery-stores-grid');
  elements.groceryWeeklyPantryList = document.getElementById('grocery-weekly-pantry-list');
  elements.groceryHistoryList = document.getElementById('grocery-history-list');
  elements.groceryListView = document.getElementById('grocery-list-view');
  elements.groceryHistoryView = document.getElementById('grocery-history-view');
  elements.groceryViewListButton = document.getElementById('grocery-view-list-button');
  elements.groceryViewHistoryButton = document.getElementById('grocery-view-history-button');

  elements.manageStoresButton = document.getElementById('manage-stores-button');

  elements.mealsList = document.getElementById('meals-list');
  elements.addMealButton = document.getElementById('add-meal-button');
  elements.mealSearchText = document.getElementById('meal-search-text');
  elements.mealSearchTag = document.getElementById('meal-search-tag');
  elements.mealSearchIngredient = document.getElementById('meal-search-ingredient');
  elements.mealSearchReset = document.getElementById('meal-search-reset');
  elements.mealTagCloud = document.getElementById('meal-tag-cloud');

  elements.pantryWeeklyList = document.getElementById('pantry-weekly-list');
  elements.pantryOtherList = document.getElementById('pantry-other-list');
  elements.pantryHistoryList = document.getElementById('pantry-history-list');
  elements.pantryListView = document.getElementById('pantry-list-view');
  elements.pantryHistoryView = document.getElementById('pantry-history-view');
  elements.pantryViewListButton = document.getElementById('pantry-view-list-button');
  elements.pantryViewHistoryButton = document.getElementById('pantry-view-history-button');

  elements.householdModal = document.getElementById('household-modal');
  elements.householdModalClose = document.getElementById('household-modal-close');
  elements.householdModalStatus = document.getElementById('household-modal-status');
  elements.householdInviteCode = document.getElementById('active-household-invite-code');
  elements.householdList = document.getElementById('household-list');
  elements.createHouseholdForm = document.getElementById('create-household-form');
  elements.householdNameInput = document.getElementById('household-name');
  elements.joinHouseholdForm = document.getElementById('join-household-form');
  elements.joinHouseholdIdInput = document.getElementById('join-household-id');
  elements.joinHouseholdCodeInput = document.getElementById('join-household-code');

  elements.mealModal = document.getElementById('meal-modal');
  elements.mealModalTitle = document.getElementById('meal-modal-title');
  elements.mealModalClose = document.getElementById('meal-modal-close');
  elements.mealModalForm = document.getElementById('meal-modal-form');
  elements.mealDayIdInput = document.getElementById('meal-day-id');
  elements.mealExistingSelect = document.getElementById('meal-existing-select');
  elements.mealExistingConfig = document.getElementById('meal-existing-config');
  elements.newMealDetails = document.getElementById('new-meal-details');
  elements.newMealTitle = document.getElementById('new-meal-title');
  elements.newMealDescription = document.getElementById('new-meal-description');
  elements.newMealTags = document.getElementById('new-meal-tags');
  elements.newMealIngredients = document.getElementById('new-meal-ingredients');
  elements.addNewMealIngredient = document.getElementById('add-new-meal-ingredient');
  elements.saveMealToLibrary = document.getElementById('save-meal-to-library');
  elements.saveMealToLibraryLabel = document.getElementById('save-meal-to-library-label');

  elements.storesModal = document.getElementById('stores-modal');
  elements.storesModalClose = document.getElementById('stores-modal-close');
  elements.addStoreForm = document.getElementById('add-store-form');
  elements.storeNameInput = document.getElementById('store-name');

  elements.importMealsButton = document.getElementById('import-meals-button');
  elements.importMealsModal = document.getElementById('import-meals-modal');
  elements.importMealsModalClose = document.getElementById('import-meals-modal-close');
  elements.importMealsJson = document.getElementById('import-meals-json');
  elements.importMealsSubmit = document.getElementById('import-meals-submit');
  elements.importMealsResults = document.getElementById('import-meals-results');
  elements.importMealsSummary = document.getElementById('import-meals-summary');
  elements.importMealsErrors = document.getElementById('import-meals-errors');
  elements.storesManageList = document.getElementById('stores-manage-list');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatTimestamp(value) {
  if (!value) {
    return 'just now';
  }

  if (typeof value.toDate === 'function') {
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    }).format(value.toDate());
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return 'just now';
  }

  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function clearError() {
  elements.error.textContent = '';
}

function showError(error) {
  const message = typeof error === 'string' ? error : error?.message || 'Unknown error';
  const code = typeof error === 'object' && error ? error.code : null;
  const displayMessage = code && !String(message).includes(code) ? `${message} (${code})` : message;
  elements.error.textContent = displayMessage;
  console.error(error);
}

function setStatus(message) {
  elements.status.textContent = message;
}

function isLocalMode() {
  return state.mode === 'local';
}

function isRemoteMode() {
  return state.mode === 'remote';
}

function showView(viewName) {
  Object.entries(elements.views).forEach(([name, view]) => {
    view.classList.toggle('hidden', name !== viewName);
  });
}

function activeHousehold() {
  return state.households.find((entry) => entry.id === state.activeHouseholdId) || null;
}

function hasSelectedHousehold() {
  return Boolean(activeHousehold());
}

function householdVisibleToCurrentUser(household) {
  const userUid = state.user?.uid;
  if (!userUid || !household) {
    return false;
  }

  return household.ownerUid === userUid
    || (Array.isArray(household.memberUids) && household.memberUids.includes(userUid));
}

function inAppView() {
  return !elements.views.app.classList.contains('hidden');
}

function localModeMessage() {
  if (state.remoteAvailable) {
    return 'Local-only mode is active. Data remains on this device.';
  }

  return 'Firebase is unavailable, so the app is running in local-only mode.';
}

function updateLoginView() {
  if (!elements.loginHelper) {
    return;
  }

  if (!state.remoteAvailable) {
    elements.loginHelper.textContent = 'Google sign-in is unavailable right now. You can still use local-only mode.';
    elements.loginButton.disabled = true;
    return;
  }

  elements.loginButton.disabled = false;

  if (state.authUser) {
    const label = state.authUser.displayName || state.authUser.email || 'your account';
    elements.loginButton.textContent = `Continue as ${label}`;
    elements.loginHelper.textContent = 'Continue in shared mode, or choose local-only mode instead.';
    return;
  }

  elements.loginButton.textContent = 'Continue with Google';
  elements.loginHelper.textContent = 'Sign in for shared household data, or stay local-only.';
}

function renderModeBanner() {
  if (isLocalMode()) {
    elements.modeBanner.textContent = localModeMessage();
    elements.modeBanner.classList.remove('hidden');
    return;
  }

  elements.modeBanner.textContent = '';
  elements.modeBanner.classList.add('hidden');
}

function renderAuthDetails() {
  if (!state.user) {
    elements.userName.textContent = 'Not signed in';
    elements.userEmail.textContent = '';
    return;
  }

  if (isLocalMode()) {
    elements.userName.textContent = state.user.displayName || 'Local mode';
    elements.userEmail.textContent = 'Local-only';
    return;
  }

  elements.userName.textContent = state.user.displayName || state.user.email || 'Signed in';
  elements.userEmail.textContent = state.user.email || state.user.uid;
}

function renderHeaderButtons() {
  const inApp = inAppView();
  const household = activeHousehold();

  elements.authActionButton.classList.toggle('hidden', !inApp);
  elements.householdOpenButton.classList.toggle('hidden', !inApp || !household);

  if (!inApp) {
    return;
  }

  elements.householdOpenButton.textContent = household ? `Household: ${household.name}` : 'Household setup';

  if (isRemoteMode()) {
    elements.authActionButton.textContent = 'Sign out';
    elements.authActionButton.disabled = false;
  } else {
    elements.authActionButton.textContent = state.remoteAvailable ? 'Sign in' : 'Sign in unavailable';
    elements.authActionButton.disabled = !state.remoteAvailable;
  }
}

function renderHouseholdGate() {
  const showGate = inAppView() && !hasSelectedHousehold();
  elements.householdGate.classList.toggle('hidden', !showGate);
  elements.mainAppContent.classList.toggle('hidden', showGate);

  if (!showGate) {
    return;
  }

  elements.householdGateStatus.textContent = isLocalMode()
    ? 'Create a household to begin planning meals on this device.'
    : 'Create a household or join one with an invite code to continue.';
}

function switchTab(tabName) {
  state.activeTab = tabName;

  elements.tabButtons.forEach((button) => {
    const selected = button.dataset.tabTarget === tabName;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', String(selected));
  });

  Object.entries(elements.tabPanels).forEach(([name, panel]) => {
    panel.classList.toggle('hidden', name !== tabName);
  });
}

function householdModalCanClose() {
  return !state.householdModalLocked;
}

function openHouseholdModal(lock = false) {
  if (!state.mode || !inAppView()) {
    return;
  }

  state.householdModalLocked = Boolean(lock);
  elements.householdModal.classList.remove('hidden');
  elements.householdModalClose.disabled = !householdModalCanClose();
  renderHouseholdModal();
}

function closeHouseholdModal() {
  if (!householdModalCanClose()) {
    return;
  }

  elements.householdModal.classList.add('hidden');
}

function openStoresModal() {
  if (!state.mode || !inAppView()) {
    return;
  }

  elements.storesModal.classList.remove('hidden');
  renderStoresManageList();
}

function closeStoresModal() {
  elements.storesModal.classList.add('hidden');
}

function setMealModalSubmitText(text) {
  const button = elements.mealModalForm.querySelector('button[type="submit"]');
  if (button) {
    button.textContent = text;
  }
}

function openMealModalForDay(dayId) {
  if (!state.mode || !inAppView()) {
    return;
  }

  state.mealModal = {
    open: true,
    mode: 'day',
    dayId,
  };

  const day = state.weekPlan[dayId] || {};
  elements.mealDayIdInput.value = dayId;
  elements.mealModalTitle.textContent = `Set meal for ${dayId}`;
  elements.mealExistingSelect.disabled = false;
  elements.mealExistingSelect.parentElement.classList.remove('hidden');
  elements.mealExistingConfig.classList.remove('hidden');

  const selectedMealId = day.mealId || '__new__';
  renderMealExistingOptions(selectedMealId);
  renderMealExistingConfig();

  resetNewMealFields();
  if (!day.mealId && day.mealTitle) {
    elements.newMealTitle.value = day.mealTitle;
  }

  elements.saveMealToLibrary.checked = true;
  elements.saveMealToLibraryLabel.classList.remove('hidden');
  setMealModalSubmitText('Apply to this day');
  elements.mealModal.classList.remove('hidden');
}

function openMealModalForLibrary() {
  if (!state.mode || !inAppView()) {
    return;
  }

  state.mealModal = {
    open: true,
    mode: 'library',
    dayId: null,
  };

  elements.mealDayIdInput.value = '';
  elements.mealModalTitle.textContent = 'Add meal to library';
  elements.mealExistingSelect.disabled = true;
  elements.mealExistingSelect.parentElement.classList.add('hidden');
  elements.mealExistingConfig.classList.add('hidden');

  renderMealExistingOptions('__new__');
  resetNewMealFields();
  elements.newMealDetails.open = true;

  elements.saveMealToLibraryLabel.classList.add('hidden');
  setMealModalSubmitText('Add to library');
  elements.mealModal.classList.remove('hidden');
}

function openMealModalForEdit(mealId) {
  if (!state.mode || !inAppView()) {
    return;
  }

  const meal = state.meals.find((entry) => entry.id === mealId);
  if (!meal) {
    return;
  }

  state.mealModal = {
    open: true,
    mode: 'edit',
    dayId: null,
    editMealId: mealId,
  };

  elements.mealDayIdInput.value = '';
  elements.mealModalTitle.textContent = `Edit ${meal.title}`;
  elements.mealExistingSelect.disabled = true;
  elements.mealExistingSelect.parentElement.classList.add('hidden');
  elements.mealExistingConfig.classList.add('hidden');

  renderMealExistingOptions('__new__');

  elements.newMealTitle.value = meal.title || '';
  elements.newMealDescription.value = meal.description || '';
  elements.newMealTags.value = Array.isArray(meal.tags) ? meal.tags.join(', ') : '';
  elements.newMealIngredients.innerHTML = '';

  const ingredients = Array.isArray(meal.ingredients) ? meal.ingredients : [];
  if (ingredients.length) {
    ingredients.forEach((ingredient) => addNewMealIngredientRow(ingredient));
  } else {
    addNewMealIngredientRow();
  }

  elements.newMealDetails.open = true;
  const summary = elements.newMealDetails.querySelector('summary');
  if (summary) {
    summary.classList.add('hidden');
  }

  elements.saveMealToLibraryLabel.classList.add('hidden');
  setMealModalSubmitText('Save changes');
  elements.mealModal.classList.remove('hidden');
}

function closeMealModal() {
  state.mealModal = {
    open: false,
    mode: 'day',
    dayId: null,
  };

  const summary = elements.newMealDetails.querySelector('summary');
  if (summary) {
    summary.classList.remove('hidden');
  }

  elements.mealModal.classList.add('hidden');
}

function forceHideAllAppModals() {
  state.householdModalLocked = false;
  elements.householdModal.classList.add('hidden');
  elements.storesModal.classList.add('hidden');
  elements.mealModal.classList.add('hidden');
  elements.importMealsModal.classList.add('hidden');
  state.mealModal = {
    open: false,
    mode: 'day',
    dayId: null,
  };
}

function clearHouseholdSubscriptions() {
  state.unsubs.forEach((unsub) => {
    try {
      unsub();
    } catch (error) {
      console.warn('Failed to unsubscribe listener', error);
    }
  });
  state.unsubs = [];
}

function clearWeekSubscription() {
  if (!state.weekUnsub) {
    return;
  }

  try {
    state.weekUnsub();
  } catch (error) {
    console.warn('Failed to unsubscribe week listener', error);
  }

  state.weekUnsub = null;
}

function resetHouseholdData() {
  state.members = [];
  state.stores = [];
  state.meals = [];
  state.groceryItems = [];
  state.pantryItems = [];
  state.activity = [];
  state.weekPlan = createEmptyWeekPlan();
}

function nameForMember(uid) {
  if (!uid) {
    return 'Anyone';
  }

  const member = state.members.find((entry) => entry.uid === uid);
  return member ? member.displayName : uid;
}

function storeName(storeId) {
  if (!storeId) {
    return 'No store';
  }

  const store = state.stores.find((entry) => entry.id === storeId);
  return store ? store.name : 'Unknown store';
}

function renderHouseholdModal() {
  const household = activeHousehold();

  if (!state.households.length) {
    elements.householdList.innerHTML = '<li class="empty">No household yet. Create one to continue.</li>';
  } else {
    elements.householdList.innerHTML = state.households
      .map((entry) => {
        const selected = entry.id === state.activeHouseholdId;
        return `
          <li>
            <button type="button" class="ghost household-choice ${selected ? 'selected' : ''}" data-household-id="${entry.id}">
              <span>${escapeHtml(entry.name)}</span>
              <span class="meta">${selected ? 'Active' : 'Switch'}</span>
            </button>
          </li>
        `;
      })
      .join('');
  }

  if (!household) {
    elements.householdModalStatus.textContent = 'You need a household before planning meals.';
    elements.householdInviteCode.textContent = 'Invite code: --';
  } else {
    elements.householdModalStatus.textContent = `Active household id: ${household.id}`;
    elements.householdInviteCode.textContent = `Invite code: ${household.inviteCode || '--'}`;
  }

  elements.householdModalClose.disabled = !householdModalCanClose();
}

function cookOptions(selectedUid) {
  const options = ['<option value="">Anyone</option>'];

  state.members.forEach((member) => {
    const selected = member.uid === selectedUid ? 'selected' : '';
    options.push(`<option value="${member.uid}" ${selected}>${escapeHtml(member.displayName)}</option>`);
  });

  return options.join('');
}

function eaterChips(selectedUids = []) {
  return state.members
    .map((member) => {
      const active = selectedUids.includes(member.uid);
      return `<button type="button" class="eater-chip${active ? ' active' : ''}" data-uid="${member.uid}">${escapeHtml(member.displayName)}</button>`;
    })
    .join('');
}

function renderWeeklyGrid() {
  elements.weekLabel.textContent = weekRangeLabel(state.weekStartIso);

  elements.weeklyGrid.innerHTML = buildWeekDays(state.weekStartIso)
    .map((day) => {
      const value = state.weekPlan[day.dayId] || {};
      const mealTitle = value.mealTitle || 'No meal selected';
      const isForage = String(value.mealTitle || '').toLowerCase() === 'forage';
      const eaterList = Array.isArray(value.eaterUids) ? value.eaterUids : [];

      return `
        <form class="planner-day${isForage ? ' forage-day' : ''}" data-day-id="${day.dayId}">
          <h4>${escapeHtml(day.label)}</h4>

          <div class="meal-picker">
            <div>
              <div class="title">${escapeHtml(mealTitle)}</div>
            </div>
            <div class="actions">
              <button type="button" class="ghost forage-btn" data-day-id="${day.dayId}">${isForage ? 'Unforage' : 'Forage'}</button>
              <button type="button" class="ghost meal-open" data-day-id="${day.dayId}">Set meal</button>
            </div>
          </div>

          <label>
            Who is cooking
            <select name="cookUid">
              ${cookOptions(value.cookUid || '')}
            </select>
          </label>

          <div class="eater-section">
            <span class="eater-label">Who is eating</span>
            <div class="eater-chips">
              ${eaterChips(eaterList)}
            </div>
          </div>

          <label>
            Notes
            <textarea name="notes" maxlength="1000" placeholder="Add notes for this meal...">${escapeHtml(value.notes || '')}</textarea>
          </label>

          <div class="actions">
            <button type="submit">Save day</button>
            <button type="button" class="ghost clear-day" data-day-id="${day.dayId}">Clear</button>
          </div>
        </form>
      `;
    })
    .join('');
}

function renderGroceryAddStoreOptions(selectedStoreId = null) {
  const options = ['<option value="">No store</option>'];

  state.stores.forEach((store) => {
    const selected = store.id === selectedStoreId ? 'selected' : '';
    options.push(`<option value="${store.id}" ${selected}>${escapeHtml(store.name)}</option>`);
  });

  elements.groceryAddStore.innerHTML = options.join('');
}

function renderGroceryStoreGrid() {
  const grouped = new Map();
  grouped.set('', []);

  state.stores.forEach((store) => {
    grouped.set(store.id, []);
  });

  state.groceryItems.forEach((item) => {
    const key = item.storeId && grouped.has(item.storeId) ? item.storeId : '';
    grouped.get(key).push(item);
  });

  const columns = [];

  grouped.forEach((items, storeId) => {
    const name = storeId ? storeName(storeId) : 'No store';
    const body = items.length
      ? `<ul class="panel-list">${items
          .sort((left, right) => {
            if (left.completed !== right.completed) {
              return left.completed ? 1 : -1;
            }
            return String(left.name).localeCompare(String(right.name));
          })
          .map((item) => {
            return `
              <li class="grocery-item ${item.completed ? 'done' : ''}">
                <div class="item-row">
                  <label class="actions" style="margin: 0;">
                    <input type="checkbox" class="grocery-toggle" data-item-id="${item.id}" ${item.completed ? 'checked' : ''} />
                    <span class="title">${escapeHtml(item.name)}</span>
                  </label>
                  <button type="button" class="danger grocery-delete" data-item-id="${item.id}">Remove</button>
                </div>
                ${item.notes ? `<p class="meta">${escapeHtml(item.notes)}</p>` : ''}
              </li>
            `;
          })
          .join('')}</ul>`
      : '<p class="empty">No items in this store.</p>';

    columns.push(`
      <article class="store-column">
        <div class="store-head">
          <strong>${escapeHtml(name)}</strong>
          <button type="button" class="ghost quick-add-store" data-store-id="${storeId}">+</button>
        </div>
        ${body}
      </article>
    `);
  });

  elements.groceryStoresGrid.innerHTML = columns.join('');
}

function renderWeeklyPantrySnippet() {
  const weeklyItems = state.pantryItems.filter((item) => item.section === 'weekly');

  if (!weeklyItems.length) {
    elements.groceryWeeklyPantryList.innerHTML = '<li class="empty">No checked items in weekly pantry yet.</li>';
    return;
  }

  elements.groceryWeeklyPantryList.innerHTML = weeklyItems
    .map((item) => `<li>${escapeHtml(item.name)}</li>`)
    .join('');
}

function renderHistoryList(listElement, items, scope) {
  if (!items.length) {
    listElement.innerHTML = '<li class="empty">No history yet.</li>';
    return;
  }

  listElement.innerHTML = items
    .map((entry) => {
      const canUndo = Boolean(entry.undo) && !entry.undone;
      return `
        <li class="history-item">
          <p>${escapeHtml(entry.message)}</p>
          <p class="meta">${escapeHtml(entry.actorName || 'Someone')} • ${escapeHtml(formatTimestamp(entry.createdAt))}</p>
          ${entry.undone ? '<p class="meta">Undone</p>' : ''}
          ${canUndo ? `<button type="button" class="ghost undo-activity" data-activity-id="${entry.id}" data-scope="${scope}">Undo</button>` : ''}
        </li>
      `;
    })
    .join('');
}

function renderGroceryHistory() {
  const items = state.activity.filter((entry) => entry.scope === 'grocery');
  renderHistoryList(elements.groceryHistoryList, items, 'grocery');
}

function filteredMeals() {
  const textNeedle = state.mealSearch.text.trim().toLowerCase();
  const tagNeedle = state.mealSearch.tag.trim().toLowerCase();
  const ingredientNeedle = state.mealSearch.ingredient.trim().toLowerCase();

  return state.meals.filter((meal) => {
    if (textNeedle) {
      const textMatch = `${meal.title || ''} ${meal.description || ''}`.toLowerCase().includes(textNeedle);
      if (!textMatch) {
        return false;
      }
    }

    if (tagNeedle) {
      const tagMatch = (Array.isArray(meal.tags) ? meal.tags : []).some((tag) => String(tag).toLowerCase().includes(tagNeedle));
      if (!tagMatch) {
        return false;
      }
    }

    if (ingredientNeedle) {
      const ingredientMatch = (Array.isArray(meal.ingredients) ? meal.ingredients : []).some((ingredient) => {
        return String(ingredient.name || '').toLowerCase().includes(ingredientNeedle);
      });

      if (!ingredientMatch) {
        return false;
      }
    }

    return true;
  });
}

function renderMealTagCloud() {
  const tagCounts = new Map();
  state.meals.forEach((meal) => {
    (Array.isArray(meal.tags) ? meal.tags : []).forEach((tag) => {
      const key = String(tag).toLowerCase();
      if (!key) {
        return;
      }

      tagCounts.set(key, (tagCounts.get(key) || 0) + 1);
    });
  });

  const activeTag = state.mealSearch.tag.trim().toLowerCase();

  const sorted = Array.from(tagCounts.entries()).sort((a, b) => a[0].localeCompare(b[0]));

  elements.mealTagCloud.innerHTML = sorted
    .map(([tag, count]) => {
      const isActive = activeTag === tag;
      return `<button type="button" class="tag-filter${isActive ? ' active' : ''}" data-tag="${escapeHtml(tag)}">${escapeHtml(tag)} <span class="meta">(${count})</span></button>`;
    })
    .join('');
}

function renderMealsList() {
  const meals = filteredMeals();

  if (!meals.length) {
    elements.mealsList.innerHTML = '<p class="empty">No meals match the current search.</p>';
    return;
  }

  elements.mealsList.innerHTML = meals
    .map((meal) => {
      const tags = Array.isArray(meal.tags) ? meal.tags : [];
      const ingredients = Array.isArray(meal.ingredients) ? meal.ingredients : [];

      return `
        <article class="meal-item">
          <div class="item-row">
            <strong class="title">${escapeHtml(meal.title || 'Untitled meal')}</strong>
            <span class="meta">${ingredients.length} ingredient${ingredients.length === 1 ? '' : 's'}</span>
            <button type="button" class="ghost edit-meal-button" data-meal-id="${meal.id}">Edit</button>
          </div>
          ${meal.description ? `<p>${escapeHtml(meal.description)}</p>` : ''}
          ${tags.length ? `<div class="meal-tags">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>` : ''}
          <ul class="ingredient-list">
            ${ingredients
              .map((ingredient) => {
                const buyLabel = ingredient.usuallyNeedToBuy ? 'buy by default' : 'usually on hand';
                return `<li>${escapeHtml(ingredient.name)} <span class="meta">(${escapeHtml(buyLabel)}${ingredient.defaultStoreId ? `, ${escapeHtml(storeName(ingredient.defaultStoreId))}` : ''})</span></li>`;
              })
              .join('')}
          </ul>
        </article>
      `;
    })
    .join('');
}

function renderPantryLists() {
  const weekly = state.pantryItems.filter((item) => item.section === 'weekly');
  const other = state.pantryItems.filter((item) => item.section === 'other');

  const renderList = (items) => {
    if (!items.length) {
      return '<li class="empty">No items.</li>';
    }

    return items
      .map((item) => {
        return `
          <li class="pantry-item" data-pantry-id="${item.id}" data-section="${item.section}">
            <div class="item-row">
              <span class="title">${escapeHtml(item.name)}</span>
              <button type="button" class="danger pantry-delete" data-pantry-id="${item.id}">Remove</button>
            </div>
            <p class="meta">Right-click to move</p>
          </li>
        `;
      })
      .join('');
  };

  elements.pantryWeeklyList.innerHTML = renderList(weekly);
  elements.pantryOtherList.innerHTML = renderList(other);
}

function renderPantryHistory() {
  const items = state.activity.filter((entry) => {
    if (entry.scope === 'pantry') {
      return true;
    }

    return entry.scope === 'grocery' && (entry.action === 'check' || entry.action === 'uncheck');
  });
  renderHistoryList(elements.pantryHistoryList, items, 'pantry');
}

function renderGrocerySubview() {
  const showList = state.groceryView === 'list';

  elements.groceryListView.classList.toggle('hidden', !showList);
  elements.groceryHistoryView.classList.toggle('hidden', showList);

  elements.groceryViewListButton.classList.toggle('active', showList);
  elements.groceryViewHistoryButton.classList.toggle('active', !showList);
}

function renderPantrySubview() {
  const showList = state.pantryView === 'list';

  elements.pantryListView.classList.toggle('hidden', !showList);
  elements.pantryHistoryView.classList.toggle('hidden', showList);

  elements.pantryViewListButton.classList.toggle('active', showList);
  elements.pantryViewHistoryButton.classList.toggle('active', !showList);
}

function renderStoresManageList() {
  if (!state.stores.length) {
    elements.storesManageList.innerHTML = '<li class="empty">No stores yet.</li>';
    return;
  }

  elements.storesManageList.innerHTML = state.stores
    .map((store) => {
      return `
        <li>
          <div class="item-row" style="width: 100%;">
            <span>${escapeHtml(store.name)}</span>
            <button type="button" class="danger remove-store" data-store-id="${store.id}">Remove</button>
          </div>
        </li>
      `;
    })
    .join('');
}

function renderMealExistingOptions(selectedId = '__new__') {
  const options = ['<option value="__new__">Create new meal</option>'];

  state.meals.forEach((meal) => {
    const selected = meal.id === selectedId ? 'selected' : '';
    options.push(`<option value="${meal.id}" ${selected}>${escapeHtml(meal.title)}</option>`);
  });

  elements.mealExistingSelect.innerHTML = options.join('');

  if (selectedId && selectedId !== '__new__' && !state.meals.find((meal) => meal.id === selectedId)) {
    elements.mealExistingSelect.value = '__new__';
  }

  if (!elements.mealExistingSelect.value) {
    elements.mealExistingSelect.value = '__new__';
  }
}

function storeSelectOptions(selectedStoreId = null) {
  const options = ['<option value="">No store</option>'];

  state.stores.forEach((store) => {
    const selected = store.id === selectedStoreId ? 'selected' : '';
    options.push(`<option value="${store.id}" ${selected}>${escapeHtml(store.name)}</option>`);
  });

  return options.join('');
}

function dayIngredientPlanForMeal(dayId, meal) {
  const day = state.weekPlan[dayId] || {};
  const existing = Array.isArray(day.ingredientPlan) ? day.ingredientPlan : [];

  return (Array.isArray(meal.ingredients) ? meal.ingredients : []).map((ingredient) => {
    const match = existing.find((entry) => entry.ingredientId && entry.ingredientId === ingredient.id)
      || existing.find((entry) => !entry.ingredientId && entry.name === ingredient.name)
      || null;

    return {
      ingredientId: ingredient.id || null,
      name: ingredient.name,
      needToBuy: match ? Boolean(match.needToBuy) : Boolean(ingredient.usuallyNeedToBuy),
      storeId: match ? match.storeId || null : ingredient.defaultStoreId || null,
    };
  });
}

function renderMealExistingConfig() {
  if (state.mealModal.mode !== 'day') {
    elements.mealExistingConfig.innerHTML = '';
    return;
  }

  const selectedMealId = elements.mealExistingSelect.value;

  if (selectedMealId === '__new__') {
    elements.newMealDetails.open = true;
    elements.mealExistingConfig.innerHTML = '<p class="meta">Configure the new meal ingredients below.</p>';
    return;
  }

  const meal = state.meals.find((entry) => entry.id === selectedMealId);

  if (!meal) {
    elements.mealExistingConfig.innerHTML = '<p class="meta">Meal not found.</p>';
    return;
  }

  elements.newMealDetails.open = false;

  const plan = dayIngredientPlanForMeal(state.mealModal.dayId, meal);

  if (!plan.length) {
    elements.mealExistingConfig.innerHTML = '<p class="meta">This meal has no ingredients.</p>';
    return;
  }

  elements.mealExistingConfig.innerHTML = plan
    .map((entry, index) => {
      return `
        <div class="ingredient-plan-row" data-ingredient-row data-ingredient-id="${entry.ingredientId || ''}" data-name="${escapeHtml(entry.name)}">
          <span>${escapeHtml(entry.name)}</span>
          <label>
            <input type="checkbox" class="existing-need-buy" ${entry.needToBuy ? 'checked' : ''}>
            Buy
          </label>
          <select class="existing-store">
            ${storeSelectOptions(entry.storeId)}
          </select>
          <span class="meta">#${index + 1}</span>
        </div>
      `;
    })
    .join('');
}

function resetNewMealFields() {
  elements.newMealTitle.value = '';
  elements.newMealDescription.value = '';
  elements.newMealTags.value = '';
  elements.newMealIngredients.innerHTML = '';
  addNewMealIngredientRow();
}

function addNewMealIngredientRow(seed = null) {
  const row = document.createElement('div');
  row.className = 'new-ingredient-row';
  row.setAttribute('data-new-ingredient-row', 'true');

  row.innerHTML = `
    <input type="text" class="new-ing-name" maxlength="80" placeholder="Ingredient name" value="${escapeHtml(seed?.name || '')}" />
    <label>
      <input type="checkbox" class="new-ing-buy" ${seed?.usuallyNeedToBuy ? 'checked' : ''} />
      Usually buy
    </label>
    <select class="new-ing-store">
      ${storeSelectOptions(seed?.defaultStoreId || null)}
    </select>
    <button type="button" class="danger remove-new-ing">Remove</button>
  `;

  elements.newMealIngredients.appendChild(row);
}

function dayFormValues(dayId) {
  const form = elements.weeklyGrid.querySelector(`.planner-day[data-day-id="${dayId}"]`);

  if (!(form instanceof HTMLFormElement)) {
    const day = state.weekPlan[dayId] || {};
    return {
      cookUid: day.cookUid || null,
      eaterUids: Array.isArray(day.eaterUids) ? day.eaterUids : [],
      notes: day.notes || '',
    };
  }

  const cookUid = form.elements.cookUid.value || null;
  const eaterUids = Array.from(form.querySelectorAll('.eater-chip.active'))
    .map((button) => button.dataset.uid)
    .filter(Boolean);
  const notes = form.elements.notes.value || '';

  return {
    cookUid,
    eaterUids,
    notes,
  };
}

async function saveDayPlan(dayId, overrides = {}) {
  if (!state.activeHouseholdId) {
    throw new Error('No household selected.');
  }

  const base = state.weekPlan[dayId] || {};
  const formValues = dayFormValues(dayId);

  const payload = {
    mealId: Object.prototype.hasOwnProperty.call(overrides, 'mealId') ? overrides.mealId : base.mealId || null,
    mealTitle: Object.prototype.hasOwnProperty.call(overrides, 'mealTitle') ? overrides.mealTitle : base.mealTitle || null,
    cookUid: Object.prototype.hasOwnProperty.call(overrides, 'cookUid') ? overrides.cookUid : formValues.cookUid,
    eaterUids: Object.prototype.hasOwnProperty.call(overrides, 'eaterUids') ? overrides.eaterUids : formValues.eaterUids,
    notes: Object.prototype.hasOwnProperty.call(overrides, 'notes') ? overrides.notes : formValues.notes,
    ingredientPlan: Object.prototype.hasOwnProperty.call(overrides, 'ingredientPlan')
      ? overrides.ingredientPlan
      : Array.isArray(base.ingredientPlan)
        ? base.ingredientPlan
        : [],
  };

  await state.dataApi.saveWeekDayPlan(
    state.dataContext,
    state.activeHouseholdId,
    weekIdFromStart(state.weekStartIso),
    dayId,
    payload,
    state.user,
  );
}

function parseNewMealDraftFromModal() {
  const ingredientRows = Array.from(elements.newMealIngredients.querySelectorAll('[data-new-ingredient-row]'));

  const ingredients = ingredientRows
    .map((row) => {
      const nameInput = row.querySelector('.new-ing-name');
      const buyInput = row.querySelector('.new-ing-buy');
      const storeSelect = row.querySelector('.new-ing-store');
      const name = nameInput.value.trim();

      if (!name) {
        return null;
      }

      return {
        name,
        usuallyNeedToBuy: Boolean(buyInput.checked),
        defaultStoreId: storeSelect.value || null,
      };
    })
    .filter(Boolean);

  return {
    title: elements.newMealTitle.value,
    description: elements.newMealDescription.value,
    tags: elements.newMealTags.value,
    ingredients,
  };
}

function parseIngredientPlanForExistingMeal() {
  return Array.from(elements.mealExistingConfig.querySelectorAll('[data-ingredient-row]')).map((row) => {
    const needToBuy = row.querySelector('.existing-need-buy').checked;
    const storeId = row.querySelector('.existing-store').value || null;
    const ingredientId = row.dataset.ingredientId || null;
    const name = row.dataset.name || '';

    return {
      ingredientId,
      name,
      needToBuy,
      storeId,
    };
  });
}

function parseIngredientPlanForNewMeal(meal) {
  return (Array.isArray(meal.ingredients) ? meal.ingredients : []).map((ingredient) => ({
    ingredientId: ingredient.id || null,
    name: ingredient.name,
    needToBuy: Boolean(ingredient.usuallyNeedToBuy),
    storeId: ingredient.defaultStoreId || null,
  }));
}

async function ensureActiveHouseholdMembership(householdId) {
  if (!householdId || !state.dataApi || !state.dataContext || !state.user) {
    return;
  }

  if (typeof state.dataApi.ensureHouseholdMembership !== 'function') {
    return;
  }

  if (state.ensuredHouseholdMemberships.has(householdId)) {
    return;
  }

  const household = state.households.find((entry) => entry.id === householdId) || null;
  await state.dataApi.ensureHouseholdMembership(state.dataContext, householdId, state.user, household);
  state.ensuredHouseholdMemberships.add(householdId);
}

async function refreshHouseholds(preferredHouseholdId = null) {
  if (!state.dataApi || !state.dataContext || !state.user) {
    return;
  }

  const userUid = state.user.uid;
  const canGetHousehold = typeof state.dataApi.getHousehold === 'function';

  function normalizeHouseholds(items) {
    const docsById = new Map();
    (Array.isArray(items) ? items : []).forEach((household) => {
      if (!household || !household.id || !householdVisibleToCurrentUser(household)) {
        return;
      }
      docsById.set(household.id, household);
    });
    return Array.from(docsById.values())
      .sort((left, right) => String(left.name).localeCompare(String(right.name)));
  }

  async function loadHouseholdsByIds(ids) {
    if (!canGetHousehold) {
      return [];
    }

    const uniqueIds = Array.from(
      new Set(
        (Array.isArray(ids) ? ids : [])
          .filter((value) => typeof value === 'string' && value.trim().length > 0)
          .map((value) => value.trim()),
      ),
    );
    if (!uniqueIds.length) {
      return [];
    }

    const docs = await Promise.all(
      uniqueIds.map(async (householdId) => {
        try {
          return await state.dataApi.getHousehold(state.dataContext, householdId);
        } catch (error) {
          console.warn(`Unable to read household ${householdId}`, error);
          return null;
        }
      }),
    );
    return normalizeHouseholds(docs);
  }

  let indexedIds = [];
  if (typeof state.dataApi.listHouseholdIdsForUser === 'function') {
    try {
      indexedIds = await state.dataApi.listHouseholdIdsForUser(state.dataContext, userUid);
    } catch (error) {
      console.warn('Unable to read user household index', error);
    }
  }

  let defaultHouseholdIdFromUser = null;
  if (typeof state.dataApi.getDefaultHouseholdId === 'function') {
    try {
      defaultHouseholdIdFromUser = await state.dataApi.getDefaultHouseholdId(state.dataContext, userUid);
    } catch (error) {
      console.warn('Unable to read default household id', error);
    }
  }

  let households = await loadHouseholdsByIds(indexedIds);

  const fallbackIds = [preferredHouseholdId, defaultHouseholdIdFromUser]
    .filter((value) => typeof value === 'string' && value.trim().length > 0);
  if (!households.length && fallbackIds.length) {
    households = await loadHouseholdsByIds(fallbackIds);
  }

  if (!households.length) {
    try {
      households = normalizeHouseholds(await state.dataApi.listUserHouseholds(state.dataContext, userUid));
    } catch (error) {
      console.warn('listUserHouseholds failed', error);
      setHouseholdDebugOutput({
        ranAt: new Date().toISOString(),
        stage: 'refreshHouseholds:listUserHouseholds',
        userUid,
        indexedIds,
        fallbackIds,
        error: serializeError(error),
      });
      throw error;
    }
  }

  state.households = households;

  if (households.length && typeof state.dataApi.saveHouseholdIdsForUser === 'function') {
    try {
      await state.dataApi.saveHouseholdIdsForUser(
        state.dataContext,
        state.user.uid,
        households.map((household) => household.id),
      );
    } catch (error) {
      console.warn('Unable to backfill user household index', error);
    }
  }

  let selectedId = preferredHouseholdId || defaultHouseholdIdFromUser;

  if (!selectedId || !households.some((household) => household.id === selectedId)) {
    selectedId = households.length ? households[0].id : null;
  }

  state.activeHouseholdId = selectedId;

  if (selectedId && typeof state.dataApi.setDefaultHouseholdId === 'function') {
    try {
      await state.dataApi.setDefaultHouseholdId(state.dataContext, state.user.uid, selectedId);
    } catch (error) {
      console.warn('Unable to persist default household id', error);
    }
  }

  if (selectedId) {
    try {
      await ensureActiveHouseholdMembership(selectedId);
    } catch (error) {
      console.warn('Unable to ensure household membership document', error);
    }
  }

  renderHeaderButtons();
  renderHouseholdModal();
  renderHouseholdGate();

  if (!households.length) {
    clearHouseholdSubscriptions();
    clearWeekSubscription();
    resetHouseholdData();
    renderMainData();
    closeHouseholdModal();
    setStatus('Create or join a household to continue.');
    return;
  }

  closeHouseholdModal();
  subscribeToHouseholdData();

  if (isLocalMode()) {
    setStatus(localModeMessage());
  } else {
    setStatus(`Using household: ${activeHousehold()?.name || ''}`);
  }
}

function subscribeToHouseholdData() {
  clearHouseholdSubscriptions();
  clearWeekSubscription();
  resetHouseholdData();

  if (!state.activeHouseholdId || !state.dataApi || !state.dataContext) {
    renderMainData();
    return;
  }

  const householdId = state.activeHouseholdId;
  const listenerError = (label) => (error) => showError(withStepError(label, error));

  state.unsubs.push(
    state.dataApi.listenMembers(
      state.dataContext,
      householdId,
      (members) => {
        state.members = members;
        renderWeeklyGrid();
      },
      listenerError('Members listener failed'),
    ),
  );

  state.unsubs.push(
    state.dataApi.listenStores(
      state.dataContext,
      householdId,
      (stores) => {
        state.stores = stores;
        renderGroceryAddStoreOptions(elements.groceryAddStore.value || null);
        renderGroceryStoreGrid();
        renderMealsList();
        renderStoresManageList();
        if (state.mealModal.open) {
          renderMealExistingConfig();
        }
      },
      listenerError('Stores listener failed'),
    ),
  );

  state.unsubs.push(
    state.dataApi.listenMeals(
      state.dataContext,
      householdId,
      (meals) => {
        state.meals = meals;
        renderMealTagCloud();
        renderMealsList();
        if (state.mealModal.open) {
          renderMealExistingOptions(elements.mealExistingSelect.value || '__new__');
          renderMealExistingConfig();
        }
      },
      listenerError('Meals listener failed'),
    ),
  );

  state.unsubs.push(
    state.dataApi.listenGroceryItems(
      state.dataContext,
      householdId,
      (items) => {
        state.groceryItems = items;
        renderGroceryStoreGrid();
      },
      listenerError('Grocery listener failed'),
    ),
  );

  state.unsubs.push(
    state.dataApi.listenPantryItems(
      state.dataContext,
      householdId,
      (items) => {
        state.pantryItems = items;
        renderWeeklyPantrySnippet();
        renderPantryLists();
      },
      listenerError('Pantry listener failed'),
    ),
  );

  state.unsubs.push(
    state.dataApi.listenActivity(
      state.dataContext,
      householdId,
      (items) => {
        state.activity = items;
        renderGroceryHistory();
        renderPantryHistory();
      },
      listenerError('Activity listener failed'),
      120,
    ),
  );

  subscribeToWeek();
}

function subscribeToWeek() {
  clearWeekSubscription();

  if (!state.activeHouseholdId || !state.dataApi || !state.dataContext) {
    return;
  }

  state.weekUnsub = state.dataApi.listenWeekDays(
    state.dataContext,
    state.activeHouseholdId,
    weekIdFromStart(state.weekStartIso),
    (dayDocs) => {
      state.weekPlan = mergeDayDocs(dayDocs);
      renderWeeklyGrid();
    },
    (error) => showError(withStepError('Week listener failed', error)),
  );
}

async function selectHousehold(householdId) {
  if (!householdId || householdId === state.activeHouseholdId) {
    return;
  }

  if (!state.households.some((entry) => entry.id === householdId)) {
    return;
  }

  state.activeHouseholdId = householdId;

  await ensureActiveHouseholdMembership(householdId);

  if (typeof state.dataApi.setDefaultHouseholdId === 'function') {
    await state.dataApi.setDefaultHouseholdId(state.dataContext, state.user.uid, householdId);
  }

  renderHeaderButtons();
  renderHouseholdModal();
  subscribeToHouseholdData();
  closeHouseholdModal();
}

function withStepError(prefix, error) {
  const baseMessage = typeof error === 'string' ? error : error?.message || 'Unknown error';
  const wrapped = new Error(`${prefix}: ${baseMessage}`);
  if (error && typeof error === 'object' && 'code' in error) {
    wrapped.code = error.code;
  }
  return wrapped;
}

function serializeError(error) {
  const message = typeof error === 'string' ? error : error?.message || 'Unknown error';
  const code = error && typeof error === 'object' && 'code' in error ? error.code : null;

  return {
    message,
    code,
  };
}

function summarizeHouseholdForDebug(household) {
  const currentUid = state.user?.uid || null;
  const memberUids = Array.isArray(household?.memberUids) ? household.memberUids : [];

  return {
    id: household?.id || null,
    name: household?.name || null,
    ownerUid: household?.ownerUid || null,
    memberCount: memberUids.length,
    includesCurrentUserInMemberUids: Boolean(currentUid && memberUids.includes(currentUid)),
    visibleToCurrentUser: householdVisibleToCurrentUser(household),
  };
}

function setHouseholdDebugOutput(payload) {
  if (!elements.householdDebugOutput) {
    return;
  }

  if (typeof payload === 'string') {
    elements.householdDebugOutput.textContent = payload;
    return;
  }

  elements.householdDebugOutput.textContent = JSON.stringify(payload, null, 2);
}

async function runHouseholdDiagnostics() {
  if (!state.user || !state.dataApi || !state.dataContext) {
    setHouseholdDebugOutput('Diagnostics require an authenticated remote session.');
    return;
  }

  const userUid = state.user.uid;
  const report = {
    ranAt: new Date().toISOString(),
    mode: state.mode,
    userUid,
    activeHouseholdId: state.activeHouseholdId,
    loadedHouseholdIds: state.households.map((entry) => entry.id),
  };

  async function captureCall(fn) {
    try {
      return {
        ok: true,
        value: await fn(),
      };
    } catch (error) {
      return {
        ok: false,
        error: serializeError(error),
      };
    }
  }

  if (typeof state.dataApi.debugGetUserDoc === 'function') {
    const userDocResult = await captureCall(() => {
      return state.dataApi.debugGetUserDoc(state.dataContext, userUid);
    });
    report.userDoc = userDocResult.ok ? userDocResult.value : userDocResult.error;
  } else if (typeof state.dataApi.listHouseholdIdsForUser === 'function'
    || typeof state.dataApi.getDefaultHouseholdId === 'function') {
    const [idsResult, defaultResult] = await Promise.all([
      typeof state.dataApi.listHouseholdIdsForUser === 'function'
        ? captureCall(() => state.dataApi.listHouseholdIdsForUser(state.dataContext, userUid))
        : Promise.resolve({ ok: true, value: [] }),
      typeof state.dataApi.getDefaultHouseholdId === 'function'
        ? captureCall(() => state.dataApi.getDefaultHouseholdId(state.dataContext, userUid))
        : Promise.resolve({ ok: true, value: null }),
    ]);

    report.userDoc = {
      householdIds: idsResult.ok ? idsResult.value : idsResult.error,
      defaultHouseholdId: defaultResult.ok ? defaultResult.value : defaultResult.error,
    };
  } else {
    report.userDoc = 'User index helpers are unavailable in this mode.';
  }

  if (typeof state.dataApi.debugQueryHouseholdsByMember === 'function') {
    const byMemberResult = await captureCall(() => {
      return state.dataApi.debugQueryHouseholdsByMember(state.dataContext, userUid);
    });
    report.queryByMember = byMemberResult.ok
      ? byMemberResult.value.map(summarizeHouseholdForDebug)
      : byMemberResult.error;
  } else {
    report.queryByMember = 'debugQueryHouseholdsByMember is unavailable.';
  }

  if (typeof state.dataApi.debugQueryHouseholdsByOwner === 'function') {
    const byOwnerResult = await captureCall(() => {
      return state.dataApi.debugQueryHouseholdsByOwner(state.dataContext, userUid);
    });
    report.queryByOwner = byOwnerResult.ok
      ? byOwnerResult.value.map(summarizeHouseholdForDebug)
      : byOwnerResult.error;
  } else {
    report.queryByOwner = 'debugQueryHouseholdsByOwner is unavailable.';
  }

  if (typeof state.dataApi.listUserHouseholds === 'function') {
    const listResult = await captureCall(() => {
      return state.dataApi.listUserHouseholds(state.dataContext, userUid);
    });
    report.listUserHouseholds = listResult.ok
      ? listResult.value.map(summarizeHouseholdForDebug)
      : listResult.error;
  } else {
    report.listUserHouseholds = 'listUserHouseholds is unavailable.';
  }

  if (typeof state.dataApi.listHouseholdIdsForUser === 'function' && typeof state.dataApi.getHousehold === 'function') {
    const indexedIdsResult = await captureCall(() => {
      return state.dataApi.listHouseholdIdsForUser(state.dataContext, userUid);
    });

    if (indexedIdsResult.ok) {
      report.indexedHouseholdReads = await Promise.all(
        indexedIdsResult.value.slice(0, 20).map(async (householdId) => {
          const getResult = await captureCall(() => {
            return state.dataApi.getHousehold(state.dataContext, householdId);
          });

          return getResult.ok
            ? {
              householdId,
              household: getResult.value ? summarizeHouseholdForDebug(getResult.value) : null,
            }
            : {
              householdId,
              error: getResult.error,
            };
        }),
      );
    } else {
      report.indexedHouseholdReads = indexedIdsResult.error;
    }
  } else {
    report.indexedHouseholdReads = 'Indexed household lookup helpers are unavailable.';
  }

  setHouseholdDebugOutput(report);
}

async function debugLoadHouseholdById(rawHouseholdId) {
  if (!state.user || !state.dataApi || !state.dataContext) {
    throw new Error('Load-by-id requires an authenticated remote session.');
  }

  if (typeof state.dataApi.getHousehold !== 'function') {
    throw new Error('getHousehold API is unavailable in this mode.');
  }

  const householdId = String(rawHouseholdId || '').trim();
  if (!householdId) {
    throw new Error('Household id is required.');
  }

  const report = {
    ranAt: new Date().toISOString(),
    mode: state.mode,
    userUid: state.user.uid,
    householdId,
  };

  let household = null;
  try {
    household = await state.dataApi.getHousehold(state.dataContext, householdId);
    report.getHousehold = {
      ok: true,
      exists: Boolean(household),
      household: household ? summarizeHouseholdForDebug(household) : null,
    };
  } catch (error) {
    report.getHousehold = {
      ok: false,
      error: serializeError(error),
    };
    setHouseholdDebugOutput(report);
    throw error;
  }

  if (!household) {
    setHouseholdDebugOutput(report);
    return;
  }

  if (!householdVisibleToCurrentUser(household)) {
    report.refreshHouseholds = {
      ok: false,
      reason: 'Current user is not owner/member in this household document.',
    };
    setHouseholdDebugOutput(report);
    return;
  }

  try {
    await refreshHouseholds(householdId);
    report.refreshHouseholds = {
      ok: true,
      activeHouseholdId: state.activeHouseholdId,
      loadedHouseholdIds: state.households.map((entry) => entry.id),
    };
  } catch (error) {
    report.refreshHouseholds = {
      ok: false,
      error: serializeError(error),
    };
    setHouseholdDebugOutput(report);
    throw error;
  }

  setHouseholdDebugOutput(report);
}

async function createHouseholdAndRefresh(rawHouseholdName) {
  let householdId;
  try {
    householdId = await state.dataApi.createHousehold(
      state.dataContext,
      state.user,
      rawHouseholdName,
    );
  } catch (error) {
    throw withStepError('Create household write failed', error);
  }

  try {
    await refreshHouseholds(householdId);
  } catch (error) {
    throw withStepError('Created household but failed to load account households', error);
  }
  closeHouseholdModal();
  setStatus('Household created.');
}

async function joinHouseholdAndRefresh(rawHouseholdId, rawInviteCode) {
  const joinedHouseholdId = String(rawHouseholdId || '').trim();
  try {
    await state.dataApi.joinHousehold(
      state.dataContext,
      state.user,
      rawHouseholdId,
      rawInviteCode,
    );
  } catch (error) {
    throw withStepError('Join household write failed', error);
  }

  try {
    await refreshHouseholds(joinedHouseholdId);
  } catch (error) {
    throw withStepError('Joined household but failed to load account households', error);
  }
  closeHouseholdModal();
  setStatus('Joined household.');
}

function showLoginScreen() {
  state.pendingRemoteEntry = false;
  state.mode = null;
  state.dataApi = null;
  state.dataContext = null;
  state.user = null;
  state.households = [];
  state.activeHouseholdId = null;
  state.ensuredHouseholdMemberships.clear();

  clearHouseholdSubscriptions();
  clearWeekSubscription();
  resetHouseholdData();
  forceHideAllAppModals();

  showView('login');
  renderHouseholdModal();
  renderAuthDetails();
  renderModeBanner();
  updateLoginView();
  renderHeaderButtons();
  renderHouseholdGate();
}

async function enterLocalMode() {
  state.pendingRemoteEntry = false;
  state.mode = 'local';
  state.dataApi = localData;
  state.households = [];
  state.activeHouseholdId = null;
  clearHouseholdSubscriptions();
  clearWeekSubscription();
  resetHouseholdData();

  if (!state.localContext) {
    state.localContext = localData.createLocalContext(localData.LOCAL_MODE_USER);
  }

  state.dataContext = state.localContext;
  state.user = localData.LOCAL_MODE_USER;

  showView('app');
  renderAuthDetails();
  renderModeBanner();
  renderHeaderButtons();
  renderMainData();

  await refreshHouseholds();
}

async function enterRemoteMode(user) {
  if (!state.remoteAvailable || !state.services?.db) {
    throw new Error('Firebase is not available.');
  }

  state.ensuredHouseholdMemberships.clear();
  state.mode = 'remote';
  state.dataApi = remoteData;
  state.dataContext = state.services.db;
  state.user = user;
  state.households = [];
  state.activeHouseholdId = null;
  clearHouseholdSubscriptions();
  clearWeekSubscription();
  resetHouseholdData();

  showView('app');
  renderAuthDetails();
  renderModeBanner();
  renderHeaderButtons();
  renderMainData();

  await refreshHouseholds();
}

async function attemptRemoteEntry() {
  if (!state.remoteAvailable || !state.services?.auth) {
    throw new Error('Google sign-in is unavailable.');
  }

  state.pendingRemoteEntry = true;

  if (state.authUser) {
    await enterRemoteMode(state.authUser);
    state.pendingRemoteEntry = false;
    return;
  }

  const result = await signInWithGoogle(state.services.auth);

  if (result?.user) {
    await enterRemoteMode(result.user);
    state.pendingRemoteEntry = false;
    return;
  }

  setStatus('Continuing Google sign-in...');
}

function renderMainData() {
  renderWeeklyGrid();
  renderGroceryAddStoreOptions(elements.groceryAddStore.value || null);
  renderGroceryStoreGrid();
  renderWeeklyPantrySnippet();
  renderGroceryHistory();
  renderMealTagCloud();
  renderMealsList();
  renderPantryLists();
  renderPantryHistory();
  renderStoresManageList();
  renderHouseholdModal();
  renderGrocerySubview();
  renderPantrySubview();
  renderHouseholdGate();
}

function bindEvents() {
  elements.loginButton.addEventListener('click', async () => {
    clearError();

    try {
      await attemptRemoteEntry();
    } catch (error) {
      state.pendingRemoteEntry = false;
      showError(error);
    }
  });

  elements.localOnlyButton.addEventListener('click', async () => {
    clearError();

    try {
      await enterLocalMode();
      setStatus(localModeMessage());
    } catch (error) {
      showError(error);
    }
  });

  elements.authActionButton.addEventListener('click', async () => {
    clearError();

    try {
      if (isRemoteMode()) {
        await signOutCurrentUser(state.services.auth);
        showLoginScreen();
        setStatus('Signed out. Choose sign-in or local-only mode.');
        return;
      }

      await attemptRemoteEntry();
    } catch (error) {
      state.pendingRemoteEntry = false;
      showError(error);
    }
  });

  elements.householdOpenButton.addEventListener('click', () => {
    openHouseholdModal(!state.households.length);
  });

  elements.householdModalClose.addEventListener('click', () => {
    closeHouseholdModal();
  });

  elements.householdModal.addEventListener('click', (event) => {
    if (event.target === elements.householdModal) {
      closeHouseholdModal();
    }
  });

  elements.householdList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-household-id]');
    if (!button) {
      return;
    }

    clearError();

    try {
      await selectHousehold(button.dataset.householdId);
    } catch (error) {
      showError(error);
    }
  });

  elements.createHouseholdForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    try {
      await createHouseholdAndRefresh(elements.householdNameInput.value);
      elements.householdNameInput.value = '';
      elements.householdGateNameInput.value = '';
    } catch (error) {
      showError(error);
    }
  });

  elements.joinHouseholdForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    try {
      await joinHouseholdAndRefresh(elements.joinHouseholdIdInput.value, elements.joinHouseholdCodeInput.value);
      elements.joinHouseholdIdInput.value = '';
      elements.joinHouseholdCodeInput.value = '';
      elements.householdGateIdInput.value = '';
      elements.householdGateCodeInput.value = '';
    } catch (error) {
      showError(error);
    }
  });

  elements.householdGateCreateForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    try {
      await createHouseholdAndRefresh(elements.householdGateNameInput.value);
      elements.householdGateNameInput.value = '';
      elements.householdNameInput.value = '';
    } catch (error) {
      showError(error);
    }
  });

  elements.householdGateJoinForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    try {
      await joinHouseholdAndRefresh(elements.householdGateIdInput.value, elements.householdGateCodeInput.value);
      elements.householdGateIdInput.value = '';
      elements.householdGateCodeInput.value = '';
      elements.joinHouseholdIdInput.value = '';
      elements.joinHouseholdCodeInput.value = '';
    } catch (error) {
      showError(error);
    }
  });

  elements.householdDebugRun.addEventListener('click', async () => {
    clearError();
    setStatus('Running household diagnostics...');

    try {
      await runHouseholdDiagnostics();
      setStatus('Household diagnostics complete. See the debug panel for details.');
    } catch (error) {
      showError(withStepError('Household diagnostics failed', error));
    }
  });

  elements.householdDebugLoadForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();
    setStatus('Loading household by id...');

    try {
      await debugLoadHouseholdById(elements.householdDebugHouseholdId.value);
      setStatus(`Loaded household ${elements.householdDebugHouseholdId.value.trim()}.`);
    } catch (error) {
      showError(withStepError('Debug household load failed', error));
    }
  });

  elements.tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      switchTab(button.dataset.tabTarget);
    });
  });

  elements.weekPrevButton.addEventListener('click', () => {
    state.weekStartIso = shiftWeekIso(state.weekStartIso, -1);
    subscribeToWeek();
    renderWeeklyGrid();
    setStatus(`Viewing week ${weekRangeLabel(state.weekStartIso)}.`);
  });

  elements.weekNextButton.addEventListener('click', () => {
    state.weekStartIso = shiftWeekIso(state.weekStartIso, 1);
    subscribeToWeek();
    renderWeeklyGrid();
    setStatus(`Viewing week ${weekRangeLabel(state.weekStartIso)}.`);
  });

  elements.weeklyGrid.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.classList.contains('planner-day')) {
      return;
    }

    event.preventDefault();
    clearError();

    try {
      const dayId = form.dataset.dayId;
      await saveDayPlan(dayId);
      setStatus(`Saved ${dayId}.`);
    } catch (error) {
      showError(error);
    }
  });

  elements.weeklyGrid.addEventListener('click', async (event) => {
    const eaterChip = event.target.closest('.eater-chip');
    if (eaterChip) {
      eaterChip.classList.toggle('active');
      return;
    }

    const forageButton = event.target.closest('.forage-btn');
    if (forageButton) {
      clearError();
      try {
        const dayId = forageButton.dataset.dayId;
        const current = state.weekPlan[dayId] || {};
        const isForage = String(current.mealTitle || '').toLowerCase() === 'forage';
        await saveDayPlan(dayId, {
          mealId: null,
          mealTitle: isForage ? null : 'Forage',
          ingredientPlan: [],
        });
        setStatus(isForage ? `Cleared forage for ${dayId}.` : `${dayId}: Forage!`);
      } catch (error) {
        showError(error);
      }
      return;
    }

    const mealButton = event.target.closest('.meal-open');
    if (mealButton) {
      openMealModalForDay(mealButton.dataset.dayId);
      return;
    }

    const clearButton = event.target.closest('.clear-day');
    if (!clearButton) {
      return;
    }

    clearError();

    try {
      const dayId = clearButton.dataset.dayId;
      await saveDayPlan(dayId, {
        mealId: null,
        mealTitle: null,
        cookUid: null,
        eaterUids: [],
        notes: '',
        ingredientPlan: [],
      });
      setStatus(`Cleared ${dayId}.`);
    } catch (error) {
      showError(error);
    }
  });

  elements.groceryAddForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    try {
      await state.dataApi.addGroceryItem(
        state.dataContext,
        state.activeHouseholdId,
        {
          name: elements.groceryAddName.value,
          notes: elements.groceryAddNotes.value,
          storeId: elements.groceryAddStore.value,
        },
        state.user,
      );

      elements.groceryAddName.value = '';
      elements.groceryAddNotes.value = '';
      setStatus('Added grocery item.');
    } catch (error) {
      showError(error);
    }
  });

  elements.groceryStoresGrid.addEventListener('click', async (event) => {
    const plusButton = event.target.closest('.quick-add-store');
    if (plusButton) {
      elements.groceryAddStore.value = plusButton.dataset.storeId || '';
      elements.groceryAddName.focus();
      return;
    }

    const deleteButton = event.target.closest('.grocery-delete');
    if (!deleteButton) {
      return;
    }

    clearError();

    try {
      await state.dataApi.deleteGroceryItem(
        state.dataContext,
        state.activeHouseholdId,
        deleteButton.dataset.itemId,
        state.user,
      );
      setStatus('Removed grocery item.');
    } catch (error) {
      showError(error);
    }
  });

  elements.groceryStoresGrid.addEventListener('change', async (event) => {
    const checkbox = event.target.closest('.grocery-toggle');
    if (!checkbox) {
      return;
    }

    clearError();

    try {
      await state.dataApi.setGroceryItemCompleted(
        state.dataContext,
        state.activeHouseholdId,
        checkbox.dataset.itemId,
        checkbox.checked,
        state.user,
      );
    } catch (error) {
      showError(error);
    }
  });

  elements.groceryViewListButton.addEventListener('click', () => {
    state.groceryView = 'list';
    renderGrocerySubview();
  });

  elements.groceryViewHistoryButton.addEventListener('click', () => {
    state.groceryView = 'history';
    renderGrocerySubview();
  });

  elements.groceryHistoryList.addEventListener('click', async (event) => {
    const button = event.target.closest('.undo-activity');
    if (!button) {
      return;
    }

    clearError();

    try {
      await state.dataApi.undoActivity(
        state.dataContext,
        state.activeHouseholdId,
        button.dataset.activityId,
        state.user,
      );
      setStatus('Undid grocery action.');
    } catch (error) {
      showError(error);
    }
  });

  elements.manageStoresButton.addEventListener('click', () => {
    openStoresModal();
  });

  elements.storesModalClose.addEventListener('click', () => {
    closeStoresModal();
  });

  elements.storesModal.addEventListener('click', (event) => {
    if (event.target === elements.storesModal) {
      closeStoresModal();
    }
  });

  elements.addStoreForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    try {
      await state.dataApi.addStore(
        state.dataContext,
        state.activeHouseholdId,
        elements.storeNameInput.value,
        state.user,
      );

      elements.storeNameInput.value = '';
      setStatus('Added store.');
    } catch (error) {
      showError(error);
    }
  });

  elements.storesManageList.addEventListener('click', async (event) => {
    const button = event.target.closest('.remove-store');
    if (!button) {
      return;
    }

    clearError();

    try {
      await state.dataApi.removeStore(
        state.dataContext,
        state.activeHouseholdId,
        button.dataset.storeId,
        state.user,
      );
      setStatus('Removed store.');
    } catch (error) {
      showError(error);
    }
  });

  const onMealSearchInput = () => {
    state.mealSearch.text = elements.mealSearchText.value;
    state.mealSearch.tag = elements.mealSearchTag.value;
    state.mealSearch.ingredient = elements.mealSearchIngredient.value;
    renderMealTagCloud();
    renderMealsList();
  };

  elements.mealSearchText.addEventListener('input', onMealSearchInput);
  elements.mealSearchTag.addEventListener('input', onMealSearchInput);
  elements.mealSearchIngredient.addEventListener('input', onMealSearchInput);

  elements.mealSearchReset.addEventListener('click', () => {
    elements.mealSearchText.value = '';
    elements.mealSearchTag.value = '';
    elements.mealSearchIngredient.value = '';
    onMealSearchInput();
  });

  elements.mealTagCloud.addEventListener('click', (event) => {
    const button = event.target.closest('.tag-filter');
    if (!button) {
      return;
    }

    const tag = button.dataset.tag;
    const current = state.mealSearch.tag.trim().toLowerCase();

    if (current === tag) {
      elements.mealSearchTag.value = '';
    } else {
      elements.mealSearchTag.value = tag;
    }

    onMealSearchInput();
  });

  elements.addMealButton.addEventListener('click', () => {
    openMealModalForLibrary();
  });

  elements.mealsList.addEventListener('click', (event) => {
    const button = event.target.closest('.edit-meal-button');
    if (!button) {
      return;
    }

    openMealModalForEdit(button.dataset.mealId);
  });

  elements.importMealsButton.addEventListener('click', () => {
    elements.importMealsJson.value = '';
    elements.importMealsResults.classList.add('hidden');
    elements.importMealsSummary.textContent = '';
    elements.importMealsErrors.innerHTML = '';
    elements.importMealsModal.classList.remove('hidden');
  });

  elements.importMealsModalClose.addEventListener('click', () => {
    elements.importMealsModal.classList.add('hidden');
  });

  elements.importMealsModal.addEventListener('click', (event) => {
    if (event.target === elements.importMealsModal) {
      elements.importMealsModal.classList.add('hidden');
    }
  });

  elements.importMealsSubmit.addEventListener('click', async () => {
    clearError();
    elements.importMealsResults.classList.add('hidden');
    elements.importMealsSummary.textContent = '';
    elements.importMealsErrors.innerHTML = '';

    const raw = elements.importMealsJson.value.trim();
    if (!raw) {
      showError('Paste a JSON array of meals to import.');
      return;
    }

    const parsed = parseBulkMealJson(raw);

    if (parsed.errors.length > 0 && parsed.valid.length === 0) {
      elements.importMealsResults.classList.remove('hidden');
      elements.importMealsSummary.textContent = 'No valid meals found.';
      parsed.errors.forEach((err) => {
        const li = document.createElement('li');
        const label = err.title ? `#${err.index + 1} "${err.title}"` : err.index >= 0 ? `#${err.index + 1}` : 'Parse error';
        li.textContent = `${label}: ${err.message}`;
        elements.importMealsErrors.appendChild(li);
      });
      return;
    }

    try {
      elements.importMealsSubmit.disabled = true;
      const result = await state.dataApi.bulkCreateMeals(state.dataContext, state.activeHouseholdId, parsed.valid, state.user);

      elements.importMealsResults.classList.remove('hidden');
      const allErrors = [...parsed.errors, ...result.errors];
      elements.importMealsSummary.textContent = `Imported ${result.created} meal(s).` + (allErrors.length ? ` ${allErrors.length} error(s).` : '');

      allErrors.forEach((err) => {
        const li = document.createElement('li');
        const label = err.title ? `"${err.title}"` : `#${err.index + 1}`;
        li.textContent = `${label}: ${err.message}`;
        elements.importMealsErrors.appendChild(li);
      });

      if (result.created > 0) {
        setStatus(`Imported ${result.created} meal(s) to library.`);
      }
    } catch (error) {
      showError(error);
    } finally {
      elements.importMealsSubmit.disabled = false;
    }
  });

  elements.mealModalClose.addEventListener('click', () => {
    closeMealModal();
  });

  elements.mealModal.addEventListener('click', (event) => {
    if (event.target === elements.mealModal) {
      closeMealModal();
    }
  });

  elements.mealExistingSelect.addEventListener('change', () => {
    renderMealExistingConfig();
  });

  elements.addNewMealIngredient.addEventListener('click', () => {
    addNewMealIngredientRow();
  });

  elements.newMealIngredients.addEventListener('click', (event) => {
    const button = event.target.closest('.remove-new-ing');
    if (!button) {
      return;
    }

    const row = button.closest('[data-new-ingredient-row]');
    if (!row) {
      return;
    }

    row.remove();

    if (!elements.newMealIngredients.querySelector('[data-new-ingredient-row]')) {
      addNewMealIngredientRow();
    }
  });

  elements.mealModalForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    try {
      if (state.mealModal.mode === 'edit') {
        const draft = parseNewMealDraftFromModal();
        await state.dataApi.updateMeal(state.dataContext, state.activeHouseholdId, state.mealModal.editMealId, draft, state.user);
        closeMealModal();
        setStatus(`Updated ${draft.title.trim() || 'meal'}.`);
        return;
      }

      if (state.mealModal.mode === 'library') {
        const draft = parseNewMealDraftFromModal();
        await state.dataApi.createMeal(state.dataContext, state.activeHouseholdId, draft, state.user);
        closeMealModal();
        setStatus('Meal added to library.');
        return;
      }

      const dayId = state.mealModal.dayId;
      if (!dayId) {
        throw new Error('Day is required to save this meal.');
      }

      const selectedMealId = elements.mealExistingSelect.value;

      if (selectedMealId && selectedMealId !== '__new__') {
        const meal = state.meals.find((entry) => entry.id === selectedMealId);
        if (!meal) {
          throw new Error('Selected meal no longer exists.');
        }

        const ingredientPlan = parseIngredientPlanForExistingMeal();
        await saveDayPlan(dayId, {
          mealId: meal.id,
          mealTitle: meal.title,
          ingredientPlan,
        });

        closeMealModal();
        setStatus(`Applied ${meal.title} to ${dayId}.`);
        return;
      }

      const draft = parseNewMealDraftFromModal();
      const saveToLibrary = elements.saveMealToLibrary.checked;

      if (saveToLibrary) {
        const createdMealId = await state.dataApi.createMeal(state.dataContext, state.activeHouseholdId, draft, state.user);
        const createdMeal = {
          id: createdMealId,
          title: draft.title.trim(),
          ingredients: draft.ingredients,
        };

        await saveDayPlan(dayId, {
          mealId: createdMealId,
          mealTitle: createdMeal.title,
          ingredientPlan: parseIngredientPlanForNewMeal(createdMeal),
        });

        closeMealModal();
        setStatus(`Created and applied ${createdMeal.title} to ${dayId}.`);
      } else {
        await saveDayPlan(dayId, {
          mealId: null,
          mealTitle: draft.title.trim() || null,
          ingredientPlan: [],
        });

        closeMealModal();
        setStatus(`Applied ${draft.title.trim() || 'meal'} to ${dayId}.`);
      }
    } catch (error) {
      showError(error);
    }
  });

  elements.pantryViewListButton.addEventListener('click', () => {
    state.pantryView = 'list';
    renderPantrySubview();
  });

  elements.pantryViewHistoryButton.addEventListener('click', () => {
    state.pantryView = 'history';
    renderPantrySubview();
  });

  const pantryDeleteHandler = async (event) => {
    const button = event.target.closest('.pantry-delete');
    if (!button) {
      return;
    }

    clearError();

    try {
      await state.dataApi.deletePantryItem(
        state.dataContext,
        state.activeHouseholdId,
        button.dataset.pantryId,
        state.user,
      );
      setStatus('Removed pantry item.');
    } catch (error) {
      showError(error);
    }
  };

  elements.pantryWeeklyList.addEventListener('click', pantryDeleteHandler);
  elements.pantryOtherList.addEventListener('click', pantryDeleteHandler);

  const pantryContextHandler = async (event) => {
    const row = event.target.closest('.pantry-item');
    if (!row) {
      return;
    }

    event.preventDefault();
    clearError();

    try {
      const currentSection = row.dataset.section;
      const nextSection = currentSection === 'weekly' ? 'other' : 'weekly';

      await state.dataApi.movePantryItem(
        state.dataContext,
        state.activeHouseholdId,
        row.dataset.pantryId,
        nextSection,
        state.user,
      );

      setStatus(`Moved pantry item to ${nextSection}.`);
    } catch (error) {
      showError(error);
    }
  };

  elements.pantryWeeklyList.addEventListener('contextmenu', pantryContextHandler);
  elements.pantryOtherList.addEventListener('contextmenu', pantryContextHandler);

  elements.pantryHistoryList.addEventListener('click', async (event) => {
    const button = event.target.closest('.undo-activity');
    if (!button) {
      return;
    }

    clearError();

    try {
      await state.dataApi.undoActivity(
        state.dataContext,
        state.activeHouseholdId,
        button.dataset.activityId,
        state.user,
      );
      setStatus('Undid pantry action.');
    } catch (error) {
      showError(error);
    }
  });
}

async function bootstrap() {
  cacheElements();
  bindEvents();

  state.localContext = localData.createLocalContext(localData.LOCAL_MODE_USER);
  state.services = await getFirebaseServices();
  state.remoteAvailable = Boolean(state.services?.enabled);

  if (state.remoteAvailable && state.services?.auth) {
    onAuthStateChanged(state.services.auth, (user) => {
      state.authUser = user;
      updateLoginView();

      if (state.pendingRemoteEntry && user) {
        enterRemoteMode(user)
          .then(() => {
            state.pendingRemoteEntry = false;
          })
          .catch(showError);
      }

      if (isRemoteMode() && !user) {
        showLoginScreen();
        setStatus('Signed out. Choose sign-in or local-only mode.');
      }

      if (isRemoteMode() && user) {
        state.user = user;
        renderAuthDetails();
      }
    });
  }

  if (!state.remoteAvailable && state.services?.error) {
    showError(state.services.error);
  }

  showLoginScreen();
  updateLoginView();
  setStatus('Select Google sign-in or local-only mode to continue.');

  switchTab(state.activeTab);
  renderMainData();
}

document.addEventListener('DOMContentLoaded', () => {
  bootstrap().catch(showError);
});
