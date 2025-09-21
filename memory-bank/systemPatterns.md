# System Patterns & Architecture

## Architecture Overview
- Frontend: Nuxt 3 (Vue 3, TypeScript, Tailwind), Nuxt UI Dashboard base
- Server: Nuxt/Nitro server routes for API proxying, auth callbacks, webhooks
- Integrations: Xero Accounting API via OAuth 2.0
- Data: Caching layer for rate-limit protection and fast loads; database for tokens and sync metadata
- AI: External AI provider for insights (Phase 3)

## Key Patterns
- OAuth 2.0 (Authorization Code + Refresh): server-only secrets, secure storage, auto-refresh
- Multi-tenant: users can link multiple Xero organizations; scoped access per organization
- Data sync: scheduled jobs (15 min dashboard sync; hourly cash position during business hours)
- Webhooks: subscribe to Xero events (invoices, payments) to reduce polling and improve freshness
- Caching: request-level caching + precomputed aggregates; cache invalidation on webhook events
- Rate limiting: batch requests, backoff/retry, respect Xero quotas (60/min, 5,000/day)
- Reporting: server-side data shaping; client receives normalized datasets for charts/grids
- Observability: structured logging, error boundaries, health checks

## Security
- TLS in transit, AES-256 at rest (DB and any object storage)
- Principle of least privilege for tokens and scopes
- Secrets via environment variables; no secrets in client
- Audit logs for auth, data access, and admin actions

## Extensibility
- Feature modules for invoices, expenses, cash flow, reports
- Composables: `useXeroAuth`, `useXeroData`, `useAI`
- Charts and widgets as isolated components with typed props
