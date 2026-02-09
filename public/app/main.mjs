import { getFirebaseServices, onAuthStateChanged, signInWithGoogle, signOutCurrentUser } from './firebase.mjs';
import * as localData from './local-data.mjs';
import * as remoteData from './data.mjs';
import { buildWeekDays, getWeekStartIso, shiftWeekIso, weekRangeLabel } from './utils/dates.mjs';
import { collectPersonTags, describeGroceryItem, filterGroceryItems, sortGroceryItems } from './utils/grocery.mjs';
import { createEmptyWeekPlan, mergeDayDocs, weekIdFromStart } from './utils/state.mjs';

const state = {
  services: null,
  remoteAvailable: false,
  mode: 'local',
  dataApi: localData,
  dataContext: null,
  localContext: null,
  user: null,
  households: [],
  activeHouseholdId: null,
  weekStartIso: getWeekStartIso(),
  weekPlan: createEmptyWeekPlan(),
  members: [],
  groceryItems: [],
  locations: [],
  activity: [],
  filters: {
    locationId: 'all',
    personTag: 'all',
    status: 'open',
  },
  activeTab: 'planner',
  unsubs: [],
  weekUnsub: null,
};

const elements = {};

function cacheElements() {
  elements.views = {
    login: document.getElementById('login-view'),
    household: document.getElementById('household-view'),
    app: document.getElementById('app-view'),
  };

  elements.error = document.getElementById('global-error');
  elements.status = document.getElementById('status-message');
  elements.modeBanner = document.getElementById('mode-banner');

  elements.loginButton = document.getElementById('login-button');
  elements.authToggleButton = document.getElementById('auth-toggle-button');

  elements.userName = document.getElementById('user-name');
  elements.userEmail = document.getElementById('user-email');

  elements.householdList = document.getElementById('household-list');
  elements.householdCreateForm = document.getElementById('create-household-form');
  elements.householdNameInput = document.getElementById('household-name');
  elements.joinHouseholdForm = document.getElementById('join-household-form');
  elements.joinHouseholdIdInput = document.getElementById('join-household-id');
  elements.joinHouseholdCodeInput = document.getElementById('join-household-code');

  elements.householdSelect = document.getElementById('active-household-select');
  elements.householdInviteCode = document.getElementById('active-household-invite-code');

  elements.tabButtons = Array.from(document.querySelectorAll('[data-tab-target]'));
  elements.tabPanels = {
    planner: document.getElementById('planner-panel'),
    grocery: document.getElementById('grocery-panel'),
    settings: document.getElementById('settings-panel'),
  };

  elements.prevWeekButton = document.getElementById('week-prev');
  elements.nextWeekButton = document.getElementById('week-next');
  elements.weekLabel = document.getElementById('week-label');
  elements.plannerGrid = document.getElementById('planner-grid');

  elements.groceryForm = document.getElementById('grocery-form');
  elements.groceryNameInput = document.getElementById('grocery-name');
  elements.groceryQuantityInput = document.getElementById('grocery-quantity');
  elements.groceryNotesInput = document.getElementById('grocery-notes');
  elements.groceryLocationSelect = document.getElementById('grocery-location');
  elements.groceryPersonInput = document.getElementById('grocery-person');
  elements.groceryMealDaySelect = document.getElementById('grocery-meal-day');
  elements.personTagsDatalist = document.getElementById('person-tags');

  elements.filterLocation = document.getElementById('filter-location');
  elements.filterPerson = document.getElementById('filter-person');
  elements.filterStatus = document.getElementById('filter-status');
  elements.groceryList = document.getElementById('grocery-list');

  elements.membersList = document.getElementById('members-list');
  elements.locationForm = document.getElementById('location-form');
  elements.locationNameInput = document.getElementById('location-name');
  elements.locationsList = document.getElementById('locations-list');
  elements.activityList = document.getElementById('activity-list');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatTimestamp(timestamp) {
  if (!timestamp) {
    return 'just now';
  }

  const date = typeof timestamp.toDate === 'function' ? timestamp.toDate() : new Date(timestamp);
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function activeHousehold() {
  return state.households.find((household) => household.id === state.activeHouseholdId) ?? null;
}

function showView(viewName) {
  Object.entries(elements.views).forEach(([name, view]) => {
    const isVisible = name === viewName;
    view.classList.toggle('hidden', !isVisible);
  });
}

function clearError() {
  elements.error.textContent = '';
}

function showError(error) {
  const message = typeof error === 'string' ? error : error?.message ?? 'Unknown error';
  elements.error.textContent = message;
  console.error(error);
}

function setStatus(message) {
  elements.status.textContent = message;
}

function isLocalMode() {
  return state.mode === 'local';
}

function localModeStatusMessage() {
  if (!state.remoteAvailable) {
    return 'Local-only mode: Firebase is unavailable. Data is stored in this browser only.';
  }

  return 'Local-only mode: Data is stored on this device only until you sign in.';
}

function renderModeBanner() {
  if (isLocalMode()) {
    elements.modeBanner.textContent = localModeStatusMessage();
    elements.modeBanner.classList.remove('hidden');
    elements.authToggleButton.textContent = state.remoteAvailable ? 'Sign in with Google' : 'Firebase unavailable';
    elements.authToggleButton.disabled = !state.remoteAvailable;
    return;
  }

  elements.modeBanner.textContent = '';
  elements.modeBanner.classList.add('hidden');
  elements.authToggleButton.textContent = 'Sign out';
  elements.authToggleButton.disabled = false;
}

function resetHouseholdState() {
  state.members = [];
  state.groceryItems = [];
  state.locations = [];
  state.activity = [];
  state.weekPlan = createEmptyWeekPlan();
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
  if (state.weekUnsub) {
    try {
      state.weekUnsub();
    } catch (error) {
      console.warn('Failed to unsubscribe week listener', error);
    }
    state.weekUnsub = null;
  }
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

function renderHouseholdList() {
  if (!state.households.length) {
    elements.householdList.innerHTML = '<li class="empty">No households yet. Create one to start planning.</li>';
    return;
  }

  const items = state.households
    .map((household) => {
      const selected = household.id === state.activeHouseholdId;
      return `
        <li>
          <button type="button" class="ghost household-choice ${selected ? 'selected' : ''}" data-household-id="${household.id}">
            <span class="title">${escapeHtml(household.name)}</span>
            <span class="meta">id: ${escapeHtml(household.id)}</span>
          </button>
        </li>
      `;
    })
    .join('');

  elements.householdList.innerHTML = items;
}

function renderActiveHouseholdSelect() {
  const options = state.households
    .map((household) => {
      const selected = household.id === state.activeHouseholdId ? 'selected' : '';
      return `<option value="${household.id}" ${selected}>${escapeHtml(household.name)}</option>`;
    })
    .join('');

  elements.householdSelect.innerHTML = options;

  const selectedHousehold = activeHousehold();
  elements.householdInviteCode.textContent = selectedHousehold
    ? `Invite code: ${selectedHousehold.inviteCode || 'not set'}`
    : 'Invite code: --';
}

function renderAuthDetails() {
  if (!state.user) {
    elements.userName.textContent = 'Not signed in';
    elements.userEmail.textContent = '';
    return;
  }

  elements.userName.textContent = state.user.displayName ?? 'Signed in user';
  if (isLocalMode()) {
    elements.userEmail.textContent = 'Not signed in';
  } else {
    elements.userEmail.textContent = state.user.email ?? state.user.uid;
  }
}

function cookOptions(selectedUid) {
  const options = [`<option value="">Anyone</option>`];

  state.members.forEach((member) => {
    const selected = member.uid === selectedUid ? 'selected' : '';
    options.push(`<option value="${member.uid}" ${selected}>${escapeHtml(member.displayName)}</option>`);
  });

  return options.join('');
}

function renderPlanner() {
  elements.weekLabel.textContent = weekRangeLabel(state.weekStartIso);

  const cards = buildWeekDays(state.weekStartIso)
    .map((day) => {
      const meal = state.weekPlan[day.dayId] ?? { mealName: '', cookUid: null };
      const empty = !meal.mealName && !meal.cookUid;

      return `
        <form class="planner-day ${empty ? 'is-empty' : ''}" data-day-id="${day.dayId}">
          <h3>${escapeHtml(day.label)}</h3>
          <p class="day-key">${escapeHtml(day.dayId)}</p>
          <label>
            Meal
            <input type="text" name="mealName" maxlength="120" placeholder="Add dinner plan" value="${escapeHtml(meal.mealName || '')}">
          </label>
          <label>
            Cook
            <select name="cookUid">
              ${cookOptions(meal.cookUid)}
            </select>
          </label>
          <div class="actions">
            <button type="submit">Save</button>
            <button type="button" class="ghost clear-meal" data-day-id="${day.dayId}">Clear</button>
          </div>
        </form>
      `;
    })
    .join('');

  elements.plannerGrid.innerHTML = cards;
}

function setSelectOptions(selectElement, options, selectedValue) {
  selectElement.innerHTML = options
    .map((option) => {
      const selected = option.value === selectedValue ? 'selected' : '';
      return `<option value="${escapeHtml(option.value)}" ${selected}>${escapeHtml(option.label)}</option>`;
    })
    .join('');
}

function renderGroceryFormOptions() {
  const locationOptions = [{ value: '', label: 'No location' }].concat(
    state.locations.map((location) => ({ value: location.id, label: location.name })),
  );

  const dayOptions = [{ value: '', label: 'Not linked to a meal' }].concat(
    buildWeekDays(state.weekStartIso).map((day) => ({ value: day.dayId, label: day.label })),
  );

  setSelectOptions(elements.groceryLocationSelect, locationOptions, elements.groceryLocationSelect.value || '');
  setSelectOptions(elements.groceryMealDaySelect, dayOptions, elements.groceryMealDaySelect.value || '');

  const personTags = collectPersonTags(state.groceryItems);
  elements.personTagsDatalist.innerHTML = personTags
    .map((personTag) => `<option value="${escapeHtml(personTag)}"></option>`)
    .join('');
}

function renderGroceryFilters() {
  const people = collectPersonTags(state.groceryItems);

  const locationFilterOptions = [{ value: 'all', label: 'All locations' }].concat(
    state.locations.map((location) => ({ value: location.id, label: location.name })),
  );

  const peopleFilterOptions = [{ value: 'all', label: 'All people' }].concat(
    people.map((person) => ({ value: person, label: person })),
  );

  setSelectOptions(elements.filterLocation, locationFilterOptions, state.filters.locationId);
  setSelectOptions(elements.filterPerson, peopleFilterOptions, state.filters.personTag);
  setSelectOptions(
    elements.filterStatus,
    [
      { value: 'open', label: 'Open only' },
      { value: 'done', label: 'Completed only' },
      { value: 'all', label: 'All items' },
    ],
    state.filters.status,
  );
}

function renderGroceryList() {
  const locationNames = new Map(state.locations.map((location) => [location.id, location.name]));
  const filtered = sortGroceryItems(filterGroceryItems(state.groceryItems, state.filters));

  if (!filtered.length) {
    elements.groceryList.innerHTML = '<li class="empty">No grocery items match these filters.</li>';
    return;
  }

  elements.groceryList.innerHTML = filtered
    .map((item) => {
      const details = describeGroceryItem(item, locationNames);
      return `
        <li class="grocery-item ${item.completed ? 'done' : ''}">
          <label class="checkline">
            <input type="checkbox" class="toggle-item" data-item-id="${item.id}" ${item.completed ? 'checked' : ''}>
            <span class="name">${escapeHtml(item.name)}</span>
          </label>
          ${details ? `<p class="meta">${escapeHtml(details)}</p>` : ''}
          ${item.notes ? `<p class="notes">${escapeHtml(item.notes)}</p>` : ''}
          <div class="actions">
            <button type="button" class="danger delete-item" data-item-id="${item.id}">Delete</button>
          </div>
        </li>
      `;
    })
    .join('');
}

function renderSettings() {
  if (!state.members.length) {
    elements.membersList.innerHTML = '<li class="empty">No members found.</li>';
  } else {
    elements.membersList.innerHTML = state.members
      .map(
        (member) => `
          <li>
            <span>${escapeHtml(member.displayName)}</span>
            <span class="meta">${escapeHtml(member.role)}</span>
          </li>
        `,
      )
      .join('');
  }

  if (!state.locations.length) {
    elements.locationsList.innerHTML = '<li class="empty">No locations configured yet.</li>';
  } else {
    elements.locationsList.innerHTML = state.locations
      .map((location) => `<li>${escapeHtml(location.name)}</li>`)
      .join('');
  }

  if (!state.activity.length) {
    elements.activityList.innerHTML = '<li class="empty">No activity yet.</li>';
  } else {
    elements.activityList.innerHTML = state.activity
      .map(
        (event) => `
          <li>
            <p>${escapeHtml(event.message)}</p>
            <p class="meta">${escapeHtml(event.actorName)} • ${escapeHtml(formatTimestamp(event.createdAt))}</p>
          </li>
        `,
      )
      .join('');
  }
}

function renderAll() {
  renderModeBanner();
  renderAuthDetails();
  renderHouseholdList();
  renderActiveHouseholdSelect();
  renderPlanner();
  renderGroceryFormOptions();
  renderGroceryFilters();
  renderGroceryList();
  renderSettings();
  switchTab(state.activeTab);
}

async function refreshHouseholds() {
  if (!state.dataApi || !state.dataContext || !state.user) {
    return;
  }

  state.households = await state.dataApi.listUserHouseholds(state.dataContext, state.user.uid);
  const hasActiveSelection = state.households.some((household) => household.id === state.activeHouseholdId);

  if (!hasActiveSelection) {
    state.activeHouseholdId = state.households.length ? state.households[0].id : null;
  }

  renderAll();

  if (!state.households.length) {
    resetHouseholdState();
    clearHouseholdSubscriptions();
    clearWeekSubscription();
    if (isLocalMode()) {
      showView('app');
      setStatus(localModeStatusMessage());
    } else {
      showView('household');
      setStatus('Create or join a household to continue.');
    }
    return;
  }

  showView('app');
  subscribeToHouseholdData();
  if (isLocalMode()) {
    setStatus(localModeStatusMessage());
  } else {
    setStatus(`Using household: ${activeHousehold()?.name ?? ''}`);
  }
}

function subscribeToHouseholdData() {
  clearHouseholdSubscriptions();
  clearWeekSubscription();
  resetHouseholdState();

  const householdId = state.activeHouseholdId;
  if (!householdId || !state.dataApi || !state.dataContext) {
    renderAll();
    return;
  }

  const api = state.dataApi;
  const context = state.dataContext;

  state.unsubs.push(
    api.listenMembers(
      context,
      householdId,
      (members) => {
        state.members = members;
        renderPlanner();
        renderGroceryFormOptions();
        renderSettings();
      },
      showError,
    ),
  );

  state.unsubs.push(
    api.listenGroceryItems(
      context,
      householdId,
      (items) => {
        state.groceryItems = items;
        renderGroceryFormOptions();
        renderGroceryFilters();
        renderGroceryList();
      },
      showError,
    ),
  );

  state.unsubs.push(
    api.listenLocations(
      context,
      householdId,
      (locations) => {
        state.locations = locations;
        renderGroceryFormOptions();
        renderGroceryFilters();
        renderSettings();
      },
      showError,
    ),
  );

  state.unsubs.push(
    api.listenActivity(
      context,
      householdId,
      (events) => {
        state.activity = events;
        renderSettings();
      },
      showError,
    ),
  );

  subscribeToWeek();
}

function subscribeToWeek() {
  clearWeekSubscription();

  if (!state.activeHouseholdId || !state.dataApi || !state.dataContext) {
    return;
  }

  const weekId = weekIdFromStart(state.weekStartIso);

  state.weekUnsub = state.dataApi.listenWeekDays(
    state.dataContext,
    state.activeHouseholdId,
    weekId,
    (dayDocs) => {
      state.weekPlan = mergeDayDocs(dayDocs);
      renderPlanner();
    },
    showError,
  );

  renderPlanner();
}

async function enterLocalMode(statusMessage = localModeStatusMessage()) {
  state.mode = 'local';
  state.dataApi = localData;

  if (!state.localContext) {
    state.localContext = localData.createLocalContext(localData.LOCAL_MODE_USER);
  }

  state.dataContext = state.localContext;
  state.user = localData.LOCAL_MODE_USER;

  showView('app');
  setStatus(statusMessage);
  await refreshHouseholds();
}

async function enterRemoteMode(user) {
  state.mode = 'remote';
  state.dataApi = remoteData;
  state.dataContext = state.services.db;
  state.user = user;

  showView('household');
  setStatus('Loading households...');
  await refreshHouseholds();
}

async function handleAuthState(user) {
  clearError();

  if (!state.remoteAvailable) {
    await enterLocalMode(localModeStatusMessage());
    return;
  }

  if (!user) {
    await enterLocalMode(localModeStatusMessage());
    return;
  }

  await enterRemoteMode(user);
}

function bindEvents() {
  const attemptSignIn = async () => {
    if (!state.remoteAvailable || !state.services || !state.services.auth) {
      setStatus(localModeStatusMessage());
      return;
    }

    await signInWithGoogle(state.services.auth);
  };

  elements.loginButton.addEventListener('click', async () => {
    clearError();

    try {
      await attemptSignIn();
    } catch (error) {
      showError(error);
    }
  });

  elements.authToggleButton.addEventListener('click', async () => {
    clearError();

    try {
      if (isLocalMode()) {
        await attemptSignIn();
      } else {
        await signOutCurrentUser(state.services.auth);
        setStatus(localModeStatusMessage());
      }
    } catch (error) {
      showError(error);
    }
  });

  elements.householdCreateForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    try {
      const householdId = await state.dataApi.createHousehold(
        state.dataContext,
        state.user,
        elements.householdNameInput.value,
      );

      elements.householdNameInput.value = '';
      state.activeHouseholdId = householdId;
      await refreshHouseholds();
      setStatus('Household created.');
    } catch (error) {
      showError(error);
    }
  });

  elements.joinHouseholdForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    try {
      await state.dataApi.joinHousehold(
        state.dataContext,
        state.user,
        elements.joinHouseholdIdInput.value,
        elements.joinHouseholdCodeInput.value,
      );

      elements.joinHouseholdIdInput.value = '';
      elements.joinHouseholdCodeInput.value = '';
      await refreshHouseholds();
      setStatus('Joined household.');
    } catch (error) {
      showError(error);
    }
  });

  elements.householdList.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-household-id]');
    if (!button) {
      return;
    }

    const householdId = button.dataset.householdId;
    if (!householdId || householdId === state.activeHouseholdId) {
      return;
    }

    state.activeHouseholdId = householdId;
    renderAll();
    showView('app');
    subscribeToHouseholdData();
  });

  elements.householdSelect.addEventListener('change', (event) => {
    const householdId = event.target.value;
    if (!householdId || householdId === state.activeHouseholdId) {
      return;
    }

    state.activeHouseholdId = householdId;
    renderAll();
    subscribeToHouseholdData();
  });

  elements.tabButtons.forEach((button) => {
    button.addEventListener('click', () => {
      switchTab(button.dataset.tabTarget);
    });
  });

  elements.prevWeekButton.addEventListener('click', () => {
    state.weekStartIso = shiftWeekIso(state.weekStartIso, -1);
    subscribeToWeek();
  });

  elements.nextWeekButton.addEventListener('click', () => {
    state.weekStartIso = shiftWeekIso(state.weekStartIso, 1);
    subscribeToWeek();
  });

  elements.plannerGrid.addEventListener('submit', async (event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.classList.contains('planner-day')) {
      return;
    }

    event.preventDefault();
    clearError();

    try {
      const dayId = form.dataset.dayId;
      const mealName = form.elements.mealName.value;
      const cookUid = form.elements.cookUid.value;

      await state.dataApi.saveMealForDay(
        state.dataContext,
        state.activeHouseholdId,
        weekIdFromStart(state.weekStartIso),
        dayId,
        { mealName, cookUid },
        state.user,
      );

      setStatus(`Saved ${dayId}.`);
    } catch (error) {
      showError(error);
    }
  });

  elements.plannerGrid.addEventListener('click', async (event) => {
    const button = event.target.closest('.clear-meal');
    if (!button) {
      return;
    }

    clearError();

    try {
      await state.dataApi.saveMealForDay(
        state.dataContext,
        state.activeHouseholdId,
        weekIdFromStart(state.weekStartIso),
        button.dataset.dayId,
        { mealName: '', cookUid: '' },
        state.user,
      );

      setStatus(`Cleared ${button.dataset.dayId}.`);
    } catch (error) {
      showError(error);
    }
  });

  elements.groceryForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    try {
      await state.dataApi.addGroceryItem(
        state.dataContext,
        state.activeHouseholdId,
        {
          name: elements.groceryNameInput.value,
          quantity: elements.groceryQuantityInput.value,
          notes: elements.groceryNotesInput.value,
          locationId: elements.groceryLocationSelect.value,
          personTag: elements.groceryPersonInput.value,
          mealDayId: elements.groceryMealDaySelect.value,
        },
        state.user,
      );

      elements.groceryForm.reset();
      renderGroceryFormOptions();
      setStatus('Added grocery item.');
    } catch (error) {
      showError(error);
    }
  });

  elements.groceryList.addEventListener('change', async (event) => {
    const checkbox = event.target.closest('.toggle-item');
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

  elements.groceryList.addEventListener('click', async (event) => {
    const button = event.target.closest('.delete-item');
    if (!button) {
      return;
    }

    clearError();

    try {
      await state.dataApi.deleteGroceryItem(
        state.dataContext,
        state.activeHouseholdId,
        button.dataset.itemId,
        state.user,
      );
    } catch (error) {
      showError(error);
    }
  });

  [
    ['locationId', elements.filterLocation],
    ['personTag', elements.filterPerson],
    ['status', elements.filterStatus],
  ].forEach(([key, select]) => {
    select.addEventListener('change', () => {
      state.filters[key] = select.value;
      renderGroceryList();
    });
  });

  elements.locationForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearError();

    try {
      await state.dataApi.addLocation(
        state.dataContext,
        state.activeHouseholdId,
        elements.locationNameInput.value,
        state.user,
      );

      elements.locationNameInput.value = '';
      setStatus('Location added.');
    } catch (error) {
      showError(error);
    }
  });
}

async function bootstrap() {
  cacheElements();
  bindEvents();

  setStatus('Initializing Firebase...');

  state.localContext = localData.createLocalContext(localData.LOCAL_MODE_USER);
  state.mode = 'local';
  state.dataApi = localData;
  state.dataContext = state.localContext;
  state.user = localData.LOCAL_MODE_USER;

  state.services = await getFirebaseServices();
  state.remoteAvailable = state.services.enabled;

  if (!state.remoteAvailable) {
    if (state.services.error) {
      showError(state.services.error);
    }
    await enterLocalMode(localModeStatusMessage());
    return;
  }

  await enterLocalMode(localModeStatusMessage());

  onAuthStateChanged(state.services.auth, (user) => {
    handleAuthState(user).catch(showError);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  bootstrap().catch(showError);
});
