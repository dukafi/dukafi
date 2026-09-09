# Railway template publication checklist

- Create a service from `ghcr.io/dukafi/dukafi:latest` (not a source build).
- Attach a persistent volume at `/data` before the first deployment.
- Set `SESSION_SECRET=${{secret(64)}}` and leave `PORT` managed by Railway.
- Set the healthcheck to `/admin/api/health`, with at least a 30-second start window.
- Confirm the service starts with one replica in the region nearest the merchant.
- Open the generated domain and complete owner setup and starter-theme selection.
- Publish the project through **Settings → Share as Template**.
- Marketplace URL: https://railway.com/deploy/dukafi-sqlite
- The README one-click button uses that URL (plus the referral query string).

For a Postgres variant, add Railway Postgres and set
`DATABASE_URL=${{Postgres.DATABASE_URL}}`. The `/data` volume remains required until
both media storage and published output use shared backends.
