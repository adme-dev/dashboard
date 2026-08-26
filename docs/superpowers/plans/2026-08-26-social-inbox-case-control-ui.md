# Social Inbox Case Control UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Social Inbox's flat right-hand action form with a responsive Case Control workspace that makes state, SLA, risk, ownership, recommended action, context, activity, follow-up, notes, and related work intuitive while reusing the current workflow model.

**Architecture:** Keep the inbox page responsible for selected-conversation state and mutations, but replace `ActionPanel.vue` with a small Case Control shell composed of focused header, handle, context, activity, follow-up, and related-work components. Add pure display/view-model utilities and one tenant-safe related-work search endpoint; use existing conversation PATCH, native-link, note, AI-triage, timeline, source-image, and composer APIs. Render a 360-pixel rail at `2xl` and a Nuxt UI slideover below that breakpoint.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Nuxt UI v4, VueUse, `@internationalized/date`, Nitro, Neon Postgres, Vitest, happy-dom.

**Spec:** `docs/superpowers/specs/2026-08-26-social-inbox-case-control-design.md`

## Global Constraints

- This plan implements only **Phase 1: Case Control UI** from the approved specification; explicit workflow-state columns, resolution reasons, moderation mutations, queue routing, SLA-clock migrations, and portfolio analytics require their own subsequent plans.
- Reuse current `status`, `assigned_to`, `priority`, `tags`, `snoozed_until`, linked-work, AI-triage, timeline, and source-post contracts.
- Use only Nuxt UI v4 controls. Do not introduce raw form controls, native `confirm()`, `alert()`, or `prompt()`.
- Wrap every editable field in `UFormField`; all controls in constrained surfaces use `w-full`.
- Use `UPopover` plus `UCalendar` for custom follow-up dates and a `USelectMenu` for time. Do not use a browser-native date or time input.
- Use semantic colour classes and verify dark mode.
- A failed source image must render a deliberate fallback, never a broken-image icon.
- Account, client, page, campaign, and author copy must not combine unrelated entities into an ambiguous company name.
- AI output is labelled advisory, correctable, and never automatically published.
- Related-work results and mutations remain scoped to the selected conversation's client on the server.
- Follow test-driven development: failing test, confirmed failure, minimal implementation, passing test, focused commit.
- Do not add database migrations in this plan.

## Phase Boundary

This plan delivers working software with the following state mapping:

| Case Control label | Existing fields |
|---|---|
| Resolved | `status === 'closed'` |
| Follow-up scheduled | `status === 'snoozed'` and future `snoozed_until` |
| Needs owner | no `assigned_to` |
| Needs action | latest message direction is inbound |
| In progress | assigned and no newer inbound action |

`Resolve` closes the conversation using the existing status contract. Structured resolution reasons arrive in the Phase 2 lifecycle plan, so this release labels the control `Close conversation` in its confirmation copy and does not pretend to capture a reportable outcome.

Cross-conversation author matching, repeated-complaint themes, and related-comment discovery require additional identity and analytics contracts and are deferred to Phase 3. Phase 1 Context displays the current thread, source post, linked campaigns, verified platform capability, and selected account health without claiming broader history.

## File Map

### Create

- `app/utils/socialInboxCaseControl.ts` — pure state, SLA, recommendation, identity-role, and account/client presentation helpers.
- `server/utils/socialInbox/relatedWork.ts` — client-scoped task and client-request lookup.
- `server/api/agency/social/inbox/conversations/[id]/related-work.get.ts` — authenticated related-work search route.
- `app/components/social-inbox/CaseControl.vue` — thin tabbed Case Control shell.
- `app/components/social-inbox/CaseControlHeader.vue` — persistent state, SLA, risk, owner, and recommendation header.
- `app/components/social-inbox/CaseControlHandle.vue` — assignment, priority, tags, notes, linked work, and actions.
- `app/components/social-inbox/CaseControlContext.vue` — account/client/source-post/campaign/platform context.
- `app/components/social-inbox/CaseControlActivity.vue` — activity-tab wrapper around the existing case timeline.
- `app/components/social-inbox/CaseControlFooter.vue` — persistent follow-up and close actions shared by every tab.
- `app/components/social-inbox/RelatedWorkSelector.vue` — remote-search task and request selectors.
- `app/components/social-inbox/CaseTaskCreateModal.vue` — prefilled, client-scoped task creation followed by native linking.
- `app/components/social-inbox/FollowUpPopover.vue` — preset and custom follow-up scheduling.
- `test/utils/socialInboxCaseControl.test.ts` — pure Case Control state and copy tests.
- `test/server/utils/socialInboxRelatedWork.test.ts` — related-work tenant and search tests.
- `test/app/socialInboxCaseControl.test.ts` — component interaction and accessibility tests.
- `test/app/socialInboxCaseControlLayout.test.ts` — page, thread, sidebar, rail, and slideover contract tests.
- `test/app/socialInboxMarketingCaseControl.test.ts` — public feature-copy contract.

### Modify

- `app/types/index.ts` — add missing source-post, follow-up, and related-work types.
- `app/utils/socialInboxDisplay.ts` — expose structured account/client context and role-aware unavailable identity labels.
- `test/utils/socialInboxDisplay.test.ts` — lock the clarified identity and entity copy.
- `app/components/social-inbox/Composer.vue` — expose a public focus method for recommended actions.
- `app/components/social-inbox/Thread.vue` — remove duplicated source-post card, add compact Manage action, and separate connected account from client.
- `app/components/social-inbox/Sidebar.vue` — use Nuxt UI for conversation rows and separate page/client labels.
- `app/pages/agency/social/inbox/index.vue` — wire Case Control mutations and responsive rail/slideover.
- `app/pages/features/index.vue` — update the Engagement Inbox summary.
- `app/pages/features/[slug].vue` — replace future-tense inbox copy with the shipped Case Control experience.
- `app/components/MarketingNav.vue` — update the existing Engagement Inbox subtitle without changing navigation structure.

### Delete after replacement

- `app/components/social-inbox/ActionPanel.vue` — its responsibilities move to the focused Case Control components above.

---

### Task 1: Case Control View Model and Unambiguous Display Copy

**Files:**

- Create: `app/utils/socialInboxCaseControl.ts`
- Create: `test/utils/socialInboxCaseControl.test.ts`
- Modify: `app/types/index.ts:2206`
- Modify: `app/utils/socialInboxDisplay.ts:1`
- Modify: `test/utils/socialInboxDisplay.test.ts:1`

**Interfaces:**

- Produces: `SocialInboxCaseState`, `SocialInboxRelatedWorkItem`, and the missing source-post fields on `SocialConversation`.
- Produces: `getSocialInboxCaseState(conversation, now?)`, `getSocialInboxSlaDisplay(conversation, now?)`, and `getSocialInboxRecommendation(conversation, triage)`.
- Produces: `getSocialInboxAccountContext(input)` returning separate `accountLabel`, `clientLabel`, and `sameEntity` values.
- Consumed by: Tasks 3–6.

- [ ] **Step 1: Write failing tests for derived state, SLA, recommendations, and display copy**

```ts
import { describe, expect, it } from 'vitest'
import {
  getSocialInboxCaseState,
  getSocialInboxRecommendation,
  getSocialInboxSlaDisplay
} from '../../app/utils/socialInboxCaseControl'

const conversation = {
  id: 'conversation-1',
  status: 'open',
  assigned_to: null,
  last_message_direction: 'in',
  platform: 'facebook',
  channel_type: 'comment',
  sla_due_at: '2026-08-26T06:30:00.000Z',
  sla_breached: false,
  first_response_at: null
} as any

describe('Social Inbox Case Control view model', () => {
  it('prioritises resolved, scheduled follow-up, ownership, and inbound action', () => {
    expect(getSocialInboxCaseState({ ...conversation, status: 'closed' })).toBe('resolved')
    expect(getSocialInboxCaseState({ ...conversation, status: 'snoozed', snoozed_until: '2026-08-27T00:00:00.000Z' }, Date.parse('2026-08-26T00:00:00.000Z'))).toBe('follow_up_scheduled')
    expect(getSocialInboxCaseState(conversation)).toBe('needs_owner')
    expect(getSocialInboxCaseState({ ...conversation, assigned_to: 'user-1' })).toBe('needs_action')
    expect(getSocialInboxCaseState({ ...conversation, assigned_to: 'user-1', last_message_direction: 'out' })).toBe('in_progress')
  })

  it('formats an active SLA as a countdown and a breach as urgent', () => {
    expect(getSocialInboxSlaDisplay(conversation, Date.parse('2026-08-26T06:00:00.000Z'))).toMatchObject({ label: '30m left', color: 'warning' })
    expect(getSocialInboxSlaDisplay({ ...conversation, sla_breached: true })).toMatchObject({ label: 'SLA breached', color: 'error' })
  })

  it('recommends human review and private handling for a high-risk complaint', () => {
    expect(getSocialInboxRecommendation(conversation, {
      summary: 'Customer alleges a serious service failure.',
      sentiment: 'negative',
      riskLevel: 'high',
      suggestedPriority: 'urgent',
      suggestedTags: ['complaint'],
      approvalRecommended: true,
      actions: []
    })).toMatchObject({ title: 'Acknowledge, then move details private', requiresHuman: true })
  })
})
```

Extend `test/utils/socialInboxDisplay.test.ts` to expect `Facebook reviewer — name unavailable`, `Facebook commenter — name unavailable`, and separate `GWS Peninsula Honda` / `Garry and Warren Smith` fields.

```ts
expect(getSocialInboxIdentityDisplay({ platform: 'facebook', channelType: 'review', name: null }).label)
  .toBe('Facebook reviewer — name unavailable')
expect(getSocialInboxIdentityDisplay({ platform: 'facebook', channelType: 'comment', name: null }).label)
  .toBe('Facebook commenter — name unavailable')
expect(getSocialInboxAccountContext({
  accountName: 'GWS Peninsula Honda',
  clientName: 'Garry and Warren Smith'
})).toEqual({
  accountLabel: 'GWS Peninsula Honda',
  clientLabel: 'Garry and Warren Smith',
  sameEntity: false
})
```

- [ ] **Step 2: Run the focused tests and confirm missing exports fail**

Run: `pnpm vitest run test/utils/socialInboxCaseControl.test.ts test/utils/socialInboxDisplay.test.ts`

Expected: FAIL because the Case Control module and structured display function do not exist and the old identity copy is still returned.

- [ ] **Step 3: Add the shared types and pure helpers**

Add these contracts to `app/types/index.ts`:

```ts
export type SocialInboxCaseState = 'needs_owner' | 'needs_action' | 'in_progress' | 'follow_up_scheduled' | 'resolved'

export interface SocialInboxRelatedWorkItem {
  kind: 'task' | 'client_request'
  id: string
  title: string
  status: string | null
  projectName: string | null
  requestType: string | null
}
```

Add `snoozed_until?: string | null`, `source_post_id`, `source_post_url`, `source_post_title`, `source_post_content`, `source_post_media`, `source_post_author_name`, `source_post_author_avatar_url`, `source_post_published_at`, and `linked_social_post_id` as optional fields on `SocialConversation` using the database column names.

Implement deterministic helpers in `app/utils/socialInboxCaseControl.ts`:

```ts
export function getSocialInboxCaseState(c: SocialConversation, now = Date.now()): SocialInboxCaseState {
  if (c.status === 'closed') return 'resolved'
  if (c.status === 'snoozed' && c.snoozed_until && Date.parse(c.snoozed_until) > now) return 'follow_up_scheduled'
  if (!c.assigned_to) return 'needs_owner'
  if (c.last_message_direction === 'in') return 'needs_action'
  return 'in_progress'
}
```

Use exact labels `Needs owner`, `Needs action`, `In progress`, `Follow-up scheduled`, and `Resolved`. SLA output returns `null`, `Responded`, `SLA breached`, or a rounded `Xm left` / `Xh left` countdown. Recommendations are deterministic: high risk first, approval recommended second, negative sentiment third, actionable inbound fourth, and `Monitor for a new response` otherwise.

Add `getSocialInboxAccountContext()` without removing the existing display function immediately:

```ts
export function getSocialInboxAccountContext(input: SocialInboxAccountContextInput) {
  const accountLabel = input.accountName?.trim() || input.platformAccountId?.trim() || null
  const clientLabel = input.clientName?.trim() || null
  return {
    accountLabel,
    clientLabel,
    sameEntity: Boolean(accountLabel && clientLabel && accountLabel.localeCompare(clientLabel, undefined, { sensitivity: 'accent' }) === 0)
  }
}
```

Update Meta fallbacks to include platform and interaction role with an em dash; never use a slash.

- [ ] **Step 4: Run the focused tests and confirm they pass**

Run: `pnpm vitest run test/utils/socialInboxCaseControl.test.ts test/utils/socialInboxDisplay.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the view-model contract**

```bash
git add app/types/index.ts app/utils/socialInboxCaseControl.ts app/utils/socialInboxDisplay.ts test/utils/socialInboxCaseControl.test.ts test/utils/socialInboxDisplay.test.ts
git commit -m "feat(social-inbox): add case control view model"
```

---

### Task 2: Tenant-Safe Related Work Search

**Files:**

- Create: `server/utils/socialInbox/relatedWork.ts`
- Create: `server/api/agency/social/inbox/conversations/[id]/related-work.get.ts`
- Create: `test/server/utils/socialInboxRelatedWork.test.ts`

**Interfaces:**

- Consumes: `SocialInboxRelatedWorkItem` shape from Task 1.
- Produces: `searchSocialInboxRelatedWork(db, conversationId, kind, query, limit)`.
- Produces: `GET /api/agency/social/inbox/conversations/:id/related-work?kind=task|client_request&q=<text>&limit=20` returning `{ items: SocialInboxRelatedWorkItem[] }`.
- Consumed by: Task 4.

- [ ] **Step 1: Write failing tests for conversation-client scoping and escaped search**

```ts
import { describe, expect, it, vi } from 'vitest'
import { searchSocialInboxRelatedWork } from '~~/server/utils/socialInbox/relatedWork'

describe('searchSocialInboxRelatedWork', () => {
  it('searches tasks through projects owned by the conversation client', async () => {
    const db = {
      queryOne: vi.fn().mockResolvedValue({ client_id: 'client-1' }),
      queryRows: vi.fn().mockResolvedValue([{ id: 'task-1', title: 'Recover customer', status: 'Open', project_name: 'Service', request_type: null }])
    }
    const items = await searchSocialInboxRelatedWork(db, 'conversation-1', 'task', '50% off', 20)
    expect(db.queryRows).toHaveBeenCalledWith(expect.stringMatching(/p\.client_id = \$1/), ['client-1', '%50\\% off%', 20])
    expect(items[0]).toMatchObject({ kind: 'task', id: 'task-1', projectName: 'Service' })
  })

  it('rejects an unknown conversation before searching', async () => {
    const db = { queryOne: vi.fn().mockResolvedValue(null), queryRows: vi.fn() }
    await expect(searchSocialInboxRelatedWork(db, 'missing', 'client_request', '', 20)).rejects.toMatchObject({ statusCode: 404 })
    expect(db.queryRows).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the test and confirm the module is missing**

Run: `pnpm vitest run test/server/utils/socialInboxRelatedWork.test.ts`

Expected: FAIL because `server/utils/socialInbox/relatedWork.ts` does not exist.

- [ ] **Step 3: Implement the search utility and authenticated route**

The utility must:

1. Load `client_id` from `social_conversations` by conversation ID.
2. Clamp the limit to 1–50.
3. Escape `%`, `_`, and `\` before building an `ILIKE` pattern.
4. For tasks, join `tasks` to `projects` and require `projects.client_id = conversation.client_id`.
5. For client requests, require `client_requests.client_id = conversation.client_id`.
6. Return only IDs, titles, statuses, project names, and request types.

Use this database boundary and mapping:

```ts
export interface SocialInboxRelatedWorkDb {
  queryOne<T>(sql: string, params?: unknown[]): Promise<T | null>
  queryRows<T>(sql: string, params?: unknown[]): Promise<T[]>
}

export async function searchSocialInboxRelatedWork(
  db: SocialInboxRelatedWorkDb,
  conversationId: string,
  kind: 'task' | 'client_request',
  query: string,
  requestedLimit = 20
): Promise<SocialInboxRelatedWorkItem[]> {
  const conversation = await db.queryOne<{ client_id: string }>(
    'SELECT client_id FROM social_conversations WHERE id = $1',
    [conversationId]
  )
  if (!conversation) throw createError({ statusCode: 404, statusMessage: 'Conversation not found' })

  const escaped = query.trim().replace(/[\\%_]/g, '\\$&')
  const pattern = `%${escaped}%`
  const limit = Math.min(Math.max(requestedLimit, 1), 50)
  const rows = kind === 'task'
    ? await db.queryRows<any>(`
        SELECT t.id, t.title, ts.name AS status, p.name AS project_name, NULL::text AS request_type
        FROM tasks t
        JOIN projects p ON p.id = t.project_id
        LEFT JOIN task_statuses ts ON ts.id = t.status_id
        WHERE p.client_id = $1 AND t.title ILIKE $2 ESCAPE '\\'
        ORDER BY t.updated_at DESC LIMIT $3`, [conversation.client_id, pattern, limit])
    : await db.queryRows<any>(`
        SELECT cr.id, cr.title, cr.status, p.name AS project_name, cr.request_type
        FROM client_requests cr
        LEFT JOIN projects p ON p.id = cr.project_id AND p.client_id = cr.client_id
        WHERE cr.client_id = $1 AND cr.title ILIKE $2 ESCAPE '\\'
        ORDER BY cr.updated_at DESC LIMIT $3`, [conversation.client_id, pattern, limit])

  return rows.map(row => ({
    kind,
    id: String(row.id),
    title: String(row.title),
    status: row.status || null,
    projectName: row.project_name || null,
    requestType: row.request_type || null
  }))
}
```

The route validates `kind`, calls `requireAuth(event)`, adapts `queryOne`/`queryRows`, and returns a 400 for invalid kinds:

```ts
const kind = String(getQuery(event).kind || '')
if (kind !== 'task' && kind !== 'client_request') {
  throw createError({ statusCode: 400, statusMessage: 'kind must be task or client_request' })
}
```

- [ ] **Step 4: Run related-work and native-link security tests**

Run: `pnpm vitest run test/server/utils/socialInboxRelatedWork.test.ts test/server/utils/socialInboxNativeLinks.test.ts`

Expected: PASS, including rejection of cross-client link IDs.

- [ ] **Step 5: Commit the read contract**

```bash
git add server/utils/socialInbox/relatedWork.ts 'server/api/agency/social/inbox/conversations/[id]/related-work.get.ts' test/server/utils/socialInboxRelatedWork.test.ts
git commit -m "feat(social-inbox): add scoped related work search"
```

---

### Task 3: Persistent Case Header and Recommended Action

**Files:**

- Create: `app/components/social-inbox/CaseControlHeader.vue`
- Create: `test/app/socialInboxCaseControl.test.ts`
- Modify: `app/components/social-inbox/Composer.vue:1`

**Interfaces:**

- Consumes: Case state, SLA, and recommendation helpers from Task 1.
- Produces: `CaseControlHeader` emits `takeOwnership`, `focusReply`, `requestApproval`, and `collapse` when the desktop rail is collapsible.
- Produces: `Composer` public method `focusReply(): void` through `defineExpose`.
- Consumed by: Task 6.

- [ ] **Step 1: Write a failing component test for information hierarchy and actions**

Mount `CaseControlHeader` with happy-dom and Nuxt UI stubs. Assert that the first rendered region contains `NEEDS OWNER`, `30m left`, `High risk`, and `Take ownership`, and that clicking its action emits `takeOwnership`.

```ts
const takeOwnership = vi.fn()
const host = document.createElement('div')
const app = createApp({
  render: () => h(CaseControlHeader, {
    conversation,
    triage,
    currentUserId: 'user-1',
    onTakeOwnership: takeOwnership
  })
})
app.component('UButton', {
  inheritAttrs: false,
  template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot />{{ $attrs.label }}</button>'
})
app.component('UBadge', { template: '<span><slot /></span>' })
app.component('UIcon', { template: '<i />' })
app.mount(host)

expect(host.textContent).toContain('NEEDS OWNER')
expect(host.textContent).toContain('30m left')
expect(host.textContent).toContain('Acknowledge, then move details private')
host.querySelector('[data-testid="take-ownership"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
expect(takeOwnership).toHaveBeenCalledOnce()
```

Add a Composer assertion that `focusReply()` focuses the underlying textarea:

```ts
const composer = composerRef.value as { focusReply: () => void }
composer.focusReply()
await nextTick()
expect(document.activeElement?.tagName).toBe('TEXTAREA')
```

Keep one reusable helper in the component test file for the later tasks:

```ts
function mount(component: unknown, props: Record<string, unknown>) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(component as never, props) })
  app.component('UFormField', { props: ['label'], template: '<label><span>{{ label }}</span><slot /><slot name="help" /></label>' })
  app.component('UButton', { inheritAttrs: false, template: '<button v-bind="$attrs" @click="$emit(\'click\')"><slot />{{ $attrs.label }}</button>' })
  app.component('USelectMenu', { inheritAttrs: false, template: '<select v-bind="$attrs" />' })
  app.component('UInputTags', {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    template: '<input v-bind="$attrs" :value="modelValue?.join(\', \')" @input="$emit(\'update:modelValue\', $event.target.value.split(\',\').map(v => v.trim()).filter(Boolean))">'
  })
  app.component('UTextarea', { inheritAttrs: false, template: '<textarea v-bind="$attrs" />' })
  app.component('UBadge', { template: '<span><slot /></span>' })
  app.component('UIcon', { template: '<i v-bind="$attrs" />' })
  app.mount(host)
  return { app, host }
}
```

- [ ] **Step 2: Run the component test and confirm the new component fails to import**

Run: `pnpm vitest run test/app/socialInboxCaseControl.test.ts`

Expected: FAIL because `CaseControlHeader.vue` and the exposed composer method do not exist.

- [ ] **Step 3: Implement the header and composer focus contract**

`CaseControlHeader.vue` receives:

```ts
const props = defineProps<{
  conversation: SocialConversation
  triage?: SocialInboxAiTriageResult | null
  currentUserId?: string | null
  collapsible?: boolean
}>()
```

Render a sticky semantic header with a compact uppercase state label, SLA badge, risk indicator, platform/channel line, ownership action, advisory recommendation, and two secondary buttons: `Focus reply` and `Request approval`. The approval action only focuses the composer and announces that the draft can be routed through the existing Client approval button; it does not send an empty request.

In `Composer.vue`, expose:

```ts
function focusReply() {
  nextTick(() => replyTextarea()?.focus())
}

defineExpose({ focusReply })
```

- [ ] **Step 4: Run the component tests**

Run: `pnpm vitest run test/app/socialInboxCaseControl.test.ts`

Expected: PASS for hierarchy, action emits, AI advisory label, and focus behavior.

- [ ] **Step 5: Commit the header slice**

```bash
git add app/components/social-inbox/CaseControlHeader.vue app/components/social-inbox/Composer.vue test/app/socialInboxCaseControl.test.ts
git commit -m "feat(social-inbox): add case control header"
```

---

### Task 4: Handle Tab, Follow-Up, Notes, and Searchable Related Work

**Files:**

- Create: `app/components/social-inbox/FollowUpPopover.vue`
- Create: `app/components/social-inbox/RelatedWorkSelector.vue`
- Create: `app/components/social-inbox/CaseTaskCreateModal.vue`
- Create: `app/components/social-inbox/CaseControlHandle.vue`
- Create: `app/components/social-inbox/CaseControlFooter.vue`
- Modify: `test/app/socialInboxCaseControl.test.ts`

**Interfaces:**

- Consumes: Related-work endpoint from Task 2.
- Produces: `FollowUpPopover` emits an ISO timestamp or `null`.
- Produces: `RelatedWorkSelector` emits `{ linked_task_id?: string | null, linked_client_request_id?: string | null }`.
- Produces: `CaseTaskCreateModal` emits the created `{ id, title }`; the parent immediately links it through the existing native-link mutation.
- Produces: `CaseControlHandle` emits `assigned`, `triage`, `nativeLinks`, `note`, and all existing AI events.
- Produces: `CaseControlFooter` emits `followUp` and `close` and stays visible for every active tab.
- Consumed by: Task 6.

- [ ] **Step 1: Extend the component test with failing interaction cases**

Cover these exact behaviors:

- every assignment, priority, tags, related-work, and note control is inside a labelled `UFormField`;
- tags emit after a 400 ms debounce without a separate `Save tags` button;
- the assignee sentinel is `__unassigned__`, never an empty string;
- task and request search use `USelectMenu`, `v-model:search-term`, `ignore-filter`, and the conversation-scoped endpoint;
- `Create task` opens a client-scoped form prefilled from the conversation and emits the new task for native linking;
- follow-up presets emit a future ISO timestamp;
- custom follow-up uses `UCalendar` and a non-empty time sentinel;
- the note button remains disabled for whitespace;
- closing emits `close` and does not claim to record a resolution reason.

Use fake timers for the tags and remote-search debounce assertions.

```ts
it('autosaves normalized tags after the debounce without a save button', async () => {
  vi.useFakeTimers()
  const triage = vi.fn()
  const { app, host } = mount(CaseControlHandle, { conversation, onTriage: triage })
  const tags = host.querySelector('[data-testid="case-tags"]') as HTMLInputElement
  tags.value = 'complaint, urgent'
  tags.dispatchEvent(new Event('input', { bubbles: true }))
  await vi.advanceTimersByTimeAsync(399)
  expect(triage).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(triage).toHaveBeenCalledWith({ tags: ['complaint', 'urgent'] })
  expect(host.textContent).not.toContain('Save tags')
  app.unmount()
  vi.useRealTimers()
})

it('uses remote searchable selectors and never emits an empty identifier', async () => {
  const nativeLinks = vi.fn()
  const { app, host } = mount(RelatedWorkSelector, { conversationId: 'conversation-1', onNativeLinks: nativeLinks })
  expect(host.querySelectorAll('[data-related-work-select]')).toHaveLength(2)
  host.querySelector('[data-unlink-task]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  expect(nativeLinks).toHaveBeenCalledWith({ linked_task_id: null })
  expect(nativeLinks).not.toHaveBeenCalledWith({ linked_task_id: '' })
  app.unmount()
})

it('prefills a new task and links the created identifier', async () => {
  const created = vi.fn()
  const { app, host } = mount(CaseTaskCreateModal, {
    open: true,
    conversation,
    currentUserId: 'user-1',
    onCreated: created
  })
  expect((host.querySelector('[data-testid="case-task-title"]') as HTMLInputElement).value)
    .toContain('Facebook comment follow-up')
  host.querySelector('[data-testid="create-case-task"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
  await flushPromises()
  expect(created).toHaveBeenCalledWith(expect.objectContaining({ id: 'task-1' }))
  app.unmount()
})
```

- [ ] **Step 2: Run the component test and confirm the handle components are missing**

Run: `pnpm vitest run test/app/socialInboxCaseControl.test.ts`

Expected: FAIL on missing imports.

- [ ] **Step 3: Implement the follow-up picker**

Use `parseDate` and the canonical `UPopover` + `UCalendar` pattern from `TaskCreateDialog.vue`. Presets are `In 1 hour`, `Later today`, `Tomorrow 9:00 am`, and `Next workday 9:00 am`. For custom selection, use a `USelectMenu` populated with 15-minute values from `08:00` through `18:00`; default to `09:00` and emit a local-time ISO string.

The clear action lives in the popover footer:

```vue
<template #content>
  <UCalendar v-model="calendarDate" class="p-2" />
  <div class="space-y-2 border-t border-default p-2">
    <UFormField label="Time">
      <USelectMenu v-model="time" :items="timeOptions" value-key="value" class="w-full" />
    </UFormField>
    <div class="flex justify-between">
      <UButton label="Clear" color="neutral" variant="ghost" size="xs" @click="emit('select', null)" />
      <UButton label="Schedule" size="xs" :disabled="!calendarDate || !time" @click="scheduleCustom" />
    </div>
  </div>
</template>
```

- [ ] **Step 4: Implement remote related-work selectors**

Maintain independent task and request search terms. Use `watchDebounced(..., { debounce: 250, maxWait: 600 })`, `v-model:search-term`, and `:ignore-filter="true"`. Each request includes the current conversation ID and kind. Ignore stale results with a monotonically increasing request token.

```ts
const taskSearch = ref('')
const taskItems = ref<SocialInboxRelatedWorkItem[]>([])
let taskRequestToken = 0

watchDebounced(taskSearch, async (query) => {
  const token = ++taskRequestToken
  const result = await apiFetch<{ items: SocialInboxRelatedWorkItem[] }>(
    `/api/agency/social/inbox/conversations/${props.conversationId}/related-work`,
    { query: { kind: 'task', q: query.trim(), limit: 20 } }
  )
  if (token === taskRequestToken) taskItems.value = result.items
}, { debounce: 250, maxWait: 600, immediate: true })
```

Use sentinels `__no_task__` and `__no_request__`; selecting either emits `null`. Each item displays title plus status and project/request type. Existing linked records stay in the items list even when they are not in the newest search response.

Implement `CaseTaskCreateModal.vue` beside the selectors. Load departments and `/api/agency/projects?clientId=<conversation.client_id>`, require both a department and a project so the resulting task passes the existing client-scoped native-link validation, and prefill title/description from platform, channel, participant display, latest preview, and safe permalink. Use `UModal`, `UFormField`, `UInput`, `UTextarea`, and `USelectMenu` with a one-column `@container` form. POST to `/api/agency/tasks` with:

```ts
const task = await apiFetch<{ id: string, title: string }>('/api/agency/tasks', {
  method: 'POST',
  body: {
    departmentId: departmentId.value,
    projectId: projectId.value,
    title: title.value.trim(),
    description: description.value.trim(),
    priority: props.conversation.priority || 'medium',
    reporterId: props.currentUserId || undefined
  }
})
emit('created', task)
```

`RelatedWorkSelector` opens this modal from `Create task`; when `created` fires, emit `{ linked_task_id: task.id }` so the existing page mutation links and audits it.

- [ ] **Step 5: Implement the Handle tab**

Move assignment, priority, tags, AI triage, related work, and internal note from `ActionPanel.vue`. Add `Take ownership` through the header rather than duplicating it here. Tags auto-save through `watchDebounced`; reset local values when `conversation.id`, assignment, priority, or tags change.

The form hierarchy begins with these exact labelled controls and keeps each full width:

```vue
<div class="@container space-y-4 p-3">
  <UFormField label="Assigned to">
    <USelectMenu v-model="assignee" :items="memberOptions" value-key="value" class="w-full" />
  </UFormField>
  <UFormField label="Priority">
    <USelectMenu v-model="priority" :items="priorityOptions" value-key="value" class="w-full" />
  </UFormField>
  <UFormField label="Tags">
    <UInputTags v-model="tags" data-testid="case-tags" class="w-full" />
  </UFormField>
  <SocialInboxRelatedWorkSelector
    :conversation-id="conversation.id"
    :linked-task="conversation.linked_task"
    :linked-client-request="conversation.linked_client_request"
    @native-links="emit('nativeLinks', $event)"
  />
  <UFormField label="Internal note">
    <UTextarea v-model="note" :rows="3" class="w-full" placeholder="Staff-only — never sent" />
  </UFormField>
  <UButton label="Add note" :disabled="!note.trim()" @click="submitNote" />
</div>
```

The Handle tab does not own the footer. Create `CaseControlFooter.vue` so actions remain available in Handle, Context, and Activity:

```vue
<footer class="grid shrink-0 grid-cols-2 gap-2 border-t border-default bg-default p-3">
  <SocialInboxFollowUpPopover :model-value="conversation.snoozed_until" @select="emit('followUp', $event)" />
  <UButton label="Resolve" icon="i-lucide-circle-check" variant="subtle" @click="emit('close')" />
</footer>
```

The actual close confirmation belongs to the shell in Task 6 so it remains available from any tab.

- [ ] **Step 6: Run the component and existing mutation tests**

Run: `pnpm vitest run test/app/socialInboxCaseControl.test.ts test/server/utils/socialInboxConversationPatch.test.ts test/server/utils/socialInboxNativeLinks.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the Handle tab**

```bash
git add app/components/social-inbox/FollowUpPopover.vue app/components/social-inbox/RelatedWorkSelector.vue app/components/social-inbox/CaseTaskCreateModal.vue app/components/social-inbox/CaseControlHandle.vue app/components/social-inbox/CaseControlFooter.vue test/app/socialInboxCaseControl.test.ts
git commit -m "feat(social-inbox): add case control handle workflow"
```

---

### Task 5: Context and Activity Tabs

**Files:**

- Create: `app/components/social-inbox/CaseControlContext.vue`
- Create: `app/components/social-inbox/CaseControlActivity.vue`
- Modify: `app/components/social-inbox/Thread.vue:1`
- Modify: `test/app/socialInboxCaseControl.test.ts`

**Interfaces:**

- Consumes: `SocialConversation`, `SocialMessage[]`, `SocialInboxCaseTimelineItem[]`, `SocialInboxAccountHealth | null`, source-post utilities, `safePublicUrl`, verified reply capabilities, and structured account/client display from Task 1.
- Produces: Context renders external platform actions only for `safePublicUrl()` results.
- Produces: Activity delegates rendering to `SocialInboxCaseTimeline`.
- Consumed by: Task 6.

- [ ] **Step 1: Add failing tests for context attribution, media fallback, and activity**

Assert that Context renders separate rows:

```text
Connected page  GWS Peninsula Honda
Client          Garry and Warren Smith
```

Assert that a failed image request removes the `<img>`, renders `i-lucide-image-off`, retains source-post text, and offers `Open post` only for an HTTP(S) platform URL. Assert that campaign and paid-media context are labelled separately. Assert that Activity forwards loading and items to `SocialInboxCaseTimeline` and contains no assignment form.

```ts
it('keeps the connected page, client, campaign, and health unambiguous', () => {
  const { app, host } = mount(CaseControlContext, {
    conversation: {
      ...conversation,
      social_account_name: 'GWS Peninsula Honda',
      client_name: 'Garry and Warren Smith',
      paid_media_platform: 'facebook',
      paid_media_campaign_name: 'Monster Sale'
    },
    accountHealth: { status: 'reauth', account_name: 'GWS Peninsula Honda' } as any
  })
  expect(host.textContent).toContain('Connected page')
  expect(host.textContent).toContain('GWS Peninsula Honda')
  expect(host.textContent).toContain('Client')
  expect(host.textContent).toContain('Garry and Warren Smith')
  expect(host.textContent).toContain('Paid campaign')
  expect(host.textContent).toContain('Monster Sale')
  expect(host.textContent).toContain('Reconnect this account')
  app.unmount()
})

it('replaces a failed source image and rejects unsafe post links', async () => {
  const messageWithSourcePost = {
    ...message,
    metadata: { sourcePost: { text: 'Monster Sale weekend', imageUrl: 'https://lookaside.facebook.com/post.jpg' } }
  } as any
  const { app, host } = mount(CaseControlContext, {
    conversation: { ...conversation, permalink: 'javascript:alert(1)' },
    messages: [messageWithSourcePost]
  })
  const image = host.querySelector('img') as HTMLImageElement
  image.dispatchEvent(new Event('error'))
  await nextTick()
  expect(host.querySelector('img')).toBeNull()
  expect(host.querySelector('[data-testid="source-image-fallback"]')).not.toBeNull()
  expect(host.textContent).toContain(messageWithSourcePost.metadata.sourcePost.text)
  expect(host.textContent).not.toContain('Open post')
  app.unmount()
})
```

- [ ] **Step 2: Run the component test and confirm the context/activity imports fail**

Run: `pnpm vitest run test/app/socialInboxCaseControl.test.ts`

Expected: FAIL.

- [ ] **Step 3: Implement Context with the existing source-image proxy**

Move the original-post presentation logic from `Thread.vue` into `CaseControlContext.vue`. Keep the endpoint `/api/agency/social/inbox/conversations/:id/source-post-image`, reset the failed-image flag when conversation or source media changes, and render the fallback before attempting any direct provider URL.

```ts
const sourcePost = computed(() => getSocialInboxSourcePost(props.messages))
const sourceImage = computed(() => getSocialInboxSourcePostImage(sourcePost.value))
const sourceImageFailed = ref(false)
const sourceImageUrl = computed(() => {
  if (!sourceImage.value || sourceImageFailed.value) return null
  return `/api/agency/social/inbox/conversations/${encodeURIComponent(props.conversation.id)}/source-post-image`
})
const platformUrl = computed(() => safePublicUrl(sourcePost.value?.permalink || props.conversation.permalink))

watch(() => [props.conversation.id, sourceImage.value], () => {
  sourceImageFailed.value = false
})
```

Pass source and platform links through `safePublicUrl()` from `app/utils/safe-url.ts`; an invalid, relative, `javascript:`, `data:`, or malformed permalink renders no external-link action.

Render connected page and client as two definition-list rows. If they are the same entity, render one connected-page row and a help line `This page is linked directly to the client`. Add distinct organic and paid campaign rows using `linked_social_campaign_id`, `paid_media_campaign_name`, `paid_media_platform`, and `paid_media_campaign_id`.

Use `getSocialInboxCapabilities(conversation)` to show reply capability only when it is disabled. Pass the selected account's health row from the page and show it only for `attention` or `reauth`; do not repeat the global healthy-account summary inside every conversation.

- [ ] **Step 4: Implement Activity and simplify Thread**

`CaseControlActivity.vue` contains only the activity heading, loading state, and `SocialInboxCaseTimeline`. Remove the original-post card and its source-post image state from `Thread.vue`; preserve message grouping, message author/avatar behavior, and conversation header.

```vue
<section aria-labelledby="case-activity-heading" class="p-3">
  <h3 id="case-activity-heading" class="mb-3 text-sm font-medium text-highlighted">Activity</h3>
  <SocialInboxCaseTimeline :items="items" :loading="loading" />
</section>
```

- [ ] **Step 5: Run source-post, thread, timeline, and component tests**

Run: `pnpm vitest run test/app/socialInboxCaseControl.test.ts test/server/api/socialInboxSourcePostImageEndpoint.test.ts test/server/utils/socialInboxSourcePostMedia.test.ts test/utils/socialInboxThread.test.ts test/server/utils/socialInboxCaseTimeline.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit the context/activity slice**

```bash
git add app/components/social-inbox/CaseControlContext.vue app/components/social-inbox/CaseControlActivity.vue app/components/social-inbox/Thread.vue test/app/socialInboxCaseControl.test.ts
git commit -m "feat(social-inbox): add case context and activity tabs"
```

---

### Task 6: Case Control Shell and Responsive Inbox Integration

**Files:**

- Create: `app/components/social-inbox/CaseControl.vue`
- Create: `test/app/socialInboxCaseControlLayout.test.ts`
- Modify: `app/pages/agency/social/inbox/index.vue:1`
- Modify: `app/components/social-inbox/Thread.vue:1`
- Modify: `app/components/social-inbox/Sidebar.vue:1`
- Delete: `app/components/social-inbox/ActionPanel.vue`

**Interfaces:**

- Consumes: Tasks 1–5.
- Produces: Desktop Case Control rail and sub-`2xl` slideover using the same component and state.
- Preserves: Existing page mutation handlers and AI action contracts.

- [ ] **Step 1: Write failing layout and wiring tests**

The happy-dom layout contract must assert:

- the desktop grid uses `2xl:grid-cols-[320px_minmax(0,1fr)_360px]`;
- the wide rail can collapse to restore message width and the Manage action restores it;
- the rail is hidden below `2xl` and the Manage button is hidden at `2xl`;
- a `USlideover` with `sm:max-w-md` contains the same `SocialInboxCaseControl` component;
- below `lg`, the conversation list occupies the full width until a conversation is selected, then the thread occupies the full width with a Back action;
- opening a conversation still marks unread messages read automatically;
- no Case Control component emits or renders `Mark read`;
- `takeOwnership` sends `{ assigned_to: currentUserId }`;
- follow-up sends `{ status: 'snoozed', snoozed_until: iso }` and clearing sends `{ status: 'open', snoozed_until: null }`;
- close confirmation sends `{ status: 'closed' }` only after the user confirms;
- mutation failure shows an error toast and reloads the authoritative conversation;
- Sidebar conversation rows are `UButton` components, not raw `<button>` elements;
- Sidebar and Thread display connected page and client as separately labelled values.

```ts
import { readFileSync } from 'node:fs'

const pageSource = readFileSync('app/pages/agency/social/inbox/index.vue', 'utf8')
const threadSource = readFileSync('app/components/social-inbox/Thread.vue', 'utf8')
const sidebarSource = readFileSync('app/components/social-inbox/Sidebar.vue', 'utf8')

expect(pageSource).toContain('2xl:grid-cols-[320px_minmax(0,1fr)_360px]')
expect(pageSource).toContain('caseRailCollapsed')
expect(pageSource).toContain('v-show="!isMobile || !selectedConv"')
expect(pageSource).toContain('v-show="!isMobile || selectedConv"')
expect(pageSource).toContain("{ status: 'snoozed', snoozed_until: value }")
expect(pageSource).not.toContain('@mark-read="onMarkRead"')
expect(threadSource).toContain("emit('back')")
expect(threadSource).toContain("emit('manage')")
expect(sidebarSource).not.toMatch(/<button\b/)
expect(sidebarSource).toContain('Client:')
```

- [ ] **Step 2: Run the layout test and confirm it fails against the old Action Panel**

Run: `pnpm vitest run test/app/socialInboxCaseControlLayout.test.ts`

Expected: FAIL because the responsive Case Control shell is not wired.

- [ ] **Step 3: Implement the Case Control shell**

Use `UTabs` with content disabled and explicit panels:

```ts
const tabs = [
  { label: 'Handle', value: 'handle', icon: 'i-lucide-hand' },
  { label: 'Context', value: 'context', icon: 'i-lucide-panel-right' },
  { label: 'Activity', value: 'activity', icon: 'i-lucide-history' }
]
const activeTab = ref<'handle' | 'context' | 'activity'>('handle')
```

Render `CaseControlHeader` above the tabs. Render only the active tab in the scrollable middle region. Render `CaseControlFooter` and the close modal outside the tab content. The close `UModal` title is `Close this conversation?`; its description says `This removes it from the active queue. You can reopen it from the Closed filter.` The confirm button is labelled `Close conversation`.

The shell props are explicit and contain no network state of their own:

```ts
defineProps<{
  conversation: SocialConversation
  messages: SocialMessage[]
  timeline: SocialInboxCaseTimelineItem[]
  timelineLoading?: boolean
  aiTriage?: SocialInboxAiTriageResult | null
  aiTriageLoading?: boolean
  aiActionBusy?: string | null
  aiActionProposals?: Record<string, SocialInboxAiActionProposal>
  accountHealth?: SocialInboxAccountHealth | null
  currentUserId?: string | null
  mutationBusy?: string | null
  collapsible?: boolean
}>()

defineEmits<{
  takeOwnership: []
  assigned: [userId: string | null]
  triage: [patch: { priority?: SocialInboxPriority | null, tags?: string[] }]
  nativeLinks: [patch: { linked_task_id?: string | null, linked_client_request_id?: string | null }]
  followUp: [value: string | null]
  note: [content: string]
  close: []
  focusReply: []
  aiTriage: []
  aiApplyTriage: [patch: { priority?: SocialInboxPriority | null, tags?: string[] }]
  aiProposeAction: [payload: { actionKey: string, input: SocialInboxAiActionInput }]
  aiConfirmAction: [payload: { actionKey: string, proposal: SocialInboxAiActionProposal }]
  collapse: []
}>()
```

On desktop, the header renders an icon-only `Collapse Case Control` button when the shell receives `collapsible`. That button emits `collapse`; it is absent in the slideover.

- [ ] **Step 4: Harden the page mutation flow**

Replace the unguarded `patchSelectedConversation` with a mutation helper that records a busy key, catches errors, shows an error toast, reloads the selected conversation, refreshes the timeline/list, and clears the busy key in `finally`.

```ts
const mutationBusy = ref<string | null>(null)

async function patchSelectedConversation(body: Record<string, unknown>, busyKey: string) {
  if (!selectedId.value) return false
  mutationBusy.value = busyKey
  try {
    await apiFetch(`/api/agency/social/inbox/conversations/${selectedId.value}`, {
      method: 'PATCH',
      body,
      headers: { 'Idempotency-Key': idempotencyKey(`social-inbox-${busyKey}`) }
    })
    thread.value = await open(selectedId.value)
    await Promise.all([loadTimeline(selectedId.value), reload()])
    return true
  } catch (error: unknown) {
    toast.add({ title: 'Update failed', description: fetchErrorDescription(error), color: 'error' })
    thread.value = await open(selectedId.value).catch(() => thread.value)
    await Promise.all([loadTimeline(selectedId.value), reload()])
    return false
  } finally {
    mutationBusy.value = null
  }
}
```

Wire these exact payloads:

```ts
async function onTakeOwnership() {
  if (!user.value?.id) return
  await patchSelectedConversation({ assigned_to: String(user.value.id) }, 'ownership')
}

async function onFollowUp(value: string | null) {
  await patchSelectedConversation(value
    ? { status: 'snoozed', snoozed_until: value }
    : { status: 'open', snoozed_until: null }, 'follow-up')
}

async function onClose() {
  await patchSelectedConversation({ status: 'closed' }, 'close')
}

async function onNote(content: string) {
  if (!selectedId.value || !content.trim()) return
  try {
    await apiFetch(`/api/agency/social/inbox/conversations/${selectedId.value}/note`, {
      method: 'POST',
      body: { content: content.trim() },
      headers: { 'Idempotency-Key': idempotencyKey('social-inbox-note') }
    })
    await onPanelChanged()
    toast.add({ title: 'Note added', color: 'success' })
  } catch (error: unknown) {
    toast.add({ title: 'Note failed', description: fetchErrorDescription(error), color: 'error' })
  }
}
```

Remove `onMarkRead` from Case Control wiring but keep automatic mark-read in `select()`.

- [ ] **Step 5: Add responsive rail/slideover and Manage focus**

Import `breakpointsTailwind` from `@vueuse/core`. Use `greaterOrEqual('2xl')` only to avoid mounting the slideover on wide screens and `smaller('lg')` for the mobile list/thread switch. Use CSS for the stable grid:

```vue
<div
  class="grid min-h-0 flex-1 grid-cols-1 overflow-hidden lg:grid-cols-[320px_minmax(0,1fr)]"
  :class="!caseRailCollapsed && '2xl:grid-cols-[320px_minmax(0,1fr)_360px]'"
>
  <SocialInboxSidebar v-show="!isMobile || !selectedConv" class="min-h-0" />
  <div v-show="!isMobile || selectedConv" class="min-h-0 min-w-0">
    <SocialInboxThread @back="returnToList" @manage="caseControlOpen = true" />
    <SocialInboxComposer ref="composerRef" />
  </div>
  <SocialInboxCaseControl
    v-if="selectedConv && !caseRailCollapsed"
    collapsible
    class="hidden h-full min-h-0 2xl:flex"
    @collapse="caseRailCollapsed = true"
  />
</div>
<ClientOnly>
  <USlideover v-if="!isWide" v-model:open="caseControlOpen" :ui="{ content: 'sm:max-w-md' }">
    <template #content><SocialInboxCaseControl class="h-full" /></template>
  </USlideover>
</ClientOnly>
```

On mobile, show Sidebar while no conversation is selected; selecting one shows Thread, and Thread's `back` event clears the selection and returns to Sidebar. Thread emits `manage`; below `2xl` it opens the slideover, while at `2xl` it sets `caseRailCollapsed = false` to restore the rail. Case Control `focusReply` closes the slideover, waits for the DOM, then calls `composerRef.focusReply()`.

Derive the Context health row without another API call:

```ts
const selectedAccountHealth = computed(() => {
  const accountId = selectedConv.value?.social_account_id
  return accountId ? accountHealthRows.value.find(row => row.id === accountId) ?? null : null
})
```

- [ ] **Step 6: Bring Sidebar into the same responsive UI standard**

Mark the filter section `@container`, use `grid grid-cols-1 gap-2 @sm:grid-cols-2`, make all select menus `w-full`, and replace each raw conversation button with `UButton color="neutral" variant="ghost" block` plus a custom default slot. Render `Page` and `Client` as separate labelled lines when both differ.

```vue
<UButton
  v-for="conversation in conversations"
  :key="conversation.id"
  color="neutral"
  variant="ghost"
  block
  class="h-auto justify-start rounded-none border-b border-default p-3 text-left"
  @click="emit('select', conversation.id)"
>
  <div class="min-w-0 flex-1">
    <p class="truncate font-medium">{{ identityFor(conversation).label }}</p>
    <p class="truncate text-xs text-muted">Page: {{ accountContext(conversation).accountLabel || 'Not linked' }}</p>
    <p v-if="showClient(conversation)" class="truncate text-xs text-muted">Client: {{ accountContext(conversation).clientLabel }}</p>
  </div>
</UButton>
```

- [ ] **Step 7: Run the complete Social Inbox UI and backend regression set**

Run:

```bash
pnpm vitest run \
  test/app/socialInboxCaseControl.test.ts \
  test/app/socialInboxCaseControlLayout.test.ts \
  test/app/composables/useSocialInboxRealtime.test.ts \
  test/utils/socialInboxDisplay.test.ts \
  test/utils/socialInboxCapabilities.test.ts \
  test/utils/socialInboxThread.test.ts \
  test/server/utils/socialInboxConversationDetail.test.ts \
  test/server/utils/socialInboxConversationList.test.ts \
  test/server/utils/socialInboxConversationPatch.test.ts \
  test/server/utils/socialInboxNativeLinks.test.ts \
  test/server/utils/socialInboxCaseTimeline.test.ts \
  test/server/api/socialInboxSourcePostImageEndpoint.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit the integrated Case Control UI**

```bash
git add app/components/social-inbox/CaseControl.vue app/components/social-inbox/Thread.vue app/components/social-inbox/Sidebar.vue app/pages/agency/social/inbox/index.vue test/app/socialInboxCaseControlLayout.test.ts
git rm app/components/social-inbox/ActionPanel.vue
git commit -m "feat(social-inbox): ship responsive case control workspace"
```

---

### Task 7: Marketing Sync, Browser Battle Test, and Release Evidence

**Files:**

- Create: `test/app/socialInboxMarketingCaseControl.test.ts`
- Modify: `app/pages/features/index.vue:191`
- Modify: `app/pages/features/[slug].vue:530`
- Modify: `app/components/MarketingNav.vue:653`

**Interfaces:**

- Consumes: the completed Phase 1 UI.
- Produces: public copy that accurately describes the shipped feature without promising Phase 2 moderation or analytics.

- [ ] **Step 1: Write a failing marketing contract test**

Read the three files and assert that the Engagement Inbox copy includes `Case Control`, `ownership`, `follow-up`, and `client work`, and no longer says assignment or SLA tracking are merely `rolling out in stages`.

```ts
import { readFileSync } from 'node:fs'

const indexSource = readFileSync('app/pages/features/index.vue', 'utf8')
const detailSource = readFileSync('app/pages/features/[slug].vue', 'utf8')
const navSource = readFileSync('app/components/MarketingNav.vue', 'utf8')

expect(indexSource).toMatch(/Case Control[^\n]+ownership[^\n]+follow-up/i)
expect(detailSource).toContain("title: 'Case Control'")
expect(detailSource).toContain('client work')
expect(detailSource).not.toContain('assignment, and SLA tracking — rolling out in stages')
expect(navSource).toMatch(/Engagement Inbox[^\n]+Case Control/)
```

- [ ] **Step 2: Run the marketing test and confirm old copy fails**

Run: `pnpm vitest run test/app/socialInboxMarketingCaseControl.test.ts`

Expected: FAIL on missing Case Control language.

- [ ] **Step 3: Update the public feature copy**

Use this bounded message:

```text
Bring every connected comment, mention, message, and review into one agency inbox. Case Control puts ownership, SLA, risk, follow-up, client work, and conversation history beside the thread so teams can act without losing context.
```

Update the detailed feature entry with four sections: `Every Connected Conversation`, `Case Control`, `Context Without Confusion`, and `Human-Controlled Assistance`. Do not advertise hide/report/delete actions, lifecycle reporting, team queues, or resolution-reason analytics until their later phases ship.

- [ ] **Step 4: Run focused tests, Nuxt preparation, and typecheck**

Run:

```bash
pnpm vitest run test/app/socialInboxMarketingCaseControl.test.ts test/app/socialInboxCaseControl.test.ts test/app/socialInboxCaseControlLayout.test.ts
pnpm exec nuxt prepare
pnpm run typecheck
```

Expected: focused tests and Nuxt preparation PASS. Compare typecheck output against the documented pre-existing TypeScript baseline; no new errors may reference Social Inbox files.

- [ ] **Step 5: Perform the mandated deep-dive review**

Re-read every modified and new file end to end. Confirm:

- server imports use `~~/server/utils/`;
- all USelectMenu sentinels are non-empty strings;
- tag and search debounces reset correctly when conversation changes;
- no primary action appears in more than one Case Control section;
- source media never falls back to an untrusted provider URL after proxy failure;
- related-work search and mutation remain conversation-client scoped;
- no external platform mutation has been introduced;
- no raw form control or native dialog was added;
- dark-mode semantic classes are used throughout.

- [ ] **Step 6: Browser-test the approved UAT matrix**

Run the authenticated inbox in a real browser and capture evidence for:

1. wide desktop with the 360-pixel rail;
2. 1280-pixel layout with Manage opening a slideover;
3. narrow mobile layout with readable controls;
4. light and dark modes;
5. unnamed Facebook commenter and reviewer;
6. page and client with different names;
7. valid and expired source-post images;
8. take ownership, tag autosave, follow-up set/clear, task search/link/unlink, note, close, and manual reopen from the Closed filter;
9. simulated PATCH and related-work failures showing recovery to authoritative state.

Expected: every acceptance point is observable without console errors, clipped controls, broken images, or ambiguous company attribution.

- [ ] **Step 7: Run the guarded production build**

Run: `pnpm run build`

Expected: PASS with the repository's configured 16 GB heap ceiling.

- [ ] **Step 8: Commit the marketing and verification contract**

```bash
git add app/pages/features/index.vue 'app/pages/features/[slug].vue' app/components/MarketingNav.vue test/app/socialInboxMarketingCaseControl.test.ts
git commit -m "docs(marketing): present social inbox case control"
```

## Completion Gate

Phase 1 is complete only when:

- all focused and regression tests pass;
- no new TypeScript errors reference Social Inbox files;
- the guarded build passes;
- desktop, slideover, mobile, light, and dark browser checks pass;
- the relation search proves client scoping;
- unread selection still marks read automatically;
- the old `ActionPanel.vue` is removed;
- public copy describes only the capability actually shipped;
- the implementation is reviewed against every Phase 1 acceptance criterion in the approved specification.

After this gate, write separate implementation plans for:

1. **Phase 2 — Operational lifecycle:** workflow states, waiting reasons, resolution reasons, SLA clocks, reopen semantics, escalation, team queues, moderation capability verification, permissioned mutations, and event audit.
2. **Phase 3 — Portfolio intelligence:** account/client trends, repeated complaint themes, sentiment recovery, workload, SLA, outcome, approval, moderation, and escalation analytics.
