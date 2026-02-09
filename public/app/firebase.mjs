const FIREBASE_WAIT_TIMEOUT_MS = 8000;
const FIREBASE_POLL_INTERVAL_MS = 50;
const REQUIRED_CONFIG_KEYS = ['apiKey', 'authDomain', 'projectId', 'appId'];
const REDIRECT_FALLBACK_CODES = new Set([
  'auth/popup-blocked',
  'auth/cancelled-popup-request',
  'auth/operation-not-supported-in-this-environment',
]);

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function hasRequiredConfig(config) {
  return REQUIRED_CONFIG_KEYS.every((key) => {
    const value = config?.[key];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

function readRuntimeConfig() {
  if (!window.firebaseConfig || typeof window.firebaseConfig !== 'object') {
    return null;
  }

  return { ...window.firebaseConfig };
}

function normalizeRuntimeConfig(config) {
  if (!hasRequiredConfig(config)) {
    return null;
  }

  const normalized = { ...config };
  const projectId = String(normalized.projectId ?? '').trim();
  if (projectId) {
    // Use Firebase's canonical auth handler domain to avoid custom-domain OAuth mismatches.
    normalized.authDomain = `${projectId}.firebaseapp.com`;
  }

  return normalized;
}

async function waitForFirebaseSdk(timeoutMs = FIREBASE_WAIT_TIMEOUT_MS) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const firebase = window.firebase;
    const hasSdk =
      firebase
      && typeof firebase.app === 'function'
      && typeof firebase.auth === 'function'
      && typeof firebase.firestore === 'function';

    if (hasSdk) {
      return true;
    }

    await sleep(FIREBASE_POLL_INTERVAL_MS);
  }

  return false;
}

async function ensureFirebaseApp(runtimeConfig) {
  const firebase = window.firebase;
  const firstApp = Array.isArray(firebase.apps) && firebase.apps.length ? firebase.apps[0] : null;

  if (!firstApp) {
    return firebase.initializeApp(runtimeConfig);
  }

  const currentConfig = firstApp.options && typeof firstApp.options === 'object' ? firstApp.options : {};
  const needsReinitialize =
    !hasRequiredConfig(currentConfig)
    || REQUIRED_CONFIG_KEYS.some((key) => String(currentConfig[key] ?? '') !== String(runtimeConfig[key] ?? ''));

  if (!needsReinitialize) {
    return firstApp;
  }

  await firstApp.delete();
  return firebase.initializeApp(runtimeConfig);
}

async function configureAuth(auth) {
  const persistence = window.firebase?.auth?.Auth?.Persistence?.LOCAL;
  if (!persistence) {
    return;
  }

  try {
    await auth.setPersistence(persistence);
  } catch (error) {
    console.warn('Failed to set auth persistence to LOCAL', error);
  }
}

async function configureFirestore(db) {
  if (!db || typeof db.enablePersistence !== 'function') {
    return;
  }

  try {
    await db.enablePersistence({ synchronizeTabs: true });
  } catch (error) {
    const code = error?.code ?? '';
    if (code !== 'failed-precondition' && code !== 'unimplemented') {
      console.warn('Failed to enable Firestore persistence', error);
    }
  }
}

export async function getFirebaseServices() {
  const hasSdk = await waitForFirebaseSdk();

  if (!hasSdk) {
    return {
      enabled: false,
      error: 'Firebase SDK did not initialize in time.',
    };
  }

  const rawConfig = readRuntimeConfig();
  const runtimeConfig = normalizeRuntimeConfig(rawConfig);

  if (!runtimeConfig) {
    return {
      enabled: false,
      error: `Firebase config is missing required keys: ${REQUIRED_CONFIG_KEYS.join(', ')}`,
    };
  }

  try {
    const app = await ensureFirebaseApp(runtimeConfig);
    const auth = window.firebase.auth();
    const db = window.firebase.firestore();

    await configureAuth(auth);
    await configureFirestore(db);

    return {
      enabled: true,
      app,
      auth,
      db,
    };
  } catch (error) {
    return {
      enabled: false,
      error: `Firebase initialization failed: ${error.message}`,
    };
  }
}

export function onAuthStateChanged(auth, callback) {
  return auth.onAuthStateChanged(callback);
}

export async function signInWithGoogle(auth) {
  const provider = new window.firebase.auth.GoogleAuthProvider();

  try {
    return await auth.signInWithPopup(provider);
  } catch (error) {
    if (!REDIRECT_FALLBACK_CODES.has(error?.code)) {
      throw error;
    }

    await auth.signInWithRedirect(provider);
    return null;
  }
}

export async function signOutCurrentUser(auth) {
  return auth.signOut();
}
