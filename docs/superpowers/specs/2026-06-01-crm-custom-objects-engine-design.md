# CRM Custom-Objects Engine — config verticals (Phase B)

**Date:** 2026-06-01
**Status:** Design approved (brainstorming) — pending spec review
**Author:** Paul + Claude
**Milestone scope:** Engine only (Phase B of the Multi-Vertical CRM Platform). Automotive
code pack (Phase C) and additional config verticals (Phase D) are out of scope and become
their own specs.
**Parent spec:** `docs/superpowers/specs/2026-05-31-native-crm-twenty-blueprint-design.md` (§9 Phase B)

---

## 1. Summary

Build a **metadata-driven custom-objects engine** on top of the shipped CRM core so a new
"config vertical" (retail, construction, …) is added by **data, not code**. An agency admin
defines *object types* and their *fields*; the engine stores records as JSONB, validates each
record against its field definitions, enforces per-client + per-vertical isolation, and renders
generic list / detail / pipeline UI. Records are surfaced to clients in the portal via the same
`provide/inject('crmApiBase')` pattern that already powers the agency↔portal split.

This milestone delivers the engine **plus one proof config vertical (Retail)** seeded entirely as
config, to validate the metadata model end-to-end (fields, a core relation, a pipeline).

## 2. Goals / Non-Goals

### Goals
- Four new tables (`crm_object_defs`, `crm_field_defs`, `crm_records`, `crm_pipeline_templates`)
  in **migration 140** (next free after tracking's `139`).
- JSONB record store: adding a field/object is pure config — **zero migrations**.
- Dynamic, client-scoped CRUD API for object defs, field defs, and records; records mirrored
  under the client portal.
- A config **designer UI** (agency-only) and **generic record UI** (agency + portal) driven by
  field defs, reusing existing CRM components.
- **Two-axis isolation**: a caller only ever sees defs/records for (a) their `client_id` AND
  (b) verticals in their `crm_client_verticals`.
- A seeded **Retail** proof vertical proving fields + a core relation + a pipeline.
- Pure, TDD'd server utils mirroring the shipped `server/utils/crm/` style.

### Non-Goals (this milestone)
- The automotive code pack (Phase C) — separate spec.
- Building retail/construction as production verticals beyond the Retail proof (Phase D).
- `crm_views` / saved views — deferred (the generic table derives default columns from field
  defs). Dropped from the parent spec's table list for this milestone (YAGNI).
- Config-object → config-object relations — relations target the **core only** this milestone.
- Generated-per-object physical tables — explicitly rejected; JSONB store is the decision.
- Coupling the field-type system to the board `custom_columns` 20+ type engine — the engine
  defines its own curated CRM field-type list.
- Clients self-defining schema — object/field **definition is agency-only**.

## 3. Architecture overview

Three layers, mirroring the shipped CRM slices:

```
  Agency app /agency/crm/*  ·  Client portal /portal/crm/*
                     │
                     ▼
   Nitro API:  server/api/crm/{object-defs,field-defs,records}     (definition = agency-only)
               server/api/client-portal/crm/records               (records only, client-scoped)
                     │
                     ▼
   Server utils:  server/utils/crm/engine/
                  validateRecord · buildRecordFilter ·
                  resolveClientObjects · seedVerticalFromTemplate
                     │
                     ▼
   Neon Postgres:  crm_object_defs / crm_field_defs / crm_records / crm_pipeline_templates
                   (+ existing crm_verticals / crm_client_verticals / crm_stages)
```

- **Isolation source of truth:** `resolveClientObjects(clientId)` joins `crm_client_verticals`
  → the object defs a client may see. Every record read/write resolves the object def first and
  rejects if its `vertical_key` isn't enabled for the caller's client.
- **Reuse:** the engine generalises shipped code — `crm_field_defs` ≈ `crm_custom_fields` lifted
  from "person/company only" to "any object def"; `validateRecord` generalises
  `validateCustomFields()`; `buildRecordFilter` extends the `buildWhere()` queryScope helper.
- **UI reuse:** same `provide('crmApiBase', …)` inject — zero component forking agency↔portal.

## 4. Data model (migration 140)

```sql
-- Object type definitions (the "tables" a config vertical declares).
CREATE TABLE crm_object_defs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  vertical_key TEXT NOT NULL REFERENCES crm_verticals(key) ON DELETE CASCADE,
  key          TEXT NOT NULL,              -- machine key, e.g. 'product'
  label        TEXT NOT NULL,              -- 'Product'
  label_plural TEXT NOT NULL,              -- 'Products'
  icon         TEXT,                       -- lucide name, e.g. 'i-lucide-package'
  has_pipeline BOOLEAN NOT NULL DEFAULT false,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ,
  UNIQUE (client_id, key)
);

-- Field definitions for a config object.
CREATE TABLE crm_field_defs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  object_def_id UUID NOT NULL REFERENCES crm_object_defs(id) ON DELETE CASCADE,
  key           TEXT NOT NULL,
  label         TEXT NOT NULL,
  field_type    TEXT NOT NULL DEFAULT 'text' CHECK (field_type IN (
                  'text','long_text','number','currency','date','status','dropdown',
                  'checkbox','rating','link','email','phone','location','tags','relation')),
  options       JSONB NOT NULL DEFAULT '[]'::jsonb,  -- for dropdown/status/tags
  relation_target TEXT CHECK (relation_target IN ('person','company')),  -- for field_type='relation'
  is_required   BOOLEAN NOT NULL DEFAULT false,
  is_title      BOOLEAN NOT NULL DEFAULT false,       -- the display/title field for the record
  position      INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (object_def_id, key)
);

-- JSONB-backed records for config objects.
CREATE TABLE crm_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  object_def_id UUID NOT NULL REFERENCES crm_object_defs(id) ON DELETE CASCADE,
  data          JSONB NOT NULL DEFAULT '{}'::jsonb,
  stage_id      UUID REFERENCES crm_stages(id) ON DELETE SET NULL,  -- pipeline objects only
  created_by    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at    TIMESTAMPTZ
);
CREATE INDEX idx_crm_records_scope  ON crm_records(client_id, object_def_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_crm_records_data   ON crm_records USING GIN (data);
CREATE INDEX idx_crm_records_stage  ON crm_records(stage_id) WHERE stage_id IS NOT NULL;

-- Seed templates: per-vertical object/field/pipeline definitions instantiated on assign.
CREATE TABLE crm_pipeline_templates (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  vertical_key    TEXT NOT NULL REFERENCES crm_verticals(key) ON DELETE CASCADE,
  object_def_key  TEXT NOT NULL,
  stages          JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{code,name,probability,is_won,is_lost,position}]
  UNIQUE (vertical_key, object_def_key)
);
```

Notes:
- `field_type` reuses the shipped `crm_custom_fields` enum + `long_text` + `relation`.
- `relation` stores a target UUID inside `data` (`data->>'<key>'`); `relation_target` constrains
  it to `person`|`company`. Validated on write (exists + same `client_id`); tolerated if dangling
  on read.
- Migration also seeds the **Retail** vertical (`crm_verticals` row, kind=`config`) + its object
  defs / field defs / pipeline template (see §8).

## 5. API surface

**Definition — agency-only (`requireRole`, owner/admin):**
| Method | Route |
|---|---|
| GET, POST | `/api/crm/object-defs` |
| PATCH, DELETE | `/api/crm/object-defs/[id]` |
| GET, POST | `/api/crm/object-defs/[id]/field-defs` |
| PATCH, DELETE | `/api/crm/object-defs/[id]/field-defs/[fid]` |

**Records — agency + portal (client-scoped):**
| Method | Route |
|---|---|
| GET, POST | `/api/crm/records?objectKey=<key>` (list: jsonb filter + title search, paginated) |
| GET, PATCH, DELETE | `/api/crm/records/[id]` |
| (mirror) | `server/api/client-portal/crm/records*` — scoped by `requireClientAuth(event).clientId` |

- Definition endpoints are **NOT mirrored** to the portal (clients can't define schema).
- Every record endpoint resolves the object def and enforces the two-axis isolation gate via a
  single shared helper before any read/write.
- Agency endpoints follow the shipped pattern: `requireAuth` + `requireRole` for mutations,
  client scoping via the existing `queryScope` helper.

## 6. Server utils (`server/utils/crm/engine/`, TDD)

- **`validateRecord(fieldDefs, data) → cleanData`** — generalises `validateCustomFields()`:
  coerce by type; enforce `is_required`; validate `dropdown`/`status` against `options`;
  validate `email`/`phone`/`link` format; for `relation`, confirm the target UUID exists in the
  named core table with the same `client_id`; drop unknown keys; throw with the offending key.
- **`buildRecordFilter(clientId, objectDefId, query) → { where, params }`** — extends
  `buildWhere()` to emit JSONB predicates (`data->>'key' ILIKE $n`, escaping `%`/`_` per the
  known ILIKE-injection lesson) plus a title-field search across `is_title` fields.
- **`resolveClientObjects(clientId) → ObjectDef[]`** — object defs visible to a client (joins
  `crm_client_verticals`); the isolation source of truth, used by every records call.
- **`seedVerticalFromTemplate(clientId, verticalKey)`** — on vertical assign, instantiate the
  vertical's object defs + field defs + `crm_stages` rows from `crm_pipeline_templates`.
  Idempotent (skip already-seeded).

All four get unit tests mirroring the 13 existing `test/crm/` tests, including explicit
cross-client and cross-vertical leakage tests (parent spec §8 risk #3).

## 7. UI

- **Config designer** (`/agency/crm`, agency-only tab): object-def manager + field-def manager,
  reusing the `CustomFieldsManager.vue` interaction pattern (it already does this for
  person/company custom fields — extend to the wider type list + per-object scope, incl.
  `relation_target` picker and `is_title`/`is_required` toggles).
- **Generic record surfaces**: drive `RecordsTable` / `RecordSlideover` / `RecordForm`
  (component names already present on main from Slice 4 — confirm whether already generic or need
  generalising) from field defs. Field rendering switches on `field_type` → the right Nuxt UI v4
  control (`UInput`, `UTextarea`, `USelectMenu`, `UCheckbox`, `UPopover`+`UCalendar` for dates per
  CLAUDE.md, a record-picker for `relation`). Every field wrapped in `UFormField`.
- Pipeline objects (`has_pipeline`) reuse `PipelineBoard.vue` against `crm_records.stage_id`.
- Same `provide('crmApiBase', …)` inject — agency provides `/api/crm`, portal provides
  `/api/client-portal/crm`.
- **The `frontend-design` skill is invoked before building/editing any form** (mandatory per
  CLAUDE.md), and date inputs use the `UPopover`+`UCalendar` pattern (never `UInput type=date`).

## 8. Proof vertical — Retail (seeded as config)

Seeded by migration 140 into `crm_verticals` (`key='retail'`, kind=`config`) + templates:
- **Product** object — fields: `name` (text, title), `sku` (text), `price` (currency),
  `category` (dropdown), `stock` (number). No pipeline.
- **Order** object — fields: `reference` (text, title), `customer` (relation → person),
  `total` (currency), `notes` (long_text). `has_pipeline = true`.
- **Order pipeline** template — stages: New → Paid → Fulfilled → Cancelled.

Assigning the Retail vertical to a client runs `seedVerticalFromTemplate`, creating the object
defs, field defs, and stages for that client. This exercises fields, a **core relation**
(Order→Person), and a **pipeline** end-to-end — the full engine surface.

## 9. Risks / mitigations

1. **JSONB filter performance** — GIN index on `data`; cap/paginate result sets; title search
   over `is_title` keys only.
2. **Relation integrity** — no DB FK into JSONB; validate-on-write (exists + same client),
   tolerate dangling on read (render as "—"/unresolved).
3. **Two-axis isolation leakage** — single shared gate (`resolveClientObjects`) on every records
   call; explicit cross-client + cross-vertical tests.
4. **Field-type ↔ UI drift** — one `field_type → control` mapping table shared by validation and
   rendering, so server and client agree.
5. **Migration numbering** — `140` confirmed free (main tops out at `139-tracking-enforce-origin`).
   This engine branches off `main`, independent of the parallel email branch's migration set.

## 10. Implementation slices (each its own plan / commit / verify cycle)

- **B1 — Schema + defs API + server utils:** migration 140 (+ Retail seed data), `crm/engine/`
  utils (TDD), object-def + field-def CRUD API (agency-only), types.
- **B2 — Records API + isolation:** dynamic record CRUD (`?objectKey=`), `buildRecordFilter`,
  the two-axis isolation gate, portal mirror, `seedVerticalFromTemplate` wired into vertical
  assign. Isolation tests.
- **B3 — Config designer UI:** object-def + field-def manager on `/agency/crm` (agency-only),
  built via the `frontend-design` skill.
- **B4 — Generic record UI + Retail proof:** `RecordsTable`/`RecordSlideover`/`RecordForm` driven
  by field defs, pipeline reuse, portal surface; end-to-end Retail walkthrough as the
  success-criteria check.

## 11. Success criteria

- An agency admin defines a config object with fields (incl. a core relation and a pipeline) and
  it appears in `/agency/crm` with no code change.
- Assigning the Retail vertical to a client seeds Product + Order + the order pipeline for that
  client.
- A client, in the portal, manages records for their enabled config objects — and sees **only**
  their own client's data and **only** their assigned verticals' objects (verified by tests).
- Adding a new field to a config object is a single `crm_field_defs` row — no migration, no
  deploy.
- The schema cleanly supports Phase C (automotive code pack) and Phase D (more config verticals)
  with no rework.
