# Brief → Job → Assignment → Sidebar Workflow — Gap Register & Action Plan

- **Date:** 2026-06-28
- **Author:** Paul + Claude
- **Status:** Audit findings (code-verified) + proposed action plan — not yet scheduled
- **Scope:** The existing flow that turns a submitted brief into a project with tasks and assignees, and how it surfaces in the UI. No code changed by this audit.

## Method & caveat

Traced directly in source (not runtime — the browser could not be opened this session, so UI *rendering* is unverified; everything below is read from code). Primary files:
`server/utils/briefConversion.ts`, `server/api/agency/briefs/index.post.ts`, `server/api/agency/briefs/[id]/status.patch.ts`, `server/api/agency/briefs/templates/[id]/mapping.put.ts`, `app/pages/agency/briefs/[id].vue`, `app/layouts/agency.vue`, `server/database/schema-briefs.sql`, `schema-templates.sql`, `schema-xeroflow.sql`, `schema-workflow.sql`.

## How the flow works today (verified)

1. **Template → brief** (`briefs/new.vue` → `briefs/index.post.ts`): user picks category → template → multi-step form → submit. Creates `briefs` + `brief_field_values`. Template `auto_assign_to` (person) / `auto_assign_department` sets `briefs.assigned_to` at submission; assignee added as watcher + notified.
2. **Status lifecycle**: `draft → submitted → under_review/needs_info → approved → rejected/in_progress → completed/cancelled`.
3. **Brief → project**: manual **Convert to Project** button (enabled once `approved`, `briefs/[id].vue:50`) **or** automatic on approval when the template sets `auto_convert_on_approval=true` + `project_template_id` (`status.patch.ts:134-159`, fail-open). Both call `convertBriefToProject()`.
4. **Conversion** (`briefConversion.ts`): creates a `projects` row + N `tasks` from the project template's `template_tasks`, links `briefs.converted_to_project_id`, optionally fuzzy-matches tasks to quote line items for cost.
5. **Surfacing**: sidebar (`agency.vue:135-150`) has distinct entries — Inbox, Workflow, Timeline, Tasks, Projects, **Briefs**. Brief detail shows a **Linked Project** card (`briefs/[id].vue:790-810`). Inbox carries assignment notifications with an unread badge.

## Root-cause synthesis

**Conversion behaves as "instantiate a static project template" and discards almost all of the brief's intake data.** The brief is a rich, per-job form, but at conversion the field values, the assignee, the requested deadline, and the budget are all dropped; the resulting tasks are generic template boilerplate, assigned to nobody, and no one is notified. Most gaps below are facets of this one root cause.

---

## Gap register

| ID | Gap | Severity | Bug vs choice | Evidence |
|----|-----|----------|---------------|----------|
| G1 | Converted tasks are created **unassigned** | High | Likely bug | `briefConversion.ts:167-188` |
| G2 | Brief assignee/owner **not carried** to project/tasks | Medium | Bug | `briefConversion.ts:60-112` (PM = converter) |
| G3 | `field_mapping` is **dead** — configured but never applied | High | Bug (dead feature) | `mapping.put.ts` sets it; `briefConversion.ts:33` + `status.patch.ts:139` read it; applied nowhere |
| G4 | Brief **deadline & budget dropped** at conversion | Medium | Bug | `briefConversion.ts:30` selects, `:93-108` uses template defaults |
| G5 | **No notification** when a brief becomes a job | Medium | Bug | conversion emits no notifications |
| G6 | Status is **one-way** — project completion doesn't sync back to the brief | Low–Med | Choice/gap | no project→brief status path |
| G7 | **No role→person resolver** — template task roles exist but can't become real assignees | High | Bug (root of G1) | `schema-xeroflow.sql:128` `default_assignee_role`; `schema-templates.sql:117` `default_role`; unused |
| G8 | **Duplicate `template_tasks` schema** with divergent assignee columns | Medium | Tech debt | `schema-xeroflow.sql:106` vs `schema-templates.sql:96` |
| G9 | Brief panel links to the project but shows **no task/assignee rollup**; no unified view | Low–Med | UX gap | `briefs/[id].vue:790-810` (name + time only) |
| G10 | Auto-convert / auto-quote failures are **swallowed** (console.error; status still succeeds) | Medium | Bug | `status.patch.ts:155-158, 177-180` |

### Detail

**G1 — Converted tasks are unassigned.** The task INSERT (`briefConversion.ts:167-188`) sets `reporter_id = userId` (the converter) and **no `assignee_id` and no `task_assignees` row**. Every task created from a brief lands with nobody responsible. *Impact:* the "assign people" expectation isn't met by conversion — assignment is a manual step per task in the Workflow board afterward.

**G2 — Brief owner not carried over.** Conversion sets `projects.project_manager_id = userId` (whoever clicked Convert / approved), and never reads `briefs.assigned_to` (it isn't even in the SELECT, `:27-37`). *Impact:* the person who owned the brief isn't the PM of the resulting project; ownership is lost at the boundary.

**G3 — `field_mapping` dead.** There is an admin/PM endpoint (`mapping.put.ts`, body `fieldMapping: Record<string,string>`) to map brief field keys → project/task fields, persisted on `brief_templates.field_mapping`. It is SELECTed in `briefConversion.ts:33` and `status.patch.ts:139` but **applied in zero places**. *Impact:* none of the brief's submitted content flows into the project or its tasks — the carefully-captured intake dead-ends. This is a configured, discoverable feature that silently does nothing.

**G4 — Deadline & budget dropped.** `briefConversion.ts:30` selects `requested_deadline, budget_min/max, budget_currency`; the project's `end_date` is `start + template.estimated_duration_days (or +30)` (`:93-95`) and budget comes from `template.default_budget_*` (`:107-108`). *Impact:* the client's requested deadline and the brief's budget are ignored in favour of template defaults.

**G5 — Silent conversion.** Creating a project + tasks emits no notification to the brief owner or anyone else (and there are no task assignees to notify — see G1). Auto-convert on approval only logs on failure. *Impact:* work materialises with no signal; people discover it by browsing.

**G6 — One-way status.** Nothing moves `briefs.status → completed` when the converted project/tasks finish; the brief lingers in `approved`/`in_progress`. *Impact:* brief lists misreport real state; no closed-loop reporting.

**G7 — No role→person resolver (root cause of G1).** `template_tasks` carries an intended assignee *role* (`default_assignee_role` ∈ project_manager/consultant/client/any, or free-text `default_role` like 'Designer'), but conversion never reads it, and there is no mechanism to turn a role into a concrete `team_member`. *Impact:* even "use the template's roles" can't work without a resolver — this is the structural blocker behind G1.

**G8 — Duplicate `template_tasks` schema.** Two definitions exist with different assignee columns (`schema-xeroflow.sql:106` has the `default_assignee_role` enum; `schema-templates.sql:96` has free-text `default_role`). `briefConversion.ts` does `SELECT *`, so it works against whichever is live, but a clean assignment fix needs one canonical column. *Impact:* ambiguity/risk; must reconcile before building G1/G7.

**G9 — UI rollup missing.** The brief's "Linked Project" card (`briefs/[id].vue:790-810`) shows only the project name + converted-time. There is no inline "N tasks · assigned to …" summary, and no single panel ties brief ↔ project ↔ tasks ↔ assignees together — users hop between Briefs / Projects / Workflow / Tasks. (Reverse project→brief surfacing not confirmed in this pass.) *Impact:* the discontinuity behind the original "does it show in the sidebar?" question.

**G10 — Swallowed failures.** On approval, if `convertBriefToProject` or `generateQuoteFromBrief` throws, it's caught with `console.error` and the status change still returns success (`status.patch.ts:155-158, 177-180`). *Impact:* a brief can be "approved" with no project/quote created and no visible error — silent partial failure.

---

## Action plan (phased)

Sequenced so each phase is independently shippable and de-risks the next. Effort: **S** ≤0.5d · **M** ~1-2d · **L** >2d. All behind no new flag unless noted; each phase = tests + atomic commits.

### P0 — Reconcile the template-task schema (G8) · **S** · blocker
Pick the canonical `template_tasks` definition and assignee column (recommend the `schema-xeroflow.sql` `default_assignee_role` enum, plus an optional `default_assignee_id UUID` for explicit per-task people). Confirm which table is live in prod (`\d template_tasks`), migrate to a single shape, drop/rename the divergent one. *Files:* `server/database/migrations/NNN_*.sql`, both schema files. *Risk:* low (additive column; reconcile carefully if both tables hold data).

### P1 — Assignment & ownership (G7 → G1, G2) · **M** · core value
- Add a **role resolver** `resolveTaskAssignee(role, ctx)`: `project_manager → project.project_manager_id`; explicit `default_assignee_id → that person`; department/role → first active member of the mapped department; `client`/`any` → unassigned. *(new `server/utils/briefConversion/assigneeResolver.ts`)*
- Set `projects.project_manager_id` from `brief.assigned_to` (fallback to converter) — **quick win, ~1 line + SELECT** (G2).
- In the task INSERT, set `assignee_id` from the resolver and add a `task_assignees(role='assignee')` row (G1).
- Notify each resolved assignee (`task_assigned`) — overlaps P3.
*Files:* `briefConversion.ts:167-188`, new resolver, `assigneeResolver.test.ts`. *Risk:* medium (assignment is visible behaviour).

### P2 — Carry the brief's data into the job (G3, G4) · **M/L**
- **Apply `field_mapping`** (`Record<briefFieldKey, targetField>`): join `brief_field_values`, map to project/task fields per the config; at minimum enrich task/project description and any mapped scalar (deadline, budget). Define + document the supported target keys. (G3)
- Apply brief `requested_deadline` → project `end_date` / proportional task due-dates; apply brief budget → project budget when present, overriding template defaults. (G4)
*Files:* `briefConversion.ts`, a `applyFieldMapping()` unit, tests. *Risk:* medium — `field_mapping` is currently empty for all templates, so start by honouring it where set; no regression for unset templates.

### P3 — Notifications & failure surfacing (G5, G10) · **S/M**
- Notify the brief owner on conversion ("Brief X → Project Y, N tasks") and assignees on task assignment (P1). (G5)
- Stop swallowing auto-convert/auto-quote failures: write a `brief_activities` failure entry + notify the approver, and return a `warning` in the status response so the UI can surface it. (G10)
*Files:* `status.patch.ts:134-181`, `briefConversion.ts`, `briefNotifications.ts`. *Risk:* low.

### P4 — Status sync-back (G6) · **S** · optional/flagged
When a converted project (or all its tasks) completes, optionally move the brief → `completed` (config per template or a global flag). *Files:* project/task completion path + `briefConversion` link lookup. *Risk:* low; gate behind a flag to avoid surprising existing workflows.

### P5 — UI rollup (G9) · **S/M**
Enrich the "Linked Project" card with task count + assignee avatars (one extra read), and add a reverse project→brief link on the project page. Optionally a compact "from this brief" tasks list. *Files:* `briefs/[id].vue:790-810`, a small summary endpoint, project detail page. *Risk:* low (additive UI).

### Quick wins to pick off first
- **G2** project PM = brief assignee (~1 line). 
- **G10** surface conversion/quote failures (small, prevents silent broken approvals).
- **G9** task-count on the linked-project card (small read).

### Suggested order
**P0 → P1 → P3 (assignee notifications) → P2 → P5 → P4.** P0 unblocks P1; P1+P3 deliver the headline "assigned, and people are told"; P2 makes the job actually reflect the brief; P5/P4 close the UX/status loop.

## Open questions for product
1. Is **manual task assignment** intentional (G1), or should conversion auto-assign from template roles? (Determines whether P1 is a fix or a new capability.)
2. Should `field_mapping` (G3) be revived, or removed as dead config? (If revived, what target fields are in scope?)
3. Should brief **deadline/budget** override template defaults (G4), or are template defaults authoritative?
4. Should brief status **auto-complete** when its project finishes (G6), or stay manual?
