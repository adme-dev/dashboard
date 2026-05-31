# Multi-Vertical CRM Platform — port `crm-dashboard` core + industry packs

**Date:** 2026-05-31
**Status:** Design approved (brainstorming) — pending spec review
**Author:** Paul + Claude
**History:** "Twenty as blueprint" → "port crm-dashboard core" → **multi-vertical platform** (this)

---

## 1. Summary

Build a **native, multi-vertical CRM platform** inside the Agency Dashboard. It consists of:

1. A **generic CRM core** — People, Companies, Opportunities, Activities, Notes, Pipeline —
   **ported** from the in-house project `/Users/paulgiurin/Documents/GitHub/crm-dashboard-main`
   (Nuxt 4 + Vue 3 + shadcn-vue + Supabase + Pinia) into the dashboard's stack (Nuxt 4 +
   Nuxt UI v4 + Neon + app-level auth + `useFetch`/`useState`).
2. **Industry "vertical packs"** layered on the core. Two mechanisms (hybrid):
   - **Code packs** for heavy/relational verticals — **automotive is Vertical Pack #1**, *kept and
     ported* from the source project (vehicles, dealerships, test-drives, appraisals, trade-ins),
     not stripped.
   - **Config packs** for lighter verticals (retail, construction, …) — defined as **data** via a
     **custom-objects / custom-fields / pipeline-template engine** (Twenty's metadata-driven model
     as the design reference). Adding a vertical = configuration, not a dev cycle.

Delivered **as-a-service to agency clients**: each `client_id` is assigned one or more verticals;
their CRM surfaces the enabled packs' objects, fields, and pipelines. Per-client data isolation;
surfaced in the client portal with agency-side oversight. No deadline pressure.

---

## 2. Goals / Non-Goals

### Goals
- Generic CRM core in our stack — one codebase, one deploy, no extra service.
- A **vertical-pack architecture**: core + packs, with `client_id → vertical(s)` assignment.
- **Reuse the automotive layer** as the first code pack (don't rebuild, don't delete).
- A **custom-objects engine** so non-code verticals are added by config.
- Reuse framework-agnostic libs as-is: `vue-flow`, `vue-draggable-plus`, `unovis`, `lucide`.

### Non-Goals (this milestone)
- Building every vertical now — retail/construction come *after* the engine exists, as proof packs.
- Porting the source project's marketing/SMS/WhatsApp/AI-enrichment/research subsystems (future).
- Keeping shadcn-vue, Supabase, or Pinia (all converted — §6).
- Generated-per-object physical tables for config verticals (we use a jsonb record store — §5).

---

## 3. Architecture overview

```
                         Client portal /portal/crm/*   ·   Agency app /agency/crm/*
                                            │
                                            ▼
                                  Nitro API: server/api/crm/*
                                            │
              ┌─────────────────────────────┼─────────────────────────────┐
              ▼                              ▼                             ▼
      GENERIC CORE                   CUSTOM-OBJECTS ENGINE           CODE PACKS
   crm_people / crm_companies      crm_object_defs / crm_field_defs   automotive:
   crm_opportunities / stages      crm_records (jsonb) / crm_views    crm_vehicles,
   crm_activities / crm_notes      → powers CONFIG verticals          crm_dealerships,
   (+ crm_custom_fields)             (retail, construction, …)        test_drives, …
              │                              │                             │
              └──────────────── Neon Postgres (all crm_* tables, client_id scoped) ───────────┘
```

- **Vertical resolution:** a `crm_client_verticals` table maps `client_id → vertical_key(s)`. On
  load, the API/UI composes: generic core + each enabled pack's objects/fields/pipelines.
- **Tenancy:** every row carries `client_id` (FK → `agency_clients`); enforced **server-side**
  (`requireAuth`/`requireClientAuth`), replacing Supabase RLS.
- **State/UI:** `useState`/`useFetch` composables; components converted to Nuxt UI v4.

---

## 4. Vertical packs — the two mechanisms

| | **Code pack** (heavy) | **Config pack** (light) |
|---|---|---|
| Example | Automotive (Pack #1) | Retail, Construction, … |
| Storage | Real `crm_*` tables w/ relations | `crm_records` rows (jsonb) keyed by `crm_object_defs` |
| Defined by | Migrations + Vue components + pages | Data: object defs, field defs, pipeline templates, view defs |
| Added by | Developers | Configuration (admin UI / seed) |
| Reference | The source project's automotive code | Twenty's metadata model (objects → fields → views) |
| When | Relational depth, custom logic, volume | Mostly records + fields + a pipeline |

This is the hybrid: automotive reuses existing relational code; new verticals avoid a dev cycle.
The **custom-fields** facility (`crm_custom_fields`, reusing the dashboard's 20+ column types) also
lets *code* verticals and the core be extended per-client without a config pack.

---

## 5. Data model (design-level; exact columns finalised at planning)

### Generic core (ported, `crm_` prefix, `client_id` added)
| Target | Source | Twenty analog | Notes |
|---|---|---|---|
| `crm_companies` | `accounts` | Company | name, domain, address, employees, custom jsonb |
| `crm_people` | `contacts` | Person | name, emails, phones, job_title, city, company_id |
| `crm_opportunities` | `deals` | Opportunity | name, amount, close_date, stage_id, owner, person/company FKs (automotive FKs live in the automotive pack, not core) |
| `crm_stages` | `deal_stages` | Stage | code, name, probability, is_won/lost, position |
| `crm_activities` | `deal_activities` | Activity | type, title, body, scheduled/completed, polymorphic target |
| `crm_notes` | `notes` | Note | body, author, polymorphic target |
| `crm_custom_fields` | new | — | object_type, key, label, field_type, options, position |

### Vertical infrastructure (new)
| Table | Role |
|---|---|
| `crm_verticals` | catalogue of available packs (key, name, kind=code\|config) |
| `crm_client_verticals` | `client_id → vertical_key` assignment(s) |
| `crm_object_defs` | config-pack object definitions (key, label, icon, vertical_key) |
| `crm_field_defs` | fields for config objects (object_def_id, key, type, options) |
| `crm_records` | jsonb-backed records for config objects (object_def_id, client_id, data jsonb) |
| `crm_pipeline_templates` | per-vertical default stage sets |
| `crm_views` | saved/seeded views (filters, columns) per object |

### Automotive code pack (ported, kept)
`crm_vehicles`, `crm_dealerships`, `crm_test_drives`, `crm_appraisals`, `crm_trade_ins`, etc. —
ported from the source project's automotive schema, `dealership_id`→`client_id`, wired to core via
opportunity/person links.

---

## 6. Port conversions (the actual work)

| Concern | From | To | Effort |
|---|---|---|---|
| UI library | shadcn-vue / reka-ui / sonner / vaul | **Nuxt UI v4** | Medium (~1wk core; automotive components additional) |
| DB access | `supabase.from()` | **`db.ts` `queryRows`/…** | Low (already behind `$fetch`) |
| Auth + isolation | Supabase auth + RLS (`dealership_id`) | **`requireAuth`/`requireClientAuth` + `client_id`** | Medium |
| State | Pinia | **`useState`/`useFetch`** | Low |
| Charts / kanban / icons | unovis / vue-flow / vue-draggable-plus / lucide | same (deps) | None–Low |

---

## 7. API & UI surface
- **API** `server/api/crm/*`: core objects (`people`, `companies`, `opportunities`, `activities`,
  `notes`, `stages`), engine (`object-defs`, `field-defs`, `records`, `views`,
  `verticals`, `client-verticals`), automotive pack routes, CSV import. All `client_id`-scoped
  server-side.
- **Client portal** `/portal/crm`: lists, record detail (slide-over), pipeline kanban, activity
  timeline, custom fields — surfacing only the client's enabled verticals.
- **Agency app** `/agency/crm`: client picker, vertical assignment, oversight — RBAC-gated.
- Nuxt UI v4 + **`frontend-design` skill** (mandatory for any form); `UFormField`, `UPopover`+
  `UCalendar` for dates (per CLAUDE.md).

---

## 8. Top risks / gotchas
1. **Scope** — this is a *platform*, not a feature. Mitigate by strict slicing (§10): ship the
   core first; the engine and packs are later, independent slices.
2. **Config-pack storage** — jsonb `crm_records` must still support filtering/sorting/search
   efficiently (GIN indexes on `data`); validate against `crm_field_defs` on write.
3. **Vertical leakage** — a client must only ever see objects/fields/records for their assigned
   verticals AND their `client_id`. Two-axis isolation; test both.
4. **UI API drift** — shadcn-vue → Nuxt UI v4 (slots, `v-model`, validation). Port in clusters.

## 8a. Licensing
Source project is in-house (MIT `nuxt-shadcn-dashboard` base). We own the ported code. Twenty is
reference only — not used or copied.

---

## 9. Decomposition (each is its own spec/plan)
This platform is several sub-projects. Build order:
- **A. Generic core port** ← *this spec's detailed focus, Slice 1 below*
- **B. Custom-objects engine** (config packs)
- **C. Automotive code pack** (port the automotive layer onto the platform)
- **D. First config vertical** (retail or construction) — proves the engine

## 10. Slices (Phase A — generic core)
- **Slice 1 — People + Companies:** port `contacts`/`accounts`; schema + API + composables;
  components → Nuxt UI v4; custom fields; CSV import; `client_id` isolation; `crm_verticals` +
  `crm_client_verticals` scaffolding; agency + portal surfaces.
- **Slice 2 — Opportunities + Pipeline:** port `deals`/`deal_stages`/`deal_activities`; kanban
  (`vue-flow` + `vue-draggable-plus`); forecasting (`unovis`); pipeline templates.
- **Slice 3 — Activities + Notes timeline.**

Phases B–D follow as their own specs once Phase A lands.

---

## 11. Open decisions (planning)
- Exact core column lists (read source migrations + `supabase_schema/tables.json`).
- Config-pack record store: confirm jsonb `crm_records` (vs generated tables) — leaning jsonb.
- Order of Phase B vs C (engine-first scalability vs automotive-first reuse value).
- Record detail: slide-over (preferred) vs full page.

## 12. Success criteria (Slice 1)
- A client logs into the portal, opens CRM, manages People + Companies with custom fields, imports
  CSV, sees only their own data, and only their assigned vertical(s).
- An agency user can assign a vertical to a client and manage that client's CRM under RBAC.
- The schema cleanly supports the engine (Phase B), automotive pack (Phase C), and core Slices 2–3
  with no rework.
