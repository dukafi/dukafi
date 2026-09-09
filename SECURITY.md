# Security Policy

## Supported versions

We accept reports against:

- the `master` branch of [dukafi/core](https://github.com/dukafi/core)
- the published image `ghcr.io/dukafi/dukafi:latest`

## Reporting a vulnerability

**Do not open a public GitHub issue** for a security problem.

Report it privately using GitHub Security Advisories:

<https://github.com/dukafi/core/security/advisories/new>

Include enough to reproduce: affected route or component, Dukafi commit or
image tag, and whether the store is on SQLite or Postgres.

We will acknowledge the report, work on a fix, and agree a disclosure date
before anything is posted publicly.

Vulnerabilities in the plugin registry (`ghcr.io/dukafi/registry`) belong in
[dukafi/plugins](https://github.com/dukafi/plugins/security/advisories/new),
not this repository.
