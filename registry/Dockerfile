# Two stages, and the final one is FROM scratch.
#
# The registry is a single static binary with a pure-Go SQLite driver — no
# cgo, no libc, nothing to patch. A service that fetches URLs strangers choose
# is exactly the one whose image should contain as little as possible.

# The tag must be >= the `go` directive in go.mod (1.25.0) — a toolchain older
# than the module's stated version fails the build outright rather than
# degrading, which is how this was pinned at 1.23 and never built.
FROM golang:1.25-alpine AS build
WORKDIR /src

# proxy.golang.org is Google. From some networks — and from Docker's default
# bridge NAT — that TCP session is reset mid-read, which is what a failed
# `go mod download` almost always is. Comma-separated GOPROXY entries are
# tried in order on any error, including RST; `direct` is GitHub itself.
ARG GOPROXY=https://proxy.golang.org,https://goproxy.io,direct
ENV GOPROXY=${GOPROXY}

COPY go.mod go.sum ./
RUN n=0; until go mod download; do \
      n=$((n + 1)); \
      [ "$n" -ge 5 ] && exit 1; \
      echo "go mod download failed (attempt $n/5), retrying..."; \
      sleep $((n * 3)); \
    done

COPY *.go ./
# CGO_ENABLED=0 is what makes `scratch` possible, and modernc.org/sqlite is
# why it is available at all.
RUN CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /registry .

# A correctly-owned /data to seed the volume from — see the COPY in the final
# stage for why this cannot just be a VOLUME line.
#
# .keep is not decoration: BuildKit can elide a COPY whose source directory is
# empty, which would leave /data unowned and put us back where we started.
RUN mkdir -p /data && touch /data/.keep && chown -R 65532:65532 /data

# Certificates, so the fetcher can verify the https hosts it is pointed at —
# without them every manifest fetch fails at the handshake.
FROM alpine:3.20 AS certs
RUN apk add --no-cache ca-certificates

FROM scratch
COPY --from=certs /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/
COPY --from=build /registry /registry

# The linked Go modules are BSD-3 and MIT, and both require their notices to be
# reproduced in BINARY distributions — which a container image is. Dukafi's own
# terms are proprietary; that is compatible, provided these travel with it.
# Regenerate with ./scripts/third-party-notices.sh after touching go.mod.
COPY THIRD_PARTY_NOTICES LICENSE /

# The database lives on a volume. Public archives live in a Railway Storage
# Bucket when one is configured; otherwise they sit under /data/plugins.
#
# /data is COPYed in rather than conjured by the VOLUME line. Docker creates a
# volume mountpoint that does not exist in the image as root-owned, and this
# container runs as 65532 — so the very first boot would fail to create the
# SQLite file. Seeding the directory from the image means a fresh anonymous or
# named volume inherits ownership 65532 and just works. (A BIND mount takes
# the host directory's ownership instead, so those still need a chown; the
# README says so.)
COPY --from=build --chown=65532:65532 /data /data
VOLUME ["/data"]

ENV REGISTRY_DB=/data/registry.sqlite3
ENV REGISTRY_ADDR=:8080
EXPOSE 8080

# Unprivileged. `scratch` has no /etc/passwd, so this is a bare uid — which is
# all the kernel needs.
USER 65532:65532

# There is no shell and no curl in `scratch`, so the usual `CMD curl -f ...`
# is impossible. The binary probes itself instead — the only healthcheck a
# distroless image can have without giving up on being distroless.
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD ["/registry", "-health-check"]

ENTRYPOINT ["/registry"]
