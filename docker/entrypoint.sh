#!/bin/sh
# Everything that has to happen between "container started" and "serving".
#
# set -e matters more than usual here: without it a failed migration would be
# followed by a server that boots happily against a half-migrated schema and
# fails one request at a time.
set -e

APP_USER=dukafi
DATA_DIR="${DUKAFI_DATA_DIR:-/data}"

log() { echo "[dukafi] $*"; }

# ── The volume ───────────────────────────────────────────────────────────────
#
# A freshly provisioned volume is mounted root-owned, and it shadows whatever
# the image had at this path — so the chown in the Dockerfile does not survive.
# It has to happen here, on every boot, before anything tries to write.
#
# Only possible as root; when the platform already runs us as an unprivileged
# user we skip it and trust the mount to be writable.
if [ "$(id -u)" = "0" ]; then
  # `plugins` alongside the database and uploads: an installed plugin is
  # state this store chose, not something the image supplies.
  mkdir -p "$DATA_DIR" "$DUKAFI_PUBLISHED_ROOT" "$DATA_DIR/uploads" "${DUKAFI_PLUGINS_ROOT:-$DATA_DIR/plugins}"
  # -R on every boot is O(files) and a large media library makes that slow, so
  # only recurse when the top level is not already ours.
  if [ "$(stat -c %U "$DATA_DIR")" != "$APP_USER" ]; then
    log "taking ownership of $DATA_DIR"
    chown -R "$APP_USER:$APP_USER" "$DATA_DIR"
  else
    chown "$APP_USER:$APP_USER" "$DATA_DIR" "$DUKAFI_PUBLISHED_ROOT" "$DATA_DIR/uploads"
  fi
  RUN_AS="setpriv --reuid=$APP_USER --regid=$APP_USER --clear-groups"
else
  mkdir -p "$DUKAFI_PUBLISHED_ROOT" "$DATA_DIR/uploads" "${DUKAFI_PLUGINS_ROOT:-$DATA_DIR/plugins}" 2>/dev/null || true
  RUN_AS=""
fi

# ── Refuse to boot insecurely ────────────────────────────────────────────────
#
# config/session_secret.rb raises on a missing SESSION_SECRET in production,
# but it does so on the first REQUEST. Checking here turns a stream of 500s
# into one legible line in the deploy log.
if [ -z "$SESSION_SECRET" ]; then
  log "FATAL: SESSION_SECRET is not set."
  log "Every session cookie — admin login, cart ownership, order tokens — is"
  log "signed with it. Generate one with: openssl rand -hex 64"
  exit 1
fi

# ── Which database ───────────────────────────────────────────────────────────
if [ -n "$DATABASE_URL" ]; then
  log "database: postgres"
else
  log "database: sqlite at ${DUKAFI_DB}"
fi

# ── Migrate ──────────────────────────────────────────────────────────────────
#
# Idempotent: Sequel::Migrator applies only what is missing. Running it on
# every boot is what makes a redeploy the whole upgrade procedure.
#
# SKIP_MIGRATIONS exists for the multi-instance case, where exactly one
# process should migrate and the rest should just serve.
if [ "$SKIP_MIGRATIONS" = "1" ]; then
  log "skipping migrations (SKIP_MIGRATIONS=1)"
else
  log "running migrations"
  # shellcheck disable=SC2086
  $RUN_AS bundle exec ruby scripts/migrate.rb
fi

# ── The edit sidecar ─────────────────────────────────────────────────────────
#
# Owns the TypeScript half of the write path (`importHtml`), which Ruby has no
# equivalent of. Only MCP writes need it — the storefront, the admin and every
# read work without it — so a failure here degrades one feature rather than
# taking the container down.
#
# The shared token is minted per boot rather than configured. It only ever
# travels between two processes in this container (Unix socket in the image,
# loopback TCP in local bin/dev), so a fresh random value each start is
# strictly better than anything a deployer would paste into a dashboard.
SIDECAR_JS=/app/sidecar/sidecar.js

if [ "$SKIP_SIDECAR" = "1" ]; then
  log "edit sidecar disabled (SKIP_SIDECAR=1) — MCP writes will be unavailable"
elif [ ! -f "$SIDECAR_JS" ]; then
  log "no edit sidecar in this image — MCP writes will be unavailable"
else
  DUKAFI_SIDECAR_TOKEN="$(head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
  export DUKAFI_SIDECAR_TOKEN

  if [ -n "$DUKAFI_SIDECAR_SOCKET" ]; then
    rm -f "$DUKAFI_SIDECAR_SOCKET"
    log "edit sidecar starting on unix:${DUKAFI_SIDECAR_SOCKET}"
  else
    log "edit sidecar starting on 127.0.0.1:${DUKAFI_SIDECAR_PORT:-9293}"
  fi

  # Restarted if it exits. A crash should cost one request, not every edit for
  # the life of the container. The sleep keeps a persistent failure from
  # becoming a hot loop.
  (
    while true; do
      # shellcheck disable=SC2086
      $RUN_AS bun "$SIDECAR_JS" || true
      log "edit sidecar exited; restarting in 2s"
      sleep 2
    done
  ) &
fi

log "starting: $*"
# shellcheck disable=SC2086
exec $RUN_AS "$@"
