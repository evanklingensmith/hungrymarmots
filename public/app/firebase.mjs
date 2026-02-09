const FIREBASE_WAIT_TIMEOUT_MS = 8000;
const FIREBASE_POLL_INTERVAL_MS = 50;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForFirebase(timeoutMs = FIREBASE_WAIT_TIMEOUT_MS) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const firebase = window.firebase;
    if (firebase && Array.isArray(firebase.apps) && firebase.apps.length > 0) {
      return true;
    }

    await sleep(FIREBASE_POLL_INTERVAL_MS);
  }

  return false;
}

export async function getFirebaseServices() {
  const isReady = await waitForFirebase();

  if (!isReady) {
    return {
      enabled: false,
      error: 'Firebase SDK did not initialize in time.',
    };
  }

  try {
    const app = window.firebase.app();
    return {
      enabled: true,
      app,
      auth: window.firebase.auth(),
      db: window.firebase.firestore(),
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
  return auth.signInWithPopup(provider);
}

export async function signOutCurrentUser(auth) {
  return auth.signOut();
}
