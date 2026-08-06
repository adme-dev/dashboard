# Monday to XeroFlow Migration and Retirement Master Plan

**Status:** Proposed for owner approval

**Evidence snapshot:** 2026-08-06 (Australia/Melbourne)

**Scope:** ADME Monday account `229224`, every active Monday user, all active and archived work, a controlled two-way transition, and eventual Monday retirement

**Pilot board/item:** [Toyota Dealer Website — Support Tickets & P1–P4 SLA / pilot item](https://adme2.monday.com/boards/8922815727/pulses/12733119900)

**Staff adoption dependency:** [XeroFlow employee adoption email playbook](./xeroflow-employee-adoption-email-playbook.md)

**Operations dependency:** [Cloudflare Platform Operations Admin Plan](./cloudflare-platform-operations-admin-plan.md)

## 1. Executive decision

XeroFlow will become the system of record for agency work. Every active Monday user must be provisioned in XeroFlow, the complete required Monday history must be landed with verifiable fidelity, and new work must converge during a deliberately time-bounded two-way transition. After convergence, Monday will move through strict read-only, normal-user access removal, board archive, an approved audit/export/restore window, and true provider retirement. True retirement means cancelling the Monday subscription/billing, deprovisioning SSO/SCIM, removing account-admin seats, revoking personal/API tokens, uninstalling apps and domain integrations, and closing the Monday account/plan after the terminal owner gate.

The current implementation is not ready for that transition. It contains useful discovery, import, governed HR evidence, webhook-ingress, mapping, health, and single-board cutover foundations, but live evidence and code inspection show that it is not a general operational two-way sync. The `bidirectional` setting is currently cosmetic, outbound Monday mutations do not exist, webhook processing does not apply source changes to local tasks, historical coverage is incomplete, provider asset queries are broken, replies are not imported, creator identity is unreliable, and board-email creation/reply/notification parity is not deployed.

The retirement program therefore has five non-negotiable outcomes:

1. **Identity parity:** all 18 active Monday users have one active, authenticated XeroFlow identity with approved roles, teams, departments, notification preferences, and a canonical Monday user mapping.
2. **Historical fidelity:** every in-scope active and archived board object, item, subitem, update, reply, file, identity, timestamp, state, and mapped field is accounted for by a manifest, a canonical XeroFlow record, or an owner-approved exclusion.
3. **Operational parity:** UI, API, import, email, Monday webhook, and reconciliation job creation all use one canonical creation path and notify the creator plus configured board recipients/watchers exactly once.
4. **Safe convergence:** inbound and outbound changes use durable queues, idempotency, per-field watermarks, conflict review, normalized operation/message-attempt records, and echo suppression. No global `updated_at` last-write-wins rule is acceptable.
5. **Gated retirement:** every pre-closure state change has an evidence gate and rollback route. Monday access is not removed and boards are not archived until the global migration gate passes. Account/plan closure is an explicitly irreversible terminal action permitted only after the audit/export/restore window and final owner approval.

**Historical backfill sends zero notifications.** This is a hard safety invariant. Historical import, replay, checksum repair, and pre-cutover backfill must create no email, push, in-app, Slack, automation, or Monday outbound fan-out. Only a deduplicated net-new operational creation after the approved notification watermark may notify.

## 2. Program boundaries

### 2.1 In scope

- All 24 Monday workspaces and the complete active/archived board inventory.
- Standard boards, subitem boards, custom objects, documents, their relationships, and owner-approved handling rules.
- Groups, columns, column configuration, item values, dependencies, links, mirrors/connect-board relationships, assignments, subscribers, permissions, automations, integrations, forms, dashboards, and ownership needed to reproduce or retire an operating workflow.
- Items, subitems, updates, replies, files/assets, source URLs, source-created/source-updated timestamps, archive/deletion state, and authorship.
- All 18 active Monday users and relevant inactive/stale identities required for historical attribution or ownership transfer.
- A time-bounded inbound and outbound sync for approved transition boards.
- A unique XeroFlow inbound email address per board, creator/watcher email fan-out, and replies that thread back onto the correct XeroFlow item.
- Strict Monday read-only, normal-user access removal, board archive, retained audit/export/restore access, OAuth/webhook shutdown, subscription/billing cancellation, SSO/SCIM deprovisioning, account-admin-seat removal, personal/API token revocation, app/domain-integration uninstall, account/plan closure, and final retirement evidence.

### 2.2 Out of scope unless separately approved

- Deleting individual Monday boards, items, or users as a migration shortcut. Terminal account/plan closure is in scope only after the approved archive/audit/export/restore window and irreversible owner gate.
- Treating Vectorize, Graphify, an AI summary, or a generated checksum explanation as the authoritative migration record.
- Automatically resolving concurrent field conflicts, destructive source actions, or ambiguous user/board mappings.
- Using HR-governed evidence scopes as a substitute for general operational board authorization.
- Migrating unrelated vendor integrations without first inventorying their owners, credentials, automations, and replacement in XeroFlow.

## 3. Live production baseline

The following is read-only production evidence collected on 2026-08-06. Counts must be regenerated into a signed inventory manifest immediately before implementation because Monday and XeroFlow continue to change.

### 3.1 Monday estate

| Measure | Live count | Interpretation |
|---|---:|---|
| Workspaces | 24 | Inventory and ownership boundary. |
| Active enabled users | 18 | All are non-guest, non-pending, and non-view-only. |
| Active board objects | 318 | 41,987 reported items. |
| Active standard boards | 246 | Primary work-board migration population. |
| Active subitem boards | 57 | Must be related to parents, not blindly created as independent departments. |
| Active custom objects | 11 | Require an explicit destination model or exclusion. |
| Active documents | 4 | Require document/archive handling, not task import. |
| Archived board objects | 201 | 11,214 reported items. |
| Archived standard boards | 141 | 9,854 reported items. |
| Archived subitem boards | 50 | 1,339 reported items. |
| Archived custom objects | 4 | 15 reported items. |
| Archived documents | 6 | 6 reported items. |
| Active + archived board objects | 519 | 53,201 reported items, an upper-bound workload rather than a unique task count. |

Subitem boards are separate Monday board objects and can overlap the conceptual parent/subitem workload. Board names are not state: an active board named `Approved/To Be Billed (Archived)` contains 9,344 reported items. The manifest must use Monday state/type/IDs, not naming conventions.

### 3.2 Existing XeroFlow Monday footprint

| Measure | Live count | Gap signal |
|---|---:|---|
| Completed migration sessions | 642 | Plus 1 failed session; volume does not prove fidelity. |
| Board mapping rows | 971 | 332 distinct Monday board IDs and 324 target departments. |
| Completed item mapping rows | 37,251 | 37,163 distinct Monday items/tasks. |
| Tasks with complete direct Monday board/item provenance | 88 | Legacy mapping and task provenance are split. |
| Imported migration updates | 3,058 | Only 1 operational comment exists. |
| Imported migration files | 0 | Only 2 operational files exist. |
| Stored Monday column values | 386 | Far below the historical task population. |
| Governed cutover execution runs | 0 | Approval/execution machinery has not been exercised live. |

Current mapping coverage compared with the live inventory:

- Active: 298 of 318 board objects have a mapping; 20 are unmapped with 191 reported items.
- Archived: 30 of 201 board objects have a mapping; 171 are unmapped with 10,631 reported items.
- A mapped board is not proof that every current item is present or current. The pilot board demonstrates this directly.
- The 37,163 distinct mapped items cannot be subtracted from 53,201 to claim an exact missing-item count because current item-count semantics and separate subitem board objects can overlap. Exact missing counts come only from the canonical inventory/reconciliation manifest.

### 3.3 Monday connection and runtime evidence

- The stored Monday OAuth connection is for `ADME Advertising Pty Ltd`, account `229224`.
- Settings are `one-way`, hourly, with comments/files/subitems enabled, archive deletion disabled, and only board `18399213235` selected. The pilot board is not selected.
- The current approved HR evidence scope contains only board `18419440327`, period 2026-04-01 through 2026-07-11, and allowlists only `name` and `status`. It does not authorize the general retirement scope.
- The live webhook event table contains one processed synthetic smoke event and no genuine organization-wide stream. The pilot board has no registered app webhooks.
- Nine sync logs exist. Two recent board-import runs each failed all 87 items after partial processing because the asset query no longer matches the Monday API schema.
- `monday_inactive` and `monday_blocked` notifications have never been created. The pilot item has no XeroFlow notification evidence.

### 3.4 Identity baseline

XeroFlow has 22 active local team members. Fifteen active local members have a Monday ID, and 20 local rows total have a Monday ID. Fourteen of the 18 current active Monday users map to active local rows.

`team_members.title` exists and is populated by a Monday import path, but the canonical team-members API currently neither selects nor returns it. Title readiness is therefore unproven even where a database value exists. Gate 0 must inventory exact title coverage for every active recipient, compare Monday and XeroFlow values, backfill approved missing values from Monday, and put every disagreement through human conflict review. The adoption system displays the approved title exactly; a separately reviewed mapping may select a role-family learning module, but it must not rewrite the person's title. Until a recipient's title/role-family decision is resolved, role-personalised sends are blocked and the [employee adoption playbook](./xeroflow-employee-adoption-email-playbook.md) must use its department/custom-role neutral fallback.

The following active Monday users are absent from XeroFlow and must be resolved before content attribution or cutover:

| Monday user | Monday ID | Required action |
|---|---:|---|
| Crystal Tse | 102012190 | Create/provision or record an owner-approved historical-only identity. |
| Hannah Hanh-An Phan Truong | 107010062 | Create/provision or record an owner-approved historical-only identity. |
| Garrix Lopena | 108097303 | Resolve separately from existing Garrix mapping `78099299`; do not merge by name. |
| Kea Do | 111488703 | Create/provision or record an owner-approved historical-only identity. |

Additional cleanup:

- Alex V has active-local/stale Monday ID `76482914`, not returned by the current Monday active-user inventory.
- Five inactive local members retain stale Monday IDs: Abby, Craig, Richard, Teresa, and Tyler.
- An inactive `monday-574175@placeholder.local` Paul row exists alongside the active Paul mapping.
- Robert Giurin is correctly mapped to active local member `robert@adme.net.au`, Monday user `574174`.
- Paul Giurin is correctly mapped to active local member `paul@adme.net.au`, Monday user `574175`, but the inactive placeholder duplicate must not receive attribution or notifications.

### 3.5 Board email and watcher baseline

- XeroFlow production has 334 departments/boards.
- The checked-in `departments.board_email_token` migration is not present in production; the column does not exist.
- `tasks.metadata` and `tasks.created_by`, both referenced by the checked-in board-email/automation code, do not exist in production. `tasks.reporter_id` exists but is optional and is not a safe creator invariant.
- There are 6 active subscriptions in total, 0 active board-level subscriptions, 0 board-level email-enabled watchers, and 0 boards with a board-level email watcher.
- The pilot department has 0 subscriptions of any scope.
- `BoardEmailSettings.vue` exists but is not mounted by any XeroFlow page/component.

## 4. Pilot definition and current state

The pilot is the user-provided Monday URL:

<https://adme2.monday.com/boards/8922815727/pulses/12733119900>

| Attribute | Live Monday value |
|---|---|
| Board | `8922815727` — `Toyota Dealer Website — Support Tickets & P1–P4 SLA (XeroFlow foundation)` |
| Board state/items | Active, 81 items |
| Item | `12733119900` — `Xero notifications — unsubscribe Maddison (recurring, XeroFlow login issue)` |
| Group | `🔴 Open / In-Progress Tickets` |
| People | Robert Giurin `574174`; Paul Giurin `574175` |
| Status | `Working on it` |
| Priority (SLA) | `P4 — Low` |
| SLA Result | `Open` |
| Category | `Account/Notifications` |
| Received / response / resolution due | 2026-07-19 / 2026-07-20 / 2026-07-22 |
| Resolved on | Empty |
| Updates | One top-level update by Robert and one reply by Paul |
| Assets | None |
| External evidence | Gmail thread link present |

The old XeroFlow board mapping for this Monday board is named `Toyota Dealer Website Updates`, points to department `06d52b9c-93db-4aac-8371-cec5cfce6753`, and records a completed 58/58 import from February/March. The live board has since been renamed/repurposed and now has 81 items. Its 58 mapped tasks all use the global `To Do` state; none have direct Monday board/item provenance on `tasks`. The pilot item has no item/task/comment/file mapping, no notification, and no webhook event.

The pilot exposes several deterministic-mapping failures that must become regression cases:

- Multiple status columns cause `SLA Result = Open` to overwrite operational status, while `Priority (SLA)` never reaches the priority mapper.
- Multiple date columns cause the last non-empty date heuristic to win instead of an approved field mapping.
- Multiple people are represented as one text value and fail the single-user exact-name lookup.
- The old XeroFlow department has no department-specific status, so some import paths create `NULL` status or fail.
- The migration importer ignores the reply and can attribute the top-level update to an inactive placeholder rather than Robert's active XeroFlow identity.

## 5. Current capability versus retirement gap

| Capability | Current XeroFlow foundation | Blocking gap / decision |
|---|---|---|
| OAuth and discovery | Stored OAuth, workspace/board/user queries, preview routes. | General routes have inconsistent authorization; archived discovery is not implemented because `getBoards` ignores requested state. |
| Active board import | Migration and operational sync services can create tasks, subitems, comments, and files. | Mapping heuristics are unsafe; legacy mapping can duplicate tasks; assets fail; direct SQL bypasses canonical domain behavior. |
| Archived history | Schema can retain source states. | Client does not fetch archived boards/items; current inventory coverage is only 30/201 archived objects. |
| Board mapping | Board/session/item mapping tables and task Monday columns exist. | No global canonical link; session mappings and direct task provenance are split. |
| Field mapping | Settings store board/status/column/user mappings. | Migration ignores important mappings and operational sync auto-detects by type; no versioned field-ownership contract. |
| Users/assignees | User preview/sync scripts and `team_members.monday_user_id` exist. | Four active users absent; import paths do not consistently reuse canonical IDs; endpoints are under-authorized; invites/roles/teams are not provisioned. |
| Employee title/adoption role family | `team_members.title` exists and a Monday import can populate it. | The team-members API omits title; exact coverage and source conflicts are unknown. Gate 0 must expose approved exact titles, review role-family module mappings, and block role-personalised sends for unresolved recipients while using a neutral fallback. |
| Updates/comments | Top-level Monday updates can become task activity. | Replies are ignored; operational creator can be `NULL`; no outbound XeroFlow reply/update mutation. |
| Files/assets | R2 and file mapping foundation exist. | Monday Asset query uses obsolete `uploaded_at` and scalar `uploaded_by`; attachment history is effectively absent. |
| Webhook ingress | Challenge, signed JWT check, unique event landing, queue state. | Scope SQL uses `ANY()` against JSONB and fails; events are not atomically claimed; processing only marks mappings pending; update/file/comment content is not applied. |
| Reconciliation | Hourly HR-scoped reconcile can detect source drift. | It is not organization-wide, uses migration overwrite semantics, and has no general connected-board runtime. |
| Outbound sync | UI stores `bidirectional`. | No Monday mutation methods for item name, columns, comments, files, or archive; no transactional outbox or provider receipts. |
| Loop/idempotency | Webhook event IDs and some comment/file/source keys are unique. | No cross-channel operation ID/digest, echo acknowledgement, per-field watermark, or conflict ledger. Retry/legacy paths can duplicate tasks and activities. |
| Notifications | Assignment, mention, watcher, push, and email utilities exist. | Task creation is fragmented across at least 17 direct server inserts; creator is filtered out of watcher fan-out; many paths emit no creation event; Monday import bypasses notifications. |
| Board email | Token migration/API, worker parser, MIME safety checks, and internal endpoint exist in source. | Production schema absent; current `board-` address reaches the wrong catch-all; synchronous path drops message IDs and bytes; no queue, idempotency, email fan-out, or reply thread. |
| Single-board cutover | Dry-run plan, owner/admin approval, fingerprint/revision, typed confirmation, audit, execution, rollback. | Zero live runs; caps 500 top-level items; omits assignees/status/custom values/updates/replies/files/history and excludes inactive records. |
| Read-only/retirement | Monday supports permissions, view-only users, archive/restore, and user deactivation. | Owners bypass board permissions; `View and comment` is not strict read-only; deactivating an owner can disable their integrations/automations. Ownership transfer and a verified no-write window are mandatory. |
| Tests | Contract tests cover many security/source patterns; runtime tests cover normalizers and cutover pieces. | Many tests inspect source strings. There is no runtime provider-schema, JSONB scope, multi-column mapping, full-history, two-way, email-thread, loop, quota, or organization-scale E2E suite. |

The older [Operational Monday Integration Plan](./monday-operational-integration-plan.md) marks full landing, webhooks, reconciliation, and notifications complete. Its checkboxes are implementation-intent history, not evidence that the retirement acceptance criteria are met. This master plan supersedes those completion claims for organization-wide retirement.

## 6. Target architecture and authoritative records

### 6.1 Control/data flow

```text
Monday API/webhooks ──> signed ingress ledger ──> Cloudflare Queue ──> canonical sync service
                                                                  │
XeroFlow UI/API/import/email/reconcile ──> canonical task service ┤
                                                                  v
                                                  Neon links, fields, conflicts,
                                                  activities and delivery outbox
                                                   │       │        │
                                                   │       │        └─> R2 manifests/MIME/files
                                                   │       └──────────> transactional email Queue
                                                   │                           │
                                                   │                Cloudflare Email Service
                                                   └──────────────────> Monday outbound Queue

Email Routing: board+signed-token / reply+signed-token
Cloudflare Queue: durable work, retry and DLQ
Platform Ops: lag, DLQ, errors, deployments, email quota, AI budget
```

### 6.2 Canonical relational model

Implementation may adapt names to existing conventions, but the following invariants are required:

| Record | Required invariant |
|---|---|
| `monday_board_inventory` | One row per account/workspace/board ID/state/type/observation; immutable run manifest plus current projection. |
| `monday_item_links` | Globally unique active link by Monday account + item ID and by XeroFlow task ID; independent of migration session. |
| `monday_source_snapshots` | Immutable bounded source snapshot/checksum for audit and repair; raw large payloads may be referenced from R2. |
| `monday_mapping_versions` | Owner-approved board/group/field/status/user mapping with version, effective time, and actor. |
| `monday_sync_events` | Durable inbound observation with provider event ID, source timestamp, observation timestamp, state, attempt, and error class. |
| `monday_field_watermarks` | Last applied source, source version/time, local version/time, outbound operation ID, and mapping version per canonical field. |
| `monday_outbound_operations` | Transactional outbox with idempotency key, payload digest, provider receipt, attempts, retry/dead-letter state. |
| `monday_sync_conflicts` | Field-level concurrent/destructive/ambiguous conflicts with evidence, resolution, actor, and resolution mapping version. |
| Task creator provenance | Every new task has `created_by_type`, canonical actor/external identity, `source_kind`, source ID, and idempotency key. |
| `task_creation_events` | Exactly one canonical creation event per task; `historical=true` is permanently notification-suppressed. |
| `transactional_messages` | Immutable channel-neutral parent shared by board, adoption, and Platform Operations mail; unique on tenant + immutable logical event + canonical recipient + template/purpose. It contains no channel, provider, delivery status, provider attempt, or quota reservation. |
| `transactional_message_attempts` | Append-only set of delivery children; never delete or repurpose a child. Unique on parent + channel + provider + attempt idempotency key, with provider message ID and an idempotent status/error/timestamp projection backed by append-only webhook/worker evidence. Provider-managed retries reuse the same child identity. |
| `transactional_quota_reservations` | Reservation attached to one intended outbound attempt, unique by attempt and reservation key; retry/replay cannot reserve twice. |
| `board_notification_recipients` | Owner-managed internal/external recipients, event selection, active state, and audit. |
| `board_email_routes` | One active signed/hashed creation route per board with rotation/revocation/audit; raw route token is never stored. |
| `board_email_sender_policies` | Per-board fail-closed internal tenant/domain and exact verified-external-sender policy, authentication/alignment requirements, verification/expiry, and audit. |
| `task_email_threads/messages` | Unique task thread, Message-ID/provider ID/idempotency, In-Reply-To/References, participants, direction, author, and delivery state. |
| Email attachments | Actual bytes in private R2 with hash/size/type/scan state and a XeroFlow attachment/activity link. |

Backfill current `monday_item_mappings` and task Monday columns into canonical links before any new import. Conflicting links block that board; they are not resolved by choosing the newest row.

### 6.3 Shared task-creation service

All current task insert paths must call one transactional domain service or satisfy an equivalent database-enforced invariant. This includes normal UI/API, subtask, duplicate, CSV import, template, AI action, meeting action item, brief conversion, anomaly/accountability, email, Monday import, webhook landing, reconciliation, governed cutover, and supported scripts.

The service must atomically:

1. Validate board/status/group and actor/source provenance.
2. Claim the source/idempotency key.
3. Create or return the canonical existing task.
4. Create creation activity and canonical source link where applicable.
5. Append one `task_creation_event`.
6. Append notification and integration outbox work unless `historical=true`.
7. Return the task and event IDs; delivery occurs asynchronously.

Normal imports notify according to the approved event contract. Historical Monday backfill, historical CSV restoration, checksum repair, and replay set `historical=true` and send zero notifications.

### 6.4 Two-way sync and loop prevention

For every inbound Monday event:

1. Verify signature/challenge and persist the unique provider event quickly.
2. Enqueue a bounded job and atomically claim it in the consumer.
3. Fetch the current source entity using the pinned Monday API version.
4. Resolve the canonical link and active mapping version.
5. Compare each mapped field against its source and local watermarks.
6. Apply non-conflicting changes transactionally through the same XeroFlow domain services used by UI/API.
7. Create append-only comment/reply/file records by provider ID/content hash.
8. Append XeroFlow notification and outbound work once.
9. Record the new field watermarks and provider evidence.

For every outbound XeroFlow event:

1. Commit the local change and outbound operation in one transaction.
2. Deliver through the Monday outbound Queue using an idempotency key and canonical payload digest.
3. Record the provider result/operation metadata and the exact field watermark.
4. When Monday echoes the mutation through a webhook, match the operation/digest and mark it acknowledged without reapplying the local mutation or re-emitting notifications.

Conflict rules during transition:

- **Concurrent mapped field changes:** if Monday and XeroFlow both changed since the shared watermark, create a conflict; do not overwrite either side silently.
- **Append-only comments/replies:** deduplicate by provider ID and immutable content/source tuple; preserve source author/time. XeroFlow edits become new audit events unless Monday supports an explicitly approved equivalent.
- **Files:** append by provider asset ID and SHA-256; name collisions do not overwrite content.
- **Archive/delete:** never auto-propagate destructively during transition. Hold for owner review.
- **Mapping changes:** require a new approved mapping version and a dry-run diff before applying.
- **Clock handling:** source timestamps and XeroFlow observation timestamps are distinct. Never compare heterogeneous clocks as a single global last-write-wins value.

### 6.5 Field ownership state machine

| State | Monday writes | XeroFlow writes | Outbound to Monday | Required exit gate |
|---|---|---|---|---|
| `inventory` | Allowed | Allowed | Off | Signed manifest and identity decisions. |
| `historical_backfill` | Allowed | Allowed | Off | Counts/checksums and exclusions reconcile; zero notifications. |
| `shadow` | Allowed | Allowed | Simulated only | Dry-run diffs stable; no P0/P1 defects. |
| `inbound_live` | Allowed | Allowed | Off | Inbound applies exactly once; conflicts visible. |
| `bidirectional_pilot` | Allowed | Allowed | On for approved fields/boards | Echo/loop, conflict, reply, and notification gates pass. |
| `xeroflow_primary` | Policy-prohibited for ordinary staff; controls may remain visible | Authoritative | On during the controlled bridge for approved service-account sync/reconciliation/audit | No unauthorized staff Monday writes and global convergence window passes. This is the per-wave T0 state, not technical read-only. |
| `monday_read_only` | Technically blocked for normal users | Authoritative | General outbound off; dedicated pilot milestone lane only | No normal-user writes, backlog, or unresolved critical diff. |
| `access_removed` | Retained audit admin only | Authoritative | General outbound off; dedicated pilot milestone lane only | Audit window and restore drill pass. |
| `archived_retained` | Retained audit admin only | Authoritative | Dedicated pilot milestone lane/acknowledgement only; general webhooks disabled | Archive/restore manifest and audit/export/restore window pass. |
| `closure_pending` | Retained closure admin only | Authoritative | Final approved milestone comment, then permanently off; tokens/apps scheduled for revocation | Terminal export, restore drill, billing/SSO/SCIM/admin/app/token inventory, and owner closure approval pass. |
| `retired` | No Monday access/account | Authoritative | Off; all Monday credentials/integrations revoked | Subscription/billing cancelled, SSO/SCIM deprovisioned, admin seats removed, personal/API tokens revoked, apps/domain integrations uninstalled, account/plan closed, and provider receipts archived in XeroFlow. |

## 7. Full-history fidelity contract

An entity is complete only when its count, identity, state, relevant fields, timestamps, relationships, and evidence pass the manifest. “Mapped” or “session completed” is not sufficient.

| Monday entity/capability | XeroFlow destination/evidence | Required validation | Current gap |
|---|---|---|---|
| Account/workspaces | Inventory manifest | IDs, names, state, counts, owners | Discovery exists; no retirement manifest. |
| Boards of every type/state | Department/project/document destination or approved exclusion | ID/type/state/name/workspace/item counts/checksum | Archived fetch absent; types need classification. |
| Owners and subscribers | Board membership/ownership/recipient policy | Canonical user mapping and count | Not inventoried for retirement; owners bypass permissions. |
| Permissions | XeroFlow role/board access decision | Effective-access test per persona | No org-wide parity mapping. |
| Groups | Board groups with source ID/order/color | Count/order/source ID | Partial. |
| Columns/settings | Versioned column definitions/mappings | ID/type/config/options/count/checksum | Only 386 stored values; mappings heuristic. |
| Items | Tasks/jobs with canonical link | ID/state/group/core fields/source times/count/hash | At least pilot current item absent. |
| Subitems | Parent-linked tasks, not standalone duplicates | Parent/source link/count/order | Partial and unsafe for separate subitem boards. |
| Assignments/people/teams | Canonical XeroFlow identities | Every source user resolved or approved historical-only | 4 active users absent; multi-person parsing unsafe. |
| Status/priority/dates | Explicit approved mappings | Field-by-field values and unmapped report | Multiple status/date heuristic fails pilot. |
| Custom values | Typed XeroFlow column-value store/raw snapshot | Per-column non-null counts/type parse/diff | Sparse current coverage. |
| Dependencies/connect/mirror | XeroFlow links or approved immutable reference | Edge count, endpoint existence, cycle/unresolved report | Not covered by current importer. |
| Updates | Task activity | Provider ID, author, body hash, source time, count | 3,058 historical; attribution issues. |
| Replies | Threaded child activity | Parent update ID, reply ID, author/body/time/count | Ignored by current importer. |
| Files/assets | R2 object + attachment mapping | Asset ID, SHA-256, bytes, type, uploader/time/count | Provider query broken; history effectively absent. |
| Automations/integrations | Replacement/runbook/retirement record | Owner, trigger/action, credential, last use, replacement | Deactivation may disable owner-created automation. |
| Forms/dashboards/docs | XeroFlow equivalent, archive artifact, or exclusion | Owner/use/dependency/export evidence | Not in current migration. |
| Archived/deleted state | Non-destructive XeroFlow state + manifest | State and timestamps; no automatic local deletion | Archived discovery absent. |
| Email/Gmail references | Task link/thread evidence where permitted | Safe URL/thread metadata; no secret/token storage | Pilot link exists only in Monday. |

Validation has four layers:

1. **Structural:** source/destination counts by board/entity/state and unique canonical links.
2. **Content:** normalized field hashes plus raw immutable source snapshot references.
3. **Relationship:** parent/group/user/dependency/update/reply/file referential integrity.
4. **Sampled human review:** board owner signs off representative high-risk, multi-column, file-heavy, archived, and threaded records.

No board advances with unexplained missing records, duplicate canonical links, missing authors, dangling parents, failed asset hashes, or unresolved P0/P1 defects.

## 8. Board email, creator notifications, and replies

### 8.1 Routing decision

Live Cloudflare Email Routing on `xeroflow.io` supports subaddressing. Exact `reply@` and `lead@` routes already deliver to `email-to-board-worker`; the zone universal catch-all delivers to `email-lead-intake`. The checked-in `board-<token>` address would therefore be captured by the wrong worker.

Use `board+<signed-token>@xeroflow.io` and provision/verify an exact `board@xeroflow.io` route to `email-to-board-worker`. Do not redirect or take over the universal catch-all. Use the versioned HMAC/hashed-token pattern in [`server/utils/crm/emailReplyToken.ts`](../../server/utils/crm/emailReplyToken.ts), keeping the SMTP local part at or below 64 octets. Store only the route-token hash. Rotation revokes the old route and records the actor/time/reason.

### 8.2 Sender authorization before mutation

A valid board route token identifies a destination; it does not authorize a sender. Each board has one fail-closed sender policy:

- **Internal tenant sender:** normalized envelope sender and RFC `From` resolve to the same mailbox or an explicitly approved aligned domain, the address maps to an active XeroFlow tenant member, and the message satisfies the board's SPF/DKIM/DMARC/authentication policy.
- **Verified external sender:** the normalized RFC `From` is an exact active address in that board's verified-external-sender allowlist, its verification is unexpired, envelope/`From` alignment satisfies the approved policy, and required authentication signals pass.
- **Disabled:** no inbound message may create or modify board work.

Do not trust display name, `Reply-To`, possession of a leaked board token, or domain similarity. The worker must parse and evaluate envelope sender, RFC `From`, provider authentication results, alignment, route state, sender-policy revision, membership/verification state, and replay/automation signals **before any task, activity, thread, attachment link, notification, or outbound-delivery mutation**.

Unauthorized, spoofed, misaligned, unauthenticated, unverified, expired, or leaked-token traffic creates neither a task nor a delivery. It is SMTP-rejected where safe or placed in a bounded encrypted quarantine with a minimal security audit record, reason code, route hash, sender hashes, authentication summary, and expiry. Quarantine never appears as a board item, never emails the sender/watchers, and cannot be promoted without an authorized, audited replay that re-runs the current sender policy.

### 8.3 Durable inbound contract

Board email must use the same durable R2 + Queue + DLQ path as the CRM email foundation:

- preserve raw MIME for the approved short retention window;
- preserve envelope and parsed From/To/CC/Reply-To, Message-ID, In-Reply-To, References, subject, text/HTML, and attachment evidence;
- enforce the active per-board sender-policy revision before canonical mutation;
- reject oversized/unsafe messages before canonical mutation;
- suppress auto-replies, list mail, and XeroFlow-origin loops;
- deduplicate by route + provider message ID/internet Message-ID/content hash under an advisory lock;
- store actual attachment bytes in private R2, scan, and link clean files to the task;
- atomically create the task, first thread message/activity, source link, and creation event;
- acknowledge a duplicate as success without creating another task/message/notification.

The synchronous checked-in adapter at [`workers/email-worker/src/boardAdapter.ts`](../../workers/email-worker/src/boardAdapter.ts) is not the target: it drops threading headers, parsed addresses, raw MIME, and attachment bytes.

### 8.4 Recipient and outbound-provider contract

Every **net-new operational** board job creation, regardless of source, creates one email event for this deduplicated recipient set:

1. the creator (authenticated XeroFlow user, canonical mapped Monday creator, import operator, approved system owner, or verified external email sender);
2. active configured internal/external board recipients for `task_created`;
3. active board watchers whose `notify_email` and event preferences include creation.

One canonical email address receives one logical parent even if it appears in multiple roles. Cloudflare Email Service is primary for all new board, employee-adoption, and Platform Operations transactional email. Create or reuse one immutable `transactional_messages` parent unique on `(tenant_id, logical_event_key, canonical_recipient_id, template_purpose_id)`, independent of channel. Append delivery work to `transactional_message_attempts`, unique on `(transactional_message_id, channel, provider, attempt_idempotency_key)`, and reconcile provider ID/status/retry/failure/webhook evidence there. Attach one unique `transactional_quota_reservations` record to the intended outbound attempt. Suppression/invalid-address policy must be explicit and visible; a skipped mandatory creator delivery is a defect, not silent success.

Existing Resend paths remain legacy-only during staged caller migration. Resend is not an automatic fallback. If Cloudflare Email Service is unavailable, the selected Cloudflare child attempt remains queued/deferred or dead-lettered under policy; the logical parent does not acquire provider status. Any provider migration/replay requires owner approval against the same channel-neutral parent so a recipient cannot receive both copies.

Historical backfill sends zero notifications. A reconciliation-created task sends only when it represents a source item newer than the approved operational notification watermark and no canonical creation event already exists.

### 8.5 Reply contract

Every outbound creation email uses a signed `Reply-To: reply+<thread-token>@xeroflow.io`, a stable XeroFlow Message-ID, and correct References. An inbound reply must:

- verify and resolve the route without exposing raw tokens, then re-run sender authorization/alignment for the thread participant before mutation;
- deduplicate by provider/internet Message-ID;
- resolve the sender to an internal member or external participant;
- append exactly one task activity/message with source author/time/body;
- store/link clean attachments;
- notify remaining participants/watchers once;
- while the board is in approved bidirectional state, enqueue one Monday `create_update` operation and treat its webhook echo as an acknowledgement.

XeroFlow UI comments need an explicit thread-send policy: internal-only comments stay internal; a user-selected email reply is sent to thread participants and recorded as an outbound thread message. The UI must never email external participants implicitly from an internal note.

### 8.6 Shared email capacity gate

The live Cloudflare Email Service outbound transactional allowance is 1,000 messages/day and is shared by new board, adoption, and Platform Operations mail. Before each wave, calculate:

```text
p95 shared daily messages = p95(net-new jobs/day × deduplicated creation recipients)
                   + p95(thread replies/day × deduplicated reply recipients)
                   + p95(adoption and Platform Operations messages/day)
                   + retry allowance
```

The wave is blocked unless forecast steady-state is at or below 70% of the daily allowance, leaving incident/retry headroom, and a burst backlog can drain within the notification SLA. Use Queue rate limiting, immutable `transactional_messages` parents, append-only `transactional_message_attempts`, attempt-bound unique `transactional_quota_reservations`, retry with jitter, an actively consumed DLQ, quota telemetry, and alerts. Historical backfill cannot consume this allowance because it sends zero notifications.

## 9. Cloudflare and Graphify responsibilities

| Capability | Role in this program | Must not become |
|---|---|---|
| Email Routing | Route `board+` and `reply+` subaddresses to the email worker without disturbing lead/catch-all routing. | A source of business state, sender authorization, or a place to embed unverified board IDs. |
| Cloudflare Email Service | Primary provider for all new board, adoption, and Platform Operations transactional email through shared `transactional_messages`, `transactional_message_attempts`, and `transactional_quota_reservations`. | An implicit failover to legacy Resend or a provider-specific deduplication authority. |
| Cloudflare Queues | Durable inbound webhook/email work, reconciliation partitions, outbound Monday operations, notification delivery, retries, and DLQs. | The only incident/evidence store; Queue retention is not durable audit retention. |
| R2 | Immutable inventory exports, bounded source snapshots, raw MIME, file bytes, checksums, and rollback evidence with lifecycle rules. | A generally browsable UI or an unbounded secret/payload dump. |
| AI Gateway | Optional mapping suggestions, summarization/classification assistance, model routing, cost/rate controls, and metadata-only telemetry. | The fidelity validator, conflict resolver, or mutation authority. |
| Vectorize | Optional scoped semantic search over approved migrated content after relational truth is complete. | A canonical store, exact-count validator, or access-control boundary by itself. |
| Graphify | Repository dependency/change-impact graph, implementation navigation, and post-change documentation freshness. | A graph of private Monday production content or migration evidence. |
| Platform Operations | Queue/DLQ/email/Worker/deployment incidents, freshness, delivery failures, and AI budget health. | A substitute for board-level fidelity and owner acceptance. |

Graphify must be refreshed after foundational schema/services, after pilot convergence, and before final retirement sign-off. Its status must be visible through existing Model Ops/Graphify surfaces, but missing Graphify artifacts must not block deterministic data reconciliation.

## 10. AI cost forecast and top-up trigger

The deterministic migration path—discovery, export, hashing, mapping, replay, reconciliation, and notification deduplication—must not require an AI model. Optional AI may suggest mappings, summarize unresolved diffs for human review, or create approved semantic embeddings after fidelity is established.

The linked Platform Operations snapshot records an inferred AI Gateway credit balance of approximately USD $48.73, a payment method, auto top-up off, no enforced account spending limit, no Unified Billing usage in the prior 30 days, and an unauthenticated `agency-dashboard-pilot` gateway. These values are time-sensitive and must be re-read before any billing decision.

Before enabling optional AI for a wave, forecast:

```text
wave AI cost p95 = mapping-suggestion calls
                 + summary input/output tokens
                 + embedding dimensions written/queried
                 + retry/fallback allowance

usable credit = verified gateway credit - owner-approved reserve
```

The forecast and top-up trigger must reference one named, immutable, owner-approved Platform Operations budget configuration revision, for example `monday-retirement-ai-budget-vN`. The same revision must contain gateway/environment/feature/model scope, monthly/daily/per-feature spend limits, rate limits, warning/hard behavior, pricing catalogue version, 100% pricing coverage for every enabled route, credit/reserve forecast, provider reconciliation timestamp, and passing controlled spend-limit/rate-limit evidence. The wave evidence pack records the exact revision ID.

Create a top-up approval request when either condition is true:

- usable credit is below 150% of the p95 cost of the next approved wave; or
- the 30-day forecast crosses the owner reserve before the next scheduled review.

Hard-block optional AI when the named revision is missing, expired, or stale; its pricing coverage is below 100%; its reconciliation timestamp is outside the approved freshness window; its spend/rate test failed; usable credit is below 100% of the next-wave p95 cost; gateway authentication/spend limits are missing; or model pricing is unknown. Continue deterministic migration using manual mappings; never top up automatically. Any top-up requires explicit owner approval, amount/reason, before/after balance, budget revision ID, forecast version, and audit. Use Platform Operations warnings at 50%, 75%, and 90% of the revision's approved monthly/daily budget and hard behavior at 100%.

AI Gateway metadata is limited to non-sensitive pseudonymous organization, feature, environment, risk, and actor/team keys. Do not send email addresses, client names, source item text, prompts, or other PII in gateway metadata. Sensitive workflows default to payload logging off.

## 11. Delivery sequence

No phase is skipped. A phase remains reversible until the next gate is explicitly approved.

### Phase 0 — Authority, freeze rules, and operations readiness

**Outcome:** named owners, approved scope/retention/conflict policy, functioning Platform Operations dependency, and no ambiguity about who can advance or roll back a wave.

- [ ] Name executive owner, migration lead, data-fidelity lead, identity/access lead, XeroFlow engineering lead, Platform Ops on-call, communications/adoption lead, and a human owner for every board wave.
- [ ] Approve in-scope entity classes, retention periods, source export storage, notification watermark, conflict SLAs, strict-read-only method, retained audit account, and archive observation window.
- [ ] Create the XeroFlow `Monday retirement defects` lane; do not track migration defects in Monday.
- [ ] Obtain an immutable `ready=true` revision from the Platform Operations Monday-retirement readiness profile. It must register every relevant Queue/DLQ/Worker/R2/Cloudflare Email Service webhook and shared message-attempt consumer with owner/SLO/alert/runbook and include passing controlled Queue/DLQ, R2, email attempt/webhook, and Worker failure evidence in the incident records plus normalized message tables.
- [ ] Verify Cloudflare Email Routing, R2 lifecycle, observed Queue/DLQ plan/retention, Cloudflare Email Service normalized parent/attempt/attempt-bound-reservation contract, Monday OAuth/signing secret, and least-privilege production access. Existing Resend is legacy-only and not fallback readiness.
- [ ] Produce the active-recipient title-readiness ledger: inventory exact `team_members.title` and Monday title coverage, expose title through the canonical team-members API, backfill owner-approved missing titles from Monday, resolve discrepancies without silent overwrite, and approve each exact-title-to-role-family module decision. Block role-personalised adoption sends for unresolved recipients and prove the department/custom-role neutral fallback from the adoption playbook.
- [ ] Re-read live AI Gateway balance/auth/spend configuration; approve and name a Platform Operations AI budget revision with complete pricing, current reconciliation, and passing spend/rate test evidence, or disable optional AI.

**Gate 0:** all roles/decisions are signed; every active adoption recipient has an approved exact title and reviewed role-family module selection or is explicitly held to the neutral fallback with role-personalised delivery blocked; the unexpired Platform Operations Monday-retirement readiness revision is `ready=true`; every relevant Queue/DLQ/Worker/R2/email webhook has an owner/SLO/alert/runbook; controlled Queue/DLQ, R2, Cloudflare Email Service attempt/webhook, and Worker failures have deduplicated incident evidence plus normalized `transactional_messages`/attempt/reservation evidence; optional AI references an admissible named budget revision or is disabled; no Monday production mutation has occurred.

**Rollback:** disable collectors/test routes and retain the read-only audit. No data-plane rollback is required.

### Phase 1 — Immutable inventory and identity

**Outcome:** complete source manifest and approved one-to-one identity map before content attribution.

- [ ] Enumerate all workspaces, active/archived board objects, types, owners, subscribers, permissions, groups, columns, item/subitem counts, automations, integrations, forms, dashboards, documents, and dependencies with uncapped pagination/checkpoints.
- [ ] Store immutable manifest/checksum artifacts in R2 and normalized inventory rows in Neon.
- [ ] Classify 246 active standard boards separately from subitem boards/custom objects/documents; assign destination, wave, owner, criticality, and exclusion reason.
- [ ] Resolve all 18 active users; provision the 4 absent users as active or record an owner-approved historical-only decision; reconcile stale IDs and placeholder duplicates.
- [ ] Provision XeroFlow authentication/invites, roles, teams, departments, board access, notification preferences, and ownership.
- [ ] Reconcile the Gate 0 employee-title ledger after identity provisioning; preserve the approved exact display title separately from the reviewed role-family module selector and keep neutral-fallback holds visible.
- [ ] Inventory inactive users needed for attribution and every owner-created Monday integration/automation before any deactivation.

**Gate 1:** 100% of source board objects and active users appear exactly once in the manifest/decision ledger; all owners/integrations have a transfer target; manifest rerun is stable or explains every delta.

**Rollback:** inventory is read-only; revoke temporary discovery access and retain signed artifacts.

### Phase 2 — Canonical links, creation/notification service, email, and two-way spine

**Outcome:** one task identity, one creation event, durable inbound/outbound transport, and testable email/reply behavior.

- [ ] Add canonical link/snapshot/mapping/watermark/conflict/outbound-operation schemas and backfill legacy mappings without choosing winners silently.
- [ ] Add creator/source provenance, creation event, recipient configuration, and the normalized `transactional_messages`, `transactional_message_attempts`, and `transactional_quota_reservations` records.
- [ ] Refactor every direct task creation path onto the shared service and enforce `historical=true` zero-notification behavior.
- [ ] Fix archived discovery, Monday Asset schema, reply pagination/import, multi-person identity, and versioned per-board field mappings.
- [ ] Fix webhook JSONB scope query, atomic event claim, durable application, retries, stale/out-of-order handling, and DLQ.
- [ ] Add Monday outbound client operations for item name/mapped columns/update reply/file/archive only where approved; add receipts/digests/echo suppression.
- [ ] Add signed/hashed `board+` routes, exact Cloudflare route, per-board fail-closed sender policies, durable email Queue/R2 processing, actual attachments, creator/watcher Cloudflare Email Service fan-out, normalized shared message records, and signed reply threads.
- [ ] Mount owner/admin board-email/recipient settings and delivery health UI using Nuxt UI v4.

**Gate 2:** runtime tests pass for all creation sources, duplicate/out-of-order webhook/email delivery, echo suppression, multi-column mapping, archived discovery, replies/assets, notification dedupe, R2 attachment hash, quota limiting, and conflict creation; focused build/type checks show no new errors.

**Rollback:** feature flags keep webhook apply, outbound Monday, board email, and creation email independently off. Additive schemas remain; restore legacy reads while preserving canonical audit records.

### Phase 3 — Pilot historical backfill and shadow comparison

**Outcome:** the pilot board and item are complete in XeroFlow without notifying anyone or changing Monday.

- [ ] Approve the exact pilot mapping for group, status, P4 priority, SLA result, category, received/response/resolution dates, people, Gmail link, updates, replies, and files.
- [ ] Reconcile the legacy 58 mapped tasks against current canonical item links before importing any of the 81 live items.
- [ ] Backfill active and archived pilot history with `historical=true`; assert zero notification/outbound deliveries.
- [ ] Verify Robert/Paul attribution uses active local identities and the top-level update/reply retain parentage and source timestamps.
- [ ] Run structural/content/relationship checksums plus board-owner sample review.
- [ ] Run shadow webhook/reconcile and outbound dry-run; generate conflicts/diffs without mutation.

**Gate 3:** pilot source/destination counts and hashes reconcile; no duplicate task/activity/link; zero historical notifications; no P0/P1/P2 fidelity defect; dry-run produces no unexplained change; owner signs the pilot manifest.

**Rollback:** remove only pilot records created by the approved run using run-scoped rollback, restore reused tasks to recorded before-images, retain audit/snapshots, and leave Monday unchanged.

### Phase 4 — Pilot inbound, bidirectional, email, and convergence

**Outcome:** real pilot work can originate in either approved system and converge exactly once.

- [ ] Enable pilot inbound webhooks and repair reconciliation; verify task/field/comment/reply/file changes land through canonical services.
- [ ] Enable the pilot unique `board+` email; send a controlled email that creates exactly one linked task with body/attachments/creator evidence.
- [ ] Send controlled unauthorized, spoofed, misaligned, unverified, expired, and leaked-route-token messages; prove each creates neither task nor delivery and only the approved reject/quarantine audit evidence.
- [ ] Verify creator and configured pilot recipients/watchers each receive one XeroFlow email and an email reply lands once on the same task.
- [ ] Enable outbound Monday only for approved pilot fields/comments; exercise XeroFlow edit and XeroFlow email reply.
- [ ] Verify Monday webhook echoes acknowledge the outbound operation without duplicate task/activity/email.
- [ ] Exercise conflict, retry, out-of-order, rate-limit, Queue failure, DLQ, and rollback scenarios.
- [ ] Complete at least 7 consecutive days of pilot convergence with no unexplained drift or unauthorized Monday writes.

**Gate 4:** the user-provided pilot item is linked and fully attributed; Robert receives the required XeroFlow creation notification for a Robert-created operational test; reply threading passes both directions; Queue/DLQ/email/Platform Ops evidence is green; all conflicts are resolved/audited; owner approves progression.

**Rollback:** turn off pilot outbound first, retain inbound repair, restore XeroFlow field before-images or Monday via recorded outbound operations as approved, rotate/revoke board email route if implicated, and return to shadow mode.

### Phase 5 — Active-board waves

**Outcome:** all active standard boards move through backfill, shadow, inbound, and controlled XeroFlow-primary operation without a big-bang cutover.

Suggested waves:

1. Low-volume standard boards without files, complex automations, mirrors, or multiple status/date semantics.
2. Moderate-volume standard boards with approved mappings and known owners.
3. High-volume/complex standard boards, including the 9,344-, 5,735-, 3,862-, 3,847-, and 3,002-item boards.
4. Subitem-board relationships, custom objects, documents, and replacement/export workflows.

For each wave:

- [ ] Freeze mapping version and inventory delta.
- [ ] Backfill historical records with zero notifications.
- [ ] Reconcile counts/hashes/relationships and human samples.
- [ ] Shadow for a minimum approved observation window.
- [ ] Enable inbound, then controlled outbound only after the wave gate.
- [ ] Validate board sender policy, email/recipient/reply matrix, and shared daily quota forecast across board, adoption, and Platform Operations mail.
- [ ] Assign an immutable `wave_t0`. At that behavioural cutover, instruct staff that ordinary Monday edits are policy-prohibited and direct every CTA/deep link to the corresponding job already created in XeroFlow.
- [ ] Keep the bounded migration bridge/service account eligible for approved sync, reconciliation and audit writes; do not describe the wave as technically read-only.
- [ ] Train/announce via the employee adoption playbook before XeroFlow-primary, including the distinction between the staff editing rule and the later global technical restriction/archive milestones.
- [ ] At wave T+30, close the initial support review only. Do not mutate Monday permissions, remove access, archive boards or send retirement claims from a wave-relative timer.
- [ ] Hold a wave review; do not auto-advance.

**Wave gate:** 100% board decisions, zero P0/P1, no relevant P2, zero unexplained count/hash/link drift, zero Queue/DLQ backlog outside SLA, email forecast ≤70% quota, owner samples signed, rollback rehearsal current, staff-policy cutover copy approved, and every staff CTA/deep link verified against an existing XeroFlow job. Passing a wave gate does not authorize technical Monday restriction or archive.

**Rollback:** reverse only the current wave to inbound/shadow; previous accepted waves remain XeroFlow-primary unless incident evidence requires a broader stop.

### Phase 6 — Archived estate and non-board dependencies

**Outcome:** all 201 archived board objects and non-board operational dependencies are preserved or explicitly excluded before Monday access changes.

- [ ] Import/export archived standard boards, subitem relationships, custom objects, and documents according to Gate 1 decisions.
- [ ] Preserve archived state, owners/authors/timestamps/source URLs, updates/replies/files, and immutable checksums.
- [ ] Replace or retire every inventoried integration, automation, form, dashboard, and document dependency.
- [ ] Prove no XeroFlow runtime still depends on a personal Monday token or owner who will be deactivated.

**Gate 6:** archived and dependency manifests are 100% decided and reconciled; restore/sample retrieval passes; no historical notification was sent; owner-transfer inventory is complete.

**Rollback:** keep Monday archive objects untouched and reverse only XeroFlow run-scoped imports if necessary.

### Phase 7 — Organization-wide XeroFlow primary and strict Monday read-only

**Outcome:** XeroFlow is authoritative and normal Monday users cannot create or edit content.

- [ ] Complete 14 consecutive calendar days of global convergence after the final active wave.
- [ ] Confirm staff communication/training/support checkpoints in the employee adoption playbook.
- [ ] Transfer board/integration/automation ownership to the retained audit admin and remove all other board owners.
- [ ] Disable general XeroFlow outbound-to-Monday at the start of the strict read-only window. Retain only the dedicated, feature-gated milestone-comment lane to pilot item `12733119900` until the final pre-closure comment is receipted; it cannot send task/field/file mutations or arbitrary comments.
- [ ] Move normal users to a technically enforced view-only mode where supported. Do not call Monday `View and comment` read-only because comments are writes.
- [ ] If strict view-only cannot be enforced by the account plan/API, revoke normal-user access and label the state `restricted audit window`; do not claim a read-only success.
- [ ] Monitor Monday audit/webhook evidence and assert zero normal-user write events for the approved window.

**Gate 7:** zero unresolved critical/high defects, conflicts, lag, failed deliveries, or fidelity diffs; zero normal-user Monday writes; staff support/communications green; retained admin restore drill passes.

**Rollback:** re-enable only the minimum prior access and inbound/controlled outbound required for the affected wave, using transferred ownership and before-images; notify staff through the playbook incident template.

### Phase 8 — Access removal, archive, and audit/export/restore window

**Outcome:** Monday is archived and recoverable for a time-boxed owner-approved observation window. This state is not retirement and the provider account remains open.

- [ ] Before the first access-removal or archive mutation, record a global Gate 8 entry authorization against the passed Gate 7 evidence, final-delta/Queue-drain state, signed archive-batch manifest, restore/rollback plan, retained-audit owner and completed staff notice. A wave timer or wave owner cannot issue this authorization.
- [ ] Remove normal-user Monday access after Gate 7, preserving the retained audit admin.
- [ ] Deactivate users only after proving ownership/integration/automation transfer; record deactivation results and exceptions.
- [ ] Disable general Monday webhooks and scheduled reconcile only after final delta ingestion and Queue drain. Retain only the bounded pilot-item acknowledgement/reconciliation path required for the final pre-closure milestone comment.
- [ ] Archive boards in approved batches; do not delete. Record pre/post archive manifest and perform a restore drill on a representative board.
- [ ] Keep least-privilege read-only OAuth/audit access for the owner-approved observation period.
- [ ] Export the terminal account/workspace/board/item/update/file/user/integration manifest, store signed checksums in XeroFlow/R2, and prove the documented restore path.
- [ ] Publish the pre-closure fidelity, identity, notification, delivery, incident, archive, cost, billing, and communications evidence pack.

**Gate 8:** the observation window is complete; terminal export/checksum and representative restore evidence pass; sections 16.1–16.6 and the pre-closure bullets of section 16.7 are signed by the executive owner, migration lead, data-fidelity lead, identity/access lead, Platform Ops, communications lead, and board-owner representatives; no provider closure action has started.

**Rollback:** restore archived boards, reactivate required users, restore least-privilege access, rotate/re-enable integration secrets, and return affected waves to inbound/shadow using the immutable manifest. Deletion is never a rollback mechanism.

### Phase 9 — Monday subscription and account closure

**Outcome:** the provider relationship is actually retired, with no Monday account, subscription, privileged access, credentials, or installed integration left active.

- [ ] Freeze and identify the exact Monday account/workspaces covered by the closure authorization; reconcile the terminal export/checksum against the Gate 8 evidence revision.
- [ ] Record final billing date, renewal/cancellation terms, invoices/credits/refunds, data-export deadline, and vendor support reference.
- [ ] Post the final permitted pre-closure Monday milestone comment, reconcile its receipt/echo, drain outbound operations, and then permanently disable every XeroFlow-to-Monday mutation path.
- [ ] Disable remaining webhooks/reconciliation schedules and revoke OAuth grants, signing secrets, service credentials, personal tokens, and API tokens.
- [ ] Uninstall Monday apps and remove domain, email, browser, automation, marketplace, and other account integrations.
- [ ] Deprovision Monday SSO/SCIM and confirm no identity-provider assignment or provisioning route can recreate access.
- [ ] Remove account-admin seats and all remaining users except the minimum authorized closer; then remove/close the closer as part of the provider-supported terminal sequence.
- [ ] Cancel the Monday subscription/billing and close the account/plan using the provider-supported account-owner flow.
- [ ] Verify that sign-in, API, SSO/SCIM, webhook, app, and billing checks all show closed/revoked; store provider receipts and the final verification timestamp in XeroFlow/R2.
- [ ] Publish the terminal closure record and communicate that recovery now requires the approved exports and a newly provisioned provider account, not an in-place Monday restore.

**Gate 9 — irreversible closure authorization:** the executive owner gives typed approval against the exact account ID, Gate 8 evidence revision, terminal export checksum, closure actor, planned closure time, and the enumerated billing/SSO/SCIM/admin/token/app/account actions. Platform Ops confirms no pending Monday operation or Queue message, and communications confirms the pre-closure notice. Authorization expires if any referenced evidence changes.

**Rollback boundary:** before the provider confirms account/plan closure, stop and restore only the still-available access or integration needed to investigate. After closure, there is no Monday rollback promise: recovery is a new account/import from signed exports under a new owner-approved incident plan. Do not describe provider account recreation as a routine rollback.

## 12. Development defect lane and Platform Operations dependency

All migration defects are created in XeroFlow through the canonical task service on a dedicated `Monday retirement defects` board. They must include wave/board/item IDs, severity, capability, safe evidence link, first/last observed time, reproduction, owner, state, and blocking gate. Do not paste secrets, raw tokens, private email bodies, or unnecessary personal data.

| Severity | Definition | Gate effect |
|---|---|---|
| P0 | Data loss, cross-tenant/privacy/security breach, destructive loop, unbounded notification/email, or unrecoverable mutation. | Stop all mutations and waves; invoke incident rollback. |
| P1 | Duplicate/missing canonical record, wrong user attribution, broken loop suppression, failed restore, or sustained Queue/DLQ/email outage. | Blocks current and later waves. |
| P2 | Material field/thread/file/notification mismatch with a bounded workaround. | Blocks the affected capability/board/wave until resolved or explicitly owner-accepted with expiry. |
| P3 | Cosmetic, documentation, or low-risk usability defect. | May enter scheduled backlog with owner/date. |

Platform Operations is a release dependency, not an optional dashboard. Before Gate 0 it must produce an unexpired immutable `ready=true` revision that registers every relevant migration resource with owner/SLO/alert/runbook/retention and records passing controlled failures in incident records plus the normalized shared message tables. It must expose or alert on:

- webhook, reconciliation, Monday outbound, board-email, and notification Queue backlog/oldest age/retries/DLQ;
- Worker exceptions and deployments correlated to incidents;
- Cloudflare Email Service accepted, deferred, bounced, failed, suppressed, webhook, and shared board/adoption/Platform Operations quota usage through `transactional_message_attempts` and attempt-bound `transactional_quota_reservations`; legacy Resend remains separately visible and is never an automatic fallback;
- R2 write/scan/lifecycle failures;
- Monday API rate/auth/schema failures;
- AI Gateway balance/auth/rate/fallback health plus the named budget-revision ID, pricing coverage, reconciliation freshness, and spend/rate test state when optional AI is enabled;
- a tested development-team notification path and a global kill switch.

## 13. Staff communications and adoption dependency

Technical progression depends on the [XeroFlow employee adoption email playbook](./xeroflow-employee-adoption-email-playbook.md). The communications lead must record completion for:

- initial migration announcement and why XeroFlow is becoming authoritative;
- identity/invite verification and role/access support;
- pilot cohort instructions, office hours, and feedback route;
- each wave's training, behavioural source-of-truth date, board email address, notification/reply behavior, and support contact;
- XeroFlow-primary notice with explicit direction that staff must not create or update Monday work, plus one deep-link CTA to the corresponding already-created XeroFlow job;
- disclosure that the controlled migration bridge/service account may still write for sync/reconciliation/audit, so per-wave T0 is not technical read-only;
- strict read-only/restricted-audit date and what users can/cannot do;
- access removal/archive-window notice, retention/restore expectations, irreversible account-closure warning, and final retirement confirmation through Cloudflare Email Service and the normalized shared message records;
- incident/rollback communications if a wave returns to Monday temporarily.

No wave enters XeroFlow-primary and no organization-wide access state changes until the matching communication checkpoint is signed. A wave T+30 communication closes its initial support review only; it cannot trigger or imply Gate 7 technical restriction, Gate 8 access removal/archive, or provider retirement.

## 14. Pilot milestone comments on Monday item `12733119900`

This section defines a future controlled outbound behavior; it does not authorize a Monday mutation during planning or implementation. Milestone evidence may become eligible before delivery is technically permitted. No milestone comment is sent until the owner has approved the milestone-comment feature, the pilot canonical link exists, outbound Monday operations are enabled for the pilot, and echo/idempotency tests have passed.

Milestone comments are posted as top-level Monday updates on the user-provided pilot item only. They provide a concise bridge for staff still observing Monday and always link back to XeroFlow as the authoritative evidence. They do not copy private email bodies, raw migration manifests, user lists, tokens, internal defect details, or confidential evidence into Monday.

| Milestone code | Evidence becomes eligible | Earliest delivery | Required XeroFlow links |
|---|---|---|---|
| `plan_approved` | Gate 0 passes and the executive owner approves this plan, its decisions, and the pilot scope. Preserve that Gate 0 evidence timestamp. | Once only after the pilot canonical link exists and the outbound/echo/idempotency preflight passes; delivery may occur after Gate 0 without changing the evidence timestamp. | XeroFlow program/evidence page and approved plan record. |
| `pilot_backfill_verified` | Gate 3 passes, the 81-item pilot manifest is signed, Robert/Paul attribution is correct, and historical notification count is zero. | After the outbound/echo/idempotency preflight passes. | Pilot XeroFlow board/task and immutable fidelity evidence summary. |
| `pilot_inbound_live` | Pilot webhook/reconciliation apply is enabled and duplicate/out-of-order repair tests pass. | After the outbound/echo/idempotency preflight passes. | Pilot task and sync-health/evidence page. |
| `pilot_bidirectional_live` | Approved outbound fields/comments are enabled and echo/conflict tests pass. | At the first successful transition into that state. | Pilot task and current transition-state page. |
| `pilot_email_reply_verified` | Unique board email, authorized-sender checks, creator/watcher delivery, and reply-to-task acceptance pass. | At the first successful transition into that state. | Pilot task email-thread view and redacted delivery evidence. |
| `pilot_converged` | Gate 4 and the 7-day pilot convergence window pass with owner sign-off. | At the first successful transition into that state. | Pilot evidence pack and next-wave decision. |
| `monday_read_only_scheduled` | Gate 7 prerequisites pass and the staff communication checkpoint is complete. | Before strict read-only/restricted audit begins. | XeroFlow source-of-truth notice, support route, and read-only schedule. |
| `monday_archive_window_started` | Gate 7 passes and the Gate 8 archive/observation window is approved. | Before normal-user access removal and archive batches begin. | Archive manifest, support route, and observation-window schedule. |
| `monday_account_closure_authorized` | Gate 9 authorization is signed against the immutable Gate 8 evidence revision and terminal export checksum. | Exactly once before tokens/apps/account access are revoked; it is the last permitted Monday milestone comment. | Final pre-closure evidence pack, export verification, and post-closure support route. |

Every comment must use this bounded structure:

```text
XeroFlow migration milestone: <human milestone label>
Status: <approved state> at <source timestamp with timezone>
XeroFlow: <allowlisted HTTPS task/program link>
Evidence: <allowlisted HTTPS evidence-summary link>
Reference: <stable milestone reference>
```

Implementation safeguards:

1. When evidence becomes eligible, persist immutable `evidence_at`, evidence revision, and body/link inputs. Before permitted delivery, create a transactional `monday_outbound_operations` row with idempotency key `monday-retirement:<program-id>:pilot-item-12733119900:<milestone-code>:<evidence-revision>` and a canonical body/link digest. `sent_at` is separate and never replaces the original evidence timestamp.
2. Enforce logical uniqueness for program + item + milestone code. The first eligible evidence revision is immutable for that milestone; a retry reuses the same operation and no later evidence revision creates another logical comment.
3. Validate that the canonical link still targets Monday board `8922815727`, item `12733119900`, and the approved XeroFlow pilot task immediately before sending.
4. Allow only `https://app.xeroflow.io/` links built from stored XeroFlow identifiers. Reject user-supplied URLs, credentials, query-string secrets, redirects, and non-HTTPS links.
5. Store the Monday update ID, provider response, body digest, sent time, actor, mapping version, and linked XeroFlow evidence revision as the delivery receipt.
6. If the provider response is ambiguous, reconcile by the stored operation/digest and source update inventory before retrying. Do not send a speculative duplicate.
7. Match the resulting Monday `create_update` webhook to the outbound receipt/update ID/digest. Mark it acknowledged without inserting another XeroFlow activity, sending another email, or enqueueing another Monday operation.
8. A human-authored reply to the milestone update is a distinct inbound reply and may land once in the linked XeroFlow thread; the original XeroFlow-origin update remains echo-suppressed.
9. A failed or dead-lettered milestone comment creates/updates one Platform Operations incident and one XeroFlow migration defect. It does not roll back the completed migration milestone and is not reported as posted.
10. Historical backfill, shadow comparison, test replays, evidence regeneration, and evidence revision changes post no milestone comments unless the corresponding milestone becomes eligible and transitions to delivered for the first time. `plan_approved` remains one logical comment even if delivery is delayed.
11. After `monday_account_closure_authorized` is receipted and echoed, reject every later milestone-comment request. Provider closure is recorded only in XeroFlow because Monday is no longer an available or authoritative notification channel.

The milestone comment is informational. Monday content never approves a gate, changes the authoritative XeroFlow transition state, or substitutes for the signed evidence pack.

## 15. Implementation task checklist

Tasks are ordered by dependency and should be split further if a focused implementation session would exceed roughly five files.

### Foundation

- [ ] **M1 — Regenerate production inventory manifest.** Dependencies: Gate 0. Verify all pagination, board states/types, counts, owners, dependencies, and R2 checksum artifacts against a second run. Likely evidence: [`server/utils/mondayClient.ts`](../../server/utils/mondayClient.ts), new inventory service/tests.
- [ ] **M2 — Canonicalize user identities and employee titles.** Dependencies: M1. Verify 18/18 active-user decisions, four missing-user resolutions, stale/placeholder cleanup, invitations, roles, teams, exact title API coverage, owner-approved Monday title backfill/conflict review, reviewed role-family module mappings, neutral fallback, and historical attribution fixtures.
- [ ] **M3 — Add canonical link/snapshot/mapping schemas.** Dependencies: M1. Verify uniqueness, immutable snapshots, mapping-version audit, and a dry-run legacy backfill/conflict report.
- [ ] **M4 — Add field watermarks/conflict/outbound ledgers.** Dependencies: M3. Verify concurrent-edit, stale-event, destructive-event, and echo acknowledgement state transitions.
- [ ] **M5 — Build the shared task-creation service.** Dependencies: M2/M3. Verify one task/event for duplicate source keys and zero delivery rows for `historical=true`.
- [ ] **M6 — Migrate all direct task creation callers.** Dependencies: M5. Verify UI/API/subtask/duplicate/CSV/template/AI/meeting/brief/anomaly/email/Monday/cutover/script coverage with a source matrix test.

### Monday fidelity and two-way transport

- [ ] **M7 — Pin/fix Monday provider queries.** Dependencies: M1. Verify active/archived boards, uncapped pagination, current Asset fields, users, replies, subitems, and contract tests against the pinned API version.
- [ ] **M8 — Implement versioned deterministic board mappings.** Dependencies: M2/M3/M7. Verify pilot multi-status/date/person mapping and unmapped-field reports.
- [ ] **M9 — Backfill legacy links without duplicates.** Dependencies: M3/M8. Verify the pilot's 58 legacy mappings resolve before current import and every ambiguity becomes a conflict.
- [ ] **M10 — Repair webhook landing/claim/apply.** Dependencies: M4/M7/M8. Verify JSONB scope, concurrent claim, duplicate/out-of-order/stale event, content apply, retry, and DLQ.
- [ ] **M11 — Implement reconciliation partitions.** Dependencies: M9/M10. Verify checkpoint resume, no watermark advancement on partial failure, and exact repair after dropped webhook.
- [ ] **M12 — Implement Monday outbound operations.** Dependencies: M4/M8. Verify name/mapped column/update/file operations, receipts/digests, rate-limit retry, dead letter, and echo suppression.

### Email and notifications

- [ ] **M13 — Add board route/recipient/thread/sender-policy schemas.** Dependencies: M2/M5. Verify signed/hashed route rotation/revoke, unique active board route, recipient audit, internal-member and exact verified-external policy revisions, verification expiry, message/attachment uniqueness, and reply authorization.
- [ ] **M14 — Route durable authorized board email.** Dependencies: M13 + Platform Ops Queue/R2. Verify exact `board@xeroflow.io` subaddress delivery without catch-all diversion, fail-closed envelope/`From`/authentication/alignment checks before mutation, rejection/quarantine audit, zero task/delivery for unauthorized/spoofed/leaked-token senders, MIME retention, Queue/DLQ, automation suppression, idempotency, and actual attachments.
- [ ] **M15 — Deliver creator/watcher creation email.** Dependencies: M5/M13/M14. Verify every creation source, canonical recipient dedupe, mandatory creator, watcher preferences, Cloudflare Email Service, immutable parent/append-only attempt/attempt-bound reservation model, retry, suppression visibility, no automatic Resend fallback, and 1,000/day rate gate.
- [ ] **M16 — Implement reply-to-task threads.** Dependencies: M13/M14/M15. Verify Message-ID/References, signed reply route, current sender-policy reauthorization, internal/external authorship, attachments, participant fan-out, UI internal-note boundary, and optional Monday outbound update.
- [ ] **M17 — Mount board email/recipient administration.** Dependencies: M13-M16. Verify owner/admin RBAC, Nuxt UI v4 form rules, route health, copy/rotate/revoke, recipients/watchers, internal/verified-external sender policy and verification controls, test email, quarantine audit, and delivery failures.

### Pilot, waves, and retirement

- [ ] **M18 — Execute pilot historical dry-run/backfill.** Dependencies: M1-M17. Verify full pilot matrix, zero historical notifications, exact Robert/Paul attribution, and run-scoped rollback.
- [ ] **M19 — Execute pilot live convergence.** Dependencies: M18. Verify inbound/outbound/email/reply/loop/conflict/failure matrix, including unauthorized/spoofed/leaked-route sender rejection with zero task/delivery, and a 7-day stable window.
- [ ] **M20 — Automate wave evidence packs.** Dependencies: M18/M19. Verify every wave produces inventory delta, counts/hashes, samples, conflicts, defects, notification quota, Platform Ops health, approvals, and rollback pointer.
- [ ] **M21 — Migrate active-board waves.** Dependencies: M20 + communications checkpoints. Verify each independent wave gate and no automatic advancement.
- [ ] **M22 — Migrate archived/non-board dependencies.** Dependencies: M20. Verify archive/doc/custom/subitem handling, integrations/automations/forms/dashboards, restore samples, and zero notifications.
- [ ] **M23 — Enforce strict read-only/restricted audit.** Dependencies: M21/M22 + 14-day convergence. Verify owner transfer, normal-user effective access, zero write events, support readiness, and rollback access.
- [ ] **M24 — Remove access and run the archive/restore window.** Dependencies: M23. Verify user deactivation does not disable needed automation, board archive/restore manifests, terminal export/checksum, final Queue drain, retained audit access, pre-closure evidence, and no individual board/item deletion.
- [ ] **M25 — Close the Monday provider account.** Dependencies: M24 + completed observation window + Gate 9 authorization. Verify the final pre-closure comment/echo, outbound disable/drain, webhook/schedule/OAuth/personal/API-token revocation, app/domain-integration uninstall, SSO/SCIM deprovisioning, admin-seat removal, subscription/billing cancellation, account/plan closure, provider receipts, post-closure access/billing checks, Graphify refresh, runbooks, and terminal owner approval.

### Verification checkpoint after every 2–3 tasks

- [ ] Re-read every modified/new file and run the project's pre-commit battle test.
- [ ] Run focused unit/integration/provider-contract tests and database migration dry-run/application as required by project rules.
- [ ] Run typecheck/build in proportion to the slice and record inherited versus introduced failures.
- [ ] Refresh the defect lane and block progression for P0/P1 or relevant P2 findings.
- [ ] Update public XeroFlow feature pages for shipped user-facing capabilities.
- [ ] Refresh Graphify at M6, M19, and M25.

## 16. Acceptance criteria

### 16.1 Identity and access

- [ ] All 18 active Monday users have one approved canonical identity decision; every required active user can authenticate to XeroFlow.
- [ ] Robert `574174` and Paul `574175` resolve to their active XeroFlow accounts; the inactive Paul placeholder receives no attribution/notification.
- [ ] Roles, teams, departments, board access, notification preferences, owners, and historical-only identities are signed and tested.
- [ ] The canonical team-members API returns each approved exact title; Monday/XeroFlow title conflicts and missing values have an auditable decision, role-family module mappings are reviewed separately, and unresolved recipients receive only the department/custom-role neutral adoption fallback.
- [ ] Every Monday board/integration/automation owner has transferred ownership before deactivation.

### 16.2 Fidelity

- [ ] All 519 observed active/archived board objects are present in the final manifest with destination or approved exclusion; refreshed counts explain all deltas.
- [ ] Every in-scope item/subitem has exactly one canonical link and required source state/fields/timestamps/authors.
- [ ] Groups, typed column values, dependencies, updates, replies, files, and parent relationships pass count/hash/referential checks.
- [ ] Every file passes provider ID + byte count + SHA-256 + clean scan + R2/XeroFlow link validation.
- [ ] Archived/custom/document/form/dashboard/integration/automation handling is owner-approved and retrievable.
- [ ] Historical backfill sends zero notifications and zero Monday outbound mutations.

### 16.3 Pilot

- [ ] The pilot URL resolves to one XeroFlow task with the approved status, P4 priority, SLA fields/dates, category, people, Gmail link, update, and reply.
- [ ] The legacy 58-task mapping is reconciled without duplicating any task; the current 81-item board count is explained by the signed manifest.
- [ ] Robert and Paul are the correct authors/participants; source timestamps and reply parentage are preserved.
- [ ] A controlled Monday creation/update lands once in XeroFlow, and a controlled XeroFlow change lands once in Monday.
- [ ] An outbound echo creates no duplicate task/activity/email.
- [ ] The pilot `board+` address creates one task; creator and configured recipients/watchers receive one email each; a reply lands once on that task and, when enabled, once on the same Monday item.
- [ ] Unauthorized, spoofed, misaligned, unauthenticated, unverified, expired, and leaked-route-token pilot messages create neither task nor delivery and produce only the approved reject/quarantine audit evidence.

### 16.4 Operational notifications and email

- [ ] UI, API, subtask, duplicate, CSV, template, AI, meeting, brief, anomaly, email, Monday webhook, reconcile, cutover, and supported script creation paths use the canonical service.
- [ ] Every net-new operational creation emails the creator plus deduplicated configured recipients/watchers according to the explicit policy.
- [ ] Historical/replay/repair creation paths produce zero `transactional_messages`, `transactional_message_attempts`, and `transactional_quota_reservations` records.
- [ ] Sender authorization and envelope/`From` authentication/alignment run before every board-email or reply mutation; unauthorized traffic cannot create a task, thread, attachment, activity, notification, or delivery.
- [ ] Message/reply/attachment idempotency plus normalized logical-parent/attempt/reservation records survive duplicate, retry, out-of-order, and partial-failure tests.
- [ ] New board, adoption, and Platform Operations mail uses Cloudflare Email Service through one immutable `transactional_messages` parent per logical event + recipient + template/purpose, append-only `transactional_message_attempts`, and attempt-bound unique `transactional_quota_reservations`; a provider failure queues/defers/dead-letters the same attempt and never automatically falls back to legacy Resend.
- [ ] No `transactional_messages` uniqueness rule or parent field contains channel, provider, delivery status, provider attempt or quota reservation; duplicate workers/provider retries reuse the same child attempt and reservation.
- [ ] Forecast daily volume is ≤70% of the 1,000/day allowance and Platform Ops alerts before exhaustion.

### 16.5 Two-way safety and convergence

- [ ] Inbound events are signed, durably landed, atomically claimed, applied once, and repaired by reconcile.
- [ ] Outbound operations are transactional, idempotent, rate-limited, receipted, retryable, and dead-lettered visibly.
- [ ] Field-level watermarks distinguish source from observation time and create conflicts for concurrent changes.
- [ ] Comments/replies/files are append-only/deduplicated; archive/delete never propagates destructively without approval.
- [ ] Pilot completes 7 stable days and the organization completes 14 stable days with no unexplained drift, unauthorized Monday write, P0/P1, or relevant P2.
- [ ] At every wave T0, staff copy policy-prohibits ordinary Monday edits and each action deep-links to the corresponding existing XeroFlow job, while approved bridge/service-account writes remain bounded and auditable until Gate 7.

### 16.6 Operations, cost, and rollback

- [ ] Before Gate 0, Platform Operations emits an unexpired immutable `ready=true` revision covering every relevant Queue/DLQ/Worker/R2/email webhook and message-attempt consumer with owner/SLO/alert/runbook/retention plus passing controlled-failure evidence in incident records and normalized message tables.
- [ ] Every DLQ has an active consumer and durable redacted failure record; no blocking backlog exceeds SLA at a gate.
- [ ] Optional AI references an approved named immutable budget revision with 100% enabled-route pricing coverage, a current provider reconciliation timestamp, passing controlled spend/rate tests, authenticated gateway, limits/top-up policy, metadata-only sensitive logging, and deterministic fallback.
- [ ] Every wave has a tested rollback, immutable before-images/snapshots, owner, and staff incident communication.
- [ ] Graphify and runbooks represent the final architecture without containing private Monday business data.

### 16.7 Retirement

- [ ] No wave-relative T0/T+30 timer technically restricts Monday, removes access, archives boards or claims retirement; technical restriction is a global Gate 7 action and access removal/archive is controlled only by Phase/Gate 8 evidence and approval.
- [ ] Strict read-only is technically proven for normal users, or the state is honestly labeled/replaced by restricted audit access.
- [ ] Normal-user access removal, user deactivation, and archive occur only after ownership transfer, passed Gate 7 evidence, and signed Gate 8 entry authorization.
- [ ] Representative archive restore drill succeeds before integration revocation.
- [ ] Monday boards are archived, not deleted; retained audit access follows the approved observation/retention policy.
- [ ] The terminal export/checksum and restore evidence are signed before OAuth, signing secrets, personal/API tokens, webhooks, schedules, apps, or domain integrations are revoked/disabled.
- [ ] The final pre-closure Monday comment is sent and echoed once before mutation paths and credentials are disabled; final provider closure is recorded only in XeroFlow.
- [ ] SSO/SCIM is deprovisioned, account-admin seats are removed, apps/domain integrations are uninstalled, subscription/billing is cancelled, and the Monday account/plan is closed with provider receipts and post-closure verification.
- [ ] Executive, migration, fidelity, identity/access, Platform Ops, communications, and board-owner representatives sign the pre-closure evidence pack; the executive owner separately signs the expiring Gate 9 irreversible closure authorization against the exact account and evidence revision.

## 17. Required evidence paths

### Identity, title, and adoption readiness

- [`server/api/agency/team-members.get.ts`](../../server/api/agency/team-members.get.ts)
- [`scripts/sync-titles.ts`](../../scripts/sync-titles.ts)
- [`scripts/check-monday-titles.ts`](../../scripts/check-monday-titles.ts)
- [`server/database/migrations/add_title_column.sql`](../../server/database/migrations/add_title_column.sql)
- [`docs/prd/xeroflow-employee-adoption-email-playbook.md`](./xeroflow-employee-adoption-email-playbook.md)

### Monday client, migration, sync, and reconciliation

- [`server/utils/mondayClient.ts`](../../server/utils/mondayClient.ts)
- [`server/utils/mondayMigration.ts`](../../server/utils/mondayMigration.ts)
- [`server/utils/mondaySync.ts`](../../server/utils/mondaySync.ts)
- [`server/utils/mondayWebhookReconcile.ts`](../../server/utils/mondayWebhookReconcile.ts)
- [`server/utils/hr/mondaySyncRunner.ts`](../../server/utils/hr/mondaySyncRunner.ts)
- [`server/api/webhooks/monday.post.ts`](../../server/api/webhooks/monday.post.ts)
- [`server/api/cron/monday-webhooks.post.ts`](../../server/api/cron/monday-webhooks.post.ts)
- [`server/api/agency/monday/webhooks/register.post.ts`](../../server/api/agency/monday/webhooks/register.post.ts)
- [`server/api/agency/monday/sync/index.post.ts`](../../server/api/agency/monday/sync/index.post.ts)
- [`server/api/agency/monday/settings/index.put.ts`](../../server/api/agency/monday/settings/index.put.ts)

### Cutover, mappings, and live-state schema

- [`server/utils/mondayCutoverPlan.ts`](../../server/utils/mondayCutoverPlan.ts)
- [`server/utils/mondayCutoverApproval.ts`](../../server/utils/mondayCutoverApproval.ts)
- [`server/utils/mondayCutoverExecution.ts`](../../server/utils/mondayCutoverExecution.ts)
- [`server/utils/mondayCutoverExecutionStore.ts`](../../server/utils/mondayCutoverExecutionStore.ts)
- [`server/database/migrations/230_monday_webhook_events.sql`](../../server/database/migrations/230_monday_webhook_events.sql)
- [`server/database/migrations/233_monday_item_source_links.sql`](../../server/database/migrations/233_monday_item_source_links.sql)
- [`server/database/migrations/234_monday_reconciliation_state.sql`](../../server/database/migrations/234_monday_reconciliation_state.sql)
- [`server/database/migrations/240_monday_operational_comments.sql`](../../server/database/migrations/240_monday_operational_comments.sql)
- [`server/database/migrations/241_monday_operational_files.sql`](../../server/database/migrations/241_monday_operational_files.sql)
- [`server/database/migrations/263_monday_cutover_approval_artifacts.sql`](../../server/database/migrations/263_monday_cutover_approval_artifacts.sql)
- [`server/database/migrations/264_monday_cutover_execution_runs.sql`](../../server/database/migrations/264_monday_cutover_execution_runs.sql)

### Task creation, notifications, email, and threads

- [`server/api/agency/tasks/index.post.ts`](../../server/api/agency/tasks/index.post.ts)
- [`server/utils/boardNotifications.ts`](../../server/utils/boardNotifications.ts)
- [`server/utils/subscriptions.ts`](../../server/utils/subscriptions.ts)
- [`server/utils/notifications.ts`](../../server/utils/notifications.ts)
- [`server/utils/automationEngine.ts`](../../server/utils/automationEngine.ts)
- [`server/api/internal/email-to-board.post.ts`](../../server/api/internal/email-to-board.post.ts)
- [`server/database/migrations/004-board-email.sql`](../../server/database/migrations/004-board-email.sql)
- [`app/components/board/BoardEmailSettings.vue`](../../app/components/board/BoardEmailSettings.vue)
- [`workers/email-worker/src/index.ts`](../../workers/email-worker/src/index.ts)
- [`workers/email-worker/src/routing.ts`](../../workers/email-worker/src/routing.ts)
- [`workers/email-worker/src/boardAdapter.ts`](../../workers/email-worker/src/boardAdapter.ts)
- [`server/utils/crm/emailReplyToken.ts`](../../server/utils/crm/emailReplyToken.ts)
- [`server/database/migrations/288-crm-conversations-email-foundation.sql`](../../server/database/migrations/288-crm-conversations-email-foundation.sql)

### Verification and existing claims

- [`test/server/utils/mondayClientSchema.test.ts`](../../test/server/utils/mondayClientSchema.test.ts)
- [`test/server/utils/mondaySyncComments.test.ts`](../../test/server/utils/mondaySyncComments.test.ts)
- [`test/server/utils/mondaySyncFiles.test.ts`](../../test/server/utils/mondaySyncFiles.test.ts)
- [`test/server/utils/mondayWebhookReconcile.test.ts`](../../test/server/utils/mondayWebhookReconcile.test.ts)
- [`test/workers/emailWorkerRouting.test.ts`](../../test/workers/emailWorkerRouting.test.ts)
- [`test/workers/emailWorkerBoardAdapter.test.ts`](../../test/workers/emailWorkerBoardAdapter.test.ts)
- [`docs/prd/monday-operational-integration-plan.md`](./monday-operational-integration-plan.md)
- [`docs/prd/hr-monday-production-handoff.md`](./hr-monday-production-handoff.md)

## 18. External operational constraints

- Monday webhooks are a freshness signal with retry behavior, not the sole repair mechanism; reconciliation remains required.
- Monday supports item-name, multiple-column, update/comment, and file mutations needed for an approved outbound subset.
- Board owners can bypass board permissions. Ownership must be transferred/removed before claiming read-only.
- `View and comment` permits a write and is not strict read-only.
- Deactivating a Monday user can disable integrations/automations they created. Transfer and prove ownership first.
- Archive is preferred to delete because archive is recoverable. Deletion/trash retention is not the retirement strategy.

Primary provider references:

- [Monday webhooks](https://developer.monday.com/api-reference/reference/webhooks)
- [Monday change multiple column values](https://developer.monday.com/api-reference/docs/change-column-values)
- [Monday create update](https://developer.monday.com/api-reference/docs/create-update)
- [Monday assets](https://developer.monday.com/api-reference/docs/get-assets)
- [Monday files](https://developer.monday.com/api-reference/reference/files-1)
- [Monday users/deactivation API](https://developer.monday.com/api-reference/reference/users)
- [Monday board permissions](https://support.monday.com/hc/en-us/articles/115005315809-Board-permissions)
- [Monday user administration](https://support.monday.com/hc/en-us/articles/360002426980-How-to-manage-users-on-your-account)
- [Monday archive and restore](https://support.monday.com/hc/en-us/articles/115005314609-How-to-archive-and-restore-data)
- [Monday board owners](https://support.monday.com/hc/en-us/articles/115005320545-Board-owners-on-monday-com)

## 19. Owner decisions required before Gate 0

1. Approve the executive/program owners and board-owner representatives.
2. Approve retention for raw source snapshots, MIME, attachments, manifests, delivery evidence, and retained Monday audit access.
3. Approve the technical strict-read-only method supported by the Monday account; otherwise approve restricted audit access as the honest substitute.
4. Approve whether each custom object/document/form/dashboard/automation/integration is migrated, exported, replaced, or excluded.
5. Approve creator-email mandatory/suppression behavior, external board recipients, allowed senders, thread participant rules, and notification watermark.
6. Approve the 7-day pilot and 14-day global convergence windows or record a stricter replacement.
7. Approve AI reserve/budgets/top-up authority or disable optional AI for the program.
8. Approve the archive observation period and final OAuth/secrets revocation date.
9. Approve employee-title source precedence, conflict reviewers, exact-title display, role-family module mappings, and the department/custom-role neutral adoption fallback; unresolved recipients cannot receive role-personalised mail.
10. Approve the terminal Monday closure actor, exact account/workspaces, closure date, final export revision, billing cancellation, SSO/SCIM deprovisioning, admin-seat removal, token revocation, app/domain-integration uninstall, and account/plan closure sequence.
