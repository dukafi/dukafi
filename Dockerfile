# syntax=docker/dockerfile:1

# Dukafi — one image, either database.
#
# Three stages so the runtime carries none of the toolchain: Bun and the whole
# node_modules tree build the admin client and are thrown away; the gem build
# chain compiles pg/sqlite3/ruby-vips and is thrown away; the final stage keeps
# only the runtime libraries.
#
# amd64 only, deliberately. The publish path shells out to the Tailwind
# standalone binary at RUNTIME (services/tailwind_compiler.rb), and upstream
# ships it per-architecture; scripts/install_tailwind.rb pins the linux-x64
# checksum. Adding arm64 means pinning a second checksum, not just a buildx
# flag.

ARG RUBY_VERSION=3.4.4
ARG BUN_VERSION=1.3.0

# ── Stage 1: the admin client ────────────────────────────────────────────────
FROM oven/bun:${BUN_VERSION} AS editor

WORKDIR /editor

# Dependencies first: this layer is reused by every build that does not change
# the lockfile, which is the overwhelming majority of them.
#
# vendor/ comes along because `pixel-art-icons` is a file: dependency living
# there — bun resolves it during install, so package.json and the lockfile
# alone are not enough. It is 1.5 MB and changes about never, so it belongs in
# the cached dependency layer rather than with the source.
COPY dukafi-editor/package.json dukafi-editor/bun.lock ./
COPY dukafi-editor/vendor/ ./vendor/
RUN bun install --frozen-lockfile

COPY dukafi-editor/ ./

# vite.config.ts sets outDir to ../dukafi/public/admin, so the build writes
# outside its own root. Nothing is READ from there, so an empty directory at
# the right relative path is all it needs.
RUN mkdir -p /dukafi/public/admin && bun run build

# The edit sidecar, bundled to one file so the runtime needs the Bun binary but
# not node_modules. It carries the TypeScript half of the write path —
# `importHtml`, which Ruby has no equivalent of.
RUN bun build server/sidecar.ts --target=bun --outdir=/sidecar


# ── Stage 2: gems ────────────────────────────────────────────────────────────
FROM ruby:${RUBY_VERSION}-slim AS gems

# pg, sqlite3 and ruby-vips all build native extensions.
RUN apt-get update -qq && apt-get install --no-install-recommends -y \
      build-essential \
      libpq-dev \
      libsqlite3-dev \
      libvips-dev \
      pkg-config \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY dukafi/Gemfile dukafi/Gemfile.lock ./
RUN bundle config set --local without 'development test' \
 && bundle install --jobs 4 --retry 3 \
 && rm -rf /usr/local/bundle/cache


# ── Stage 3: runtime ─────────────────────────────────────────────────────────
FROM ruby:${RUBY_VERSION}-slim AS runtime

# The runtime halves of the build libraries: libvips42 not libvips-dev,
# libpq5 not libpq-dev. curl serves the healthcheck and fetches Tailwind.
RUN apt-get update -qq && apt-get install --no-install-recommends -y \
      ca-certificates \
      curl \
      libpq5 \
      libsqlite3-0 \
      libvips42 \
      util-linux \
 && rm -rf /var/lib/apt/lists/*

# Tailwind standalone, pinned and checksummed exactly as
# scripts/install_tailwind.rb does. Fetched here rather than by running that
# script so the layer caches independently of the application source.
ARG TAILWIND_VERSION=4.3.0
ARG TAILWIND_SHA256=73f0e5459054e5cfaa8ab6f3b940f3fbe0f13cc7fd83bc24e7c655033c203400
RUN curl -fsSL -o /usr/local/bin/tailwindcss \
      "https://github.com/tailwindlabs/tailwindcss/releases/download/v${TAILWIND_VERSION}/tailwindcss-linux-x64" \
 && echo "${TAILWIND_SHA256}  /usr/local/bin/tailwindcss" | sha256sum -c - \
 && chmod +x /usr/local/bin/tailwindcss

COPY --from=gems /usr/local/bundle /usr/local/bundle

# Bun, purely to run the edit sidecar. ~90 MB, and it is what buys writes that
# work with no editor tab open — the difference between a cloud agent being
# able to edit a store and not.
COPY --from=editor /usr/local/bin/bun /usr/local/bin/bun

WORKDIR /app
COPY dukafi/ ./
COPY --from=editor /dukafi/public/admin ./public/admin
COPY --from=editor /sidecar/sidecar.js ./sidecar/sidecar.js

# The editor bundle above is derived from Instatic, which is MIT. MIT requires
# the copyright and permission notice to travel with "all copies or substantial
# portions of the Software", and a compiled bundle of it is a substantial
# portion — so the notice ships in the image, not only in the source tree.
# Dukafi's own terms are proprietary; that combination is exactly what MIT
# permits, provided this file is here.
COPY THIRD_PARTY_NOTICES LICENSE ./

COPY docker/entrypoint.sh /usr/local/bin/entrypoint

# The container starts as root only long enough for the entrypoint to take
# ownership of a freshly mounted volume, then drops to this user via setpriv
# (from util-linux above — installed explicitly rather than relied on, since
# what a -slim image ships is not a stable contract).
#
# The check stays: it is cheap, and a silently-root container is exactly the
# kind of thing that goes unnoticed until it matters.
RUN chmod +x /usr/local/bin/entrypoint \
 && command -v setpriv > /dev/null \
 && useradd --system --create-home --shell /usr/sbin/nologin --uid 1000 dukafi \
 && mkdir -p /data /data/plugins \
 && chown -R dukafi:dukafi /app /data

# Everything the merchant owns lives on the volume, never in the image.
# TAILWINDCSS_BIN points the publish path at the binary above instead of the
# vendored one, which is not in the image.
ENV RACK_ENV=production
ENV APP_ENV=production
ENV PORT=9292
ENV TAILWINDCSS_BIN=/usr/local/bin/tailwindcss
ENV DUKAFI_DB=/data/dukafi.sqlite3
ENV DUKAFI_PUBLISHED_ROOT=/data/published
ENV DUKAFI_STORAGE_ROOT=/data
# Installed plugins live on the VOLUME, so an operator drops one in, restarts,
# and it survives the next deploy. The image itself ships none: a store has
# the payment providers its owner installed and no others. First-party
# plugins are distributed in `plugins-available/` in the repo.
ENV DUKAFI_PLUGINS_ROOT=/data/plugins
# Where Ruby reaches the edit sidecar. Loopback only — it applies arbitrary
# edits, so it must never be published. The entrypoint mints its shared token
# per boot, so there is nothing here for a deployer to configure.
ENV DUKAFI_SIDECAR_PORT=9293
ENV DUKAFI_SIDECAR_URL=http://127.0.0.1:9293
ENV BUNDLE_WITHOUT="development:test"

VOLUME ["/data"]
EXPOSE 9292

# The health route lives INSIDE AdminApi, which is mounted at /admin/api — a
# bare /health falls through to the storefront and 404s. Not adding a
# top-level /health on purpose: it would shadow any merchant page with the
# slug "health", which a store could plausibly want.
#
# Hitting the app rather than the port proves the process booted, which in
# turn proves the database connected: config/database.rb connects at load, so
# a bad DATABASE_URL never gets as far as listening.
HEALTHCHECK --interval=30s --timeout=5s --start-period=25s --retries=3 \
  CMD curl -fsS "http://127.0.0.1:${PORT}/admin/api/health" || exit 1

ENTRYPOINT ["/usr/local/bin/entrypoint"]

# Shell form so ${PORT} expands: Railway assigns the port at run time and the
# process must bind to whatever it is handed.
CMD ["sh", "-c", "exec bundle exec puma -b tcp://0.0.0.0:${PORT}"]
