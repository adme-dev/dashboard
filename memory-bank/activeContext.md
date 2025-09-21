# Active Context

## Current Focus
Phase 1: Core Dashboard — establish authentication, baseline KPIs, and essential reports.

## Recent Changes
- Initialized Memory Bank from PRD
- Drafted architecture and tech context

## Next Steps
- Implement Xero OAuth 2.0 (server routes, secure token storage, refresh)
- Build dashboard KPI data endpoints and UI
- Add P&L and Balance Sheet reports (server shaping + pages)
- Prepare staging deployment and env configuration

## Decisions
- Use Nuxt/Nitro server routes for OAuth and Xero proxying
- Introduce minimal persistence (SQLite/Prisma) for tokens and sync metadata
- Start with request-level caching; expand to Redis in prod

## Open Questions
- Preferred cloud provider and DB (e.g., Supabase/Postgres vs managed Postgres)?
- Choose `xero-node` vs direct REST for long-term maintainability?
