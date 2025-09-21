# Tech Context

## Stack
- Nuxt 3, Vue 3, TypeScript, Tailwind CSS, Nuxt UI Pro (dashboard template)
- Nitro server routes for API, auth, webhooks
- Node 18+

## Xero Integration
- OAuth 2.0 Authorization Code with refresh tokens
- Official SDK option: `xero-node` (Node.js) or direct REST via `ofetch`
- Store: access/refresh tokens, organization connections, consented scopes, token expiry

## Data & Storage (to be selected)
- Database for tokens/sync metadata (SQLite/Postgres initially; plan Postgres in cloud)
- Caching layer (in-memory for dev; Redis/Upstash/Vercel KV for prod)

## Scheduling & Webhooks
- Scheduled sync (15m dashboard, hourly cash position) via Nitro cron or external scheduler (e.g., GitHub Actions, Cloud scheduler)
- Webhook endpoint for Xero events to trigger cache invalidation and fast UI updates

## Environment Variables (proposed)
- `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`
- `XERO_REDIRECT_URI`
- `SESSION_SECRET`
- `DATABASE_URL`
- `CACHE_URL` (optional)

## Dev Setup
- Install: `pnpm install`
- Run: `pnpm dev`
- Lint: `pnpm lint`

## Constraints & Notes
- Template currently has no DB; add minimal persistence for tokens early in Phase 1
- Avoid leaking secrets to client; keep OAuth on server routes
- Respect rate limits with caching and batching
