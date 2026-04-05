// --- Auth-aware fetch wrapper for hosted mode ---
async function apiFetch(url, options) {
    options = options || {};
    if (window.BIKEPLANNER_CONFIG && window.BIKEPLANNER_CONFIG.mode === 'hosted' && typeof getAuthHeaders === 'function') {
        const authHeaders = await getAuthHeaders();
        options.headers = Object.assign({}, options.headers || {}, authHeaders);
    }
    return fetch(url, options);
}

// --- Trip persistence ---
const TRIP_STORAGE_KEY = 'bikeplanner-trip-id';

function persistTripId(id) {
    if (id) {
        localStorage.setItem(TRIP_STORAGE_KEY, id);
    } else {
        localStorage.removeItem(TRIP_STORAGE_KEY);
    }
}

function updateTripNameDisplay(name) {
    const el = document.getElementById('trip-name');
    if (el) el.textContent = name || 'No trip loaded';
}

function setupTripNameEditing() {
    const nameEl = document.getElementById('trip-name');
    if (!nameEl) return;

    nameEl.addEventListener('click', () => {
        if (!state.tripId) return;
        const current = nameEl.textContent;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'trip-name-input';
        input.value = current;
        nameEl.replaceWith(input);
        input.focus();
        input.select();

        const save = async () => {
            const newName = input.value.trim() || current;
            const span = document.createElement('span');
            span.id = 'trip-name';
            span.title = 'Click to rename';
            span.textContent = newName;
            input.replaceWith(span);
            setupTripNameEditing();

            if (newName !== current && state.tripId) {
                try {
                    await apiFetch(`/api/trips/${state.tripId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: newName }),
                    });
                } catch (err) {
                    console.warn('Failed to rename trip:', err);
                }
            }
        };

        input.addEventListener('blur', save);
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
            if (e.key === 'Escape') {
                input.value = current;
                input.blur();
            }
        });
    });
}

async function fetchTrips() {
    try {
        const resp = await apiFetch('/api/trips');
        if (!resp.ok) return [];
        const data = await resp.json();
        return data.trips || [];
    } catch (err) {
        console.warn('Failed to fetch trips:', err);
        return [];
    }
}

function renderTripList(trips) {
    const container = document.getElementById('trip-list');
    if (!container) return;
    container.innerHTML = '';

    if (trips.length === 0) {
        container.innerHTML = '<div style="font-size:12px;color:#707090;padding:8px 0;">No saved trips</div>';
        return;
    }

    trips.forEach(trip => {
        const item = document.createElement('div');
        item.className = 'trip-item' + (trip.id === state.tripId ? ' active' : '');

        const date = trip.created_at ? new Date(trip.created_at).toLocaleDateString() : '';

        item.innerHTML = `
            <div class="trip-item-info">
                <div class="trip-item-name">${trip.name || 'Untitled Trip'}</div>
                <div class="trip-item-date">${date}</div>
            </div>
        `;

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'trip-item-delete';
        deleteBtn.innerHTML = '&times;';
        deleteBtn.title = 'Delete trip';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteTrip(trip.id);
        });
        item.appendChild(deleteBtn);

        item.addEventListener('click', () => loadTrip(trip.id));
        container.appendChild(item);
    });
}

async function deleteAllTrips() {
    if (!confirm('Delete ALL trips? This cannot be undone.')) return;
    try {
        await apiFetch('/api/trips', { method: 'DELETE' });
        newTrip();
        const trips = await fetchTrips();
        renderTripList(trips);
    } catch (err) {
        console.warn('Failed to delete all trips:', err);
    }
}

async function toggleTripPanel() {
    const panel = document.getElementById('trip-panel');
    if (!panel) return;
    const isOpen = panel.style.display !== 'none';
    if (isOpen) {
        panel.style.display = 'none';
    } else {
        panel.style.display = 'block';
        const trips = await fetchTrips();
        renderTripList(trips);
    }
}

async function loadTrip(tripId) {
    setStatus('Loading trip...');
    try {
        const resp = await apiFetch(`/api/trips/${tripId}`);
        if (!resp.ok) {
            setStatus('Trip not found');
            persistTripId(null);
            return;
        }
        const trip = await resp.json();

        clearAll();
        state.tripId = tripId;
        persistTripId(tripId);

        // Restore start/end markers
        if (trip.start_lat != null && trip.start_lon != null) {
            setStart([trip.start_lon, trip.start_lat]);
        }
        if (trip.end_lat != null && trip.end_lon != null) {
            setEnd([trip.end_lon, trip.end_lat]);
        }

        // Restore via-points
        try {
            const wpResp = await apiFetch(`/api/trips/${tripId}/waypoints`);
            if (wpResp.ok) {
                const wpData = await wpResp.json();
                (wpData.waypoints || [])
                    .filter(wp => wp.waypoint_type === 'via')
                    .sort((a, b) => a.sort_order - b.sort_order)
                    .forEach(wp => addViaPoint([wp.lon, wp.lat], wp.id));
            }
        } catch (err) {
            console.warn('Failed to load waypoints:', err);
        }

        // Set click mode since start is already set
        if (trip.start_lat != null) {
            state.clickMode = 'waypoint';
            updateClickHint();
        }

        // Restore itinerary params (convert from metric to current display units)
        if (trip.daily_distance_km != null) {
            const val = getUnit() === 'imperial' ? Math.round(trip.daily_distance_km * KM_TO_MI) : Math.round(trip.daily_distance_km);
            document.getElementById('daily-distance').value = val;
        }
        if (trip.max_elevation_m != null) {
            const val = getUnit() === 'imperial' ? Math.round(trip.max_elevation_m * M_TO_FT) : Math.round(trip.max_elevation_m);
            document.getElementById('max-elevation').value = val;
        }
        if (trip.surface_pref) {
            document.getElementById('surface-pref').value = trip.surface_pref;
        }

        updateTripNameDisplay(trip.name);

        // Load itinerary if exists
        try {
            const itinListResp = await apiFetch(`/api/trips/${tripId}/itineraries`);
            if (itinListResp.ok) {
                const itinList = await itinListResp.json();
                const itineraries = itinList.itineraries || [];
                if (itineraries.length > 0) {
                    const latestItin = itineraries[0];
                    const itinResp = await apiFetch(`/api/trips/${tripId}/itineraries/${latestItin.id}`);
                    if (itinResp.ok) {
                        const itin = await itinResp.json();

                        // Restore route from itinerary's route_geojson
                        if (itin.route_geojson) {
                            const routeGeoJson = typeof itin.route_geojson === 'string'
                                ? JSON.parse(itin.route_geojson) : itin.route_geojson;
                            state.routeData = routeGeoJson;
                            displayRoute(routeGeoJson);
                        }

                        // Restore itinerary display
                        if (itin.days && itin.days.length > 0) {
                            const itinData = {
                                id: itin.id,
                                total_distance_km: itin.total_distance_km,
                                total_elevation_gain_m: itin.total_elevation_m || itin.total_elevation_gain_m,
                                num_days: itin.num_days || itin.days.length,
                                days: itin.days.map(d => ({
                                    ...d,
                                    segment_coords: d.segment_geojson
                                        ? (typeof d.segment_geojson === 'string'
                                            ? JSON.parse(d.segment_geojson) : d.segment_geojson)
                                        : (d.segment_coords || []),
                                })),
                            };
                            state.itinerary = itinData;
                            displayItinerary(itinData);
                        }
                    }
                }
            }
        } catch (err) {
            console.warn('Failed to load itinerary:', err);
        }

        // Load chat history
        document.getElementById('chat-panel').style.display = 'block';
        if (typeof loadChatHistory === 'function') loadChatHistory(tripId);

        // Load GPX overlays
        document.getElementById('gpx-overlay-section').style.display = 'block';
        await loadGpxOverlays(tripId);

        // Close trip panel
        const panel = document.getElementById('trip-panel');
        if (panel) panel.style.display = 'none';

        setStatus('Trip loaded');
    } catch (err) {
        setStatus(`Error loading trip: ${err.message}`);
    }
}

async function deleteTrip(tripId) {
    if (!confirm('Delete this trip?')) return;
    try {
        await apiFetch(`/api/trips/${tripId}`, { method: 'DELETE' });
        if (tripId === state.tripId) {
            newTrip();
        }
        // Refresh list
        const trips = await fetchTrips();
        renderTripList(trips);
    } catch (err) {
        console.warn('Failed to delete trip:', err);
    }
}

function newTrip() {
    clearAll();
    persistTripId(null);
    updateTripNameDisplay('No trip loaded');
}

// --- Constants ---
const DAY_COLORS = [
    '#e94560', '#4caf50', '#2196f3', '#ff9800', '#9c27b0',
    '#00bcd4', '#ff5722', '#8bc34a', '#3f51b5', '#ffc107',
];

// --- Units ---
const KM_TO_MI = 0.621371;
const M_TO_FT = 3.28084;

function getUnit() {
    return state.units; // 'metric' or 'imperial'
}

function fmtDist(km) {
    if (getUnit() === 'imperial') return (km * KM_TO_MI).toFixed(1);
    return parseFloat(km).toFixed(1);
}

function fmtElev(m) {
    if (getUnit() === 'imperial') return Math.round(m * M_TO_FT);
    return Math.round(m);
}

function distLabel() { return getUnit() === 'imperial' ? 'mi' : 'km'; }
function elevLabel() { return getUnit() === 'imperial' ? 'ft' : 'm'; }

// --- State ---
const state = {
    start: null,       // [lon, lat]
    end: null,         // [lon, lat]
    markers: [],
    routeData: null,
    elevChart: null,
    clickMode: 'start', // 'start' | 'waypoint'
    waypoints: [],      // [{id: null|string, coord: [lon,lat], marker: Marker}, ...]
    tripId: null,
    itinerary: null,
    dayLayers: [],
    units: localStorage.getItem('bikeplanner-units') || 'metric',
    gpxOverlays: [],
    overnightStops: [],
    overnightFilters: {
        types: [],
        bikeFriendlyOnly: false,
        maxPriceBand: null,
    },
    splitMarkers: [],
};

// --- Map init ---
const map = new maplibregl.Map({
    container: 'map',
    style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [-3.7, 52.3],  // Wales center
    zoom: 8,
});

map.addControl(new maplibregl.NavigationControl(), 'top-right');
map.addControl(new maplibregl.ScaleControl(), 'bottom-right');

// --- Hosted mode: init Firebase + auth gate ---
if (window.BIKEPLANNER_CONFIG && window.BIKEPLANNER_CONFIG.mode === 'hosted') {
    if (window.firestoreLayer) window.firestoreLayer.initFirebase();
    if (window.initAuth) window.initAuth();
}

// --- Map sources and layers (added after load) ---
map.on('load', () => {
    // Route line source
    map.addSource('route', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
    });

    map.addLayer({
        id: 'route-line',
        type: 'line',
        source: 'route',
        layout: { 'line-join': 'round', 'line-cap': 'round' },
        paint: {
            'line-color': '#e94560',
            'line-width': 4,
            'line-opacity': 0.85,
        },
    });

    // POI source
    map.addSource('pois', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
    });

    map.addLayer({
        id: 'poi-markers',
        type: 'circle',
        source: 'pois',
        paint: {
            'circle-radius': 5,
            'circle-color': '#ffb74d',
            'circle-stroke-width': 1,
            'circle-stroke-color': '#fff',
        },
    });

    // Overnight stops source
    map.addSource('overnight', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: [] },
    });

    map.addLayer({
        id: 'overnight-markers',
        type: 'circle',
        source: 'overnight',
        paint: {
            'circle-radius': 6,
            'circle-color': [
                'match', ['get', 'type'],
                'hotel', '#e91e63',
                'bnb', '#ff5722',
                'guesthouse', '#ff9800',
                'self_catering', '#ff9800',
                'hostel', '#2196f3',
                'campground', '#4caf50',
                'dispersed', '#8bc34a',
                'bunkhouse', '#9c27b0',
                '#9e9e9e',
            ],
            'circle-stroke-width': 1,
            'circle-stroke-color': '#fff',
        },
    });

    checkBRouterStatus();

    // Check for /trip/{id} URL (shared trip link)
    const tripUrlMatch = window.location.pathname.match(/^\/trip\/([a-zA-Z0-9_\-]+)/);
    if (tripUrlMatch) {
        const sharedTripId = tripUrlMatch[1];
        const isHosted = window.BIKEPLANNER_CONFIG && window.BIKEPLANNER_CONFIG.mode === 'hosted';
        if (isHosted && typeof showTripPasswordPrompt === 'function') {
            // Show trip password prompt — no site password needed
            showTripPasswordPrompt(sharedTripId).then(() => loadTrip(sharedTripId));
        } else {
            loadTrip(sharedTripId);
        }
    } else {
        // Auto-restore saved trip
        const savedTripId = localStorage.getItem(TRIP_STORAGE_KEY);
        if (savedTripId) loadTrip(savedTripId);
    }

    // Show share button in hosted mode
    if (window.BIKEPLANNER_CONFIG && window.BIKEPLANNER_CONFIG.mode === 'hosted') {
        const shareBtn = document.getElementById('share-trip-btn');
        if (shareBtn) shareBtn.style.display = '';
    }

    // Signal that map is fully loaded (used by E2E tests)
    document.body.dataset.mapReady = 'true';
});

// --- Map click handler ---
map.on('click', (e) => {
    const { lng, lat } = e.lngLat;
    const coord = [parseFloat(lng.toFixed(6)), parseFloat(lat.toFixed(6))];

    if (state.clickMode === 'start') {
        setStart(coord);
        state.clickMode = 'waypoint';
        updateClickHint();
    } else if (state.clickMode === 'waypoint') {
        if (e.originalEvent.shiftKey) {
            setEnd(coord);
            state.clickMode = 'start';
            updateClickHint();
        } else {
            addViaPoint(coord);
        }
    }
});

// --- POI popup on click ---
map.on('click', 'poi-markers', (e) => {
    const f = e.features[0];
    new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(`<strong>${f.properties.name || 'POI'}</strong><br>${f.properties.category || ''}`)
        .addTo(map);
});

map.on('click', 'overnight-markers', (e) => {
    const f = e.features[0];
    const props = f.properties;
    let raw = {};
    try { raw = typeof props.raw_data === 'string' ? JSON.parse(props.raw_data) : (props.raw_data || {}); } catch (err) { /* ignore */ }

    let html = `<strong>${props.name || 'Overnight'}</strong>`;
    if (raw.subtype) html += `<br><em>${raw.subtype}</em>`;
    if (raw.town) html += ` in ${raw.town}`;
    else if (props.type) html += `<br>${props.type}`;
    if (props.cost_free) html += '<br>Free';
    else if (props.cost_amount) html += `<br>${props.cost_currency || 'GBP'} ${props.cost_amount}`;
    if (raw.bike_friendly) html += '<br>Bike-friendly';
    if (props.url) html += `<br><a href="${props.url}" target="_blank" rel="noopener" style="color:#4caf50;">Book / Details</a>`;
    new maplibregl.Popup().setLngLat(e.lngLat).setHTML(html).addTo(map);
});

// Cursor changes
map.on('mouseenter', 'poi-markers', () => map.getCanvas().style.cursor = 'pointer');
map.on('mouseleave', 'poi-markers', () => map.getCanvas().style.cursor = '');
map.on('mouseenter', 'overnight-markers', () => map.getCanvas().style.cursor = 'pointer');
map.on('mouseleave', 'overnight-markers', () => map.getCanvas().style.cursor = '');

// --- Marker management ---
function clearMarkers() {
    state.markers.forEach(m => m.remove());
    state.markers = [];
}

function addMarker(coord, className) {
    const el = document.createElement('div');
    el.className = className;
    const marker = new maplibregl.Marker({ element: el, draggable: true })
        .setLngLat(coord)
        .addTo(map);

    marker.on('dragend', () => {
        const lngLat = marker.getLngLat();
        const newCoord = [parseFloat(lngLat.lng.toFixed(6)), parseFloat(lngLat.lat.toFixed(6))];
        if (className === 'marker-start') {
            state.start = newCoord;
            document.getElementById('start-input').value = `${newCoord[1]}, ${newCoord[0]}`;
        } else {
            state.end = newCoord;
            document.getElementById('end-input').value = `${newCoord[1]}, ${newCoord[0]}`;
        }
        updateRouteButton();
    });

    state.markers.push(marker);
    return marker;
}

function setStart(coord) {
    state.start = coord;
    // Remove old start marker
    const oldStart = state.markers.find((_, i) => i === 0);
    if (oldStart) { oldStart.remove(); state.markers.splice(0, 1); }
    const m = addMarker(coord, 'marker-start');
    // Ensure start marker is at index 0
    state.markers.splice(state.markers.indexOf(m), 1);
    state.markers.unshift(m);
    document.getElementById('start-input').value = `${coord[1]}, ${coord[0]}`;
    updateRouteButton();
}

function setEnd(coord) {
    state.end = coord;
    // Remove old end marker if exists
    if (state.markers.length > 1) {
        state.markers[1].remove();
        state.markers.splice(1, 1);
    }
    addMarker(coord, 'marker-end');
    document.getElementById('end-input').value = `${coord[1]}, ${coord[0]}`;
    updateRouteButton();
}

function updateRouteButton() {
    document.getElementById('route-btn').disabled = !(state.start && state.end);
}

// --- Via-point management ---
function addViaPoint(coord, dbId = null) {
    const index = state.waypoints.length;

    const el = document.createElement('div');
    el.className = 'marker-via';
    el.textContent = index + 1;

    const marker = new maplibregl.Marker({ element: el, draggable: true })
        .setLngLat(coord)
        .addTo(map);

    const entry = { id: dbId, coord: coord, marker: marker };
    state.waypoints.push(entry);

    // Right-click to delete
    el.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const idx = state.waypoints.indexOf(entry);
        if (idx !== -1) removeViaPoint(idx);
    });

    // Drag-end: update coord and sync
    marker.on('dragend', () => {
        const lngLat = marker.getLngLat();
        entry.coord = [parseFloat(lngLat.lng.toFixed(6)), parseFloat(lngLat.lat.toFixed(6))];
        updateWaypointList();
        if (state.tripId) syncAllWaypoints();
    });

    updateWaypointList();
    updateRouteButton();
}

function removeViaPoint(index) {
    const entry = state.waypoints[index];
    if (!entry) return;

    entry.marker.remove();

    // Delete from DB if saved
    if (state.tripId && entry.id) {
        apiFetch(`/api/trips/${state.tripId}/waypoints/${entry.id}`, { method: 'DELETE' })
            .catch(err => console.warn('Failed to delete waypoint:', err));
    }

    state.waypoints.splice(index, 1);
    renumberViaPoints();
    updateWaypointList();
}

function renumberViaPoints() {
    state.waypoints.forEach((wp, i) => {
        wp.marker.getElement().textContent = i + 1;
    });
}

function reorderViaPoint(fromIndex, toIndex) {
    const [moved] = state.waypoints.splice(fromIndex, 1);
    state.waypoints.splice(toIndex, 0, moved);
    renumberViaPoints();
    updateWaypointList();
    if (state.tripId) syncAllWaypoints();
}

function clearViaPoints() {
    state.waypoints.forEach(wp => wp.marker.remove());
    state.waypoints = [];
    updateWaypointList();
}

function updateWaypointList() {
    const section = document.getElementById('via-points-section');
    const list = document.getElementById('via-list');
    const count = document.getElementById('via-count');
    if (!section || !list) return;

    count.textContent = `(${state.waypoints.length})`;

    if (state.waypoints.length === 0) {
        section.style.display = 'none';
        list.innerHTML = '';
        return;
    }

    section.style.display = 'block';
    list.innerHTML = '';

    state.waypoints.forEach((wp, i) => {
        const item = document.createElement('div');
        item.className = 'via-item';
        item.draggable = true;
        item.dataset.index = i;
        item.innerHTML = `
            <span class="via-drag-handle" title="Drag to reorder">&#8942;</span>
            <span class="via-number">${i + 1}</span>
            <span class="via-coord">${wp.coord[1].toFixed(4)}, ${wp.coord[0].toFixed(4)}</span>
        `;
        const delBtn = document.createElement('button');
        delBtn.className = 'via-delete';
        delBtn.innerHTML = '&times;';
        delBtn.title = 'Remove via-point';
        delBtn.addEventListener('click', () => removeViaPoint(i));
        item.appendChild(delBtn);

        item.addEventListener('dragstart', (e) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', String(i));
            item.classList.add('via-dragging');
        });
        item.addEventListener('dragend', () => {
            item.classList.remove('via-dragging');
            list.querySelectorAll('.via-item').forEach(el => el.classList.remove('via-drag-over'));
        });
        item.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            item.classList.add('via-drag-over');
        });
        item.addEventListener('dragleave', () => {
            item.classList.remove('via-drag-over');
        });
        item.addEventListener('drop', (e) => {
            e.preventDefault();
            item.classList.remove('via-drag-over');
            const fromIndex = parseInt(e.dataTransfer.getData('text/plain'));
            const toIndex = parseInt(item.dataset.index);
            if (fromIndex !== toIndex) reorderViaPoint(fromIndex, toIndex);
        });

        list.appendChild(item);
    });
}

function updateClickHint() {
    const hint = document.getElementById('click-hint');
    if (!hint) return;
    if (state.clickMode === 'waypoint') {
        hint.textContent = 'Click to add via-points. Shift+click to set endpoint.';
    } else {
        hint.textContent = 'Click the map to set start and end points, or enter coordinates.';
    }
}

async function saveWaypointsToTrip() {
    if (!state.tripId) return;
    for (let i = 0; i < state.waypoints.length; i++) {
        const wp = state.waypoints[i];
        if (wp.id) continue;
        try {
            const resp = await apiFetch(`/api/trips/${state.tripId}/waypoints`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lat: wp.coord[1],
                    lon: wp.coord[0],
                    label: `Via ${i + 1}`,
                    sort_order: i,
                    waypoint_type: 'via',
                }),
            });
            if (resp.ok) {
                const data = await resp.json();
                wp.id = data.id;
            }
        } catch (err) {
            console.warn('Failed to save waypoint:', err);
        }
    }
}

async function syncAllWaypoints() {
    if (!state.tripId) return;
    try {
        // Fetch existing waypoints and delete them
        const resp = await apiFetch(`/api/trips/${state.tripId}/waypoints`);
        if (resp.ok) {
            const data = await resp.json();
            const existing = (data.waypoints || []).filter(wp => wp.waypoint_type === 'via');
            await Promise.all(existing.map(wp =>
                apiFetch(`/api/trips/${state.tripId}/waypoints/${wp.id}`, { method: 'DELETE' })
            ));
        }
        // Re-create all with current positions/order
        for (let i = 0; i < state.waypoints.length; i++) {
            const wp = state.waypoints[i];
            const createResp = await apiFetch(`/api/trips/${state.tripId}/waypoints`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    lat: wp.coord[1],
                    lon: wp.coord[0],
                    label: `Via ${i + 1}`,
                    sort_order: i,
                    waypoint_type: 'via',
                }),
            });
            if (createResp.ok) {
                const d = await createResp.json();
                wp.id = d.id;
            }
        }
    } catch (err) {
        console.warn('Failed to sync waypoints:', err);
    }
}

function removeSplitMarkers() {
    state.splitMarkers.forEach(m => m.remove());
    state.splitMarkers = [];
}

function clearItinerary() {
    state.itinerary = null;
    state.dayLayers.forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
    });
    state.dayLayers = [];
    removeSplitMarkers();
    if (map.getLayer('route-line')) {
        map.setLayoutProperty('route-line', 'visibility', 'visible');
    }
    document.getElementById('itinerary-days').innerHTML = '';
    document.getElementById('itinerary-summary').innerHTML = '';
    document.getElementById('day-split-timeline').innerHTML = '';
    document.getElementById('gradient-legend').style.display = 'none';
    hideElevationTimeline();
    state._timelineData = null;
}

async function updateTripEndpoints() {
    if (!state.tripId || !state.start || !state.end) return;
    try {
        await apiFetch(`/api/trips/${state.tripId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                start_lat: state.start[1],
                start_lon: state.start[0],
                end_lat: state.end[1],
                end_lon: state.end[0],
            }),
        });
    } catch (err) {
        console.warn('Failed to update trip endpoints:', err);
    }
}

// --- Routing ---
async function calculateRoute() {
    if (!state.start || !state.end) return;

    setStatus('Calculating route...');
    const profile = document.getElementById('surface-pref').value;

    try {
        const allWaypoints = [
            state.start,
            ...state.waypoints.map(wp => wp.coord),
            state.end,
        ];

        const resp = await apiFetch('/api/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                waypoints: allWaypoints,
                profile,
            }),
        });

        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.detail || 'Route calculation failed');
        }

        const data = await resp.json();
        state.routeData = data;

        // Clear old itinerary when recalculating
        clearItinerary();

        displayRoute(data);

        if (state.tripId) {
            // Update existing trip endpoints and sync waypoints
            await updateTripEndpoints();
            await syncAllWaypoints();
        } else {
            // First route — create a new trip
            await createTrip();
        }

        if (data.fallback) {
            setStatus('Route estimated (straight line). Start BRouter for bike routing.');
        } else {
            setStatus('Route calculated');
        }
    } catch (err) {
        setStatus(`Error: ${err.message}`);
    }
}

function displayRoute(geojson) {
    // Update route line style based on fallback
    map.setPaintProperty('route-line', 'line-dasharray', geojson.fallback ? [2, 4] : [1, 0]);
    map.setPaintProperty('route-line', 'line-color', geojson.fallback ? '#888888' : '#e94560');
    map.getSource('route').setData(geojson);

    // Fit map to route bounds
    const coords = [];
    if (geojson.features) {
        geojson.features.forEach(f => {
            if (f.geometry.type === 'LineString') {
                coords.push(...f.geometry.coordinates);
            }
        });
    }

    if (coords.length > 0) {
        const bounds = coords.reduce(
            (b, c) => b.extend(c),
            new maplibregl.LngLatBounds(coords[0], coords[0])
        );
        map.fitBounds(bounds, { padding: 60 });
    }

    // Show route stats
    const props = geojson.features?.[0]?.properties || {};
    const distanceKm = props['track-length'] ? parseFloat(props['track-length']) / 1000 : null;
    const totalTime = props['total-time'] ? (parseFloat(props['total-time']) / 3600).toFixed(1) : '?';
    const ascendM = props['filtered ascend'] ? parseFloat(props['filtered ascend']) : null;

    let statsHtml = '';
    if (geojson.fallback) {
        statsHtml += '<div class="fallback-warning">Straight-line estimate. Start BRouter for actual bike routing.</div>';
    }
    statsHtml += `
        <div>Distance: <span class="stat-value">${distanceKm !== null ? fmtDist(distanceKm) : '?'} ${distLabel()}</span></div>
        <div>Elevation gain: <span class="stat-value">${ascendM !== null ? fmtElev(ascendM) : '?'} ${elevLabel()}</span></div>
        <div>Est. time: <span class="stat-value">${totalTime} hrs</span></div>
    `;
    document.getElementById('route-stats').innerHTML = statsHtml;
    document.getElementById('route-info').style.display = 'block';

    // Show itinerary panel
    document.getElementById('itinerary-panel').style.display = 'block';

    // Build elevation chart from route coordinates
    if (geojson.features?.[0]?.geometry?.coordinates) {
        const routeCoords = geojson.features[0].geometry.coordinates;
        // BRouter GeoJSON includes elevation as 3rd coordinate
        if (routeCoords[0]?.length >= 3) {
            buildElevationChart(routeCoords);
        }
    }

    // Fetch POIs and overnight stops along route
    fetchNearbyData();
}

function buildElevationChart(coords) {
    const canvas = document.getElementById('elevation-chart');
    const imperial = getUnit() === 'imperial';
    let cumulDist = 0;
    const data = [{ x: 0, y: imperial ? coords[0][2] * M_TO_FT : coords[0][2] }];

    for (let i = 1; i < coords.length; i++) {
        const [lon1, lat1] = coords[i - 1];
        const [lon2, lat2] = coords[i];
        const d = haversineKm(lat1, lon1, lat2, lon2);
        cumulDist += d;
        // Sample every ~500m to keep chart snappy
        if (i % 10 === 0 || i === coords.length - 1) {
            const xVal = imperial ? cumulDist * KM_TO_MI : cumulDist;
            const yVal = imperial ? coords[i][2] * M_TO_FT : coords[i][2];
            data.push({ x: parseFloat(xVal.toFixed(2)), y: yVal });
        }
    }

    if (state.elevChart) state.elevChart.destroy();

    state.elevChart = new Chart(canvas, {
        type: 'line',
        data: {
            datasets: [{
                data,
                borderColor: '#e94560',
                backgroundColor: 'rgba(233, 69, 96, 0.15)',
                fill: true,
                pointRadius: 0,
                borderWidth: 1.5,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    type: 'linear',
                    title: { display: true, text: distLabel(), color: '#707090', font: { size: 10 } },
                    ticks: { color: '#707090', font: { size: 10 } },
                    grid: { color: '#0f3460' },
                },
                y: {
                    title: { display: true, text: elevLabel(), color: '#707090', font: { size: 10 } },
                    ticks: { color: '#707090', font: { size: 10 } },
                    grid: { color: '#0f3460' },
                },
            },
        },
    });
}

// --- Overnight filtering ---
const TYPE_LABELS = {
    hotel: 'Hotel', bnb: 'B&B', guesthouse: 'Guesthouse', self_catering: 'Self Catering',
    hostel: 'Hostel', campground: 'Campsite', dispersed: 'Wild Camp', bunkhouse: 'Bunkhouse',
    bothy: 'Bothy', shelter: 'Shelter',
};

function applyOvernightFilters() {
    let stops = state.overnightStops;
    const f = state.overnightFilters;

    if (f.types.length > 0) {
        stops = stops.filter(s => f.types.includes(s.type));
    }
    if (f.bikeFriendlyOnly) {
        stops = stops.filter(s => {
            const raw = typeof s.raw_data === 'string' ? JSON.parse(s.raw_data) : (s.raw_data || {});
            return raw && raw.bike_friendly === true;
        });
    }
    if (f.maxPriceBand !== null) {
        stops = stops.filter(s => {
            const raw = typeof s.raw_data === 'string' ? JSON.parse(s.raw_data) : (s.raw_data || {});
            return raw && raw.price_band !== null && raw.price_band !== undefined && raw.price_band <= f.maxPriceBand;
        });
    }

    map.getSource('overnight')?.setData({
        type: 'FeatureCollection',
        features: stops.map(s => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [s.lon, s.lat] },
            properties: s,
        })),
    });

    const countEl = document.getElementById('overnight-count');
    if (countEl) countEl.textContent = `Showing ${stops.length} of ${state.overnightStops.length}`;
}

function populateTypeFilters(stops) {
    const types = [...new Set(stops.map(s => s.type).filter(Boolean))].sort();
    const container = document.getElementById('overnight-type-filters');
    if (!container) return;
    container.innerHTML = '';
    types.forEach(t => {
        const chip = document.createElement('span');
        chip.className = 'filter-chip';
        chip.textContent = TYPE_LABELS[t] || t;
        chip.dataset.type = t;
        chip.addEventListener('click', () => {
            chip.classList.toggle('active');
            const idx = state.overnightFilters.types.indexOf(t);
            if (idx >= 0) state.overnightFilters.types.splice(idx, 1);
            else state.overnightFilters.types.push(t);
            applyOvernightFilters();
        });
        container.appendChild(chip);
    });
}

// --- Nearby POIs and overnight stops ---
async function fetchNearbyData() {
    if (!state.start || !state.end) return;

    // Query midpoint of route
    const midLat = (state.start[1] + state.end[1]) / 2;
    const midLon = (state.start[0] + state.end[0]) / 2;
    const spread = Math.max(
        Math.abs(state.start[1] - state.end[1]),
        Math.abs(state.start[0] - state.end[0])
    );
    const radiusKm = Math.min(spread * 55, 100); // rough deg-to-km

    try {
        const [poisResp, overnightResp] = await Promise.all([
            apiFetch(`/api/pois?lat=${midLat}&lon=${midLon}&radius_km=${radiusKm}`),
            apiFetch(`/api/overnight?lat=${midLat}&lon=${midLon}&radius_km=${radiusKm}`),
        ]);

        const poisData = await poisResp.json();
        const overnightData = await overnightResp.json();

        // Update map sources
        if (poisData.pois?.length) {
            map.getSource('pois').setData({
                type: 'FeatureCollection',
                features: poisData.pois.map(p => ({
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
                    properties: p,
                })),
            });
        }

        if (overnightData.stops?.length) {
            state.overnightStops = overnightData.stops;
            populateTypeFilters(overnightData.stops);
            applyOvernightFilters();
            document.getElementById('overnight-filter-panel').style.display = 'block';
        }

        // Show POI panel
        const panel = document.getElementById('poi-panel');
        const list = document.getElementById('poi-list');
        const total = (poisData.count || 0) + (overnightData.count || 0);
        if (total > 0) {
            list.innerHTML =
                `<div class="poi-meta">${poisData.count || 0} POIs, ${overnightData.count || 0} overnight stops nearby</div>`;
            panel.style.display = 'block';
        }
    } catch (err) {
        console.warn('Failed to fetch nearby data:', err);
    }
}

// --- GPX export ---
async function exportGPX() {
    if (!state.start || !state.end) return;

    const profile = document.getElementById('surface-pref').value;
    try {
        const allWaypoints = [
            state.start,
            ...state.waypoints.map(wp => wp.coord),
            state.end,
        ];

        const resp = await apiFetch('/api/route/gpx', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                waypoints: allWaypoints,
                profile,
            }),
        });

        if (!resp.ok) throw new Error('GPX export failed');

        const blob = await resp.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'bikeplanner-route.gpx';
        a.click();
        URL.revokeObjectURL(url);
    } catch (err) {
        setStatus(`Error: ${err.message}`);
    }
}

// --- BRouter status check ---
async function checkBRouterStatus() {
    try {
        const resp = await apiFetch('/api/route', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                waypoints: [[-3.7, 52.3], [-3.6, 52.3]],
                profile: 'trekking',
            }),
        });
        const dot = document.getElementById('brouter-status');
        if (resp.ok) {
            const data = await resp.json();
            if (data.fallback) {
                dot.className = 'status-dot red';
                dot.title = 'BRouter not connected (using fallback)';
            } else {
                dot.className = 'status-dot green';
                dot.title = 'BRouter connected';
            }
        } else {
            dot.className = 'status-dot red';
            dot.title = 'BRouter error';
        }
    } catch {
        // Already red by default
    }
}

// --- Utilities ---
function setStatus(text) {
    document.getElementById('status-text').textContent = text;
}

function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

async function reverseRoute() {
    if (!state.routeData?.features?.[0]?.geometry?.coordinates) {
        setStatus('No route to reverse');
        return;
    }

    // Reverse route coordinates
    const feature = state.routeData.features[0];
    feature.geometry.coordinates.reverse();

    // Swap start and end
    const oldStart = state.start;
    const oldEnd = state.end;
    setStart(oldEnd);
    setEnd(oldStart);

    // Reverse via-points order
    if (state.waypoints.length > 0) {
        state.waypoints.reverse();
        state.waypoints.forEach((wp, i) => wp.index = i);
    }

    // Clear existing itinerary
    clearItinerary();

    // Re-display the route
    displayRoute(state.routeData);

    // Update trip endpoints in DB
    if (state.tripId) {
        await updateTripEndpoints();
    }

    setStatus('Route reversed');
}

function clearAll() {
    state.start = null;
    state.end = null;
    state.routeData = null;
    state.clickMode = 'start';
    state.tripId = null;
    state.itinerary = null;
    clearMarkers();
    clearViaPoints();

    document.getElementById('start-input').value = '';
    document.getElementById('end-input').value = '';
    document.getElementById('route-info').style.display = 'none';
    document.getElementById('poi-panel').style.display = 'none';
    document.getElementById('itinerary-panel').style.display = 'none';
    document.getElementById('chat-panel').style.display = 'none';
    document.getElementById('itinerary-days').innerHTML = '';
    document.getElementById('itinerary-summary').innerHTML = '';
    if (typeof clearChat === 'function') clearChat();
    document.getElementById('route-btn').disabled = true;

    map.getSource('route')?.setData({ type: 'FeatureCollection', features: [] });
    map.getSource('pois')?.setData({ type: 'FeatureCollection', features: [] });
    map.getSource('overnight')?.setData({ type: 'FeatureCollection', features: [] });
    state.overnightStops = [];
    state.overnightFilters = { types: [], bikeFriendlyOnly: false, maxPriceBand: null };
    document.getElementById('overnight-filter-panel').style.display = 'none';
    const bikeFriendlyEl = document.getElementById('bike-friendly-filter');
    if (bikeFriendlyEl) bikeFriendlyEl.checked = false;
    const priceBandEl = document.getElementById('price-band-filter');
    if (priceBandEl) priceBandEl.value = '';

    // Remove day segment layers
    state.dayLayers.forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
    });
    state.dayLayers = [];
    if (map.getLayer('route-line')) {
        map.setLayoutProperty('route-line', 'visibility', 'visible');
    }

    if (state.elevChart) {
        state.elevChart.destroy();
        state.elevChart = null;
    }

    clearGpxOverlays();
    document.getElementById('gpx-overlay-section').style.display = 'none';

    updateClickHint();
    setStatus('Ready');
}

// --- GPX Overlays ---
const GPX_OVERLAY_COLORS = ['#ff9800', '#9c27b0', '#00bcd4', '#ff5722', '#8bc34a'];

function addGpxOverlayToMap(id, name, geojson, color, visible) {
    const sourceId = `gpx-overlay-${id}`;
    const layerId = `gpx-overlay-line-${id}`;

    map.addSource(sourceId, { type: 'geojson', data: geojson });
    map.addLayer({
        id: layerId,
        type: 'line',
        source: sourceId,
        layout: {
            'line-join': 'round',
            'line-cap': 'round',
            'visibility': visible ? 'visible' : 'none',
        },
        paint: {
            'line-color': color || '#ff9800',
            'line-width': 3,
            'line-dasharray': [4, 3],
            'line-opacity': 0.7,
        },
    }, 'route-line');

    state.gpxOverlays.push({ id, name, color, visible });
    renderGpxOverlayList();
}

async function handleGpxFileImport(file) {
    if (!state.tripId) return;
    try {
        const text = await file.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'application/xml');
        const geojson = toGeoJSON.gpx(doc);

        // Validate it has line features
        const lineFeatures = (geojson.features || []).filter(
            f => f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString')
        );
        if (lineFeatures.length === 0) {
            setStatus('GPX file has no track/route data');
            return;
        }

        const name = file.name.replace(/\.gpx$/i, '');
        const colorIdx = state.gpxOverlays.length % GPX_OVERLAY_COLORS.length;
        const color = GPX_OVERLAY_COLORS[colorIdx];

        const resp = await apiFetch(`/api/trips/${state.tripId}/gpx-overlays`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, geojson, color }),
        });
        if (!resp.ok) throw new Error('Failed to save overlay');
        const data = await resp.json();

        addGpxOverlayToMap(data.id, name, geojson, color, true);
        setStatus(`Imported GPX: ${name}`);
    } catch (err) {
        console.error('GPX import failed:', err);
        setStatus(`GPX import failed: ${err.message || err}`);
    }
}

async function loadGpxAsRoute(file) {
    try {
        setStatus('Loading GPX route...');
        const text = await file.text();
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'application/xml');
        const geojson = toGeoJSON.gpx(doc);

        // Find LineString features
        const lineFeatures = (geojson.features || []).filter(
            f => f.geometry && (f.geometry.type === 'LineString' || f.geometry.type === 'MultiLineString')
        );
        if (lineFeatures.length === 0) {
            setStatus('GPX file has no track/route data');
            return;
        }

        // Get all coordinates (flatten MultiLineString if needed)
        let allCoords = [];
        lineFeatures.forEach(f => {
            if (f.geometry.type === 'MultiLineString') {
                f.geometry.coordinates.forEach(seg => allCoords.push(...seg));
            } else {
                allCoords.push(...f.geometry.coordinates);
            }
        });

        if (allCoords.length < 2) {
            setStatus('GPX track too short');
            return;
        }

        // Build a normalized FeatureCollection with a single LineString
        const routeName = file.name.replace(/\.gpx$/i, '');
        const routeGeojson = {
            type: 'FeatureCollection',
            features: [{
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: allCoords },
                properties: { name: routeName },
            }],
        };

        // If coordinates are 2D (no elevation), try to enrich via BRouter
        if (allCoords.length > 0 && allCoords[0].length < 3) {
            setStatus('Adding elevation data...');
            try {
                const enrichResp = await apiFetch('/api/elevation/enrich', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(allCoords),
                });
                if (enrichResp.ok) {
                    const enrichData = await enrichResp.json();
                    allCoords = enrichData.coordinates;
                    routeGeojson.features[0].geometry.coordinates = allCoords;
                    if (enrichData.stats) {
                        routeGeojson.features[0].properties['filtered ascend'] =
                            String(enrichData.stats.gain_m);
                    }
                }
            } catch (err) {
                console.warn('Elevation enrichment failed, continuing without:', err);
            }
        }

        // Compute distance from coordinates
        let totalDistM = 0;
        for (let i = 1; i < allCoords.length; i++) {
            const [lon1, lat1] = allCoords[i - 1];
            const [lon2, lat2] = allCoords[i];
            const R = 6371000;
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = Math.sin(dLat / 2) ** 2 +
                      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                      Math.sin(dLon / 2) ** 2;
            totalDistM += R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        }
        routeGeojson.features[0].properties['track-length'] = String(totalDistM);

        // Clear current state and set start/end from track endpoints
        clearItinerary();
        clearViaPoints();

        const startCoord = [allCoords[0][0], allCoords[0][1]];
        const endCoord = [allCoords[allCoords.length - 1][0], allCoords[allCoords.length - 1][1]];
        setStart(startCoord);
        setEnd(endCoord);

        // Set as the active route
        state.routeData = routeGeojson;
        displayRoute(routeGeojson);

        // Create or update trip
        if (state.tripId) {
            await updateTripEndpoints();
        } else {
            await createTrip();
        }

        updateTripNameDisplay(routeName);
        if (state.tripId) {
            apiFetch(`/api/trips/${state.tripId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: routeName }),
            }).catch(() => {});
        }

        setStatus(`Loaded GPX route: ${routeName} (${fmtDist(totalDistM / 1000)} ${distLabel()})`);
    } catch (err) {
        console.error('GPX route load failed:', err);
        setStatus(`GPX route load failed: ${err.message || err}`);
    }
}

async function removeGpxOverlay(id) {
    const layerId = `gpx-overlay-line-${id}`;
    const sourceId = `gpx-overlay-${id}`;
    if (map.getLayer(layerId)) map.removeLayer(layerId);
    if (map.getSource(sourceId)) map.removeSource(sourceId);

    try {
        await apiFetch(`/api/trips/${state.tripId}/gpx-overlays/${id}`, { method: 'DELETE' });
    } catch (err) {
        console.warn('Failed to delete overlay:', err);
    }

    state.gpxOverlays = state.gpxOverlays.filter(o => o.id !== id);
    renderGpxOverlayList();
}

function toggleGpxOverlayVisibility(id) {
    const layerId = `gpx-overlay-line-${id}`;
    const ov = state.gpxOverlays.find(o => o.id === id);
    if (!ov) return;
    ov.visible = !ov.visible;
    if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', ov.visible ? 'visible' : 'none');
    }
    renderGpxOverlayList();
}

function clearGpxOverlays() {
    state.gpxOverlays.forEach(ov => {
        const layerId = `gpx-overlay-line-${ov.id}`;
        const sourceId = `gpx-overlay-${ov.id}`;
        if (map.getLayer(layerId)) map.removeLayer(layerId);
        if (map.getSource(sourceId)) map.removeSource(sourceId);
    });
    state.gpxOverlays = [];
    document.getElementById('gpx-overlay-list').innerHTML = '';
}

async function loadGpxOverlays(tripId) {
    try {
        const resp = await apiFetch(`/api/trips/${tripId}/gpx-overlays`);
        if (!resp.ok) return;
        const data = await resp.json();
        (data.overlays || []).forEach(ov => {
            addGpxOverlayToMap(ov.id, ov.name, ov.geojson, ov.color, ov.visible !== 0);
        });
    } catch (err) {
        console.warn('Failed to load GPX overlays:', err);
    }
}

function renderGpxOverlayList() {
    const list = document.getElementById('gpx-overlay-list');
    list.innerHTML = '';
    state.gpxOverlays.forEach(ov => {
        const item = document.createElement('div');
        item.className = 'gpx-overlay-item';
        item.innerHTML = `
            <span class="gpx-overlay-swatch" style="background:${ov.color || '#ff9800'}"></span>
            <span class="gpx-overlay-name" title="${ov.name}">${ov.name}</span>
            <button class="gpx-overlay-toggle ${ov.visible ? '' : 'off'}" title="${ov.visible ? 'Hide' : 'Show'}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    ${ov.visible
                        ? '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>'
                        : '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/>'
                    }
                </svg>
            </button>
            <button class="gpx-overlay-delete" title="Remove">&times;</button>
        `;
        item.querySelector('.gpx-overlay-toggle').onclick = () => toggleGpxOverlayVisibility(ov.id);
        item.querySelector('.gpx-overlay-delete').onclick = () => removeGpxOverlay(ov.id);
        list.appendChild(item);
    });
}

// --- Input helpers (convert displayed value back to metric for API) ---
function getDailyDistanceKm() {
    const val = parseFloat(document.getElementById('daily-distance').value) || 80;
    return getUnit() === 'imperial' ? val / KM_TO_MI : val;
}

function getMaxElevationM() {
    const val = parseFloat(document.getElementById('max-elevation').value) || 1500;
    return getUnit() === 'imperial' ? val / M_TO_FT : val;
}

function getAvgSpeedKmh() {
    const val = parseFloat(document.getElementById('avg-speed').value) || 15;
    return getUnit() === 'imperial' ? val / KM_TO_MI : val;
}

function getMaxHoursPerDay() {
    return parseFloat(document.getElementById('max-hours').value) || 0;
}

// --- Trip creation ---
async function createTrip() {
    if (!state.start || !state.end) return;
    try {
        const resp = await apiFetch('/api/trips', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Untitled Trip',
                start_lat: state.start[1],
                start_lon: state.start[0],
                end_lat: state.end[1],
                end_lon: state.end[0],
                daily_distance_km: getDailyDistanceKm(),
                max_elevation_m: getMaxElevationM(),
                surface_pref: document.getElementById('surface-pref').value,
            }),
        });
        if (resp.ok) {
            const data = await resp.json();
            state.tripId = data.id;
            persistTripId(data.id);
            updateTripNameDisplay('Untitled Trip');
            // Save via-points to trip
            await saveWaypointsToTrip();
            // Show chat panel
            document.getElementById('chat-panel').style.display = 'block';
            if (typeof loadChatHistory === 'function') loadChatHistory(data.id);
            // Show GPX overlay section
            document.getElementById('gpx-overlay-section').style.display = 'block';
        }
    } catch (err) {
        console.warn('Failed to create trip:', err);
    }
}

// --- Itinerary generation ---
async function generateItinerary() {
    if (!state.tripId) {
        setStatus('No trip created yet. Calculate a route first.');
        return;
    }

    setStatus('Generating itinerary...');

    try {
        // If number of days is specified, compute daily distance from total route length
        let dailyDistKm = getDailyDistanceKm();
        const numDaysInput = parseInt(document.getElementById('num-days').value);
        if (numDaysInput > 0 && state.routeData?.features?.[0]?.properties?.['track-length']) {
            const totalKm = parseFloat(state.routeData.features[0].properties['track-length']) / 1000;
            dailyDistKm = totalKm / numDaysInput;
        }

        const resp = await apiFetch(`/api/trips/${state.tripId}/itinerary`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                route_geojson: state.routeData,
                daily_distance_km: dailyDistKm,
                max_elevation_gain_m: numDaysInput > 0 ? 0 : getMaxElevationM(),
                overnight_search_radius_km: 10,
                avg_speed_kmh: getAvgSpeedKmh(),
                max_hours_per_day: numDaysInput > 0 ? 0 : getMaxHoursPerDay(),
            }),
        });

        if (!resp.ok) {
            const err = await resp.json();
            throw new Error(err.detail || 'Itinerary generation failed');
        }

        const data = await resp.json();
        state.itinerary = data;
        displayItinerary(data);
        setStatus(`Itinerary generated: ${data.num_days} days`);
    } catch (err) {
        setStatus(`Error: ${err.message}`);
    }
}

function displayItinerary(data) {
    // Summary
    document.getElementById('itinerary-summary').innerHTML = `
        <div>Total: <span class="stat-value">${fmtDist(data.total_distance_km)} ${distLabel()}</span></div>
        <div>Elevation: <span class="stat-value">${fmtElev(data.total_elevation_gain_m)} ${elevLabel()}</span> gain</div>
        <div>Days: <span class="stat-value">${data.num_days}</span></div>
    `;

    // Show gradient legend if we have elevation data
    const hasElevation = data.total_elevation_gain_m > 0;
    document.getElementById('gradient-legend').style.display = hasElevation ? 'flex' : 'none';

    // Day cards
    const container = document.getElementById('itinerary-days');
    container.innerHTML = '';

    data.days.forEach((day, i) => {
        const color = DAY_COLORS[i % DAY_COLORS.length];
        const card = document.createElement('div');
        card.className = 'day-card';
        card.dataset.dayIndex = i;

        let overnightHtml = '';
        if (day.overnight_stops && day.overnight_stops.length > 0) {
            const stop = day.overnight_stops[0];
            overnightHtml = `<div class="day-overnight">${stop.name || stop.type || 'Overnight stop'}</div>`;
        } else {
            overnightHtml = '<div class="day-overnight" style="color:#707090;">No overnight stops found</div>';
        }

        const headerDiv = document.createElement('div');
        headerDiv.className = 'day-header';
        headerDiv.innerHTML = `
            <span class="day-number">
                <span class="day-color-dot" style="background:${color};"></span>
                Day ${day.day_number}
            </span>
            <span style="font-size:12px;color:#a0a0c0;">${day.estimated_hours} hrs</span>
        `;

        const statsDiv = document.createElement('div');
        statsDiv.className = 'day-stats';
        statsDiv.innerHTML = `
            <span>${fmtDist(day.distance_km)} ${distLabel()}</span>
            <span>${fmtElev(day.elevation_gain_m)}${elevLabel()} gain</span>
            <span>${fmtElev(day.elevation_loss_m)}${elevLabel()} loss</span>
        `;

        card.appendChild(headerDiv);
        card.appendChild(statsDiv);
        card.insertAdjacentHTML('beforeend', overnightHtml);

        // Edit button for per-day overrides
        const editBtn = document.createElement('button');
        editBtn.className = 'day-edit-btn';
        editBtn.textContent = 'Edit limits';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            toggleDayOverrideForm(card, day.day_number);
        });
        card.appendChild(editBtn);

        card.addEventListener('click', () => highlightDay(i, data.days));
        container.appendChild(card);
    });

    // Display day segments on map
    displayDaySegments(data.days);

    // Build timeline
    buildDaySplitTimeline();

    // Show elevation timeline at bottom
    showElevationTimeline();
}

// --- Day split timeline ---

function _haversineJs(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getRouteCoords() {
    if (!state.routeData || !state.routeData.features) return [];
    const feat = state.routeData.features[0];
    if (!feat || !feat.geometry) return [];
    return feat.geometry.coordinates;
}

function buildCumulativeDistances(coords) {
    const cumDist = [0];
    for (let i = 1; i < coords.length; i++) {
        const d = _haversineJs(coords[i-1][1], coords[i-1][0], coords[i][1], coords[i][0]);
        cumDist.push(cumDist[i-1] + d);
    }
    return cumDist;
}

function computeSegmentStats(coords, startIdx, endIdx) {
    let dist = 0, gain = 0, loss = 0;
    for (let i = startIdx + 1; i <= endIdx; i++) {
        dist += _haversineJs(coords[i-1][1], coords[i-1][0], coords[i][1], coords[i][0]);
        if (coords[i].length >= 3 && coords[i-1].length >= 3) {
            const diff = coords[i][2] - coords[i-1][2];
            if (diff > 0) gain += diff; else loss += Math.abs(diff);
        }
    }
    return { distKm: dist / 1000, gainM: gain, lossM: loss };
}

function findCoordIndexAtDistance(cumDist, targetM) {
    for (let i = 0; i < cumDist.length; i++) {
        if (cumDist[i] >= targetM) return i;
    }
    return cumDist.length - 1;
}

function buildDaySplitTimeline() {
    const container = document.getElementById('day-split-timeline');
    container.innerHTML = '';

    const itin = state.itinerary;
    if (!itin || !itin.days || itin.days.length < 2) return;

    const coords = getRouteCoords();
    if (coords.length < 2) return;

    const cumDist = buildCumulativeDistances(coords);
    const totalDist = cumDist[cumDist.length - 1];

    // Find the coordinate index for each day split point
    // Split indices mark the END of each day (start of next day)
    let splitIndices = [];
    let searchFrom = 0;
    for (let d = 0; d < itin.days.length - 1; d++) {
        const dayCoords = itin.days[d].segment_coords;
        const endCoord = dayCoords[dayCoords.length - 1];
        // Find closest coord index in route
        let bestIdx = searchFrom;
        let bestDist = Infinity;
        for (let i = searchFrom; i < coords.length; i++) {
            const dx = coords[i][0] - endCoord[0];
            const dy = coords[i][1] - endCoord[1];
            const d2 = dx * dx + dy * dy;
            if (d2 < bestDist) { bestDist = d2; bestIdx = i; }
            if (d2 < 1e-12) break;
        }
        splitIndices.push(bestIdx);
        searchFrom = bestIdx;
    }

    // Store on state for drag updates
    state._timelineData = { coords, cumDist, totalDist, splitIndices };

    renderTimeline(container);
}

function renderTimeline(container) {
    const { coords, cumDist, totalDist, splitIndices } = state._timelineData;
    const numDays = splitIndices.length + 1;
    container.innerHTML = '';

    const bar = document.createElement('div');
    bar.className = 'timeline-bar';

    // Build segments
    let prevIdx = 0;
    for (let d = 0; d < numDays; d++) {
        const endIdx = d < splitIndices.length ? splitIndices[d] : coords.length - 1;
        const startDist = cumDist[prevIdx];
        const endDist = cumDist[endIdx];
        const pct = ((endDist - startDist) / totalDist) * 100;
        const stats = computeSegmentStats(coords, prevIdx, endIdx);
        const color = DAY_COLORS[d % DAY_COLORS.length];

        const seg = document.createElement('div');
        seg.className = 'timeline-segment';
        seg.style.width = `${pct}%`;
        seg.style.backgroundColor = color;
        seg.dataset.day = d;

        const label = document.createElement('span');
        label.className = 'timeline-label';
        label.textContent = `D${d + 1}: ${fmtDist(stats.distKm)}`;
        seg.appendChild(label);
        seg.title = `Day ${d + 1}: ${fmtDist(stats.distKm)} ${distLabel()}, ${fmtElev(stats.gainM)}${elevLabel()} gain`;

        bar.appendChild(seg);

        // Add draggable handle between days (not after last)
        if (d < splitIndices.length) {
            const handle = document.createElement('div');
            handle.className = 'timeline-handle';
            handle.dataset.splitIndex = d;
            handle.title = 'Drag to adjust day split';
            bar.appendChild(handle);
        }

        prevIdx = endIdx;
    }

    container.appendChild(bar);

    // Attach drag handlers
    container.querySelectorAll('.timeline-handle').forEach(handle => {
        handle.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            handle.setPointerCapture(e.pointerId);
            handle.classList.add('dragging');

            const splitIdx = parseInt(handle.dataset.splitIndex);

            const onPointerMove = (e) => {
                const barRect = bar.getBoundingClientRect();
                const x = Math.max(0, Math.min(e.clientX - barRect.left, barRect.width));
                const pct = x / barRect.width;
                const targetDist = pct * totalDist;

                const newCoordIdx = findCoordIndexAtDistance(cumDist, targetDist);

                // Clamp: must be after previous split and before next split
                const minIdx = splitIdx > 0 ? splitIndices[splitIdx - 1] + 1 : 1;
                const maxIdx = splitIdx < splitIndices.length - 1 ? splitIndices[splitIdx + 1] - 1 : coords.length - 2;
                const clampedIdx = Math.max(minIdx, Math.min(maxIdx, newCoordIdx));

                if (clampedIdx !== splitIndices[splitIdx]) {
                    splitIndices[splitIdx] = clampedIdx;
                    updateTimelineSegments(bar);
                }
            };

            const onPointerUp = () => {
                handle.classList.remove('dragging');
                handle.removeEventListener('pointermove', onPointerMove);
                handle.removeEventListener('pointerup', onPointerUp);

                // Apply the new splits — rebuild itinerary data and update map + cards
                applyTimelineSplits();
            };

            handle.addEventListener('pointermove', onPointerMove);
            handle.addEventListener('pointerup', onPointerUp);
        });
    });
}

function updateTimelineSegments(bar) {
    const { coords, cumDist, totalDist, splitIndices } = state._timelineData;
    const numDays = splitIndices.length + 1;
    const segments = bar.querySelectorAll('.timeline-segment');

    let prevIdx = 0;
    segments.forEach((seg, d) => {
        const endIdx = d < splitIndices.length ? splitIndices[d] : coords.length - 1;
        const startDist = cumDist[prevIdx];
        const endDist = cumDist[endIdx];
        const pct = ((endDist - startDist) / totalDist) * 100;
        const stats = computeSegmentStats(coords, prevIdx, endIdx);

        seg.style.width = `${pct}%`;
        const label = seg.querySelector('.timeline-label');
        if (label) label.textContent = `D${d + 1}: ${fmtDist(stats.distKm)}`;
        seg.title = `Day ${d + 1}: ${fmtDist(stats.distKm)} ${distLabel()}, ${fmtElev(stats.gainM)}${elevLabel()} gain`;

        prevIdx = endIdx;
    });
}

async function saveItineraryUpdate() {
    const itin = state.itinerary;
    if (!itin || !itin.id) return;
    try {
        await apiFetch(`/api/itineraries/${itin.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                total_distance_km: itin.total_distance_km,
                total_elevation_gain_m: itin.total_elevation_gain_m,
                num_days: itin.num_days,
                days: itin.days.map(d => ({
                    day_number: d.day_number,
                    start_coord: d.start_coord,
                    end_coord: d.end_coord,
                    distance_km: d.distance_km,
                    elevation_gain_m: d.elevation_gain_m,
                    elevation_loss_m: d.elevation_loss_m,
                    estimated_hours: d.estimated_hours,
                    segment_coords: d.segment_coords,
                })),
            }),
        });
    } catch (err) {
        console.warn('Failed to save itinerary update:', err);
    }
}

function applyTimelineSplits() {
    const { coords, splitIndices } = state._timelineData;
    if (!state.itinerary) return;

    const avgSpeed = getAvgSpeedKmh();
    const newDays = [];
    let prevIdx = 0;

    for (let d = 0; d <= splitIndices.length; d++) {
        const endIdx = d < splitIndices.length ? splitIndices[d] : coords.length - 1;
        const segment = coords.slice(prevIdx, endIdx + 1);
        const stats = computeSegmentStats(coords, prevIdx, endIdx);

        // Estimate hours: same formula as backend
        const climbRate = avgSpeed / 15.0 * 500.0;
        const baseHours = stats.distKm / avgSpeed;
        const climbHours = climbRate > 0 ? stats.gainM / climbRate : 0;
        const estHours = Math.round((baseHours + climbHours) * 10) / 10;

        newDays.push({
            day_number: d + 1,
            start_coord: [segment[0][0], segment[0][1]],
            end_coord: [segment[segment.length - 1][0], segment[segment.length - 1][1]],
            distance_km: Math.round(stats.distKm * 10) / 10,
            elevation_gain_m: Math.round(stats.gainM),
            elevation_loss_m: Math.round(stats.lossM),
            estimated_hours: estHours,
            overnight_stops: [],
            segment_coords: segment.map(c => [c[0], c[1]]),
        });
        prevIdx = endIdx;
    }

    const totalDist = newDays.reduce((s, d) => s + d.distance_km, 0);
    const totalGain = newDays.reduce((s, d) => s + d.elevation_gain_m, 0);

    state.itinerary.days = newDays;
    state.itinerary.num_days = newDays.length;
    state.itinerary.total_distance_km = Math.round(totalDist * 10) / 10;
    state.itinerary.total_elevation_gain_m = Math.round(totalGain);

    // Update summary
    document.getElementById('itinerary-summary').innerHTML = `
        <div>Total: <span class="stat-value">${fmtDist(totalDist)} ${distLabel()}</span></div>
        <div>Elevation: <span class="stat-value">${fmtElev(totalGain)} ${elevLabel()}</span> gain</div>
        <div>Days: <span class="stat-value">${newDays.length}</span></div>
    `;

    // Update day cards
    const cardContainer = document.getElementById('itinerary-days');
    cardContainer.innerHTML = '';
    newDays.forEach((day, i) => {
        const color = DAY_COLORS[i % DAY_COLORS.length];
        const card = document.createElement('div');
        card.className = 'day-card';
        card.dataset.dayIndex = i;

        const headerDiv = document.createElement('div');
        headerDiv.className = 'day-header';
        headerDiv.innerHTML = `
            <span class="day-number">
                <span class="day-color-dot" style="background:${color};"></span>
                Day ${day.day_number}
            </span>
            <span style="font-size:12px;color:#a0a0c0;">${day.estimated_hours} hrs</span>
        `;
        const statsDiv = document.createElement('div');
        statsDiv.className = 'day-stats';
        statsDiv.innerHTML = `
            <span>${fmtDist(day.distance_km)} ${distLabel()}</span>
            <span>${fmtElev(day.elevation_gain_m)}${elevLabel()} gain</span>
            <span>${fmtElev(day.elevation_loss_m)}${elevLabel()} loss</span>
        `;

        card.appendChild(headerDiv);
        card.appendChild(statsDiv);
        card.addEventListener('click', () => highlightDay(i, newDays));
        cardContainer.appendChild(card);
    });

    // Update map segments and split markers
    displayDaySegments(newDays);

    // Re-render timeline bar to stay in sync
    const timelineContainer = document.getElementById('day-split-timeline');
    renderTimeline(timelineContainer);

    // Re-render elevation timeline
    drawElevationProfile();
    updateElevTimelineOverlay();

    // Save updated itinerary to backend
    saveItineraryUpdate();
}

function buildGradientExpression(coords, baseColor) {
    // Compute grade (%) between consecutive points and build a line-gradient expression
    // Colors: base color for flat/downhill, yellow for moderate, orange for steep, red for very steep
    if (!coords || coords.length < 2 || coords[0].length < 3) {
        return baseColor; // No elevation data — solid color
    }

    // Build cumulative distances for line-progress mapping
    let totalDist = 0;
    const segDists = [0];
    for (let i = 1; i < coords.length; i++) {
        const d = _haversineJs(coords[i-1][1], coords[i-1][0], coords[i][1], coords[i][0]);
        totalDist += d;
        segDists.push(totalDist);
    }
    if (totalDist === 0) return baseColor;

    // Compute smoothed grades: average over a window to avoid noise
    const WINDOW = 5;
    const grades = [];
    for (let i = 0; i < coords.length; i++) {
        const lo = Math.max(0, i - WINDOW);
        const hi = Math.min(coords.length - 1, i + WINDOW);
        const elevDiff = coords[hi][2] - coords[lo][2];
        const hDist = segDists[hi] - segDists[lo];
        grades.push(hDist > 0 ? (elevDiff / hDist) * 100 : 0); // percent grade
    }

    // Build gradient stops — sample at intervals to keep the expression manageable
    const stops = [];
    const NUM_SAMPLES = Math.min(coords.length, 200);
    const step = (coords.length - 1) / (NUM_SAMPLES - 1);

    for (let s = 0; s < NUM_SAMPLES; s++) {
        const idx = Math.min(Math.round(s * step), coords.length - 1);
        const progress = segDists[idx] / totalDist;
        const grade = grades[idx];
        let color;
        if (grade <= 2) {
            color = baseColor;       // flat or downhill — day color
        } else if (grade <= 5) {
            color = '#f5c542';        // moderate climb — yellow
        } else if (grade <= 8) {
            color = '#f59e42';        // steep — orange
        } else {
            color = '#e83e3e';        // very steep — red
        }
        stops.push(progress, color);
    }

    return ['interpolate', ['linear'], ['line-progress'], ...stops];
}

function getSegment3DCoords(day, dayIndex) {
    // Try to get 3D coordinates from the full route data for gradient coloring
    const td = state._timelineData;
    if (td) {
        const splitIndices = td.splitIndices;
        const startIdx = dayIndex > 0 ? splitIndices[dayIndex - 1] : 0;
        const endIdx = dayIndex < splitIndices.length ? splitIndices[dayIndex] : td.coords.length - 1;
        return td.coords.slice(startIdx, endIdx + 1);
    }
    return day.segment_coords;
}

function displayDaySegments(days) {
    // Remove old day layers
    state.dayLayers.forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id);
        if (map.getSource(id)) map.removeSource(id);
    });
    state.dayLayers = [];
    removeSplitMarkers();

    // Hide the main route line when showing day segments
    map.setLayoutProperty('route-line', 'visibility', 'none');

    days.forEach((day, i) => {
        const color = DAY_COLORS[i % DAY_COLORS.length];
        const sourceId = `day-segment-${i}`;
        const coords3D = getSegment3DCoords(day, i);
        const gradient = buildGradientExpression(coords3D, color);
        const useGradient = Array.isArray(gradient);

        map.addSource(sourceId, {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: coords3D,
                },
            },
            lineMetrics: useGradient,
        });

        const paint = {
            'line-width': 4,
            'line-opacity': 0.85,
        };
        if (useGradient) {
            paint['line-gradient'] = gradient;
        } else {
            paint['line-color'] = color;
        }

        map.addLayer({
            id: sourceId,
            type: 'line',
            source: sourceId,
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint,
        });

        state.dayLayers.push(sourceId);
    });

    // Add draggable split markers between days
    if (state._timelineData) {
        addSplitMarkers();
    }
}

function addSplitMarkers() {
    const { coords, cumDist, totalDist, splitIndices } = state._timelineData;

    splitIndices.forEach((coordIdx, splitIdx) => {
        const coord = coords[coordIdx];
        const el = document.createElement('div');
        el.className = 'marker-split';
        el.title = `Drag to adjust Day ${splitIdx + 1} / Day ${splitIdx + 2} split`;

        const marker = new maplibregl.Marker({ element: el, draggable: true })
            .setLngLat([coord[0], coord[1]])
            .addTo(map);

        marker.on('drag', () => {
            const lngLat = marker.getLngLat();
            // Snap to nearest route coordinate
            const snapped = snapToRoute(lngLat.lng, lngLat.lat, splitIdx);
            if (snapped !== null && snapped !== splitIndices[splitIdx]) {
                splitIndices[splitIdx] = snapped;
                // Live-update timeline and map segments during drag
                const timelineContainer = document.getElementById('day-split-timeline');
                const bar = timelineContainer.querySelector('.timeline-bar');
                if (bar) updateTimelineSegments(bar);
            }
            // Snap marker position to the route point
            const snapCoord = coords[splitIndices[splitIdx]];
            marker.setLngLat([snapCoord[0], snapCoord[1]]);
        });

        marker.on('dragend', () => {
            applyTimelineSplits();
        });

        state.splitMarkers.push(marker);
    });
}

function snapToRoute(lng, lat, splitIdx) {
    const { coords, splitIndices } = state._timelineData;
    // Clamp: must be after previous split and before next split
    const minIdx = splitIdx > 0 ? splitIndices[splitIdx - 1] + 1 : 1;
    const maxIdx = splitIdx < splitIndices.length - 1 ? splitIndices[splitIdx + 1] - 1 : coords.length - 2;

    let bestIdx = splitIndices[splitIdx];
    let bestDist = Infinity;
    for (let i = minIdx; i <= maxIdx; i++) {
        const dx = coords[i][0] - lng;
        const dy = coords[i][1] - lat;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist) {
            bestDist = d2;
            bestIdx = i;
        }
    }
    return bestIdx;
}

// --- Elevation timeline (bottom bar) ---

function showElevationTimeline() {
    const td = state._timelineData;
    if (!td || !td.coords.length || td.coords[0].length < 3) return;

    const container = document.getElementById('elevation-timeline');
    container.style.display = 'block';
    map.resize();

    // Defer drawing until layout settles
    requestAnimationFrame(() => {
        drawElevationProfile();
        updateElevTimelineOverlay();
        if (!document.getElementById('elev-scrub-cursor')) {
            initTimelineScrub();
        }
    });
}

function hideElevationTimeline() {
    document.getElementById('elevation-timeline').style.display = 'none';
    if (state._scrubMarker) {
        state._scrubMarker.remove();
        state._scrubMarker = null;
    }
    map.resize();
}

function drawElevationProfile() {
    const td = state._timelineData;
    if (!td) return;

    const canvas = document.getElementById('elev-timeline-canvas');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();

    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
    ctx.scale(dpr, dpr);

    const W = rect.width;
    const H = rect.height;
    const { coords, cumDist, totalDist, splitIndices } = td;

    // Compute elevation range
    let minElev = Infinity, maxElev = -Infinity;
    for (const c of coords) {
        if (c.length >= 3) {
            if (c[2] < minElev) minElev = c[2];
            if (c[2] > maxElev) maxElev = c[2];
        }
    }
    if (!isFinite(minElev)) return;
    const elevRange = maxElev - minElev || 1;
    const PAD_TOP = 24;
    const PAD_BOT = 4;
    const chartH = H - PAD_TOP - PAD_BOT;

    // Sample elevation points
    const numSamples = Math.min(coords.length, Math.round(W));
    const step = (coords.length - 1) / (numSamples - 1);

    // Draw day-colored filled areas
    const numDays = splitIndices.length + 1;
    let prevSplitCoordIdx = 0;

    for (let d = 0; d < numDays; d++) {
        const endSplitCoordIdx = d < splitIndices.length ? splitIndices[d] : coords.length - 1;
        const color = DAY_COLORS[d % DAY_COLORS.length];

        ctx.beginPath();
        let first = true;
        for (let s = 0; s < numSamples; s++) {
            const idx = Math.min(Math.round(s * step), coords.length - 1);
            if (idx < prevSplitCoordIdx || idx > endSplitCoordIdx) continue;

            const x = (cumDist[idx] / totalDist) * W;
            const elev = coords[idx].length >= 3 ? coords[idx][2] : minElev;
            const y = PAD_TOP + chartH - ((elev - minElev) / elevRange) * chartH;

            if (first) {
                // Start from bottom
                ctx.moveTo(x, H - PAD_BOT);
                ctx.lineTo(x, y);
                first = false;
            } else {
                ctx.lineTo(x, y);
            }
        }

        // Close to bottom
        const lastX = (cumDist[endSplitCoordIdx] / totalDist) * W;
        ctx.lineTo(lastX, H - PAD_BOT);
        ctx.closePath();
        ctx.fillStyle = hexToRgba(color, 0.35);
        ctx.fill();

        prevSplitCoordIdx = endSplitCoordIdx;
    }

    // Draw elevation line on top
    ctx.beginPath();
    for (let s = 0; s < numSamples; s++) {
        const idx = Math.min(Math.round(s * step), coords.length - 1);
        const x = (cumDist[idx] / totalDist) * W;
        const elev = coords[idx].length >= 3 ? coords[idx][2] : minElev;
        const y = PAD_TOP + chartH - ((elev - minElev) / elevRange) * chartH;
        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw elevation axis labels
    ctx.fillStyle = 'rgba(160, 160, 192, 0.8)';
    ctx.font = '10px -apple-system, sans-serif';
    const imperial = getUnit() === 'imperial';
    const topLabel = imperial ? Math.round(maxElev * M_TO_FT) + ' ft' : Math.round(maxElev) + ' m';
    const botLabel = imperial ? Math.round(minElev * M_TO_FT) + ' ft' : Math.round(minElev) + ' m';
    ctx.textAlign = 'left';
    ctx.fillText(topLabel, 4, PAD_TOP - 4);
    ctx.fillText(botLabel, 4, H - PAD_BOT - 2);
}

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function updateElevTimelineOverlay() {
    const td = state._timelineData;
    if (!td) return;

    const overlay = document.getElementById('elev-timeline-overlay');
    overlay.innerHTML = '';

    const { coords, cumDist, totalDist, splitIndices } = td;
    const numDays = splitIndices.length + 1;

    let prevIdx = 0;
    for (let d = 0; d < numDays; d++) {
        const endIdx = d < splitIndices.length ? splitIndices[d] : coords.length - 1;
        const leftPct = (cumDist[prevIdx] / totalDist) * 100;
        const rightPct = (cumDist[endIdx] / totalDist) * 100;
        const widthPct = rightPct - leftPct;
        const color = DAY_COLORS[d % DAY_COLORS.length];
        const stats = computeSegmentStats(coords, prevIdx, endIdx);

        const region = document.createElement('div');
        region.className = 'elev-day-region';
        region.style.left = leftPct + '%';
        region.style.width = widthPct + '%';
        region.style.borderRightColor = color;

        const label = document.createElement('span');
        label.className = 'elev-day-label';
        label.textContent = `D${d + 1}: ${fmtDist(stats.distKm)} ${distLabel()}, ${fmtElev(stats.gainM)}${elevLabel()}`;
        region.appendChild(label);

        overlay.appendChild(region);
        prevIdx = endIdx;
    }

    // Add handles between days
    for (let s = 0; s < splitIndices.length; s++) {
        const pct = (cumDist[splitIndices[s]] / totalDist) * 100;
        const handle = document.createElement('div');
        handle.className = 'elev-timeline-handle';
        handle.style.left = pct + '%';
        handle.dataset.splitIndex = s;
        overlay.appendChild(handle);

        handle.addEventListener('pointerdown', (e) => {
            e.preventDefault();
            handle.setPointerCapture(e.pointerId);
            handle.classList.add('dragging');

            const onMove = (ev) => {
                const containerRect = overlay.getBoundingClientRect();
                const x = Math.max(0, Math.min(ev.clientX - containerRect.left, containerRect.width));
                const pctPos = x / containerRect.width;
                const targetDist = pctPos * totalDist;
                const newIdx = findCoordIndexAtDistance(cumDist, targetDist);

                const minIdx = s > 0 ? splitIndices[s - 1] + 1 : 1;
                const maxIdx = s < splitIndices.length - 1 ? splitIndices[s + 1] - 1 : coords.length - 2;
                const clamped = Math.max(minIdx, Math.min(maxIdx, newIdx));

                if (clamped !== splitIndices[s]) {
                    splitIndices[s] = clamped;
                    // Update handle position
                    handle.style.left = (cumDist[clamped] / totalDist) * 100 + '%';
                    // Update overlay regions
                    updateElevTimelineRegions();
                    // Update sidebar timeline
                    const sidebarBar = document.querySelector('#day-split-timeline .timeline-bar');
                    if (sidebarBar) updateTimelineSegments(sidebarBar);
                    // Redraw canvas for day coloring
                    drawElevationProfile();
                }
            };

            const onUp = () => {
                handle.classList.remove('dragging');
                handle.removeEventListener('pointermove', onMove);
                handle.removeEventListener('pointerup', onUp);
                applyTimelineSplits();
            };

            handle.addEventListener('pointermove', onMove);
            handle.addEventListener('pointerup', onUp);
        });
    }
}

function updateElevTimelineRegions() {
    const td = state._timelineData;
    if (!td) return;
    const { coords, cumDist, totalDist, splitIndices } = td;
    const regions = document.querySelectorAll('#elev-timeline-overlay .elev-day-region');

    let prevIdx = 0;
    regions.forEach((region, d) => {
        const endIdx = d < splitIndices.length ? splitIndices[d] : coords.length - 1;
        const leftPct = (cumDist[prevIdx] / totalDist) * 100;
        const rightPct = (cumDist[endIdx] / totalDist) * 100;
        region.style.left = leftPct + '%';
        region.style.width = (rightPct - leftPct) + '%';

        const stats = computeSegmentStats(coords, prevIdx, endIdx);
        const label = region.querySelector('.elev-day-label');
        if (label) {
            label.textContent = `D${d + 1}: ${fmtDist(stats.distKm)} ${distLabel()}, ${fmtElev(stats.gainM)}${elevLabel()}`;
        }
        prevIdx = endIdx;
    });
}

// --- Elevation timeline scrubbing ---

function initTimelineScrub() {
    const container = document.getElementById('elevation-timeline');
    const cursor = document.createElement('div');
    cursor.id = 'elev-scrub-cursor';
    container.appendChild(cursor);

    // Tooltip for elevation/distance at cursor
    const tip = document.createElement('div');
    tip.id = 'elev-scrub-tip';
    cursor.appendChild(tip);

    container.addEventListener('pointermove', onTimelineScrub);
    container.addEventListener('pointerleave', onTimelineScrubEnd);
}

function onTimelineScrub(e) {
    const td = state._timelineData;
    if (!td) return;

    const container = document.getElementById('elevation-timeline');
    const rect = container.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = Math.max(0, Math.min(1, x / rect.width));
    const targetDist = pct * td.totalDist;

    // Find the coordinate index at this distance
    const idx = findCoordIndexAtDistance(td.cumDist, targetDist);
    const coord = td.coords[idx];

    // Show cursor line
    const cursor = document.getElementById('elev-scrub-cursor');
    cursor.style.display = 'block';
    cursor.style.left = x + 'px';

    // Update tooltip
    const tip = document.getElementById('elev-scrub-tip');
    const imperial = getUnit() === 'imperial';
    const distKm = td.cumDist[idx] / 1000;
    const distStr = imperial ? fmtDist(distKm * KM_TO_MI) + ' mi' : fmtDist(distKm) + ' km';
    const elev = coord.length >= 3 ? coord[2] : 0;
    const elevStr = imperial ? Math.round(elev * M_TO_FT) + ' ft' : Math.round(elev) + ' m';
    tip.textContent = `${distStr} · ${elevStr}`;

    // Position tooltip to avoid overflow
    if (x > rect.width - 100) {
        tip.style.left = 'auto';
        tip.style.right = '4px';
    } else {
        tip.style.left = '4px';
        tip.style.right = 'auto';
    }

    // Show/update map marker
    if (!state._scrubMarker) {
        const el = document.createElement('div');
        el.className = 'marker-scrub';
        state._scrubMarker = new maplibregl.Marker({ element: el })
            .setLngLat([coord[0], coord[1]])
            .addTo(map);
    } else {
        state._scrubMarker.setLngLat([coord[0], coord[1]]);
    }
}

function onTimelineScrubEnd() {
    const cursor = document.getElementById('elev-scrub-cursor');
    if (cursor) cursor.style.display = 'none';

    if (state._scrubMarker) {
        state._scrubMarker.remove();
        state._scrubMarker = null;
    }
}

function highlightDay(dayIndex, days) {
    // Update active card
    document.querySelectorAll('.day-card').forEach((c, i) => {
        c.classList.toggle('active', i === dayIndex);
    });

    // Zoom to day segment
    const day = days[dayIndex];
    if (day.segment_coords && day.segment_coords.length > 0) {
        const bounds = day.segment_coords.reduce(
            (b, c) => b.extend(c),
            new maplibregl.LngLatBounds(day.segment_coords[0], day.segment_coords[0])
        );
        map.fitBounds(bounds, { padding: 80 });
    }

    // Highlight this segment, dim others
    state.dayLayers.forEach((id, i) => {
        map.setPaintProperty(id, 'line-opacity', i === dayIndex ? 1.0 : 0.3);
        map.setPaintProperty(id, 'line-width', i === dayIndex ? 6 : 3);
    });
}

// --- Per-day override form ---
function toggleDayOverrideForm(card, dayNumber) {
    const existing = card.querySelector('.day-override-form');
    if (existing) {
        existing.remove();
        return;
    }

    const imperial = getUnit() === 'imperial';
    const dUnit = distLabel();
    const eUnit = elevLabel();
    const sUnit = imperial ? 'mph' : 'km/h';
    const defaultDist = parseFloat(document.getElementById('daily-distance').value) || '';
    const defaultElev = parseFloat(document.getElementById('max-elevation').value) || '';
    const defaultHours = getMaxHoursPerDay() || '';
    const defaultSpeed = parseFloat(document.getElementById('avg-speed').value) || '';

    const form = document.createElement('div');
    form.className = 'day-override-form';
    form.addEventListener('click', (e) => e.stopPropagation());
    form.innerHTML = `
        <div class="override-row">
            <label>Max dist (${dUnit})</label>
            <input type="number" class="override-input" id="ov-dist-${dayNumber}" placeholder="${defaultDist}" min="1" step="1">
        </div>
        <div class="override-row">
            <label>Max elev (${eUnit})</label>
            <input type="number" class="override-input" id="ov-elev-${dayNumber}" placeholder="${defaultElev}" min="0" step="100">
        </div>
        <div class="override-row">
            <label>Max hours</label>
            <input type="number" class="override-input" id="ov-hours-${dayNumber}" placeholder="${defaultHours || 'No limit'}" min="0" max="16" step="0.5">
        </div>
        <div class="override-actions">
            <button class="override-save-btn" type="button">Save & regenerate</button>
            <button class="override-clear-btn" type="button">Clear override</button>
        </div>
    `;

    card.appendChild(form);

    // Load existing override values
    if (state.tripId) {
        apiFetch(`/api/trips/${state.tripId}/day-overrides`)
            .then(r => r.ok ? r.json() : { overrides: [] })
            .then(data => {
                const ov = (data.overrides || []).find(o => o.day_number === dayNumber);
                if (ov) {
                    if (ov.max_distance_km != null) {
                        document.getElementById(`ov-dist-${dayNumber}`).value =
                            imperial ? Math.round(ov.max_distance_km * KM_TO_MI) : Math.round(ov.max_distance_km);
                    }
                    if (ov.max_elevation_gain_m != null) {
                        document.getElementById(`ov-elev-${dayNumber}`).value =
                            imperial ? Math.round(ov.max_elevation_gain_m * M_TO_FT) : Math.round(ov.max_elevation_gain_m);
                    }
                    if (ov.max_hours != null) {
                        document.getElementById(`ov-hours-${dayNumber}`).value = ov.max_hours;
                    }
                }
            })
            .catch(() => {});
    }

    form.querySelector('.override-save-btn').addEventListener('click', () => {
        saveDayOverride(dayNumber, form);
    });
    form.querySelector('.override-clear-btn').addEventListener('click', () => {
        clearDayOverride(dayNumber, form);
    });
}

async function saveDayOverride(dayNumber, form) {
    if (!state.tripId) return;

    const imperial = getUnit() === 'imperial';
    const distVal = parseFloat(form.querySelector(`#ov-dist-${dayNumber}`).value);
    const elevVal = parseFloat(form.querySelector(`#ov-elev-${dayNumber}`).value);
    const hoursVal = parseFloat(form.querySelector(`#ov-hours-${dayNumber}`).value);

    const body = {};
    if (!isNaN(distVal)) body.max_distance_km = imperial ? distVal / KM_TO_MI : distVal;
    if (!isNaN(elevVal)) body.max_elevation_gain_m = imperial ? elevVal / M_TO_FT : elevVal;
    if (!isNaN(hoursVal)) body.max_hours = hoursVal;

    try {
        await apiFetch(`/api/trips/${state.tripId}/day-overrides/${dayNumber}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        form.remove();
        generateItinerary();
    } catch (err) {
        console.warn('Failed to save override:', err);
    }
}

async function clearDayOverride(dayNumber, form) {
    if (!state.tripId) return;

    try {
        await apiFetch(`/api/trips/${state.tripId}/day-overrides/${dayNumber}`, {
            method: 'DELETE',
        });
        form.remove();
        generateItinerary();
    } catch (err) {
        console.warn('Failed to clear override:', err);
    }
}

// --- Input parsing (lat, lon from text) ---
function parseCoordInput(value) {
    const parts = value.split(',').map(s => s.trim());
    if (parts.length === 2) {
        const lat = parseFloat(parts[0]);
        const lon = parseFloat(parts[1]);
        if (!isNaN(lat) && !isNaN(lon)) return [lon, lat];
    }
    return null;
}

// --- Event listeners ---
document.getElementById('route-btn').addEventListener('click', calculateRoute);
document.getElementById('clear-btn').addEventListener('click', newTrip);
document.getElementById('export-gpx-btn')?.addEventListener('click', exportGPX);
document.getElementById('reverse-route-btn')?.addEventListener('click', reverseRoute);
document.getElementById('generate-itinerary-btn')?.addEventListener('click', generateItinerary);
document.getElementById('trip-list-btn')?.addEventListener('click', toggleTripPanel);
document.getElementById('new-trip-btn')?.addEventListener('click', () => { newTrip(); toggleTripPanel(); });
document.getElementById('clear-all-trips-btn')?.addEventListener('click', deleteAllTrips);
document.getElementById('import-gpx-btn')?.addEventListener('click', () => {
    document.getElementById('gpx-file-input').click();
});
document.getElementById('load-gpx-route-btn')?.addEventListener('click', () => {
    document.getElementById('gpx-route-input').click();
});
document.getElementById('gpx-route-input')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) loadGpxAsRoute(file);
    e.target.value = '';
});
document.getElementById('gpx-file-input')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleGpxFileImport(file);
    e.target.value = '';
});
document.getElementById('hide-overnight-toggle')?.addEventListener('change', (e) => {
    const vis = e.target.checked ? 'none' : 'visible';
    if (map.getLayer('overnight-markers')) {
        map.setLayoutProperty('overnight-markers', 'visibility', vis);
    }
});
document.getElementById('bike-friendly-filter')?.addEventListener('change', (e) => {
    state.overnightFilters.bikeFriendlyOnly = e.target.checked;
    applyOvernightFilters();
});
document.getElementById('price-band-filter')?.addEventListener('change', (e) => {
    state.overnightFilters.maxPriceBand = e.target.value === '' ? null : parseInt(e.target.value);
    applyOvernightFilters();
});
setupTripNameEditing();

// --- Unit toggle ---
function setUnits(system) {
    const prev = state.units;
    state.units = system;
    localStorage.setItem('bikeplanner-units', system);

    // Update toggle buttons
    document.getElementById('unit-km').classList.toggle('active', system === 'metric');
    document.getElementById('unit-mi').classList.toggle('active', system === 'imperial');

    // Update labels
    document.getElementById('distance-unit-label').textContent = distLabel();
    document.getElementById('elevation-unit-label').textContent = elevLabel();
    document.getElementById('speed-unit-label').textContent = getUnit() === 'imperial' ? 'mph' : 'km/h';

    // Convert avg speed input value
    const speedInput = document.getElementById('avg-speed');
    const speedVal = parseFloat(speedInput.value);
    if (!isNaN(speedVal) && prev !== system) {
        if (system === 'imperial') {
            speedInput.value = parseFloat((speedVal * KM_TO_MI).toFixed(1));
        } else {
            speedInput.value = parseFloat((speedVal / KM_TO_MI).toFixed(1));
        }
    }

    // Convert daily distance input value
    const distInput = document.getElementById('daily-distance');
    const distVal = parseFloat(distInput.value);
    if (!isNaN(distVal) && prev !== system) {
        if (system === 'imperial') {
            distInput.value = Math.round(distVal * KM_TO_MI);
        } else {
            distInput.value = Math.round(distVal / KM_TO_MI);
        }
    }

    // Convert max elevation input value
    const elevInput = document.getElementById('max-elevation');
    const elevVal = parseFloat(elevInput.value);
    if (!isNaN(elevVal) && prev !== system) {
        if (system === 'imperial') {
            elevInput.value = Math.round(elevVal * M_TO_FT);
        } else {
            elevInput.value = Math.round(elevVal / M_TO_FT);
        }
    }

    // Re-render displays if data exists
    if (state.routeData) displayRoute(state.routeData);
    if (state.itinerary) displayItinerary(state.itinerary);
}

document.getElementById('unit-km').addEventListener('click', () => setUnits('metric'));
document.getElementById('unit-mi').addEventListener('click', () => setUnits('imperial'));

// Settings popover toggle
document.getElementById('settings-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('settings-popover').classList.toggle('open');
});
document.addEventListener('click', (e) => {
    const popover = document.getElementById('settings-popover');
    if (popover.classList.contains('open') && !popover.contains(e.target)) {
        popover.classList.remove('open');
    }
});

// Resize handler for elevation timeline canvas
window.addEventListener('resize', () => {
    if (state._timelineData && document.getElementById('elevation-timeline').style.display !== 'none') {
        drawElevationProfile();
    }
});

// Apply saved unit preference on load
if (state.units === 'imperial') setUnits('imperial');

// Export functions for chat.js
window.displayRoute = displayRoute;
window.displayItinerary = displayItinerary;
window.generateItinerary = generateItinerary;
window.displayWaypoints = displayWaypoints;
window.displayTripPois = displayTripPois;

document.getElementById('start-input').addEventListener('change', (e) => {
    const coord = parseCoordInput(e.target.value);
    if (coord) setStart(coord);
});

function displayWaypoints(data) {
    const waypoints = data.waypoints || [];

    // Handle via-points as interactive markers
    const viaPoints = waypoints
        .filter(wp => wp.waypoint_type === 'via')
        .sort((a, b) => a.sort_order - b.sort_order);

    // Clear existing via-point markers and re-add from server data
    clearViaPoints();
    viaPoints.forEach(wp => addViaPoint([wp.lon, wp.lat], wp.id));

    // Still render lodging waypoints via GeoJSON layer
    const lodgingPoints = waypoints.filter(wp => wp.waypoint_type === 'lodging');
    if (lodgingPoints.length > 0) {
        const geojson = {
            type: 'FeatureCollection',
            features: lodgingPoints.map((wp, i) => ({
                type: 'Feature',
                geometry: { type: 'Point', coordinates: [wp.lon, wp.lat] },
                properties: { ...wp, index: i },
            })),
        };

        if (map.getSource('trip-waypoints')) {
            map.getSource('trip-waypoints').setData(geojson);
        } else {
            map.addSource('trip-waypoints', { type: 'geojson', data: geojson });
            map.addLayer({
                id: 'trip-waypoints-lodging',
                type: 'circle',
                source: 'trip-waypoints',
                filter: ['==', ['get', 'waypoint_type'], 'lodging'],
                paint: {
                    'circle-radius': 7,
                    'circle-color': '#4caf50',
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#fff',
                },
            });
        }
    }
}

function displayTripPois(data) {
    const pois = data.pois || [];
    const geojson = {
        type: 'FeatureCollection',
        features: pois.map(p => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
            properties: p,
        })),
    };

    if (map.getSource('trip-pois')) {
        map.getSource('trip-pois').setData(geojson);
    } else {
        map.addSource('trip-pois', { type: 'geojson', data: geojson });
        map.addLayer({
            id: 'trip-pois-markers',
            type: 'circle',
            source: 'trip-pois',
            paint: {
                'circle-radius': 6,
                'circle-color': '#ff5722',
                'circle-stroke-width': 1.5,
                'circle-stroke-color': '#fff',
            },
        });
    }
}

document.getElementById('end-input').addEventListener('change', (e) => {
    const coord = parseCoordInput(e.target.value);
    if (coord) setEnd(coord);
});

// --- Share trip UI (hosted mode) ---
document.getElementById('share-trip-btn')?.addEventListener('click', () => {
    const panel = document.getElementById('share-trip-panel');
    panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
});

document.getElementById('share-save-btn')?.addEventListener('click', async () => {
    if (!state.tripId) {
        setStatus('No trip to share');
        return;
    }
    const pw = document.getElementById('share-password-input').value.trim();
    if (!pw) {
        setStatus('Enter a share password');
        return;
    }
    try {
        const resp = await apiFetch(`/api/trips/${state.tripId}/share-password`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pw }),
        });
        if (!resp.ok) throw new Error('Failed to set share password');
        const link = `${window.location.origin}/trip/${state.tripId}`;
        const display = document.getElementById('share-link-display');
        display.textContent = link;
        display.style.display = 'block';
        try {
            await navigator.clipboard.writeText(link);
            setStatus('Share link copied to clipboard');
        } catch (e) {
            setStatus('Share link ready (copy it manually)');
        }
    } catch (err) {
        setStatus('Failed to set share password: ' + (err.message || err));
    }
});
