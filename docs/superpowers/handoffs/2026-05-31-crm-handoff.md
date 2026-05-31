# CRM Platform — Session Handoff (2026-05-31)

## What shipped (all MERGED to `main`)

A native, multi-vertical CRM built into the dashboard, **ported from the in-house `crm-dashboard-main`** project and converted to this stack (Nuxt UI v4 + Neon + app-auth + `useState`/`useFetch`). Twenty CRM was a **design reference only** — not run, forked, or copied (no AGPL exposure).

Four stacked PRs, squash-merged in order (`main ← #22 ← #24 ← #30 ← #32`):

| PR | Migration | Scope |
|----|-----------|-------|
| #22 | `134-crm-core.sql` | People + Companies — client-scoped CRUD, custom fields, CSV import, agency UI `/agency/crm`, nav under Clients |
| #24 | `135-crm-opportunities.sql` | Opportunities + Pipeline — stages (global defaults), move-stage, pipeline rollup, native drag-and-drop kanban, forecasting |
| #30 | `138-crm-activities.sql` | Activities/Notes timeline (polymorphic: person/company/opportunity), embedded in record slide-overs |
| #32 | — (no migration) | **Client-portal surface** — clients manage their own CRM at `/portal/crm`, fully tenant-isolated |

Merge commits on `main`: `add1ad8` (#22), `42367ec` (#24), `ecf995c` (#30), `eb0a9d5` (#32).

## Architecture / where things live

- **DB tables:** `crm_companies`, `crm_people`, `crm_custom_fields`, `crm_verticals`, `crm_client_verticals`, `crm_stages`, `crm_opportunities`, `crm_activities`. Every row scoped by `client_id` (FK `agency_clients`), soft-deleted.
- **Server utils (TDD, 13 tests in `test/crm/`):** `server/utils/crm/{queryScope,customFields,csv,stages}.ts`.
- **Agency API:** `server/api/crm/**` — `requireAuth` + `requireWriteAccess`; `client_id` from request (agency picks the client).
- **Portal API:** `server/api/client-portal/crm/**` (23 endpoints) — `requireClientAuth`; `client_id` from session (`client.clientId`), request `client_id` ignored. Tenant isolation verified by security review (no cross-tenant leakage).
- **Frontend:** components in `app/components/crm/`; composables `app/composables/useCrm*.ts`; types `app/types/crm.ts`. Pages `/agency/crm` and `/portal/crm`.
- **Reuse pattern (important):** the portal reuses the agency components UNCHANGED via **`provide/inject`** — composables read `inject('crmApiBase', '/api/crm')`; the portal page does `provide('crmApiBase', '/api/client-portal/crm')`. To point the CRM UI at any base, provide that key in the page; no component edits.

## Operational / deploy notes

- **Migrations 134, 135, 138 must run against production** when deploying (the dev DB already has them). They are additive with `IF NOT EXISTS`. Run per CLAUDE.md:
  `export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-) && psql "$DATABASE_URL" -f server/database/migrations/<file>`
- **NOT yet deployed to production** and **NOT manually browser-tested** (Chrome extension wasn't connected this session). Before calling it live: deploy, run migrations, and click-test `/agency/crm` (pick a client → People/Companies/Pipeline/Activities) and `/portal/crm` (as a client) — create/edit/delete, drag a pipeline card, log an activity, run a CSV import.
- **Migration numbering:** CRM took 134/135/138; the parallel `feat/email-marketing` work took 136/137. Email's 138? No — check the next free number before any new CRM migration; email work is active in parallel.
- **Verification done:** 13/13 unit tests; `nuxt typecheck` (must use `NODE_OPTIONS='--max-old-space-size=16384'` — it OOMs at default heap) reports zero CRM errors; SQL validated against the live schema in rolled-back transactions; per-slice spec+quality+security reviews with findings fixed.

## Known follow-ups (not bugs — deferred scope)

- **Agency opportunities list joins** aren't client-scoped (the portal one was hardened in #32). Low risk (agency staff are trusted) but apply the same `AND p.client_id = o.client_id` join scoping for consistency.
- **Related-id ownership** not validated on create (a client could store another client's person/company UUID on their own opportunity; only a name could surface — portal join now prevents that). Optional hardening: validate `person_id`/`company_id`/`target_id` belong to the client.
- **RecordForm** doesn't clear stale custom-field keys on record switch (cosmetic; server drops unknown keys).
- No portal date-picker on opportunity close date (kept in API; omitted from form to honor the "no `<input type=date>`" rule — add `UPopover`+`UCalendar` later).

## Roadmap (each its own spec/plan; specs in `docs/superpowers/specs/2026-05-31-native-crm-twenty-blueprint-design.md`)

1. **Custom-objects engine** — config-driven verticals (retail, construction, …): `crm_object_defs`/`crm_field_defs`/`crm_records` (jsonb) + pipeline templates + a vertical-assignment UI. The hybrid plan: light verticals = config, heavy = code packs.
2. **Automotive code pack** — port `crm-dashboard-main`'s automotive layer (vehicles, dealerships, test-drives, appraisals, trade-ins) as Vertical Pack #1, wired to the core.
3. **Smaller:** per-client pipeline-stage customization UI; activity reminders via the existing notifications system; portal CSV import polish.

## How to resume

Specs + plans are in `docs/superpowers/{specs,plans}/2026-05-31-*crm*`. Persistent context is in agent memory (`crm-platform.md`). The build was done in an isolated worktree at `.claude/worktrees/crm-slice-1` — branches `feat/crm-slice-{1,2,3,4}` are merged and can be deleted; the worktree can be removed.
