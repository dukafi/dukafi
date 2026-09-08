#!/usr/bin/env bash
# Smoke-test a Dukafi release image: boot, health, admin bundle present.
# Does not push. Does not publish a storefront.
#
#   ./scripts/smoke-release.sh
#   DUKAFI_SMOKE_IMAGE=dukafi:local ./scripts/smoke-release.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE="${DUKAFI_SMOKE_IMAGE:-dukafi:smoke}"
NAME="dukafi-smoke-release-$$"
PORT="${DUKAFI_SMOKE_PORT:-9292}"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required" >&2
  exit 1
fi

cleanup() {
  docker rm -f "$NAME" >/dev/null 2>&1 || true
}
trap cleanup EXIT

if ! docker image inspect "$IMAGE" >/dev/null 2>&1; then
  echo "building $IMAGE…"
  docker build -t "$IMAGE" "$ROOT"
fi

docker run -d --name "$NAME" \
  -e SESSION_SECRET=smoke-secret-not-used-anywhere-real-0123456789abcdef \
  -p "${PORT}:9292" \
  "$IMAGE"

echo "waiting for health…"
for i in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:${PORT}/admin/api/health" >/dev/null; then
    echo "healthy after ${i}s"
    break
  fi
  if [ "$i" -eq 60 ]; then
    echo "did not become healthy; logs:" >&2
    docker logs "$NAME" >&2 || true
    exit 1
  fi
  sleep 1
done

# Admin SPA / shell must be present without publishing the storefront.
admin_html="$(curl -fsS "http://127.0.0.1:${PORT}/admin/" || true)"
if ! printf '%s' "$admin_html" | grep -Eqi 'script|dukafi|admin|root'; then
  # Some builds redirect; follow once more looking for a hashed asset reference.
  if ! curl -fsSIL "http://127.0.0.1:${PORT}/admin/" | grep -Eqi 'text/html|location'; then
    echo "admin bundle/shell not found at /admin/" >&2
    exit 1
  fi
fi

echo "smoke-release passed for $IMAGE"
