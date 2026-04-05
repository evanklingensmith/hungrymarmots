#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null || true)"
if [[ -z "${REPO_ROOT}" ]]; then
  echo "error: run this script from inside a git repository" >&2
  exit 1
fi

cd "${REPO_ROOT}"

if ! command -v firebase >/dev/null 2>&1; then
  echo "error: firebase CLI not found in PATH" >&2
  exit 1
fi

BUILD_VERSION="${BUILD_VERSION:-$(git rev-parse --short=12 HEAD)-$(date -u +%Y%m%d%H%M%S)}"
TMP_DIR="$(mktemp -d -t hm-deploy-XXXXXX)"

cleanup() {
  rm -rf "${TMP_DIR}" >/dev/null 2>&1 || true
}

trap cleanup EXIT

# Deploy from the current working tree so local (uncommitted) fixes are included.
mkdir -p "${TMP_DIR}"
cp -R "${REPO_ROOT}/." "${TMP_DIR}/"
rm -rf "${TMP_DIR}/.git"

TARGET_HTML="${TMP_DIR}/public/index.html"

if ! grep -q "__BUILD_VERSION__" "${TARGET_HTML}"; then
  echo "error: __BUILD_VERSION__ placeholder not found in ${TARGET_HTML}" >&2
  exit 1
fi

sed -i.bak "s/__BUILD_VERSION__/${BUILD_VERSION}/g" "${TARGET_HTML}"
rm -f "${TARGET_HTML}.bak"

# Build bike frontend (hosted mode)
BIKE_DIR="${TMP_DIR}/bike"
if [[ -d "${BIKE_DIR}/frontend" ]]; then
  echo "Building bike frontend..."
  rm -rf "${BIKE_DIR}/public-dist" && mkdir -p "${BIKE_DIR}/public-dist"
  cp "${BIKE_DIR}/frontend/index.html" "${BIKE_DIR}/public-dist/"
  cp "${BIKE_DIR}/frontend/app.js" "${BIKE_DIR}/public-dist/"
  cp "${BIKE_DIR}/frontend/style.css" "${BIKE_DIR}/public-dist/"
  cp "${BIKE_DIR}/frontend/firestore.js" "${BIKE_DIR}/public-dist/"
  cp "${BIKE_DIR}/frontend/auth.js" "${BIKE_DIR}/public-dist/"
  sed -i.bak 's/BIKEPLANNER_MODE_PLACEHOLDER/hosted/' "${BIKE_DIR}/public-dist/index.html"
  rm -f "${BIKE_DIR}/public-dist/index.html.bak"
  # __FIREBASE_CONFIG__ left as-is — /__/firebase/init.js handles it on Firebase Hosting
  sed -i.bak 's|__FIREBASE_CONFIG__|null|g' "${BIKE_DIR}/public-dist/index.html"
  rm -f "${BIKE_DIR}/public-dist/index.html.bak"
fi

(
  cd "${TMP_DIR}"
  firebase deploy --only hosting "$@"
)

echo "deployed hosting with BUILD_VERSION=${BUILD_VERSION}"
