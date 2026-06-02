# Design — CRM P4.3b: Meeting Action-Items → CRM Tasks Bridge

- **Status:** Approved for planning
- **Date:** 2026-06-02
- **Owner:** Paul (paul@adme.net.au)
- **Parent PRD:** `docs/superpowers/specs/2026-06-02-crm-phase4-intelligence-prd.md` (§7, Phase 4.3 — "Integrate office-meeting action-items → CRM tasks")
- **Predecessor:** P4.3 CRM AI layer (next-best-action + draft follow-up) — PR #101, shipped + deployed

---

## 1. Background & Motivation

The office-meeting system already extracts structured follow-up actions into
`office_meeting_action_items` (migration 114) and can convert one into a
**board/workflow task** via
`POST /api/office/:officeId/meetings/:meetingId/action-items/:id/task`
(stamps `office_meeting_action_items.task_id → tasks(id)`, migration 115).

What's missing — and what the Phase-4 PRD §7 calls for — is the parallel bridge
to **CRM tasks** (`crm_tasks`). A follow-up captured in a client/sales meeting
should land where reps work the relationship: on the CRM person, company, or
open opportunity. Today it can only become a generic board task.

**This is a wiring job, not a rebuild.** Extraction already exists. We add a
second, independent destination (CRM) over a shared resolution+conversion core,
exposed through three surfaces.

### The core challenge — resolution
A `crm_task` requires `client_id` + a target (`person | company | opportunity`).
A meeting only carries `guest_emails text[]` (no `client_id`). So the bridge's
central logic is: **match `guest_emails` → `crm_people.email`** → the matched
person yields `client_id` + `company_id` + (optionally) an open opportunity to
attach to.

### Non-goals
- Re-extracting action-items (the office system owns extraction).
- Replacing or modifying the existing board-task bridge (it stays; CRM is additive and independent).
- Building meeting↔CRM-client linkage on the meeting record (deferred enhancement — see §9).
- Speculative `crm_person` creation from unmatched guest emails (explicit anti-goal — §4).
- Any LLM call. Resolution is deterministic email matching; this is not "AI", it's plumbing. (Only the *auto-create trigger* sits behind the AI flag for rollout safety — §6.3.)

---

## 2. Architecture — one core, three surfaces

```
guest_emails (meeting)
   │ normalize (trim/lowercase)
   ▼
match crm_people.email  (tenant-scoped, soft-deleted excluded)
   │ join open crm_opportunities
   ▼
rankTargets()  → TargetProposal[]   (opp-else-person, ranked, multi-client aware)
   │
   ├─ manual surface → render proposal, rep picks/overrides
   └─ auto surface   → take [0] iff unambiguous, else skip+reason
   ▼
convertActionItemToCrmTask()  (transactional · idempotent · audited)
   ▼
crm_task created  +  action_item.crm_task_id stamped
```

### 2.1 Shared core — `server/utils/crm/meetingBridge.ts` (TDD)

**Pure (no DB, unit-tested):**

- `normalizeEmail(s: string): string` — trim + lowercase.
- `rankTargets(input): TargetProposal[]`
  - **Input:** normalized guest emails; candidate `crm_people` rows (already
    matched by the DB layer); their open `crm_opportunities`.
  - **Output:** ranked `TargetProposal[]`. Each:
    ```ts
    {
      client_id: string
      target_type: 'opportunity' | 'person' | 'company'
      target_id: string
      label: string            // e.g. "Acme renewal" / "Jane Doe"
      matched_email: string    // the guest email that produced this — cited
      person_id: string        // the matched person (provenance)
      confidence: 'high' | 'ambiguous'  // single-person/single-client = high
      alternatives: TargetRef[] // other valid targets for manual override
    }
    ```
  - **Precedence (opp-else-person):** for each matched person, the
    most-recently-updated (`updated_at DESC`) **open** opportunity for that
    person/company becomes the target; with no open opp, the **person** is the
    target. Company is offered as an *alternative*, never the default.
  - **Multi-client / multi-person:** every distinct match becomes its own
    proposal; `confidence='ambiguous'` whenever there is more than one matched
    person or more than one client. A single person in a single client →
    `confidence='high'`.
  - **Zero matches:** returns `[]`.
- `buildCrmTaskPayload(actionItem, target): CrmTaskInsert`
  - Pure mapping. `title` = `actionItem.content` (≤255). `description` carries
    provenance (meeting title, meeting id, action-item id, source artifact id —
    mirrors the board endpoint's `taskDescription`). `task_type = 'meeting'`.
    `priority` from caller (default `'medium'`). `due_at = actionItem.due_at`.
    `assigned_to` left null in v1 (action-item `assignee_user_id` is a
    `team_members` id, not a CRM-task assignee convention — keep null, rep can set).

**DB-touching (thin, integration-tested):**

- `findMeetingCrmCandidates(meetingId): { people, opps }` — the scoped match
  query: meeting's `guest_emails` ⨝ `crm_people.email` (case-insensitive,
  `deleted_at IS NULL`), then the people's open opportunities. Tenant scoping via
  `queryScope.ts`.
- `convertActionItemToCrmTask(actionItem, target, { actor, mode }): { task, actionItem, created }`
  - **Transactional + idempotent.** If `actionItem.crm_task_id` already set →
    return `{ created: false, task }` (re-fetch existing). Else, inside one
    `transaction()`:
    1. INSERT `crm_task` from `buildCrmTaskPayload`.
    2. UPDATE `office_meeting_action_items SET crm_task_id = $task, metadata = metadata || {crm_task_id, crm_task_created_at, crm_task_created_by, crm_bridge_mode}` .
    3. Write a CRM audit row (actor, source meeting/action-item, resolved target, `mode: 'manual_office' | 'manual_crm' | 'auto'`).
  - **Single source of truth — all three surfaces call this.** Never duplicates a
    task; never throws on the already-converted path.

### 2.2 Schema — one additive migration

Next free number is **159** (highest on disk is 158 — re-verify at write time;
migration numbers drift across parallel sessions).

```sql
-- 159-crm-meeting-action-item-bridge.sql
BEGIN;
ALTER TABLE office_meeting_action_items
  ADD COLUMN IF NOT EXISTS crm_task_id uuid REFERENCES crm_tasks(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_office_meeting_action_items_crm_task
  ON office_meeting_action_items(crm_task_id) WHERE crm_task_id IS NOT NULL;
COMMIT;
```

Independent of the existing `task_id` (board) column — one action-item can become
both a board task and a CRM task. **Per-client auto-create opt-in** lives in the
existing `crm_settings` table (mig 148) as a JSONB/boolean key (e.g.
`meeting_bridge_autocreate`) — confirm the column shape at plan time; no new
table.

`.env DATABASE_URL` is the **live prod DB** — this migration is immediately live
on apply. Additive + `IF NOT EXISTS`, so safe.

---

## 3. The three surfaces

### 3.1 Office-side (manual) — ships first, fully usable alone
- `GET  /api/office/:officeId/meetings/:meetingId/action-items/:id/crm-candidates`
  — auth: office membership. Returns `findMeetingCrmCandidates` → `rankTargets`
  proposals (ranked, with cited `matched_email` and `alternatives`).
- `POST /api/office/:officeId/meetings/:meetingId/action-items/:id/crm-task`
  — auth: office membership. Body: chosen `{ target_type, target_id, client_id, priority? }`.
  Validates the chosen target is among the candidate set (no arbitrary
  cross-tenant target injection), then calls `convertActionItemToCrmTask(..., mode:'manual_office')`.
  Idempotent return mirrors the board endpoint (`{ actionItem, task, created }`).
- **UI:** a **"Create CRM task"** action beside the existing "Create task" button
  in `app/components/office/OfficeMeetingArtifactsPanel.vue`, opening a small
  Nuxt UI v4 disambiguation modal: pre-selects the top proposal, shows the cited
  match ("from jane@acme.com → Jane Doe · Acme renewal"), lets the rep override
  target + priority. Zero candidates → the modal routes to a CRM contact search /
  "no CRM match" empty state (never a silent speculative insert).

### 3.2 CRM-side surfacing (manual)
- `GET /api/crm/:targetType/:id/meeting-actions` — auth: CRM read. Returns
  *unconverted* (`crm_task_id IS NULL`) action-items whose meeting `guest_emails`
  overlap this contact's email. Tenant-scoped.
- `POST /api/crm/meeting-actions/:actionItemId/convert` — auth: CRM write
  (`requireWriteAccess`). Target is the contact in context (validated to match the
  action-item's resolved candidate set). Calls the shared core, `mode:'manual_crm'`.
- **UI:** a **"From recent meetings"** section in the CRM person/company slideover
  (alongside `app/components/crm/AiSuggestions.client.vue`). Each row = action-item
  content + meeting + a Convert button. Implicit target = the record you're on.

### 3.3 Auto-create (flag-gated, dormant on ship)
- `POST /api/cron/crm-meeting-actions` — `x-cron-secret` gated, on the existing
  `workers/crm-cron` companion Worker (the P4.1 worker; add one schedule/handler).
- **Self-gates (all must hold):** `CRM_AI_ENABLED='true'` **AND** the per-client
  `crm_settings` opt-in **AND** a since-deploy cutoff (only action-items created
  after the feature's enable timestamp — first-run flood guard, mirroring the
  anomalies runbook in CLAUDE.md).
- Converts **only `confidence='high'`** (single-person, single-client)
  unconverted action-items via the core util, `mode:'auto'`.
- **Multi/zero matches → skip cleanly:** record a structured `crm_skip_reason`
  (`'ambiguous_multi_person' | 'ambiguous_multi_client' | 'no_crm_match'`) in the
  action-item metadata for observability. Never throws, never guesses, never
  creates contacts.

---

## 4. Enterprise hardening (cross-cutting)

- **Explainable:** every proposal cites the signal (`matched_email → person`), per
  the PRD's "suggestions must be explainable."
- **Idempotent:** `crm_task_id` guard → double-clicks and cron re-runs never
  duplicate. The convert path is safe to call repeatedly.
- **Audited:** every conversion writes a CRM audit row (F12) — actor, source
  meeting, resolved target, manual-vs-auto mode.
- **Tenant-isolated:** all matching + writes go through `queryScope.ts`;
  case-insensitive trimmed email match; soft-deleted people excluded; chosen
  targets validated against the candidate set (no cross-tenant injection).
- **No speculative writes:** unmatched guest emails never auto-create
  `crm_person` rows. Capture is a deliberate rep action via the CRM's existing
  dedupe-aware create flow.
- **Posture:** **manual surfaces ship ungated** (rep-initiated, deterministic, no
  LLM — same posture as the existing board bridge). **Auto-create is the only
  flag-gated piece**, doubly-gated + flood-guarded, dormant until the operator
  enables it.

---

## 5. Error handling
- 404 — action-item / meeting not found (or not in this office/tenant).
- 403 — not an office member (office endpoints) / no CRM write access (CRM endpoints).
- Already converted → idempotent `{ created: false, task }` (no error).
- Auto-create skip → no error; structured `crm_skip_reason` recorded.
- Chosen target not in candidate set → 400 (guards against injected cross-tenant targets).

---

## 6. Testing
- **Pure-util unit tests** (`test/crm/meetingBridge.*`): `rankTargets` across
  0 / 1 / many matches, multi-client, opp-else-person precedence, `updated_at`
  tie-break, confidence classification; `buildCrmTaskPayload` mapping (title
  truncation, provenance description, due_at passthrough).
- **Conversion idempotency** — real-DB probe (throwaway, per handoff §5 pattern):
  convert twice → one `crm_task`, `created:false` second time.
- **Endpoint tests** — auth (403 paths), validation (400 on out-of-set target),
  candidate listing shape.
- Baseline: `pnpm exec vitest run test/crm` green; `nuxt typecheck` 0 NEW errors
  (16384 heap).

---

## 7. Suggested slices (for the implementation plan)
- **P4.3b-1** — core util (`meetingBridge.ts`) + migration 159 + office-side
  endpoints & UI button. Manual office path, shippable + usable alone.
- **P4.3b-2** — CRM-side surfacing (read endpoint + slideover section + convert
  endpoint).
- **P4.3b-3** — auto-create cron handler on `workers/crm-cron` (gated, dormant on
  ship) + flood-guard/opt-in wiring + runbook note.

Each slice is independently mergeable; the core util lands in -1 and -2/-3 reuse
it unchanged.

---

## 8. Activation (operator, post-merge — no auto-enable)
Manual surfaces are live on deploy. To enable **auto-create**:
1. Confirm `CRM_AI_ENABLED='true'` on prod Pages.
2. Set per-client `crm_settings.meeting_bridge_autocreate` opt-in for the pilot client(s).
3. Ensure `workers/crm-cron` is deployed with `CRON_SECRET` and the new schedule.
4. Since-deploy cutoff means only *new* action-items convert — no backlog flood.

⚠️ Never enable auto-create without explicit go-ahead (consistent with the
project's standing rule on gated AI/automation features).

---

## 9. Future enhancements (out of scope for P4.3b)
- **Meeting↔CRM-client linkage:** add an optional `client_id` (or resolved
  contact link) to `office_meeting_sessions` so matching is scoped to one client —
  collapses multi-client ambiguity and raises auto-create coverage. Needs its own
  capture UX; deferred.
- **IG/SMS-style** richer assignee mapping (CRM-task owner from meeting assignee).
- Surfacing converted-task status back onto the meeting artifacts panel.
```
