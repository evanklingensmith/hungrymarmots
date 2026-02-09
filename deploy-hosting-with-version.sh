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
TARGET_HTML="${TMP_DIR}/public/index.html"

cleanup() {
  git worktree remove --force "${TMP_DIR}" >/dev/null 2>&1 || true
}

trap cleanup EXIT

git worktree add --detach "${TMP_DIR}" HEAD >/dev/null

if ! grep -q "__BUILD_VERSION__" "${TARGET_HTML}"; then
  echo "error: __BUILD_VERSION__ placeholder not found in ${TARGET_HTML}" >&2
  exit 1
fi

sed -i.bak "s/__BUILD_VERSION__/${BUILD_VERSION}/g" "${TARGET_HTML}"
rm -f "${TARGET_HTML}.bak"

(
  cd "${TMP_DIR}"
  firebase deploy --only hosting "$@"
)

echo "deployed hosting with BUILD_VERSION=${BUILD_VERSION}"
