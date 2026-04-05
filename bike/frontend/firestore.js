// --- Firestore data layer for hosted Bikeplanner ---
// Mirrors the fetch-based API in app.js, backed by Firebase/Firestore.
// Uses Firebase compat (namespace) API loaded from CDN in index.html.

let _db = null;
let _auth = null;
let _app = null;

// Active snapshot listeners keyed by tripId
const _activeListeners = {};

// ---------------------------------------------------------------------------
// Firebase init
// ---------------------------------------------------------------------------

function initFirebase() {
    const config = window.firebaseConfig;
    if (!config || typeof config !== 'object') {
        console.error('window.firebaseConfig not set — cannot initialize Firebase');
        return;
    }
    // Re-use existing app if /__/firebase/init.js already called initializeApp
    if (firebase.apps && firebase.apps.length) {
        _app = firebase.app();
    } else {
        _app = firebase.initializeApp(config);
    }
    _db = firebase.firestore();
    _auth = firebase.auth();
    console.log('Firebase initialized for project:', config.projectId);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function _tripsCol() {
    return _db.collection('bike_trips');
}

function _tripDoc(tripId) {
    return _tripsCol().doc(tripId);
}

function _subcol(tripId, name) {
    return _tripDoc(tripId).collection(name);
}

function _serverTimestamp() {
    return firebase.firestore.FieldValue.serverTimestamp();
}

function _docToObj(doc) {
    if (!doc.exists) return null;
    const data = doc.data();
    // Convert Firestore Timestamps to ISO strings
    for (const key of Object.keys(data)) {
        if (data[key] && typeof data[key].toDate === 'function') {
            data[key] = data[key].toDate().toISOString();
        }
    }
    return { id: doc.id, ...data };
}

function _snapToList(snap) {
    const results = [];
    snap.forEach(doc => {
        results.push(_docToObj(doc));
    });
    return results;
}

// ---------------------------------------------------------------------------
// Trip CRUD
// ---------------------------------------------------------------------------

async function firestoreCreateTrip(data) {
    const now = _serverTimestamp();
    const ref = await _tripsCol().add({
        name: data.name || 'Untitled Trip',
        start_lat: data.start_lat || null,
        start_lon: data.start_lon || null,
        end_lat: data.end_lat || null,
        end_lon: data.end_lon || null,
        daily_distance_km: data.daily_distance_km || 80,
        max_elevation_m: data.max_elevation_m || null,
        surface_pref: data.surface_pref || 'any',
        route_type: data.route_type || 'bike',
        preferences: data.preferences || {},
        created_at: now,
        updated_at: now,
    });
    return { id: ref.id };
}

async function firestoreListTrips() {
    const snap = await _tripsCol().orderBy('updated_at', 'desc').get();
    return { trips: _snapToList(snap) };
}

async function firestoreGetTrip(tripId) {
    const doc = await _tripDoc(tripId).get();
    if (!doc.exists) {
        throw new Error(`Trip ${tripId} not found`);
    }
    return _docToObj(doc);
}

async function firestoreUpdateTrip(tripId, data) {
    const updates = { ...data, updated_at: _serverTimestamp() };
    await _tripDoc(tripId).update(updates);
    // Return the merged result
    const doc = await _tripDoc(tripId).get();
    return _docToObj(doc);
}

async function firestoreDeleteTrip(tripId) {
    // Clean up listeners first
    _detachListeners(tripId);
    // Delete subcollections (Firestore doesn't cascade)
    await _deleteSubcollection(tripId, 'waypoints');
    await _deleteSubcollection(tripId, 'pois');
    await _deleteSubcollection(tripId, 'gpxOverlays');
    await _deleteSubcollection(tripId, 'dayOverrides');
    await _deleteItineraries(tripId);
    await _tripDoc(tripId).delete();
}

async function firestoreDeleteAllTrips() {
    const snap = await _tripsCol().get();
    const deletes = [];
    snap.forEach(doc => {
        deletes.push(firestoreDeleteTrip(doc.id));
    });
    await Promise.all(deletes);
}

// Delete all docs in a simple subcollection
async function _deleteSubcollection(tripId, subName) {
    const snap = await _subcol(tripId, subName).get();
    const batch = _db.batch();
    snap.forEach(doc => batch.delete(doc.ref));
    if (!snap.empty) await batch.commit();
}

// Delete itineraries and their nested days subcollection
async function _deleteItineraries(tripId) {
    const itinSnap = await _subcol(tripId, 'itineraries').get();
    for (const itinDoc of itinSnap.docs) {
        const daysSnap = await itinDoc.ref.collection('days').get();
        const batch = _db.batch();
        daysSnap.forEach(d => batch.delete(d.ref));
        if (!daysSnap.empty) await batch.commit();
        await itinDoc.ref.delete();
    }
}

// ---------------------------------------------------------------------------
// Waypoints (subcollection)
// ---------------------------------------------------------------------------

async function firestoreAddWaypoint(tripId, data) {
    const ref = await _subcol(tripId, 'waypoints').add({
        lat: data.lat,
        lon: data.lon,
        label: data.label || '',
        sort_order: data.sort_order || 0,
        waypoint_type: data.waypoint_type || 'via',
        overnight_stop_id: data.overnight_stop_id || null,
        created_at: _serverTimestamp(),
    });
    // Touch parent trip updated_at
    await _tripDoc(tripId).update({ updated_at: _serverTimestamp() });
    return { id: ref.id };
}

async function firestoreListWaypoints(tripId) {
    const snap = await _subcol(tripId, 'waypoints')
        .orderBy('sort_order', 'asc')
        .get();
    return { waypoints: _snapToList(snap) };
}

async function firestoreDeleteWaypoint(tripId, waypointId) {
    await _subcol(tripId, 'waypoints').doc(waypointId).delete();
    await _tripDoc(tripId).update({ updated_at: _serverTimestamp() });
}

// ---------------------------------------------------------------------------
// Trip POIs (subcollection)
// ---------------------------------------------------------------------------

async function firestoreAddTripPoi(tripId, data) {
    const ref = await _subcol(tripId, 'pois').add({
        ...data,
        created_at: _serverTimestamp(),
    });
    return { id: ref.id };
}

async function firestoreListTripPois(tripId) {
    const snap = await _subcol(tripId, 'pois').get();
    return { pois: _snapToList(snap) };
}

async function firestoreDeleteTripPoi(tripId, poiId) {
    await _subcol(tripId, 'pois').doc(poiId).delete();
}

// ---------------------------------------------------------------------------
// GPX Overlays (subcollection)
// ---------------------------------------------------------------------------

async function firestoreAddGpxOverlay(tripId, data) {
    const ref = await _subcol(tripId, 'gpxOverlays').add({
        ...data,
        created_at: _serverTimestamp(),
    });
    return { id: ref.id };
}

async function firestoreListGpxOverlays(tripId) {
    const snap = await _subcol(tripId, 'gpxOverlays').get();
    return { overlays: _snapToList(snap) };
}

async function firestoreDeleteGpxOverlay(tripId, overlayId) {
    await _subcol(tripId, 'gpxOverlays').doc(overlayId).delete();
}

// ---------------------------------------------------------------------------
// Day Overrides (subcollection — doc ID = day number string)
// ---------------------------------------------------------------------------

async function firestoreSetDayOverride(tripId, dayNumber, data) {
    const docId = String(dayNumber);
    await _subcol(tripId, 'dayOverrides').doc(docId).set({
        day_number: dayNumber,
        ...data,
        updated_at: _serverTimestamp(),
    }, { merge: true });
    return { id: docId };
}

async function firestoreListDayOverrides(tripId) {
    const snap = await _subcol(tripId, 'dayOverrides')
        .orderBy('day_number', 'asc')
        .get();
    return { overrides: _snapToList(snap) };
}

async function firestoreDeleteDayOverride(tripId, dayNumber) {
    const docId = String(dayNumber);
    await _subcol(tripId, 'dayOverrides').doc(docId).delete();
}

// ---------------------------------------------------------------------------
// Real-time listeners
// ---------------------------------------------------------------------------

function subscribeToTrip(tripId, callbacks) {
    // Detach any existing listeners for this trip
    _detachListeners(tripId);

    const unsubs = [];

    // Listen to the trip document itself
    if (callbacks.onTripUpdate) {
        const unsub = _tripDoc(tripId).onSnapshot(doc => {
            if (doc.exists) {
                callbacks.onTripUpdate(_docToObj(doc));
            }
        }, err => {
            console.warn('Trip snapshot error:', err);
        });
        unsubs.push(unsub);
    }

    // Listen to waypoints subcollection
    if (callbacks.onWaypointsUpdate) {
        const unsub = _subcol(tripId, 'waypoints')
            .orderBy('sort_order', 'asc')
            .onSnapshot(snap => {
                callbacks.onWaypointsUpdate(_snapToList(snap));
            }, err => {
                console.warn('Waypoints snapshot error:', err);
            });
        unsubs.push(unsub);
    }

    // Listen to itineraries subcollection
    if (callbacks.onItinerariesUpdate) {
        const unsub = _subcol(tripId, 'itineraries')
            .onSnapshot(snap => {
                callbacks.onItinerariesUpdate(_snapToList(snap));
            }, err => {
                console.warn('Itineraries snapshot error:', err);
            });
        unsubs.push(unsub);
    }

    // Store for cleanup
    _activeListeners[tripId] = unsubs;

    // Return a single unsubscribe function that detaches all
    return function unsubscribe() {
        _detachListeners(tripId);
    };
}

function _detachListeners(tripId) {
    const unsubs = _activeListeners[tripId];
    if (unsubs) {
        unsubs.forEach(fn => fn());
        delete _activeListeners[tripId];
    }
}

// ---------------------------------------------------------------------------
// Export to window
// ---------------------------------------------------------------------------

window.firestoreLayer = {
    initFirebase,
    // Trip CRUD
    firestoreCreateTrip,
    firestoreListTrips,
    firestoreGetTrip,
    firestoreUpdateTrip,
    firestoreDeleteTrip,
    firestoreDeleteAllTrips,
    // Waypoints
    firestoreAddWaypoint,
    firestoreListWaypoints,
    firestoreDeleteWaypoint,
    // Trip POIs
    firestoreAddTripPoi,
    firestoreListTripPois,
    firestoreDeleteTripPoi,
    // GPX Overlays
    firestoreAddGpxOverlay,
    firestoreListGpxOverlays,
    firestoreDeleteGpxOverlay,
    // Day Overrides
    firestoreSetDayOverride,
    firestoreListDayOverrides,
    firestoreDeleteDayOverride,
    // Real-time
    subscribeToTrip,
};
