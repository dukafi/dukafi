#!/usr/bin/env bash
# Regenerate THIRD_PARTY_NOTICES from whatever the binary currently links.
#
# The dependency licences here (BSD-3 and MIT) require their notices to be
# reproduced in binary distributions. Hand-maintaining that list means it goes
# stale the first time someone runs `go get`, so it is derived instead.
#
#   ./scripts/third-party-notices.sh
#
# Run it after changing go.mod, and commit the result.

set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."

{
  cat <<'HEADER'
Dukafi plugin registry — third-party notices
============================================

This binary statically links the Go modules below. Their licences require
the copyright and permission notices to be reproduced in binary
distributions, so the full texts are included here verbatim, and this file
ships inside the published container image.

Dukafi's own source is proprietary — see LICENSE. Nothing below changes
that; these are the terms of the dependencies, not of Dukafi.

Regenerate with: ./scripts/third-party-notices.sh

HEADER

  # Every non-stdlib module actually reachable from the binary, which is a
  # smaller and more honest set than everything in go.mod.
  go list -deps -f '{{if not .Standard}}{{.Module.Path}}{{end}}' . \
    | sort -u | grep -v '^github.com/dukafi/registry$' | grep -v '^$' \
    | while read -r module; do
        dir="$(go list -m -f '{{.Dir}}' "$module")"
        version="$(go list -m -f '{{.Version}}' "$module")"
        # Globbed by hand rather than through `ls`: with `set -o pipefail`,
        # a non-matching glob makes `ls` exit 2 and takes the whole script
        # down, which is a confusing way to learn a module spells it LICENCE.
        licence=""
        for candidate in "$dir"/LICENSE* "$dir"/LICENCE* "$dir"/COPYING*; do
          if [ -f "$candidate" ]; then licence="$candidate"; break; fi
        done

        printf -- '--------------------------------------------------------------------------\n'
        printf '%s  %s\n' "$module" "$version"
        printf -- '--------------------------------------------------------------------------\n\n'
        if [ -n "$licence" ]; then
          cat "$licence"
        else
          # Loud rather than silent: a module with no licence file is something
          # to look at before shipping, not something to omit quietly.
          echo "WARNING: no licence file found in $dir — check this module before release"
        fi
        printf '\n'
      done
} > THIRD_PARTY_NOTICES

echo "wrote THIRD_PARTY_NOTICES ($(wc -l < THIRD_PARTY_NOTICES) lines)"
