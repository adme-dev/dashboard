# Account-manager social workflow R&D

The October 2026 probe starts with DriveAgent product, its Social Media Content brief and the existing approved 24-second video. DriveAgent product and DriveAgent News remain separate clients.

## Brief-entry repairs

Categories return counts; available templates are loaded from the templates endpoint and filtered by category ID. Client choices from the clients endpoint are passed through the renderer to client fields. Submission promotes the selected client field to the brief's top-level client ID, preserves `content_brief_title`, and displays the returned `referenceNumber`.

Regression coverage: `test/app/briefIntake.test.ts`, plus the existing brief conversion, notification and utility checks. The client fixture matches the actual array response from `/api/agency/clients`.

The first live probe exposed a second loading regression: `immediate: false` prevented the template's first field request from starting on selection under Nuxt 4. The fetch now starts normally; the regression harness also models the deferred-fetch behavior so selecting a card alone cannot falsely pass as a working form. See the [Nuxt upgrade guide](https://nuxt.com/docs/4.x/getting-started/upgrade).

## Customer approval is a distinct handoff

Where the brief requires customer sign-off, the job must have an internal review followed by a client-portal decision on the same creative/copy version. Revisions reopen review. Keep delivery pending until the required reviewer has approved the current payload. Do not approve on a customer's behalf during a simulation.

The current general portal approval endpoints store `client_approvals` against projects/tasks and record the customer's response. They do not automatically reconcile those decisions into a general social post. The social approval gate currently checks client approval for `metadata.source === 'mcp_news'`; that condition does not cover imported product videos. The bridge and version binding remain design work, not functionality claimed by this brief-entry repair.

Neither DriveAgent client had an active portal user/approver at inspection. No portal invitation or client email is sent by this repair. The R&D deliverable remains draft, with client approval and the product Page connection explicitly pending.

## Remaining automation gaps

- Social Media Content has no configured project-template mapping.
- The project-template editor has no task-authoring UI in the inspected flow.
- The brief conversion dialog does not select a project template.
- Task-to-post handoff and provider-receipt reconciliation need stable links and duplicate protection.
- AI scheduling summaries must reflect saved status: the draft-creation endpoint always creates a draft even if a requested date is supplied.

Run the existing interfaces to expose these boundaries; do not insert workflow records directly into the database to make the demonstration appear automatic.

## Verified live probe — 3 October 2026

- Brief: SOC-26-0007, `4c8deb23-32bd-459e-a990-d45af8a4556c`, DriveAgent product client `f7c142a6-a63f-4f75-90aa-700db68c1c76`. Internal intake approved; the stored customer sign-off policy remains `client`.
- Project: `3abc7881-3176-4c5c-8049-58314e36fe9b`, active, planned end 10 October. Conversion created zero automatic tasks.
- Six tasks were created manually through Brief Add Task. All preserve actual brief/project links and remain To Do. Each has one real board Update with stage criteria and links to the existing creative and Planner draft. Quick-create has no description field, so those notes are not task descriptions.
- Existing post `ef0bd231-020f-4e81-be02-87c1f59c7903` remains Draft with no scheduled or published time. Planner shows one product draft and zero approval/scheduled/published posts.
- No new campaign, social post, generation job or paid spend. No portal invitation or customer approval.

The app repair released as `f0e50b242463ec7f0c39f7d7ae88b9301492c53a`, Cloudflare deployment `65db04bb-c5b1-4cf4-a3b3-0e127c645fb7`. The final 824 relevant tests passed across 128 files. A local disk-space failure was resolved by pruning unused package-cache files; the guarded retry succeeded. QR list → detail → list was checked before upload and after release.

Two further live errors explained the remaining intake failures. Shared Nitro routing named the template segment `id`; the reader now accepts both `slug` and `id`, covered by `test/server/api/briefTemplateEndpoint.test.ts`. Brief creation then failed inside `generate_brief_reference`: both joined tables have `slug`. Migration 446 qualifies `bc.slug`, and the base schema is corrected. The migration was applied from `ea76d5b81293bfe95684ea6216c5f9f911351555`; read-only EXPLAIN reproduced the old ambiguity and verified the qualified query, then actual UI submission succeeded.

## Discovery ledger and follow-up

The canonical [discovery ledger](account-manager-discovery-ledger.md) lives beside this runbook. A reference copy and exact live records are in the shared DriveAgent marketing folder: `marketing/xeroflow-account-manager-rd-20261003/DISCOVERY-LEDGER.md` and `live-probe.json`. It separates delivered/verified repairs from missing templates, mappings, integration gaps and client setup blockers. Update evidence, owner role, priority, status and acceptance checks during each walkthrough.

Further observed issues remain open: checkbox options share IDs and label activation can choose the wrong option; immediate post-mutation detail reads can show stale review/task counts; the legacy task list uses row-index links; the legacy task-detail page contains sample audit/comments; board Details does not normalize saved fields. This probe used precise checkbox buttons and genuine board Updates, then verified persisted IDs and states. Those manual workarounds do not close the ledger issues.

Among ten inspected active marketing/social/advertising intakes, only Google Performance Max had a project mapping and automatic conversion enabled. Prefer completing workflow mappings before duplicating existing intake templates. The dedicated six-stage organic video workflow, versioned customer approval bridge and task-to-post/delivery reconciliation remain the next design slices.
