# Dukafi 1.0 release checklist

- [ ] Fresh-VM compose deploy completed from README alone
- [ ] Railway template deployed from the published button
- [ ] Owner setup → starter theme → product → publish completed
- [ ] Real M-Pesa payment completed on a live PayHero account
- [ ] Confirmation email received
- [ ] BYOK chat and image generation tested, including provider fallback
- [ ] MCP connection tested against the deployed URL
- [ ] Backup and restore drill completed
- [ ] `scripts/smoke-replicas.sh` passed
- [ ] Changelog reviewed
- [ ] Clean commit tagged `v1.0.0`
- [ ] Multi-platform image pushed with `deploy-image`
- [ ] GitHub release published

Never mark credential-dependent checks complete from a mocked or local-only run.
