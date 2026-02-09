import { getFirebaseServices, onAuthStateChanged, signInWithGoogle, signOutCurrentUser } from './firebase.mjs';
import * as localData from './local-data.mjs';
import * as remoteData from './data.mjs';
import { buildWeekDays, getWeekStartIso, shiftWeekIso, weekRangeLabel } from './utils/dates.mjs';
import { createEmptyWeekPlan, mergeDayDocs, weekIdFromStart } from './utils/state.mjs';

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

  elements.storesModal = document.getElementById('stores-modal');
  elements.storesModalClose = document.getElementById('stores-modal-close');
  elements.addStoreForm = document.getElementById('add-store-form');
  elements.storeNameInput = document.getElementById('store-name');
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

  elements.mealModal.classList.remove('hidden');
}

function closeMealModal() {
  state.mealModal = {
    open: false,
    mode: 'day',
    dayId: null,
  };

  elements.mealModal.classList.add('hidden');
}

function forceHideAllAppModals() {
  state.householdModalLocked = false;
  elements.householdModal.classList.add('hidden');
  elements.storesModal.classList.add('hidden');
  elements.mealModal.classList.add('hidden');
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

function eaterOptions(selectedUids = []) {
  return state.members
    .map((member) => {
      const selected = selectedUids.includes(member.uid) ? 'selected' : '';
      return `<option value="${member.uid}" ${selected}>${escapeHtml(member.displayName)}</option>`;
    })
    .join('');
}

function renderWeeklyGrid() {
  elements.weekLabel.textContent = weekRangeLabel(state.weekStartIso);

  elements.weeklyGrid.innerHTML = buildWeekDays(state.weekStartIso)
    .map((day) => {
      const value = state.weekPlan[day.dayId] || {};
      const mealTitle = value.mealTitle || 'No meal selected';
      const eaterList = Array.isArray(value.eaterUids) ? value.eaterUids : [];

      return `
        <form class="planner-day" data-day-id="${day.dayId}">
          <h4>${escapeHtml(day.label)}</h4>

          <div class="meal-picker">
            <div>
              <div class="title">${escapeHtml(mealTitle)}</div>
              <div class="meta">${value.mealId ? `Meal id: ${escapeHtml(value.mealId)}` : 'No linked meal'}</div>
            </div>
            <button type="button" class="ghost meal-open" data-day-id="${day.dayId}">Set meal</button>
          </div>

          <label>
            Who is cooking
            <select name="cookUid">
              ${cookOptions(value.cookUid || '')}
            </select>
          </label>

          <label>
            Who is eating
            <select name="eaterUids" multiple>
              ${eaterOptions(eaterList)}
            </select>
          </label>

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

function selectedEaterUids(selectElement) {
  return Array.from(selectElement.selectedOptions || [])
    .map((option) => option.value)
    .filter(Boolean);
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
  const eaterUids = selectedEaterUids(form.elements.eaterUids);
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

  let households = [];

  try {
    households = await state.dataApi.listUserHouseholds(state.dataContext, state.user.uid);
  } catch (error) {
    // Fallback for edge cases where collection list rules deny but direct get is allowed.
    if (!preferredHouseholdId || typeof state.dataApi.getHousehold !== 'function') {
      throw error;
    }

    const fallbackHousehold = await state.dataApi.getHousehold(state.dataContext, preferredHouseholdId);
    if (!fallbackHousehold) {
      throw error;
    }

    households = [fallbackHousehold];
    console.warn('Fell back to direct household read after listUserHouseholds failed', error);
  }

  state.households = households;

  let selectedId = preferredHouseholdId;

  if (!selectedId && typeof state.dataApi.getDefaultHouseholdId === 'function') {
    selectedId = await state.dataApi.getDefaultHouseholdId(state.dataContext, state.user.uid);
  }

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

  state.unsubs.push(
    state.dataApi.listenMembers(
      state.dataContext,
      householdId,
      (members) => {
        state.members = members;
        renderWeeklyGrid();
      },
      showError,
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
      showError,
    ),
  );

  state.unsubs.push(
    state.dataApi.listenMeals(
      state.dataContext,
      householdId,
      (meals) => {
        state.meals = meals;
        renderMealsList();
        if (state.mealModal.open) {
          renderMealExistingOptions(elements.mealExistingSelect.value || '__new__');
          renderMealExistingConfig();
        }
      },
      showError,
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
      showError,
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
      showError,
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
      showError,
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
    showError,
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

  elements.addMealButton.addEventListener('click', () => {
    openMealModalForLibrary();
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
