// auth.js — Authentication module for hosted Bikeplanner
// Handles site-wide password gate, per-trip share passwords, and Firebase anonymous auth

(function () {
    'use strict';

    // -------------------------------------------------------------------------
    // Inject auth-overlay styles
    // -------------------------------------------------------------------------
    const style = document.createElement('style');
    style.textContent = `
        #auth-overlay, #trip-auth-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.7);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
        }
        .auth-box {
            background: #fff;
            padding: 32px;
            border-radius: 12px;
            max-width: 360px;
            width: 90%;
            text-align: center;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        .auth-box h2 {
            margin: 0 0 8px;
            font-size: 22px;
        }
        .auth-box p {
            margin: 0 0 16px;
            color: #555;
            font-size: 14px;
        }
        .auth-box input[type="password"] {
            width: 100%;
            padding: 10px 12px;
            border: 1px solid #ccc;
            border-radius: 6px;
            font-size: 15px;
            box-sizing: border-box;
        }
        .auth-box input[type="password"]:focus {
            outline: none;
            border-color: #4a90d9;
            box-shadow: 0 0 0 2px rgba(74, 144, 217, 0.25);
        }
        .auth-box button[type="submit"] {
            margin-top: 12px;
            width: 100%;
            padding: 10px;
            background: #4a90d9;
            color: #fff;
            border: none;
            border-radius: 6px;
            font-size: 15px;
            cursor: pointer;
        }
        .auth-box button[type="submit"]:hover {
            background: #3a7bc8;
        }
    `;
    document.head.appendChild(style);

    // -------------------------------------------------------------------------
    // Site password gate
    // -------------------------------------------------------------------------

    function initAuth() {
        // Only activate in hosted mode
        if (window.BIKEPLANNER_CONFIG?.mode !== 'hosted') return;

        // Skip site password gate for /trip/{id} URLs — trip password handles auth
        if (window.location.pathname.match(/^\/trip\/[a-zA-Z0-9_\-]+/)) return;

        // Check sessionStorage for a cached custom token
        var cachedToken = sessionStorage.getItem('bike-auth-token');
        if (cachedToken) {
            firebase.auth().signInWithCustomToken(cachedToken)
                .then(function () { hidePasswordGate(); })
                .catch(function () { showPasswordGate(); });
            return;
        }

        // Check if already signed in with bikeAccess claim
        firebase.auth().onAuthStateChanged(function (user) {
            if (user) {
                user.getIdTokenResult().then(function (result) {
                    if (result.claims.bikeAccess) {
                        hidePasswordGate();
                    } else {
                        showPasswordGate();
                    }
                });
            } else {
                showPasswordGate();
            }
        });
    }

    function showPasswordGate() {
        var overlay = document.getElementById('auth-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'auth-overlay';
            overlay.innerHTML =
                '<div class="auth-box">' +
                    '<h2>Bikeplanner</h2>' +
                    '<p>Enter the site password to continue.</p>' +
                    '<form id="auth-form">' +
                        '<input type="password" id="auth-password" placeholder="Password" autocomplete="current-password">' +
                        '<button type="submit">Enter</button>' +
                        '<div id="auth-error" style="display:none;color:#e83e3e;margin-top:8px;font-size:13px;"></div>' +
                    '</form>' +
                '</div>';
            document.body.appendChild(overlay);

            document.getElementById('auth-form').addEventListener('submit', function (e) {
                e.preventDefault();
                verifySitePassword();
            });
        }
        overlay.style.display = 'flex';
    }

    function hidePasswordGate() {
        var overlay = document.getElementById('auth-overlay');
        if (overlay) overlay.style.display = 'none';
    }

    async function verifySitePassword() {
        var pw = document.getElementById('auth-password').value;
        var errEl = document.getElementById('auth-error');
        errEl.style.display = 'none';

        try {
            var resp = await fetch('/api/auth/verify-site-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password: pw }),
            });

            if (!resp.ok) {
                errEl.textContent = 'Incorrect password';
                errEl.style.display = 'block';
                return;
            }

            var data = await resp.json();
            await firebase.auth().signInWithCustomToken(data.token);
            sessionStorage.setItem('bike-auth-token', data.token);
            hidePasswordGate();
        } catch (err) {
            errEl.textContent = 'Connection error. Please try again.';
            errEl.style.display = 'block';
        }
    }

    // -------------------------------------------------------------------------
    // Trip share password
    // -------------------------------------------------------------------------

    async function verifyTripPassword(tripId, password) {
        try {
            var resp = await fetch('/api/auth/verify-trip-password', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ trip_id: tripId, password: password }),
            });
            if (!resp.ok) return false;
            var data = await resp.json();
            await firebase.auth().signInWithCustomToken(data.token);
            sessionStorage.setItem('bike-auth-token', data.token);
            return true;
        } catch (err) {
            return false;
        }
    }

    function showTripPasswordPrompt(tripId) {
        var overlay = document.getElementById('trip-auth-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'trip-auth-overlay';
            overlay.innerHTML =
                '<div class="auth-box">' +
                    '<h2>Trip Access</h2>' +
                    '<p>Enter the password for this trip.</p>' +
                    '<form id="trip-auth-form">' +
                        '<input type="password" id="trip-auth-password" placeholder="Trip password" autocomplete="off">' +
                        '<button type="submit">Enter</button>' +
                        '<div id="trip-auth-error" style="display:none;color:#e83e3e;margin-top:8px;font-size:13px;"></div>' +
                    '</form>' +
                '</div>';
            document.body.appendChild(overlay);
        }
        overlay.style.display = 'flex';

        return new Promise(function (resolve) {
            var form = document.getElementById('trip-auth-form');
            var handler = async function (e) {
                e.preventDefault();
                var pw = document.getElementById('trip-auth-password').value;
                var ok = await verifyTripPassword(tripId, pw);
                if (ok) {
                    overlay.style.display = 'none';
                    form.removeEventListener('submit', handler);
                    resolve(true);
                } else {
                    var errEl = document.getElementById('trip-auth-error');
                    errEl.textContent = 'Incorrect password';
                    errEl.style.display = 'block';
                }
            };
            form.addEventListener('submit', handler);
        });
    }

    // -------------------------------------------------------------------------
    // Auth header helper for API calls
    // -------------------------------------------------------------------------

    async function getAuthHeaders() {
        var user = firebase.auth().currentUser;
        if (!user) return {};
        var token = await user.getIdToken();
        return { 'Authorization': 'Bearer ' + token };
    }

    // -------------------------------------------------------------------------
    // Expose public API on window
    // -------------------------------------------------------------------------

    window.initAuth = initAuth;
    window.getAuthHeaders = getAuthHeaders;
    window.showTripPasswordPrompt = showTripPasswordPrompt;
    window.verifyTripPassword = verifyTripPassword;

})();
