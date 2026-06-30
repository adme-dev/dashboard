# PRD: Social Inbox Enterprise Native Workflow

**Date:** 2026-06-30
**Status:** Active build plan
**Scope:** `/agency/social/inbox`
**Decision:** Social Inbox escalations use native XeroFlow tasks, boards, client requests, client portal approvals, and AI pending actions. Monday task creation is out of scope except for legacy import/migration history.

## Objective

Make Social Inbox a first-class intake and customer-care layer inside XeroFlow. Comments, reviews, mentions, and DMs should move into the same operating system as tasks, boards, client requests, client approvals, CRM timelines, notifications, and paid-media health.

Success means a social conversation can be triaged, assigned, escalated, linked to work, approved by a client when needed, and reported on without leaving XeroFlow.

## Existing Platform Primitives

- Native tasks and boards: `/agency/tasks`, `/agency/boards`, task activities, comments, approvals, labels, dependencies, and time tracking.
- Native client portal requests: `client_requests` can be assigned, linked to projects/tasks, messaged, and surfaced to clients.
- Native AI action spine: AI write actions are proposed, confirmed, executed, and audited through `ai_pending_actions` and executors.
- Native social inbox: conversations, messages, internal notes, assignment, SLA, saved replies, response queue, automation rules, and account sync health.
- Native paid-media layer: spend, budget health, campaign identity, pacing review, and social publishing/reporting.

## Non-Goals

- Do not create Monday tasks from social inbox.
- Do not introduce a parallel helpdesk database if native tasks/client requests can represent the work.
- Do not enable autonomous high-risk replies. Sensitive replies require staff or client approval.
- Do not bypass the existing task, board, client-request, or AI action contracts.

## Priority Build Order

### 1. Conversation To Native Work

Allow staff to link a social conversation to a native task and/or client request.

Acceptance:
- A conversation can store a linked native task id.
- A conversation can store a linked native client request id.
- Links are client-scoped: task/request must belong to the same client as the conversation.
- Links are visible in the inbox action panel and detail response.
- Link changes are test-covered and auditable enough for the next workflow slices.

### 2. Social Case Timeline

Unify social messages, internal notes, linked task activity, and linked client-request updates into a single case timeline.

Acceptance:
- Staff can see the social thread plus native work history in one place.
- Internal notes remain staff-only.
- Client-facing updates are separated from staff-only notes.
- Linked task/request status is visible from the conversation.

### 3. Client Approval For Sensitive Replies

Route sensitive reply drafts to the client portal approval flow.

Acceptance:
- Staff can send a draft reply to client approval.
- Client can approve, reject, or edit the proposed reply.
- Approved replies return to the social response queue for staff send or guarded dispatch.
- Approval history is visible to staff.

### 4. AI Triage With Native Actions

Extend AI triage to recommend native XeroFlow actions.

Acceptance:
- AI can propose creating/linking a native task from a conversation.
- AI can propose escalating to account management, creative, media buying, or leadership.
- AI can propose client approval for sensitive replies.
- AI proposals use the existing propose-confirm-action flow.

### 5. Paid Media Feedback Loop

Connect ad comments/reviews to campaign and spend health.

Acceptance:
- Conversations can be linked to social campaigns or spend campaign identity where available.
- Negative sentiment on active campaigns creates warnings in spend/campaign health.
- Campaign-level social feedback appears in paid-media review surfaces.

### 6. Enterprise Reporting

Report on inbox operations and downstream native work.

Acceptance:
- First response time, SLA breaches, negative review backlog, and open case count are reportable.
- Conversation-to-task/client-request conversion rate is reportable.
- AI draft acceptance and client approval turnaround are reportable.
- Reports can be filtered by client, platform, channel, assignee, and period.

## Task List

### Phase 1: Native Link Foundation

- [x] Task 1.1: Add explicit native link fields to `social_conversations`.
  - Acceptance: migration adds task and client-request link columns with indexes.
  - Verify: migration file is additive and idempotent; focused tests cover SQL contract.
  - Files: `server/database/migrations/*`, `server/utils/socialInbox/*`, tests.

- [x] Task 1.2: Add backend link validation and update contract.
  - Acceptance: task/request links are rejected when they do not belong to the conversation client.
  - Verify: unit tests for valid task, invalid task, valid request, invalid request, unlink.
  - Files: `server/utils/socialInbox/nativeLinks.ts`, API route, tests.

- [x] Task 1.3: Surface links in conversation detail/list types.
  - Acceptance: inbox detail payload includes linked task/request summary when present.
  - Verify: detail query tests include link fields.
  - Files: `server/utils/socialInbox/conversationDetail.ts`, `app/types/index.ts`, tests.

- [x] Task 1.4: Add inbox UI controls for native links.
  - Acceptance: action panel shows linked task/request and allows entering/linking/unlinking ids.
  - Verify: build and focused lint/tests.
  - Files: `ActionPanel.vue`, inbox page.

### Phase 2: Native Case Timeline

- [x] Task 2.1: Add server timeline aggregator for social + task/request activity.
- [x] Task 2.2: Add case timeline UI section in the thread/action panel.
- [x] Task 2.3: Add activity entries when native links change.

### Phase 3: Client Approval

- [x] Task 3.1: Add staff action to route reply draft to client approval.
- [x] Task 3.2: Connect client approval result to social response queue.
- [x] Task 3.3: Add portal-safe conversation context.

### Phase 4: AI Triage

- [x] Task 4.1: Add AI read context for selected social conversation.
  - Acceptance: context includes conversation, recent messages, and same-client task candidates.
  - Verify: parser/prompt tests and production build.
  - Files: `server/utils/socialInbox/aiContext.ts`, `server/utils/socialInbox/aiTriage.ts`, API routes.

- [x] Task 4.2: Add propose-link-task/propose-create-social-case action.
  - Acceptance: AI actions are staged through `ai_pending_actions`, confirmed by staff, executed through registered native executors, and audited.
  - Verify: proposal validation tests cover same-client task scope and task creation prerequisites.
  - Files: `server/utils/socialInbox/aiActions.ts`, `server/utils/ai/executors/socialInboxActions.ts`, API routes.

- [x] Task 4.3: Add triage recommendation UI.
  - Acceptance: staff can run triage, apply suggested priority/tags, stage a link/case action, and confirm the staged native action.
  - Verify: focused lint, social test suite, and production build.
  - Files: `app/components/social-inbox/AiTriagePanel.vue`, `ActionPanel.vue`, inbox page.

### Phase 5: Paid Media Feedback

- [x] Task 5.1: Add campaign identity mapping on eligible ad-comment conversations.
  - Acceptance: conversations can store planner campaign links and paid-media platform/account/campaign identity when provider payloads or enrichment jobs supply it.
  - Verify: migration, normalization, and inbox store tests cover the additive contract.
  - Note: provider-side enrichment still depends on Meta/Google payloads exposing campaign identity for the comment/review.

- [x] Task 5.2: Add negative sentiment warnings to campaign health.
  - Acceptance: linked negative feedback adds campaign-health reasons and downgrades otherwise scalable campaigns to review/hold.
  - Verify: campaign health tests cover negative feedback on mature and low-data campaigns.

- [x] Task 5.3: Show campaign feedback in spend/pacing review.
  - Acceptance: pacing review aggregates linked inbox feedback by client/platform/campaign and emits `negative_social_feedback` warnings; platform campaign tables show a feedback badge.
  - Verify: pacing review, endpoint, and spend-table utility tests cover the new warning.

### Phase 6: Reporting

- [x] Task 6.1: Add conversion and SLA analytics.
- [ ] Task 6.2: Add client/platform/channel/assignee filters.
- [ ] Task 6.3: Add exportable operational report.

## Verification Commands

- `pnpm exec vitest run test/social test/server/utils/socialInboxNativeLinks.test.ts`
- `pnpm exec eslint app/components/social-inbox app/pages/agency/social/inbox server/utils/socialInbox server/api/agency/social/inbox`
- `pnpm run build`
- `pnpm exec vitest run test/server/utils/socialInboxAiTriage.test.ts test/server/utils/socialInboxAiActions.test.ts`
- `pnpm exec vitest run test/server/utils/socialInbox*.test.ts test/social/*.test.ts`
