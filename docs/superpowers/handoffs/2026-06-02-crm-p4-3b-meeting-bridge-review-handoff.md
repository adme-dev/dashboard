# Code-Review Handoff — CRM P4.3b: Meeting Action-Items → CRM Tasks Bridge

- **PR:** [#105](https://github.com/adme-dev/dashboard/pull/105) — `crm-p4-3b-meeting-bridge` → `main`
- **Date:** 2026-06-02
- **Scope:** 18 files, +2509 / −3. 14 implementation commits + 2 docs + 1 review-doc.
- **Design:** `docs/superpowers/specs/2026-06-02-crm-p4-3b-meeting-bridge-design.md`
- **Plan:** `docs/superpowers/plans/2026-06-02-crm-p4-3b-meeting-bridge.md`
- **Predecessor:** P4.3 CRM AI layer (PR #101, shipped). This is the deferred "meeting bridge" item from Phase-4 PRD §7.

---

## 1. TL;DR for the reviewer

This wires office-meeting **action items** (`office_meeting_action_items`) into **CRM tasks** (`crm_tasks`). Extraction already exists; we add a CRM destination over **one shared core** (`server/utils/crm/meetingBridge.ts`), exposed through three surfaces:

1. **Office-side manual** — "Create CRM task" button + modal on the meeting artifacts panel. **Live on deploy, no flag.**
2. **CRM-side manual** — "From recent meetings" panel on the person/company slideover. **Live on deploy, agency-only.**
3. **Auto-create cron** — wired into the existing `workers/crm-cron` worker. **Dormant** — doubly-gated + flood-guarded.

**Already in prod:** migration 159 (additive) is applied to the shared prod Neon DB. Nothing else is deployed; manual surfaces go live when the PR deploys, auto-create stays off until an operator enables it.

**Test/type status:** 235/235 CRM tests green (14 new); `nuxt typecheck` 1252 = baseline (0 net-new).

The existing **board-task** bridge (`.../action-items/[id]/task.post.ts`, stamps `task_id → tasks`) is the proven sibling this mirrors. P4.3b adds a **parallel, independent** `crm_task_id → crm_tasks` path — an action item can become both a board task and a CRM task.

---

## 2. The core design decision (read this before reviewing)

A `crm_task` requires `client_id` + a target (`person | company | opportunity`). A meeting only carries `guest_emails text[]` — **no `client_id`**. So the bridge's whole job is **resolution**:

```
guest_emails → normalize → match crm_people.email → that person gives client_id + company_id
            → join open crm_opportunities → rank (opp-else-person) → target proposal(s)
```

- **opp-else-person precedence:** most-recently-updated *open* opp for the matched person (or their company), else the person. Company is offered as an *alternative*, never the default.
- **Confidence:** `'high'` iff exactly one matched person in one client; otherwise `'ambiguous'`.
- **Manual surfaces** render the proposal editable (rep can override). **Auto-create** only acts on `confidence='high'` and skips everything else with a structured reason.

---

## 3. File map (where to look)

### The core — review this first
| File | What | Review focus |
|---|---|---|
| `server/utils/crm/meetingBridge.ts` (348 lines) | The whole engine | See §4 |
| `test/crm/meetingBridge.rankTargets.test.ts` (11 tests) | Pure resolution contract | Edge cases: 0/1/many, multi-client, opp tie-break, cross-client exclusion, dedupe |
| `test/crm/meetingBridge.payload.test.ts` (3 tests) | Action-item → crm_task mapping | Title truncation, provenance, due_at |

### Migration (already applied to prod)
| `server/database/migrations/159-crm-meeting-action-item-bridge.sql` | Additive: `crm_task_id` on action items + `crm_settings.meeting_bridge_autocreate`/`_enabled_at` |

### Surface 1 — office-side manual
| File | Notes |
|---|---|
| `server/api/office/.../action-items/[actionItemId]/crm-candidates.get.ts` | Ranked proposals; office-membership auth |
| `server/api/office/.../action-items/[actionItemId]/crm-task.post.ts` | Convert; validates chosen target ∈ candidate set; `AlreadyConvertedError → 409` |
| `app/components/office/OfficeMeetingCrmTaskModal.vue` (201) | Nuxt UI v4 disambiguation modal |
| `app/components/office/OfficeMeetingArtifactsPanel.vue` (+32) | Button + "CRM linked" badge + modal mount |
| `app/types/office.ts` (+1) | `crm_task_id` on `OfficeMeetingActionItemRow` |

### Surface 2 — CRM-side manual (agency-only)
| File | Notes |
|---|---|
| `server/api/crm/people/[id]/meeting-actions.get.ts` | Client-scoped list |
| `server/api/crm/companies/[id]/meeting-actions.get.ts` | Client-scoped list |
| `server/api/crm/meeting-actions/[actionItemId]/convert.post.ts` | `requireWriteAccess`; target validated; `409` on race |
| `app/components/crm/MeetingActions.vue` (86) | "From recent meetings" panel; `isAgency` base guard |
| `app/components/crm/RecordSlideover.vue` (+1) | Mounts the panel after the task list |

### Surface 3 — auto-create cron (dormant)
| File | Notes |
|---|---|
| `server/api/cron/crm-meeting-actions.post.ts` (112) | Doubly-gated, flood-guarded, skip-reason taxonomy |
| `workers/crm-cron/src/index.ts` (+11/−3) | Adds `crm-meeting-actions` to the hourly JOBS array |

---

## 4. Review focus by concern

### 4a. Idempotency (no double-convert)
Four guards compose — confirm they hold together:
1. `office_meeting_action_items.crm_task_id` column + partial index (mig 159).
2. Pre-flight early-return: `if (actionItem.crm_task_id) return { created: false }` (re-reads both rows from DB, not the caller's snapshot).
3. In-transaction lost-race guard: `UPDATE ... WHERE id = $ AND crm_task_id IS NULL RETURNING *`; `rowCount === 0 → throw AlreadyConvertedError` (rolls back the `crm_tasks` INSERT in the same transaction).
4. Cron + CRM-list SQL pre-filter on `crm_task_id IS NULL`.

`convertActionItemToCrmTask` uses `transaction(async (client) => client.query(...))` — **not** `queryOne`/`execute` inside the txn (the documented separate-connection footgun). Verify.

### 4b. Tenant isolation
- **Office surface is cross-client by design** (a meeting carries no `client_id`; agency staff resolve against all clients — consistent with the bare-`requireAuth` precedent). The POST endpoints **validate the chosen `{client_id, target_type, target_id}` triple against the server-derived candidate set** (`crm-task.post.ts:50–57`, `convert.post.ts:45–52`) — an attacker can't inject an arbitrary cross-tenant target. The resulting `crm_task.client_id` is always coupled to the resolved target.
- **CRM-side surface is client-scoped**: `listMeetingActionsForCrmTarget` filters `crm_people` by `client_id = $2`.
- **Cron** resolves server-side and only acts on single-client matches.

Confirm there is **no path that lands a `crm_task` on the wrong `client_id`**.

### 4c. The auto-create gate chain (must be truly dormant)
`server/api/cron/crm-meeting-actions.post.ts`, in order:
1. `x-cron-secret` vs `CRON_SECRET` (dev-skipped, matches `crm-task-reminders.post.ts`).
2. `CRM_AI_ENABLED !== 'true'` → early return `{ skipped: 'flag_disabled' }`.
3. No `crm_settings.meeting_bridge_autocreate = true` rows → `{ skipped: 'no_optin_clients' }`.
4. Since-deploy cutoff: only items with `created_at >= ` the **matched** client's `meeting_bridge_enabled_at` convert (first-run flood guard; epoch-ms compare, `Number()`-coerced for pg-numeric-as-string).
5. Only `confidence='high'` converts; multi-client/multi-person/no-match/not-opted-in record a structured `crm_skip_reason` (so they don't re-scan and starve the `LIMIT 200 ORDER BY created_at ASC` window).

The worker only *appends* the job to the existing hourly trigger — no new schedule. **Verify no path converts without all of CRM_AI_ENABLED + per-client opt-in + post-cutoff.**

### 4d. SQL
- `findMeetingCrmCandidates`: `unnest(guest_emails)` LATERAL join, `lower(trim())` match, `LEFT JOIN crm_companies` for `company_name`, nil-UUID guard for empty `ANY()` arrays.
- Skip-reason filter uses `(metadata ->> 'crm_skip_reason') IS NULL` — deliberately **not** the JSONB `?` operator (placeholder-ambiguity risk across the dual pg/neon drivers).
- `listMeetingActionsForCrmTarget` interpolates `emailColumnFilter` — confirm it's a **hardcoded literal ternary** (`'p.id = $1'` / `'p.company_id = $1'`), not user input. All values are `$N`-parameterized.

### 4e. Frontend (Nuxt UI v4)
- `OfficeMeetingCrmTaskModal.vue`: modal owns its header (no duplicate UModal `title`); USelectMenu value is a non-empty composite key (never `''`); empty-state when no proposals; `chosen` computed bridges the string v-model to the POST body.
- `MeetingActions.vue`: `isAgency = base === '/api/crm'` guard + `immediate: isAgency` so it renders nothing and fires no request in the **client portal** (office data is internal). Owns its leading `USeparator` so it doesn't orphan when empty.
- The office panel's button/badge use the file's **existing raw-styled `<button>`/`<span>`** convention (that 4500-line file predates the Nuxt UI v4 mandate) — intentional local cohesion, not a regression.

---

## 5. How to verify locally

```bash
git fetch origin && git checkout crm-p4-3b-meeting-bridge
pnpm exec nuxt prepare                                  # fresh checkout
pnpm exec vitest run test/crm                           # expect 235 green
NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck   # expect 1252 (baseline, 0 net-new)
```

**Manual smoke (needs a meeting + a CRM contact whose email is a meeting guest):**
- Office: meeting artifacts panel → action item → "Create CRM task" → modal shows the cited match → submit → `crm_tasks` row created + "CRM linked" badge; re-click is idempotent.
- CRM: open that contact's slideover → "From recent meetings" → Convert → toast + item drops out.
- Auto-create: `POST /api/cron/crm-meeting-actions` with the secret returns `{ skipped: 'flag_disabled' }` while `CRM_AI_ENABLED` is unset.

> ⚠️ Prod has **no `office_meeting_sessions` rows yet**, so the bridge has nothing to act on live — all queries were validated read-only against the schema, and the resolution logic is unit-tested.

---

## 6. What was already reviewed (and fixed) during the build

Built via subagent-driven development; **every task got a spec-compliance review + a code-quality review**, and a final holistic review (verdict: **Ship**). Findings already applied:
- `rankTargets`: client-scoped opp matching (defense-in-depth), deterministic `updated_at` tie-break on `opportunity_id`, honest person/company labels (added `company_name`).
- Converter: typed `AlreadyConvertedError` (callers → 409 / cron → skip, not opaque 500); idempotent early-return re-reads from DB.
- Office POST: typed the action-item query (dropped `any`).
- Modal: removed duplicate UModal title/description.
- Cron: removed dead confidence check; stamp `client_not_opted_in` so non-opted-in matches don't re-scan/starve; sweep-level log; added `crm_task_created_by` to the conversion metadata.

So the review here is a **fresh second pass** — the per-task reviews are not a substitute for your judgment.

---

## 7. Known limitations / deliberate scope cuts (not bugs)
- **No meeting↔CRM-client linkage** in v1 — resolution is purely `guest_emails`. A future `office_meeting_sessions.client_id` would collapse multi-client ambiguity (design §9).
- **No speculative `crm_person` creation** from unmatched guest emails — capture stays a deliberate rep action.
- **`normalizeGuestEmail`** is exported but only referenced in tests (the SQL does `lower(trim())` inline) — documents the normalization contract; renamed from `normalizeEmail` to avoid a server auto-import collision with `dedupe.ts`/`email.ts`.
- Path params on the CRM GET endpoints aren't UUID-validated (a non-UUID → pg cast error → 500 not 400) — **consistent with every sibling CRM endpoint**, not introduced here.
- The PR bundles one **unrelated stray commit** (`11c33807`, a social-handoff doc on local `main` but not `origin/main`) — known local/origin divergence; safe to keep or drop on merge.

---

## 8. Activation runbook (operator, post-merge — NEVER without sign-off)
Manual surfaces are live on deploy. To enable the dormant auto-create cron:
1. `CRM_AI_ENABLED='true'` on the prod Pages project.
2. Per pilot client: `UPDATE crm_settings SET meeting_bridge_autocreate = true, meeting_bridge_enabled_at = now() WHERE client_id = '<uuid>';` (the timestamp **is** the since-deploy cutoff).
3. `workers/crm-cron` deployed with `CRON_SECRET` (matching the Pages secret). The job already runs hourly — no schedule change.

⚠️ Auto-create remains operator-gated and dormant on ship. Full detail in design §8.
