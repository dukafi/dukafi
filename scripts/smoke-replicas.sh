#!/usr/bin/env bash
set -euo pipefail

files=(-f compose.prod.yml -f compose.postgres.yml -f compose.caddy.yml -f compose.scale.yml)
cleanup() { docker compose "${files[@]}" down -v; }
trap cleanup EXIT

docker compose "${files[@]}" up -d --wait
origin="https://${DOMAIN:?DOMAIN is required}"
curl_args=(-fsS --retry 20 --retry-delay 2)
curl "${curl_args[@]}" "${origin}/admin/api/health"

for _ in $(seq 1 20); do
  curl "${curl_args[@]}" "${origin}/" >/dev/null
done

replicas=$(docker compose "${files[@]}" ps --format json dukafi | wc -l)
test "$replicas" -ge 2
echo "replica smoke passed with ${replicas} app containers"
