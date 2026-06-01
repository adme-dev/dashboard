# Social Inbox — Phase 2b (Automation Engine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an AI-assisted reply automation engine to the social engagement inbox — four per-rule modes (off / suggest / approval / autopilot) with hard safety guardrails and a global kill-switch — so agency staff can auto-draft, approve, or auto-send replies to comments and reviews without ever firing an unsafe automated message.

**Architecture:** A pure, DB-injected engine mirrors the 2a `store.ts` pattern so it is unit-testable without a live DB. Ingestion (webhook + poll, both already landing through `recordInbound`) flags new inbound conversations `automation_state='pending'`. The existing `social-inbox-cron` tick runs a second pass that, **only when `SOCIAL_AUTOMATION_ENABLED==='true'`**, matches enabled `social_automation_rules` by priority, evaluates conditions, applies deterministic guardrails (hard negative-sentiment→human rule, rate limits, confidence floor, business-hours), and writes every action to the `social_response_queue` audit ledger. `autopilot` rows dispatch immediately through the provider `reply()` method; `approval` rows wait for a human (staff or client). `suggest` is on-demand only (a composer "AI draft" button hitting an endpoint) and is never auto-fired. AI drafts come from Groq as structured JSON `{reply, confidence, risk}`; a parse failure fails safe (confidence 0 → forced human). The keyword/sentiment guard is the primary deterministic safety rule; the model's self-`risk` is secondary defense-in-depth.

**Tech Stack:** Nitro (Nuxt 4 server), Neon Postgres via `server/utils/db.ts`, Groq (`generateGroqInsight`), Vitest + happy-dom, Nuxt UI v4, existing `social-providers/*` registry (`reply()` method from 2a), existing `social-inbox-cron` companion Worker.

---

## Background: what already exists (from Phase 2a, merged in #61)

Read these before starting — the plan builds directly on them:

- `server/utils/socialInbox/store.ts` — `recordInbound(db, clientId, accountId, ev) → {conversationId, inserted}` (idempotent), `recordOutbound(...)`. **DB-injected `DbRunner` ({queryOne, execute}) — copy this testability pattern.**
- `server/utils/socialInbox/normalize.ts`, `types.ts` — `ChannelType = 'comment'|'dm'|'mention'|'review'`, `NormalizedEvent`.
- `server/api/cron/sync-social-inbox.post.ts` — the poll dispatcher; **Phase 2b appends an automation pass here.**
- `server/api/agency/social/inbox/conversations/[id]/reply.post.ts` — manual reply: resolves the reply target (comment → latest inbound `platform_message_id`; review → conversation `platform_conversation_id`), calls `provider.reply(...)`, then `recordOutbound(...)`. **Task 7 extracts the target-resolution + dispatch into a shared helper this engine reuses.**
- `server/utils/social-providers/registry.ts` — `getProvider(platform)` / `getProviderOrThrow(platform)`; providers expose optional `reply({accountId, accessToken, conversationId, content}) → {status, platformMessageId?, error?}` and `fetchInbox(...)`.
- `server/utils/groqClient.ts` — `generateGroqInsight(prompt, {model?, temperature?, maxTokens?, systemPrompt?}) → Promise<string>`; `GROQ_MODELS.LLAMA_70B`. Throws on API error.
- `server/utils/leads/filterEval.ts` — the pure operator-based condition evaluator to mirror for rule `conditions`.
- `server/utils/email-marketing/campaignSender.ts` — `EMAIL_SENDING_ENABLED` gate precedent (`process.env.X === 'true' && configured()`).
- **Migration `148_social_inbox.sql` already added the 2b columns** on the message/conversation tables: `social_conversations.automation_state`, `social_messages.ai_generated`, `ai_suggested`, `ai_confidence`, `automation_rule_id`. **Phase 2b only needs a NEW migration for the two 2b tables** (`social_automation_rules`, `social_response_queue`).
- `app/layouts/agency.vue` — the "Social Publishing" nav group (~line 242) already lists Inbox + Reviews; Task 16 adds Automation + Reply Queue there.

**⚠️ Migration number:** This plan uses **`150`** (149 = `149_audio_assets.sql`, merged via #62). Migration collisions have been live this week — **at execution time, re-check `ls server/database/migrations/ | grep -oE '^[0-9]+' | sort -n | tail -1`** and bump if 150 is taken.

**⚠️ Safety, non-negotiable (user standing instruction):** Do **NOT** set `SOCIAL_AUTOMATION_ENABLED=true` anywhere, do not enable/deploy the cron, and do not trigger any live `provider.reply()` send during development. The gate stays off; tests exercise the engine with injected fakes only. This phase ships dormant, exactly like the email send engine.

---

## File Structure

**New server modules (the testable core):**
- `server/utils/socialInbox/automationTypes.ts` — shared server types for rules, conditions, queue rows, engine context.
- `server/utils/socialInbox/guardrails.ts` — **pure** functions: `detectReplyRisk`, `isWithinBusinessHours`, `evaluateRuleConditions`. No I/O.
- `server/utils/socialInbox/aiDraft.ts` — `buildDraftPrompt` (pure) + `generateReplyDraft` (calls Groq, parses JSON, fails safe).
- `server/utils/socialInbox/automationGate.ts` — `isSocialAutomationEnabled()`.
- `server/utils/socialInbox/automation.ts` — the engine: `selectRule`, `resolveEffectiveMode`, `runAutomationForConversation`, `processPendingAutomation` (all DB-injected).
- `server/utils/socialInbox/dispatch.ts` — `resolveReplyTarget` + `dispatchReply` (shared by manual reply, autopilot, and approve).

**Modified server:**
- `server/utils/socialInbox/store.ts` — `bumpConversationForInbound` sets `automation_state='pending'`.
- `server/api/cron/sync-social-inbox.post.ts` — append gated automation pass.
- `server/api/agency/social/inbox/conversations/[id]/reply.post.ts` — use shared `dispatch.ts`.

**New API:**
- `server/api/agency/social/inbox/conversations/[id]/ai-draft.post.ts` — on-demand suggest.
- `server/api/agency/social/inbox/automation-rules/index.get.ts`, `index.post.ts`, `[id].patch.ts`, `[id].delete.ts`.
- `server/api/agency/social/inbox/response-queue/index.get.ts`, `[id]/approve.post.ts`, `[id]/reject.post.ts`.

**New frontend:**
- `app/pages/agency/social/inbox/automation.vue` — rules CRUD.
- `app/pages/agency/social/inbox/approvals.vue` — staff reply queue.
- `app/components/social-inbox/Composer.vue` — add "AI draft" button (modify).
- `app/layouts/agency.vue` — nav entries (modify).
- `app/types/index.ts` — automation types for the frontend (modify).

**Marketing sync:**
- `app/pages/features/index.vue`, `app/pages/features/[slug].vue`, `app/components/MarketingNav.vue` (modify).

**Tests:**
- `test/social/guardrails.test.ts`, `test/social/aiDraft.test.ts`, `test/social/automationGate.test.ts`, `test/social/automationEngine.test.ts`, `test/social/dispatch.test.ts`.

---

## Task 1: Migration — automation rules + response queue tables

**Files:**
- Create: `server/database/migrations/150_social_automation.sql`

- [ ] **Step 1: Re-check the migration number**

Run: `ls server/database/migrations/ | grep -oE '^[0-9]+' | sort -n | tail -1`
Expected: `149`. If it prints ≥150, rename this file to `<max+1>_social_automation.sql` and use that number throughout.

- [ ] **Step 2: Write the migration**

```sql
-- 150_social_automation.sql — Social Suite Slice 2 Phase 2b: reply automation engine.
-- Additive. The 2b COLUMNS on social_conversations/social_messages already shipped in
-- 148_social_inbox.sql (automation_state, ai_generated, ai_suggested, ai_confidence,
-- automation_rule_id). This migration adds only the two new 2b tables.
-- Run: psql "$DATABASE_URL" -f server/database/migrations/150_social_automation.sql

CREATE TABLE IF NOT EXISTS social_automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  platform TEXT,                                  -- NULL = all platforms
  channel_type TEXT,                              -- comment|review|... NULL = all channels
  mode TEXT NOT NULL DEFAULT 'off',               -- off|suggest|approval|autopilot
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,  -- {ratingMin,ratingMax,keywordsAny[],keywordsNone[],businessHoursOnly}
  action JSONB NOT NULL DEFAULT '{}'::jsonb,       -- {aiPrompt?: string}  (saved-reply ref is 2c)
  approval_by TEXT NOT NULL DEFAULT 'staff',       -- staff|client|none
  rate_limit INT NOT NULL DEFAULT 0,               -- max auto-actions per rule per rolling hour; 0 = unlimited
  confidence_floor NUMERIC NOT NULL DEFAULT 0.7,   -- below this, autopilot downgrades to approval
  business_hours JSONB,                            -- {tz, days:[1..7], start:"09:00", end:"17:00"}
  priority INT NOT NULL DEFAULT 100,               -- lower = evaluated first
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_social_rules_match
  ON social_automation_rules(client_id, enabled, priority);

CREATE TABLE IF NOT EXISTS social_response_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES agency_clients(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES social_conversations(id) ON DELETE CASCADE,
  message_id UUID REFERENCES social_messages(id) ON DELETE SET NULL,  -- the inbound being answered
  rule_id UUID REFERENCES social_automation_rules(id) ON DELETE SET NULL,
  draft_content TEXT NOT NULL,
  confidence NUMERIC,
  status TEXT NOT NULL DEFAULT 'pending',          -- pending|approved|rejected|sent|failed|skipped
  effective_mode TEXT NOT NULL,                    -- approval|autopilot (the mode AFTER guardrails)
  approver_type TEXT NOT NULL DEFAULT 'staff',     -- staff|client|none
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  guardrail_notes TEXT,                            -- why downgraded/skipped (audit)
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Idempotency: at most one automation queue row per inbound message.
CREATE UNIQUE INDEX IF NOT EXISTS uq_social_queue_message
  ON social_response_queue(message_id)
  WHERE message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_social_queue_client_status
  ON social_response_queue(client_id, status, created_at DESC);
```

- [ ] **Step 3: Run the migration against the dev DB**

Run:
```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/150_social_automation.sql
```
Expected: `CREATE TABLE` / `CREATE INDEX` lines, no errors. Re-running is safe (`IF NOT EXISTS`).

- [ ] **Step 4: Verify the tables exist**

Run: `psql "$DATABASE_URL" -c "\d social_automation_rules" -c "\d social_response_queue"`
Expected: both tables print their columns.

- [ ] **Step 5: Commit**

```bash
git add server/database/migrations/150_social_automation.sql
git commit -m "feat(social-inbox): migration 150 — automation rules + response queue"
```

---

## Task 2: Shared automation types

**Files:**
- Create: `server/utils/socialInbox/automationTypes.ts`
- Modify: `app/types/index.ts` (append, after the `SocialMessage` interface from 2a)

- [ ] **Step 1: Write the server types**

`server/utils/socialInbox/automationTypes.ts`:
```ts
// server/utils/socialInbox/automationTypes.ts
// Shared server-side types for the Phase 2b reply automation engine.
import type { ChannelType } from './types'

export type AutomationMode = 'off' | 'suggest' | 'approval' | 'autopilot'
export type EffectiveMode = 'approval' | 'autopilot'
export type ApproverType = 'staff' | 'client' | 'none'
export type QueueStatus = 'pending' | 'approved' | 'rejected' | 'sent' | 'failed' | 'skipped'

export interface BusinessHours {
  tz: string                 // IANA tz, e.g. "Australia/Sydney"
  days: number[]             // ISO weekdays 1=Mon..7=Sun
  start: string              // "HH:MM" 24h
  end: string                // "HH:MM" 24h
}

export interface RuleConditions {
  ratingMin?: number         // reviews: inclusive
  ratingMax?: number         // reviews: inclusive
  keywordsAny?: string[]     // inbound content must contain at least one (case-insensitive)
  keywordsNone?: string[]    // inbound content must contain none
  businessHoursOnly?: boolean
}

export interface AutomationRule {
  id: string
  client_id: string
  name: string
  platform: string | null
  channel_type: ChannelType | null
  mode: AutomationMode
  conditions: RuleConditions
  action: { aiPrompt?: string }
  approval_by: ApproverType
  rate_limit: number
  confidence_floor: number
  business_hours: BusinessHours | null
  priority: number
  enabled: boolean
}

/** The inbound context the engine evaluates a rule against. */
export interface AutomationContext {
  conversationId: string
  clientId: string
  platform: string
  channelType: ChannelType
  rating: number | null
  inboundMessageId: string
  inboundContent: string
  participantName: string | null
  now: Date
}

/** Result of an AI draft generation. */
export interface ReplyDraft {
  reply: string
  confidence: number   // 0..1
  risk: boolean        // model self-flag (secondary to the deterministic guard)
}
```

- [ ] **Step 2: Append the frontend types to `app/types/index.ts`**

Add immediately after the `SocialMessage` interface (the 2a block ending `created_at: string }`):
```ts
// --- Social Inbox automation (Slice 2 Phase 2b) ---
export type SocialAutomationMode = 'off' | 'suggest' | 'approval' | 'autopilot'

export interface SocialAutomationRule {
  id: string
  client_id: string
  name: string
  platform: string | null
  channel_type: 'comment' | 'dm' | 'mention' | 'review' | null
  mode: SocialAutomationMode
  conditions: {
    ratingMin?: number
    ratingMax?: number
    keywordsAny?: string[]
    keywordsNone?: string[]
    businessHoursOnly?: boolean
  }
  action: { aiPrompt?: string }
  approval_by: 'staff' | 'client' | 'none'
  rate_limit: number
  confidence_floor: number
  business_hours: { tz: string; days: number[]; start: string; end: string } | null
  priority: number
  enabled: boolean
  created_at: string
  updated_at: string
}

export interface SocialResponseQueueItem {
  id: string
  client_id: string
  conversation_id: string
  message_id: string | null
  rule_id: string | null
  draft_content: string
  confidence: number | null
  status: 'pending' | 'approved' | 'rejected' | 'sent' | 'failed' | 'skipped'
  effective_mode: 'approval' | 'autopilot'
  approver_type: 'staff' | 'client' | 'none'
  approved_by: string | null
  approved_at: string | null
  guardrail_notes: string | null
  error: string | null
  created_at: string
  updated_at: string
  // joined for display
  rule_name?: string | null
  platform?: string
  channel_type?: string
  participant_name?: string | null
  permalink?: string | null
  inbound_preview?: string | null
}
```

- [ ] **Step 3: Typecheck the two files compile (no full build)**

Run: `pnpm exec vitest run test/social/inboxStore.test.ts`
Expected: PASS (sanity that imports still resolve; nothing references the new types yet).

- [ ] **Step 4: Commit**

```bash
git add server/utils/socialInbox/automationTypes.ts app/types/index.ts
git commit -m "feat(social-inbox): automation types (rules, queue, engine context)"
```

---

## Task 3: Guardrails (pure, deterministic) — the safety core

**Files:**
- Create: `server/utils/socialInbox/guardrails.ts`
- Test: `test/social/guardrails.test.ts`

- [ ] **Step 1: Write the failing test**

`test/social/guardrails.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import {
  detectReplyRisk,
  isWithinBusinessHours,
  evaluateRuleConditions,
} from '~~/server/utils/socialInbox/guardrails'
import type { RuleConditions, BusinessHours, AutomationContext } from '~~/server/utils/socialInbox/automationTypes'

const baseCtx = (over: Partial<AutomationContext> = {}): AutomationContext => ({
  conversationId: 'c1', clientId: 'cl1', platform: 'facebook', channelType: 'comment',
  rating: null, inboundMessageId: 'm1', inboundContent: 'love this!', participantName: 'Sam',
  now: new Date('2026-06-01T03:00:00Z'), ...over,
})

describe('detectReplyRisk — HARD negative-sentiment→human guard', () => {
  it('flags legal/complaint/PR-risk keywords', () => {
    for (const txt of ['I will sue you', 'this is a scam', 'refund now or I report you',
                        'worst service ever, disgusting', 'I want a lawyer', 'you stole my money']) {
      expect(detectReplyRisk(txt).risky, txt).toBe(true)
    }
  })
  it('does not flag ordinary positive/neutral comments', () => {
    for (const txt of ['love this product', 'when do you open?', 'great work team', 'nice colours']) {
      expect(detectReplyRisk(txt).risky, txt).toBe(false)
    }
  })
  it('is case- and punctuation-insensitive', () => {
    expect(detectReplyRisk('SCAM!!!').risky).toBe(true)
    expect(detectReplyRisk('Re-fund').risky).toBe(false) // hyphen split — not the word "refund"
  })
  it('returns reasons for audit', () => {
    const r = detectReplyRisk('this is a scam and I will sue')
    expect(r.risky).toBe(true)
    expect(r.reasons.length).toBeGreaterThan(0)
  })
})

describe('isWithinBusinessHours', () => {
  const bh: BusinessHours = { tz: 'UTC', days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' }
  it('true inside the window on a weekday', () => {
    expect(isWithinBusinessHours(new Date('2026-06-01T10:00:00Z'), bh)).toBe(true) // Mon 10:00 UTC
  })
  it('false before open', () => {
    expect(isWithinBusinessHours(new Date('2026-06-01T08:00:00Z'), bh)).toBe(false)
  })
  it('false on a weekend', () => {
    expect(isWithinBusinessHours(new Date('2026-06-06T10:00:00Z'), bh)).toBe(false) // Sat
  })
  it('null business_hours = always within (caller decides)', () => {
    expect(isWithinBusinessHours(new Date(), null)).toBe(true)
  })
})

describe('evaluateRuleConditions', () => {
  it('empty conditions match everything', () => {
    expect(evaluateRuleConditions(baseCtx(), {})).toBe(true)
  })
  it('rating range gates reviews', () => {
    const c: RuleConditions = { ratingMin: 4, ratingMax: 5 }
    expect(evaluateRuleConditions(baseCtx({ rating: 5 }), c)).toBe(true)
    expect(evaluateRuleConditions(baseCtx({ rating: 2 }), c)).toBe(false)
    expect(evaluateRuleConditions(baseCtx({ rating: null }), c)).toBe(false) // range set but no rating
  })
  it('keywordsAny requires at least one', () => {
    const c: RuleConditions = { keywordsAny: ['price', 'cost'] }
    expect(evaluateRuleConditions(baseCtx({ inboundContent: 'what is the price?' }), c)).toBe(true)
    expect(evaluateRuleConditions(baseCtx({ inboundContent: 'nice photo' }), c)).toBe(false)
  })
  it('keywordsNone excludes', () => {
    const c: RuleConditions = { keywordsNone: ['urgent'] }
    expect(evaluateRuleConditions(baseCtx({ inboundContent: 'this is urgent' }), c)).toBe(false)
    expect(evaluateRuleConditions(baseCtx({ inboundContent: 'all good' }), c)).toBe(true)
  })
  it('businessHoursOnly is NOT evaluated here (engine handles it via business_hours)', () => {
    // conditions.businessHoursOnly is a flag the engine reads; evaluateRuleConditions ignores it
    expect(evaluateRuleConditions(baseCtx(), { businessHoursOnly: true })).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/social/guardrails.test.ts`
Expected: FAIL — `Cannot find module '.../guardrails'`.

- [ ] **Step 3: Write the implementation**

`server/utils/socialInbox/guardrails.ts`:
```ts
// server/utils/socialInbox/guardrails.ts
// PURE, deterministic safety + condition logic for the reply automation engine.
// No I/O, no DB, no Groq. This is the primary, testable safety layer — the model's
// self-reported risk is only secondary defense-in-depth.
import type { AutomationContext, BusinessHours, RuleConditions } from './automationTypes'

/**
 * HARD SAFETY RULE: any inbound that looks like a complaint, legal threat, or PR risk
 * must never be auto-answered — the engine forces it to human approval. Word-boundary
 * matched, case-insensitive. Keep this list conservative (false-positive → human, which
 * is the safe direction).
 */
const RISK_TERMS: string[] = [
  'sue', 'lawyer', 'legal', 'lawsuit', 'court', 'attorney',
  'scam', 'fraud', 'stole', 'stolen', 'theft', 'rip off', 'ripoff', 'ripped off',
  'refund', 'chargeback', 'money back', 'compensation',
  'disgusting', 'disgrace', 'appalling', 'unacceptable', 'worst', 'terrible', 'awful',
  'report you', 'reported', 'complaint', 'complain', 'ombudsman', 'accc', 'fair trading',
  'dangerous', 'injury', 'injured', 'sick', 'unsafe', 'allergic',
  'racist', 'sexist', 'discriminat', 'harass',
  'never again', 'boycott', 'cancel my', 'cancelling', 'canceling',
]

export interface RiskResult { risky: boolean; reasons: string[] }

/** Normalise to lowercase with word-ish boundaries so "SCAM!!!" matches but "re-fund" does not. */
function normaliseForMatch(text: string): string {
  return ` ${text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ')} `
}

export function detectReplyRisk(content: string): RiskResult {
  const hay = normaliseForMatch(content || '')
  const reasons: string[] = []
  for (const term of RISK_TERMS) {
    // term may be multi-word; match surrounded by spaces (we padded both ends)
    const needle = term.includes(' ') ? ` ${term} ` : ` ${term} `
    if (term.endsWith('discriminat') || term.endsWith('complain')) {
      // stem match: allow suffixes (discriminate/discrimination, complain/complaint already listed)
      if (hay.includes(` ${term}`)) reasons.push(term)
    } else if (hay.includes(needle)) {
      reasons.push(term)
    }
  }
  return { risky: reasons.length > 0, reasons }
}

/** Minutes since local midnight for a Date in a given IANA tz, plus ISO weekday (1=Mon..7=Sun). */
function localParts(now: Date, tz: string): { minutes: number; weekday: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false, weekday: 'short', hour: '2-digit', minute: '2-digit',
  })
  const parts = fmt.formatToParts(now)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  const hour = Number(get('hour'))
  const minute = Number(get('minute'))
  const wkMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 }
  return { minutes: hour * 60 + minute, weekday: wkMap[get('weekday')] ?? 0 }
}

function hhmmToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

export function isWithinBusinessHours(now: Date, bh: BusinessHours | null): boolean {
  if (!bh) return true
  let lp
  try { lp = localParts(now, bh.tz || 'UTC') } catch { return true } // bad tz → don't block
  if (!bh.days?.includes(lp.weekday)) return false
  const start = hhmmToMinutes(bh.start || '00:00')
  const end = hhmmToMinutes(bh.end || '23:59')
  return lp.minutes >= start && lp.minutes <= end
}

/**
 * Evaluate a rule's content/rating conditions against the inbound context.
 * NOTE: `businessHoursOnly` is intentionally ignored here — the engine enforces business
 * hours separately via the rule's `business_hours` window. This function is rating + keywords.
 */
export function evaluateRuleConditions(ctx: AutomationContext, c: RuleConditions): boolean {
  if (c.ratingMin != null || c.ratingMax != null) {
    if (ctx.rating == null) return false
    if (c.ratingMin != null && ctx.rating < c.ratingMin) return false
    if (c.ratingMax != null && ctx.rating > c.ratingMax) return false
  }
  const text = (ctx.inboundContent || '').toLowerCase()
  if (c.keywordsAny?.length) {
    if (!c.keywordsAny.some(k => text.includes(k.toLowerCase()))) return false
  }
  if (c.keywordsNone?.length) {
    if (c.keywordsNone.some(k => text.includes(k.toLowerCase()))) return false
  }
  return true
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/social/guardrails.test.ts`
Expected: PASS (all groups). If `detectReplyRisk('Re-fund')` fails, confirm the punctuation normalisation splits the hyphen — that is the intended behavior the test asserts.

- [ ] **Step 5: Commit**

```bash
git add server/utils/socialInbox/guardrails.ts test/social/guardrails.test.ts
git commit -m "feat(social-inbox): pure guardrails — risk detection, business hours, conditions"
```

---

## Task 4: AI draft generation (Groq, fail-safe)

**Files:**
- Create: `server/utils/socialInbox/aiDraft.ts`
- Test: `test/social/aiDraft.test.ts`

- [ ] **Step 1: Write the failing test**

`test/social/aiDraft.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { buildDraftPrompt, parseDraftResponse } from '~~/server/utils/socialInbox/aiDraft'
import type { AutomationContext } from '~~/server/utils/socialInbox/automationTypes'

const ctx: AutomationContext = {
  conversationId: 'c1', clientId: 'cl1', platform: 'instagram', channelType: 'comment',
  rating: null, inboundMessageId: 'm1', inboundContent: 'do you ship to Perth?',
  participantName: 'Jo', now: new Date('2026-06-01T03:00:00Z'),
}

describe('buildDraftPrompt', () => {
  it('includes the inbound content, platform, and participant', () => {
    const p = buildDraftPrompt(ctx, 'Be warm and concise. Brand: Acme.')
    expect(p).toContain('do you ship to Perth?')
    expect(p).toContain('instagram')
    expect(p).toContain('Jo')
    expect(p).toContain('Acme')
  })
  it('asks for strict JSON output', () => {
    expect(buildDraftPrompt(ctx, '')).toMatch(/json/i)
  })
})

describe('parseDraftResponse — fail-safe', () => {
  it('parses clean JSON', () => {
    const r = parseDraftResponse('{"reply":"Yes, we ship Australia-wide!","confidence":0.9,"risk":false}')
    expect(r).toEqual({ reply: 'Yes, we ship Australia-wide!', confidence: 0.9, risk: false })
  })
  it('extracts JSON embedded in prose / code fences', () => {
    const r = parseDraftResponse('Sure:\n```json\n{"reply":"Hi","confidence":0.8,"risk":false}\n```')
    expect(r.reply).toBe('Hi')
    expect(r.confidence).toBe(0.8)
  })
  it('clamps confidence to 0..1', () => {
    expect(parseDraftResponse('{"reply":"x","confidence":5,"risk":false}').confidence).toBe(1)
    expect(parseDraftResponse('{"reply":"x","confidence":-2,"risk":false}').confidence).toBe(0)
  })
  it('unparseable → fail safe (empty reply, confidence 0, risk true)', () => {
    expect(parseDraftResponse('the model rambled with no json')).toEqual({ reply: '', confidence: 0, risk: true })
  })
  it('missing reply → fail safe', () => {
    expect(parseDraftResponse('{"confidence":0.9,"risk":false}').reply).toBe('')
    expect(parseDraftResponse('{"confidence":0.9,"risk":false}').confidence).toBe(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/social/aiDraft.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`server/utils/socialInbox/aiDraft.ts`:
```ts
// server/utils/socialInbox/aiDraft.ts
// AI reply drafting via Groq. Returns structured {reply, confidence, risk}. Any failure
// to call or parse fails SAFE: empty reply + confidence 0 + risk true, so the engine
// downgrades to human approval rather than sending something unverified.
import { generateGroqInsight, GROQ_MODELS } from '~~/server/utils/groqClient'
import type { AutomationContext, ReplyDraft } from './automationTypes'

const CHANNEL_HINT: Record<string, string> = {
  comment: 'a public reply to a social media comment (visible to everyone)',
  review: 'a public response to a customer review',
  dm: 'a private direct message',
  mention: 'a public reply to a mention',
}

export function buildDraftPrompt(ctx: AutomationContext, brandPrompt: string): string {
  const channel = CHANNEL_HINT[ctx.channelType] ?? 'a social media reply'
  const ratingLine = ctx.rating != null ? `\nReview rating: ${ctx.rating}/5` : ''
  return [
    `You are drafting ${channel} on ${ctx.platform} for a marketing agency's client.`,
    brandPrompt ? `Brand voice & instructions: ${brandPrompt}` : 'Use a warm, professional, concise brand voice.',
    `\nCustomer (${ctx.participantName ?? 'anonymous'}) wrote:`,
    `"""${ctx.inboundContent}"""${ratingLine}`,
    `\nWrite a reply (max 2 short sentences, no hashtags unless natural, never invent facts like prices or dates).`,
    `Respond with STRICT JSON only, no prose, no code fences:`,
    `{"reply": "<the reply text>", "confidence": <0..1 how confident a human would approve this as-is>, "risk": <true if this needs a human (complaint/legal/sensitive), else false>}`,
  ].join('\n')
}

export function parseDraftResponse(raw: string): ReplyDraft {
  const fail: ReplyDraft = { reply: '', confidence: 0, risk: true }
  if (!raw) return fail
  // Pull the first {...} block (handles code fences / surrounding prose).
  const match = raw.match(/\{[\s\S]*\}/)
  if (!match) return fail
  let obj: any
  try { obj = JSON.parse(match[0]) } catch { return fail }
  const reply = typeof obj?.reply === 'string' ? obj.reply.trim() : ''
  if (!reply) return fail
  let confidence = Number(obj?.confidence)
  if (!Number.isFinite(confidence)) confidence = 0
  confidence = Math.max(0, Math.min(1, confidence))
  const risk = obj?.risk === true
  return { reply, confidence, risk }
}

/** Calls Groq. On any thrown error returns the fail-safe draft. */
export async function generateReplyDraft(ctx: AutomationContext, brandPrompt: string): Promise<ReplyDraft> {
  try {
    const out = await generateGroqInsight(buildDraftPrompt(ctx, brandPrompt), {
      model: GROQ_MODELS.LLAMA_70B,
      temperature: 0.3,
      maxTokens: 300,
      systemPrompt: 'You are a senior social media community manager. You write safe, on-brand, accurate replies and you flag anything sensitive for a human.',
    })
    return parseDraftResponse(out)
  } catch {
    return { reply: '', confidence: 0, risk: true }
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/social/aiDraft.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/socialInbox/aiDraft.ts test/social/aiDraft.test.ts
git commit -m "feat(social-inbox): Groq reply drafting with fail-safe JSON parsing"
```

---

## Task 5: Global automation gate

**Files:**
- Create: `server/utils/socialInbox/automationGate.ts`
- Test: `test/social/automationGate.test.ts`

- [ ] **Step 1: Write the failing test**

`test/social/automationGate.test.ts`:
```ts
import { describe, it, expect, afterEach } from 'vitest'
import { isSocialAutomationEnabled } from '~~/server/utils/socialInbox/automationGate'

const original = process.env.SOCIAL_AUTOMATION_ENABLED
afterEach(() => { process.env.SOCIAL_AUTOMATION_ENABLED = original })

describe('isSocialAutomationEnabled', () => {
  it('false when unset', () => {
    delete process.env.SOCIAL_AUTOMATION_ENABLED
    expect(isSocialAutomationEnabled()).toBe(false)
  })
  it('false for any value other than the exact string "true"', () => {
    for (const v of ['', '1', 'yes', 'TRUE', 'on']) {
      process.env.SOCIAL_AUTOMATION_ENABLED = v
      expect(isSocialAutomationEnabled(), v).toBe(false)
    }
  })
  it('true only for exactly "true"', () => {
    process.env.SOCIAL_AUTOMATION_ENABLED = 'true'
    expect(isSocialAutomationEnabled()).toBe(true)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run test/social/automationGate.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`server/utils/socialInbox/automationGate.ts`:
```ts
// server/utils/socialInbox/automationGate.ts
// Master kill-switch for the reply automation engine. Mirrors the email EMAIL_SENDING_ENABLED
// precedent: the engine drafts/queues/sends NOTHING unless this is the exact string "true".
// The on-demand "AI draft" suggest endpoint is exempt (explicit human action).
export function isSocialAutomationEnabled(): boolean {
  return process.env.SOCIAL_AUTOMATION_ENABLED === 'true'
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run test/social/automationGate.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/socialInbox/automationGate.ts test/social/automationGate.test.ts
git commit -m "feat(social-inbox): SOCIAL_AUTOMATION_ENABLED master gate"
```

---

## Task 6: The automation engine (DB-injected, testable)

**Files:**
- Create: `server/utils/socialInbox/automation.ts`
- Test: `test/social/automationEngine.test.ts`

This is the heart of the phase. The engine is DB-injected (an `EngineDb` runner + a `deps` object with `generateDraft` and `dispatch`) so the full decision tree is unit-tested with fakes — no live DB, no Groq, no live send.

- [ ] **Step 1: Write the failing test**

`test/social/automationEngine.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { selectRule, resolveEffectiveMode, runAutomationForConversation } from '~~/server/utils/socialInbox/automation'
import type { AutomationRule, AutomationContext, ReplyDraft } from '~~/server/utils/socialInbox/automationTypes'

const rule = (over: Partial<AutomationRule> = {}): AutomationRule => ({
  id: 'r1', client_id: 'cl1', name: 'r', platform: null, channel_type: null, mode: 'autopilot',
  conditions: {}, action: {}, approval_by: 'staff', rate_limit: 0, confidence_floor: 0.7,
  business_hours: null, priority: 100, enabled: true, ...over,
})
const ctx = (over: Partial<AutomationContext> = {}): AutomationContext => ({
  conversationId: 'c1', clientId: 'cl1', platform: 'facebook', channelType: 'comment',
  rating: null, inboundMessageId: 'm1', inboundContent: 'how much is shipping?',
  participantName: 'Sam', now: new Date('2026-06-01T03:00:00Z'), ...over,
})

describe('selectRule — priority + match', () => {
  it('picks the lowest-priority enabled rule that matches platform+channel', () => {
    const rules = [
      rule({ id: 'a', priority: 200, platform: null, channel_type: null }),
      rule({ id: 'b', priority: 50, platform: 'facebook', channel_type: 'comment' }),
      rule({ id: 'c', priority: 10, platform: 'instagram', channel_type: 'comment' }), // wrong platform
    ]
    expect(selectRule(rules, ctx())?.id).toBe('b')
  })
  it('ignores disabled rules and condition mismatches', () => {
    const rules = [
      rule({ id: 'a', priority: 10, enabled: false }),
      rule({ id: 'b', priority: 20, conditions: { keywordsAny: ['refund'] } }), // no match
      rule({ id: 'c', priority: 30 }),
    ]
    expect(selectRule(rules, ctx())?.id).toBe('c')
  })
  it('returns null when nothing matches', () => {
    expect(selectRule([rule({ platform: 'tiktok' })], ctx())).toBeNull()
  })
})

describe('resolveEffectiveMode — guardrails', () => {
  const goodDraft: ReplyDraft = { reply: 'Sure, $9 flat.', confidence: 0.95, risk: false }
  it('autopilot stays autopilot when all guardrails pass', () => {
    const r = resolveEffectiveMode(rule({ mode: 'autopilot' }), ctx(), goodDraft, { recentCount: 0 })
    expect(r.mode).toBe('autopilot')
  })
  it('HARD rule: risky inbound forces approval even for autopilot', () => {
    const r = resolveEffectiveMode(rule({ mode: 'autopilot' }), ctx({ inboundContent: 'this is a scam, refund me' }), goodDraft, { recentCount: 0 })
    expect(r.mode).toBe('approval')
    expect(r.notes).toMatch(/risk/i)
  })
  it('model self-risk forces approval', () => {
    const r = resolveEffectiveMode(rule({ mode: 'autopilot' }), ctx(), { ...goodDraft, risk: true }, { recentCount: 0 })
    expect(r.mode).toBe('approval')
  })
  it('confidence below floor downgrades autopilot to approval', () => {
    const r = resolveEffectiveMode(rule({ mode: 'autopilot', confidence_floor: 0.8 }), ctx(), { ...goodDraft, confidence: 0.5 }, { recentCount: 0 })
    expect(r.mode).toBe('approval')
    expect(r.notes).toMatch(/confidence/i)
  })
  it('rate limit exceeded → skip', () => {
    const r = resolveEffectiveMode(rule({ mode: 'autopilot', rate_limit: 5 }), ctx(), goodDraft, { recentCount: 5 })
    expect(r.mode).toBe('skip')
    expect(r.notes).toMatch(/rate/i)
  })
  it('outside business hours downgrades autopilot to approval', () => {
    const bh = { tz: 'UTC', days: [1,2,3,4,5], start: '09:00', end: '17:00' }
    const r = resolveEffectiveMode(rule({ mode: 'autopilot', business_hours: bh, conditions: { businessHoursOnly: true } }),
      ctx({ now: new Date('2026-06-01T02:00:00Z') }), goodDraft, { recentCount: 0 }) // 02:00 UTC, before open
    expect(r.mode).toBe('approval')
    expect(r.notes).toMatch(/hours/i)
  })
  it('approval mode is never upgraded', () => {
    const r = resolveEffectiveMode(rule({ mode: 'approval' }), ctx(), goodDraft, { recentCount: 0 })
    expect(r.mode).toBe('approval')
  })
})

describe('runAutomationForConversation — orchestration with fakes', () => {
  function fakeDb(rows: Record<string, any[]>) {
    return {
      queryOne: vi.fn(async (sql: string) => {
        if (/FROM social_conversations/.test(sql)) return rows.conv?.[0] ?? null
        if (/FROM social_messages/.test(sql)) return rows.inbound?.[0] ?? null
        if (/COUNT/.test(sql)) return { n: rows.recentCount?.[0]?.n ?? 0 }
        if (/INSERT INTO social_response_queue/.test(sql)) return { id: 'q1' }
        return null
      }),
      queryRows: vi.fn(async (sql: string) => {
        if (/FROM social_automation_rules/.test(sql)) return rows.rules ?? []
        return []
      }),
      execute: vi.fn(async () => 1),
    }
  }
  const convRow = { id: 'c1', client_id: 'cl1', platform: 'facebook', channel_type: 'comment', rating: null }
  const inboundRow = { id: 'm1', content: 'how much is shipping?', author_name: 'Sam' }

  it('no matching rule → clears pending, no queue row, no dispatch', async () => {
    const db = fakeDb({ conv: [convRow], inbound: [inboundRow], rules: [] })
    const deps = { generateDraft: vi.fn(), dispatch: vi.fn() }
    await runAutomationForConversation(db as any, deps as any, 'c1')
    expect(deps.generateDraft).not.toHaveBeenCalled()
    expect(deps.dispatch).not.toHaveBeenCalled()
    // clears automation_state
    expect(db.execute).toHaveBeenCalledWith(expect.stringMatching(/automation_state\s*=\s*NULL/), expect.anything())
  })

  it('off/suggest rule → no draft, no queue', async () => {
    const db = fakeDb({ conv: [convRow], inbound: [inboundRow], rules: [rule({ mode: 'suggest' })] })
    const deps = { generateDraft: vi.fn(), dispatch: vi.fn() }
    await runAutomationForConversation(db as any, deps as any, 'c1')
    expect(deps.generateDraft).not.toHaveBeenCalled()
  })

  it('autopilot + clean draft → queue row "sent" + dispatch called', async () => {
    const db = fakeDb({ conv: [convRow], inbound: [inboundRow], rules: [rule({ mode: 'autopilot' })] })
    const deps = {
      generateDraft: vi.fn(async (): Promise<ReplyDraft> => ({ reply: '$9 flat', confidence: 0.95, risk: false })),
      dispatch: vi.fn(async () => ({ ok: true, platformMessageId: 'pm1' })),
    }
    await runAutomationForConversation(db as any, deps as any, 'c1')
    expect(deps.generateDraft).toHaveBeenCalledOnce()
    expect(deps.dispatch).toHaveBeenCalledOnce()
  })

  it('autopilot + risky inbound → queue "pending" approval, NO dispatch', async () => {
    const db = fakeDb({ conv: [convRow], inbound: [{ ...inboundRow, content: 'refund me you scam' }], rules: [rule({ mode: 'autopilot' })] })
    const deps = {
      generateDraft: vi.fn(async (): Promise<ReplyDraft> => ({ reply: 'x', confidence: 0.95, risk: false })),
      dispatch: vi.fn(),
    }
    await runAutomationForConversation(db as any, deps as any, 'c1')
    expect(deps.dispatch).not.toHaveBeenCalled()
    expect(db.queryOne).toHaveBeenCalledWith(expect.stringMatching(/INSERT INTO social_response_queue/), expect.anything())
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run test/social/automationEngine.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`server/utils/socialInbox/automation.ts`:
```ts
// server/utils/socialInbox/automation.ts
// The reply automation engine. DB-injected (EngineDb) + deps-injected (draft + dispatch)
// so the whole decision tree is unit-testable with fakes. The cron handler wires the real
// DB, real Groq draft, and real provider dispatch — and ONLY runs when the master gate is on.
import type {
  AutomationRule, AutomationContext, ReplyDraft, EffectiveMode,
} from './automationTypes'
import { detectReplyRisk, isWithinBusinessHours, evaluateRuleConditions } from './guardrails'

export interface EngineDb {
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>
  queryRows<T = any>(sql: string, params?: any[]): Promise<T[]>
  execute(sql: string, params?: any[]): Promise<number>
}

export interface EngineDeps {
  generateDraft(ctx: AutomationContext, brandPrompt: string): Promise<ReplyDraft>
  dispatch(args: { conversationId: string; clientId: string; content: string; aiGenerated: boolean; queueId: string }):
    Promise<{ ok: boolean; platformMessageId?: string; error?: string }>
}

/** First enabled rule (lowest priority number) whose platform/channel/conditions match. */
export function selectRule(rules: AutomationRule[], ctx: AutomationContext): AutomationRule | null {
  const matches = rules
    .filter(r => r.enabled && r.mode !== 'off')
    .filter(r => r.platform == null || r.platform === ctx.platform)
    .filter(r => r.channel_type == null || r.channel_type === ctx.channelType)
    .filter(r => evaluateRuleConditions(ctx, r.conditions))
    .sort((a, b) => a.priority - b.priority)
  return matches[0] ?? null
}

export type ModeDecision = { mode: EffectiveMode | 'skip'; notes: string }

/**
 * Apply guardrails to a matched rule + draft and decide the effective action.
 * 'suggest'/'off' rules never reach here (selectRule excludes off; suggest handled upstream).
 * Direction of safety: any doubt downgrades autopilot → approval (or skip).
 */
export function resolveEffectiveMode(
  rule: AutomationRule, ctx: AutomationContext, draft: ReplyDraft, usage: { recentCount: number },
): ModeDecision {
  // approval-mode rules are never escalated to autopilot.
  if (rule.mode === 'approval') {
    return { mode: 'approval', notes: 'rule mode: approval' }
  }
  // --- autopilot path: every guardrail can only downgrade ---
  // Rate limit (0 = unlimited).
  if (rule.rate_limit > 0 && usage.recentCount >= rule.rate_limit) {
    return { mode: 'skip', notes: `rate limit reached (${usage.recentCount}/${rule.rate_limit})` }
  }
  // HARD negative-sentiment / PR-risk guard (deterministic, primary).
  const risk = detectReplyRisk(ctx.inboundContent)
  if (risk.risky) {
    return { mode: 'approval', notes: `forced to human — risk terms: ${risk.reasons.join(', ')}` }
  }
  // Model self-flagged risk (secondary).
  if (draft.risk) {
    return { mode: 'approval', notes: 'forced to human — model flagged risk' }
  }
  // Confidence floor.
  if (draft.confidence < rule.confidence_floor) {
    return { mode: 'approval', notes: `confidence ${draft.confidence} < floor ${rule.confidence_floor}` }
  }
  // Business hours (only when the rule opts in).
  if (rule.conditions.businessHoursOnly && !isWithinBusinessHours(ctx.now, rule.business_hours)) {
    return { mode: 'approval', notes: 'outside business hours' }
  }
  return { mode: 'autopilot', notes: 'all guardrails passed' }
}

/** Count autopilot sends for this rule in the trailing hour (rate-limit input). */
async function recentAutopilotCount(db: EngineDb, ruleId: string): Promise<number> {
  const row = await db.queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM social_response_queue
       WHERE rule_id = $1 AND status = 'sent' AND created_at > NOW() - INTERVAL '1 hour'`,
    [ruleId],
  )
  return row?.n ?? 0
}

/**
 * Run the engine for one conversation flagged automation_state='pending'.
 * Loads the conversation + its latest inbound message, selects a rule, drafts, applies
 * guardrails, writes the audit queue row, and (for autopilot) dispatches. Always clears
 * automation_state at the end so the conversation is not re-processed.
 */
export async function runAutomationForConversation(db: EngineDb, deps: EngineDeps, conversationId: string): Promise<void> {
  const clearState = () => db.execute(
    `UPDATE social_conversations SET automation_state = NULL, updated_at = NOW() WHERE id = $1`, [conversationId])

  const conv = await db.queryOne<any>(
    `SELECT id, client_id, platform, channel_type, rating FROM social_conversations WHERE id = $1`, [conversationId])
  if (!conv) return

  const inbound = await db.queryOne<any>(
    `SELECT id, content, author_name FROM social_messages
       WHERE conversation_id = $1 AND direction = 'in'
       ORDER BY platform_timestamp DESC NULLS LAST, created_at DESC LIMIT 1`, [conversationId])
  if (!inbound) { await clearState(); return }

  // Idempotency: never act twice on the same inbound message.
  const existing = await db.queryOne<{ id: string }>(
    `SELECT id FROM social_response_queue WHERE message_id = $1`, [inbound.id])
  if (existing) { await clearState(); return }

  const rules = await db.queryRows<AutomationRule>(
    `SELECT * FROM social_automation_rules WHERE client_id = $1 AND enabled = TRUE ORDER BY priority ASC`, [conv.client_id])

  const ctx: AutomationContext = {
    conversationId, clientId: conv.client_id, platform: conv.platform, channelType: conv.channel_type,
    rating: conv.rating ?? null, inboundMessageId: inbound.id, inboundContent: inbound.content ?? '',
    participantName: inbound.author_name ?? null, now: new Date(),
  }

  const rule = selectRule(rules, ctx)
  // No rule, or the matched rule is suggest-only → engine does nothing automatic.
  if (!rule || rule.mode === 'suggest' || rule.mode === 'off') { await clearState(); return }

  const draft = await deps.generateDraft(ctx, rule.action.aiPrompt ?? '')
  if (!draft.reply) {
    // Drafting failed → leave a skipped audit row, no send.
    await db.queryOne(
      `INSERT INTO social_response_queue
         (client_id, conversation_id, message_id, rule_id, draft_content, confidence, status, effective_mode, approver_type, guardrail_notes)
       VALUES ($1,$2,$3,$4,$5,$6,'skipped','approval',$7,'draft generation failed') RETURNING id`,
      [conv.client_id, conversationId, inbound.id, rule.id, '(no draft)', draft.confidence, rule.approval_by])
    await clearState(); return
  }

  const usage = { recentCount: await recentAutopilotCount(db, rule.id) }
  const decision = resolveEffectiveMode(rule, ctx, draft, usage)

  if (decision.mode === 'skip') {
    await db.queryOne(
      `INSERT INTO social_response_queue
         (client_id, conversation_id, message_id, rule_id, draft_content, confidence, status, effective_mode, approver_type, guardrail_notes)
       VALUES ($1,$2,$3,$4,$5,$6,'skipped','approval',$7,$8) RETURNING id`,
      [conv.client_id, conversationId, inbound.id, rule.id, draft.reply, draft.confidence, rule.approval_by, decision.notes])
    await clearState(); return
  }

  // Insert the queue row first (audit before any send). autopilot starts 'approved' (machine-approved),
  // approval starts 'pending' (awaits human).
  const startStatus = decision.mode === 'autopilot' ? 'approved' : 'pending'
  const queueRow = await db.queryOne<{ id: string }>(
    `INSERT INTO social_response_queue
       (client_id, conversation_id, message_id, rule_id, draft_content, confidence, status, effective_mode, approver_type, guardrail_notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [conv.client_id, conversationId, inbound.id, rule.id, draft.reply, draft.confidence,
     startStatus, decision.mode, decision.mode === 'autopilot' ? 'none' : rule.approval_by, decision.notes])
  const queueId = queueRow?.id

  // Mark conversation's automation snapshot for the UI badge.
  await db.execute(
    `UPDATE social_conversations SET automation_state = $2, updated_at = NOW() WHERE id = $1`,
    [conversationId, decision.mode === 'autopilot' ? 'auto_replied' : 'awaiting_approval'])

  if (decision.mode === 'autopilot' && queueId) {
    const res = await deps.dispatch({
      conversationId, clientId: conv.client_id, content: draft.reply, aiGenerated: true, queueId,
    })
    await db.execute(
      `UPDATE social_response_queue SET status = $2, error = $3, updated_at = NOW() WHERE id = $1`,
      [queueId, res.ok ? 'sent' : 'failed', res.ok ? null : (res.error ?? 'dispatch failed')])
  }
  // approval path: nothing more — the queue row waits for a human (Task 12).
}

/** Cron entry: process up to `limit` pending conversations. Caller MUST gate on the master switch. */
export async function processPendingAutomation(db: EngineDb, deps: EngineDeps, limit = 50): Promise<{ processed: number }> {
  const pending = await db.queryRows<{ id: string }>(
    `SELECT id FROM social_conversations WHERE automation_state = 'pending' ORDER BY updated_at ASC LIMIT $1`, [limit])
  let processed = 0
  for (const row of pending) {
    try { await runAutomationForConversation(db, deps, row.id); processed++ }
    catch (e: any) {
      await db.execute(`UPDATE social_conversations SET automation_state = NULL, updated_at = NOW() WHERE id = $1`, [row.id])
      console.error('automation.run.error', { conversationId: row.id, error: String(e?.message ?? e) })
    }
  }
  return { processed }
}
```

Add the `EffectiveMode` re-export already covered in `automationTypes.ts`. Note `EngineDeps` and `EngineDb` are exported from this module.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/social/automationEngine.test.ts`
Expected: PASS (all `selectRule`, `resolveEffectiveMode`, and `runAutomationForConversation` groups).

- [ ] **Step 5: Commit**

```bash
git add server/utils/socialInbox/automation.ts test/social/automationEngine.test.ts
git commit -m "feat(social-inbox): automation engine — rule select, guardrail mode resolution, run loop"
```

---

## Task 7: Shared dispatch helper + refactor manual reply

**Files:**
- Create: `server/utils/socialInbox/dispatch.ts`
- Modify: `server/api/agency/social/inbox/conversations/[id]/reply.post.ts`
- Test: `test/social/dispatch.test.ts`

- [ ] **Step 1: Write the failing test (pure target resolution)**

`test/social/dispatch.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest'
import { resolveReplyTarget } from '~~/server/utils/socialInbox/dispatch'

describe('resolveReplyTarget', () => {
  it('review → the conversation platform_conversation_id', async () => {
    const db = { queryOne: vi.fn() }
    const conv = { channel_type: 'review', platform_conversation_id: 'rev-99' }
    expect(await resolveReplyTarget(db as any, 'c1', conv)).toBe('rev-99')
    expect(db.queryOne).not.toHaveBeenCalled()
  })
  it('comment → the latest inbound platform_message_id when present', async () => {
    const db = { queryOne: vi.fn(async () => ({ platform_message_id: 'cmt-7' })) }
    const conv = { channel_type: 'comment', platform_conversation_id: 'post-1' }
    expect(await resolveReplyTarget(db as any, 'c1', conv)).toBe('cmt-7')
  })
  it('comment with no inbound message id → falls back to conversation id', async () => {
    const db = { queryOne: vi.fn(async () => null) }
    const conv = { channel_type: 'comment', platform_conversation_id: 'post-1' }
    expect(await resolveReplyTarget(db as any, 'c1', conv)).toBe('post-1')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run test/social/dispatch.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `dispatch.ts`**

`server/utils/socialInbox/dispatch.ts`:
```ts
// server/utils/socialInbox/dispatch.ts
// Shared reply-target resolution + send, used by manual reply (2a), autopilot, and approve.
// Keeps the "where does a reply go on each channel" rule in ONE place.
import { getProviderOrThrow } from '~~/server/utils/social-providers/registry'
import { recordOutbound } from './store'

interface TargetDb { queryOne<T = any>(sql: string, params?: any[]): Promise<T | null> }

/** comment → latest inbound comment id (the thing we reply under); review/other → conversation object id. */
export async function resolveReplyTarget(
  db: TargetDb, conversationId: string, conv: { channel_type: string; platform_conversation_id: string },
): Promise<string> {
  if (conv.channel_type === 'comment') {
    const last = await db.queryOne<{ platform_message_id: string }>(
      `SELECT platform_message_id FROM social_messages
         WHERE conversation_id = $1 AND direction = 'in' AND platform_message_id IS NOT NULL
         ORDER BY platform_timestamp DESC NULLS LAST, created_at DESC LIMIT 1`,
      [conversationId],
    )
    if (last?.platform_message_id) return last.platform_message_id
  }
  return conv.platform_conversation_id
}

interface FullDb {
  queryOne<T = any>(sql: string, params?: any[]): Promise<T | null>
  execute(sql: string, params?: any[]): Promise<number>
}

/**
 * Send a reply through the conversation's provider and record it as outbound.
 * `sentByUserId` is a real user id for manual/approved sends, or 'automation' for autopilot.
 */
export async function dispatchReply(
  db: FullDb,
  conversationId: string,
  args: { content: string; sentByUserId: string; aiGenerated?: boolean },
): Promise<{ ok: boolean; platformMessageId?: string; error?: string }> {
  const conv = await db.queryOne<any>(
    `SELECT c.*, a.platform_account_id, a.access_token
       FROM social_conversations c JOIN social_accounts a ON a.id = c.social_account_id
      WHERE c.id = $1`, [conversationId])
  if (!conv) return { ok: false, error: 'conversation not found' }

  let provider
  try { provider = getProviderOrThrow(conv.platform) } catch (e: any) { return { ok: false, error: String(e?.message ?? e) } }
  if (!provider.reply) return { ok: false, error: `${conv.platform} replies not supported` }

  const target = await resolveReplyTarget(db, conversationId, conv)
  const r = await provider.reply({
    accountId: conv.platform_account_id, accessToken: conv.access_token,
    conversationId: target, content: args.content,
  })
  if (r.status !== 'success') return { ok: false, error: r.error || 'reply failed' }

  await recordOutbound(db as any, conversationId, conv.client_id, {
    platformMessageId: r.platformMessageId || null,
    content: args.content,
    sentByUserId: args.sentByUserId,
  })
  return { ok: true, platformMessageId: r.platformMessageId }
}
```

- [ ] **Step 4: Run to verify the new test passes**

Run: `pnpm exec vitest run test/social/dispatch.test.ts`
Expected: PASS.

- [ ] **Step 5: Refactor `reply.post.ts` to use `dispatchReply`**

Replace the body of `server/api/agency/social/inbox/conversations/[id]/reply.post.ts` with:
```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'
import { dispatchReply } from '~~/server/utils/socialInbox/dispatch'

/**
 * POST /api/agency/social/inbox/conversations/:id/reply
 * Manual reply — resolves the target + sends via the shared dispatch helper, then records it.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const { content } = await readBody(event)
  if (!content?.trim()) throw createError({ statusCode: 400, statusMessage: 'content required' })

  const res = await dispatchReply({ queryOne, execute }, id, {
    content: content.trim(),
    sentByUserId: String(user.id),
    aiGenerated: false,
  })
  if (!res.ok) throw createError({ statusCode: 502, statusMessage: res.error || 'reply failed' })
  return { ok: true, platformMessageId: res.platformMessageId }
})
```

- [ ] **Step 6: Run the full inbox suite to confirm no 2a regression**

Run: `pnpm exec vitest run test/social/`
Expected: PASS — all 2a tests (inboxStore, inboxNormalize, inboxProviders, metaWebhook) + the new guardrails/aiDraft/automationGate/automationEngine/dispatch suites.

- [ ] **Step 7: Commit**

```bash
git add server/utils/socialInbox/dispatch.ts test/social/dispatch.test.ts 'server/api/agency/social/inbox/conversations/[id]/reply.post.ts'
git commit -m "feat(social-inbox): shared dispatch helper; manual reply reuses it"
```

---

## Task 8: Enqueue automation on new inbound

**Files:**
- Modify: `server/utils/socialInbox/store.ts` (the `bumpConversationForInbound` UPDATE)
- Test: `test/social/inboxStore.test.ts` (extend existing)

- [ ] **Step 1: Add a failing assertion to the existing store test**

Append to `test/social/inboxStore.test.ts` (inside the existing `describe`):
```ts
it('flags automation_state=pending when a new inbound is recorded', async () => {
  const calls: string[] = []
  const db = {
    queryOne: async () => ({ id: 'conv1' }),
    execute: async (sql: string) => { calls.push(sql); return 1 },
  }
  const { recordInbound } = await import('~~/server/utils/socialInbox/store')
  await recordInbound(db as any, 'cl1', 'acc1', {
    platform: 'facebook', channelType: 'comment', platformConversationId: 'p1',
    participant: {}, message: { platformMessageId: 'm1', direction: 'in', messageType: 'comment', content: 'hi' },
  } as any)
  expect(calls.some(s => /automation_state\s*=\s*'pending'/.test(s))).toBe(true)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm exec vitest run test/social/inboxStore.test.ts`
Expected: FAIL — the bump UPDATE does not set `automation_state`.

- [ ] **Step 3: Edit `bumpConversationForInbound` in `store.ts`**

In the `UPDATE social_conversations SET ...` inside `bumpConversationForInbound`, add the `automation_state` assignment (right after the `status = CASE ...` line):
```ts
       status = CASE WHEN status = 'closed' THEN 'open' ELSE status END,
       automation_state = 'pending',
       updated_at = NOW()
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm exec vitest run test/social/inboxStore.test.ts`
Expected: PASS (existing + new assertion).

- [ ] **Step 5: Commit**

```bash
git add server/utils/socialInbox/store.ts test/social/inboxStore.test.ts
git commit -m "feat(social-inbox): flag automation_state=pending on new inbound"
```

---

## Task 9: Wire the engine into the poll cron (gated)

**Files:**
- Modify: `server/api/cron/sync-social-inbox.post.ts`

No new test (cron is glue over already-tested units; the gate + engine are covered). Manual verification step included.

- [ ] **Step 1: Add the automation pass after the poll loop**

At the top of `server/api/cron/sync-social-inbox.post.ts`, add imports:
```ts
import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { isSocialAutomationEnabled } from '~~/server/utils/socialInbox/automationGate'
import { processPendingAutomation } from '~~/server/utils/socialInbox/automation'
import { generateReplyDraft } from '~~/server/utils/socialInbox/aiDraft'
import { dispatchReply } from '~~/server/utils/socialInbox/dispatch'
```
(The file already imports `queryRows, queryOne, execute` — do not duplicate; merge into the existing import.)

Then, immediately before the final `return { synced }`, insert:
```ts
  // --- Phase 2b: automation pass (fully dormant unless the master gate is on) ---
  let automated = 0
  if (isSocialAutomationEnabled()) {
    const engineDb = { queryOne, queryRows, execute }
    const deps = {
      generateDraft: generateReplyDraft,
      dispatch: (a: { conversationId: string; clientId: string; content: string; aiGenerated: boolean; queueId: string }) =>
        dispatchReply(engineDb, a.conversationId, { content: a.content, sentByUserId: 'automation', aiGenerated: a.aiGenerated }),
    }
    const r = await processPendingAutomation(engineDb, deps, 50)
    automated = r.processed
  }

  console.log('social-inbox-sync.run', { accounts: accounts.length, synced, automated })
  return { synced, automated }
```
(Remove the old `console.log('social-inbox-sync.run', ...)` and `return { synced }` that this replaces.)

- [ ] **Step 2: Confirm the file type-resolves via the test suite**

Run: `pnpm exec vitest run test/social/`
Expected: PASS (the cron file isn't imported by tests, but this confirms nothing it depends on broke).

- [ ] **Step 3: Manual gate verification (no live send)**

Run:
```bash
grep -n "isSocialAutomationEnabled\|automation pass" server/api/cron/sync-social-inbox.post.ts
```
Expected: the automation pass is wrapped in `if (isSocialAutomationEnabled())`. With `SOCIAL_AUTOMATION_ENABLED` unset (the default), the engine is a no-op. **Do not set the env var.**

- [ ] **Step 4: Commit**

```bash
git add server/api/cron/sync-social-inbox.post.ts
git commit -m "feat(social-inbox): run automation engine in poll cron, gated by master switch"
```

---

## Task 10: On-demand "AI draft" endpoint (suggest mode)

**Files:**
- Create: `server/api/agency/social/inbox/conversations/[id]/ai-draft.post.ts`

This is the only AI path NOT behind the master gate — it is an explicit human action (staff clicks "AI draft" in the composer), exactly like the manual reply endpoint. It never sends; it returns a draft string.

- [ ] **Step 1: Write the endpoint**

`server/api/agency/social/inbox/conversations/[id]/ai-draft.post.ts`:
```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'
import { generateReplyDraft } from '~~/server/utils/socialInbox/aiDraft'
import type { AutomationContext } from '~~/server/utils/socialInbox/automationTypes'

/**
 * POST /api/agency/social/inbox/conversations/:id/ai-draft
 * On-demand AI reply suggestion for the composer. Human action, never auto-sends — so it is
 * intentionally NOT behind SOCIAL_AUTOMATION_ENABLED. Optional body { brandPrompt? }.
 */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event).catch(() => ({}))

  const conv = await queryOne<any>(
    `SELECT id, client_id, platform, channel_type, rating FROM social_conversations WHERE id = $1`, [id])
  if (!conv) throw createError({ statusCode: 404, statusMessage: 'Not found' })

  const inbound = await queryOne<any>(
    `SELECT id, content, author_name FROM social_messages
       WHERE conversation_id = $1 AND direction = 'in'
       ORDER BY platform_timestamp DESC NULLS LAST, created_at DESC LIMIT 1`, [id])
  if (!inbound) throw createError({ statusCode: 400, statusMessage: 'no inbound message to reply to' })

  const ctx: AutomationContext = {
    conversationId: id, clientId: conv.client_id, platform: conv.platform, channelType: conv.channel_type,
    rating: conv.rating ?? null, inboundMessageId: inbound.id, inboundContent: inbound.content ?? '',
    participantName: inbound.author_name ?? null, now: new Date(),
  }
  const draft = await generateReplyDraft(ctx, String(body?.brandPrompt ?? ''))
  return { reply: draft.reply, confidence: draft.confidence, risk: draft.risk }
})
```

- [ ] **Step 2: Verify suite still green**

Run: `pnpm exec vitest run test/social/`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add 'server/api/agency/social/inbox/conversations/[id]/ai-draft.post.ts'
git commit -m "feat(social-inbox): on-demand AI draft endpoint (suggest mode, human-initiated)"
```

---

## Task 11: Automation-rules CRUD API

**Files:**
- Create: `server/api/agency/social/inbox/automation-rules/index.get.ts`
- Create: `server/api/agency/social/inbox/automation-rules/index.post.ts`
- Create: `server/api/agency/social/inbox/automation-rules/[id].patch.ts`
- Create: `server/api/agency/social/inbox/automation-rules/[id].delete.ts`

- [ ] **Step 1: List endpoint**

`server/api/agency/social/inbox/automation-rules/index.get.ts`:
```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

/** GET /api/agency/social/inbox/automation-rules?clientId= */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const clientId = getQuery(event).clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  return await queryRows(
    `SELECT * FROM social_automation_rules WHERE client_id = $1 ORDER BY priority ASC, created_at DESC`, [clientId])
})
```

- [ ] **Step 2: Create endpoint**

`server/api/agency/social/inbox/automation-rules/index.post.ts`:
```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

/** POST /api/agency/social/inbox/automation-rules  body: full rule (client_id required) */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const b = await readBody(event)
  if (!b?.client_id || !b?.name?.trim()) throw createError({ statusCode: 400, statusMessage: 'client_id and name required' })
  const mode = ['off', 'suggest', 'approval', 'autopilot'].includes(b.mode) ? b.mode : 'off'
  return await queryOne(
    `INSERT INTO social_automation_rules
       (client_id, name, platform, channel_type, mode, conditions, action, approval_by, rate_limit,
        confidence_floor, business_hours, priority, enabled, created_by)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$9,$10,$11::jsonb,$12,$13,$14) RETURNING *`,
    [b.client_id, b.name.trim(), b.platform ?? null, b.channel_type ?? null, mode,
     JSON.stringify(b.conditions ?? {}), JSON.stringify(b.action ?? {}),
     ['staff', 'client', 'none'].includes(b.approval_by) ? b.approval_by : 'staff',
     Number(b.rate_limit) || 0, Number(b.confidence_floor ?? 0.7),
     b.business_hours ? JSON.stringify(b.business_hours) : null,
     Number(b.priority) || 100, b.enabled !== false, String(user.id)])
})
```

- [ ] **Step 3: Patch endpoint**

`server/api/agency/social/inbox/automation-rules/[id].patch.ts`:
```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryOne } from '~~/server/utils/db'

/** PATCH /api/agency/social/inbox/automation-rules/:id  body: partial rule */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const b = await readBody(event)
  const sets: string[] = []
  const params: any[] = []
  const set = (col: string, val: any, cast = '') => { params.push(val); sets.push(`${col} = $${params.length}${cast}`) }

  if (b.name != null) set('name', String(b.name).trim())
  if (b.platform !== undefined) set('platform', b.platform ?? null)
  if (b.channel_type !== undefined) set('channel_type', b.channel_type ?? null)
  if (b.mode != null && ['off', 'suggest', 'approval', 'autopilot'].includes(b.mode)) set('mode', b.mode)
  if (b.conditions != null) set('conditions', JSON.stringify(b.conditions), '::jsonb')
  if (b.action != null) set('action', JSON.stringify(b.action), '::jsonb')
  if (b.approval_by != null && ['staff', 'client', 'none'].includes(b.approval_by)) set('approval_by', b.approval_by)
  if (b.rate_limit != null) set('rate_limit', Number(b.rate_limit) || 0)
  if (b.confidence_floor != null) set('confidence_floor', Number(b.confidence_floor))
  if (b.business_hours !== undefined) set('business_hours', b.business_hours ? JSON.stringify(b.business_hours) : null, '::jsonb')
  if (b.priority != null) set('priority', Number(b.priority) || 100)
  if (b.enabled != null) set('enabled', !!b.enabled)
  if (!sets.length) throw createError({ statusCode: 400, statusMessage: 'no fields to update' })

  params.push(id)
  return await queryOne(
    `UPDATE social_automation_rules SET ${sets.join(', ')}, updated_at = NOW() WHERE id = $${params.length} RETURNING *`, params)
})
```

- [ ] **Step 4: Delete endpoint**

`server/api/agency/social/inbox/automation-rules/[id].delete.ts`:
```ts
import { requireAuth } from '~~/server/utils/auth'
import { execute } from '~~/server/utils/db'

/** DELETE /api/agency/social/inbox/automation-rules/:id */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  await execute(`DELETE FROM social_automation_rules WHERE id = $1`, [id])
  return { ok: true }
})
```

- [ ] **Step 5: Verify suite still green**

Run: `pnpm exec vitest run test/social/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add server/api/agency/social/inbox/automation-rules/
git commit -m "feat(social-inbox): automation-rules CRUD API"
```

---

## Task 12: Response-queue API (list / approve / reject)

**Files:**
- Create: `server/api/agency/social/inbox/response-queue/index.get.ts`
- Create: `server/api/agency/social/inbox/response-queue/[id]/approve.post.ts`
- Create: `server/api/agency/social/inbox/response-queue/[id]/reject.post.ts`

- [ ] **Step 1: List endpoint (with joins for display)**

`server/api/agency/social/inbox/response-queue/index.get.ts`:
```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'

/** GET /api/agency/social/inbox/response-queue?clientId=&status=pending */
export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = q.clientId as string
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })
  const params: any[] = [clientId]
  let sql = `
    SELECT rq.*, r.name AS rule_name, c.platform, c.channel_type, c.participant_name, c.permalink,
           c.last_message_preview AS inbound_preview
      FROM social_response_queue rq
      JOIN social_conversations c ON c.id = rq.conversation_id
      LEFT JOIN social_automation_rules r ON r.id = rq.rule_id
     WHERE rq.client_id = $1`
  if (q.status) { params.push(q.status); sql += ` AND rq.status = $${params.length}` }
  params.push(Math.min(Number(q.limit) || 100, 500))
  sql += ` ORDER BY rq.created_at DESC LIMIT $${params.length}`
  return await queryRows(sql, params)
})
```

- [ ] **Step 2: Approve endpoint (dispatches via the shared helper)**

`server/api/agency/social/inbox/response-queue/[id]/approve.post.ts`:
```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'
import { dispatchReply } from '~~/server/utils/socialInbox/dispatch'

/**
 * POST /api/agency/social/inbox/response-queue/:id/approve  body { content? }
 * Human approves a pending automation draft → send it. A human approval is an explicit
 * action (like manual reply) so it is NOT behind the autopilot master gate. Optional edited content.
 */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const body = await readBody(event).catch(() => ({}))

  const row = await queryOne<any>(
    `SELECT * FROM social_response_queue WHERE id = $1`, [id])
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (row.status !== 'pending' && row.status !== 'approved')
    throw createError({ statusCode: 409, statusMessage: `cannot approve a ${row.status} item` })

  const content = String(body?.content ?? row.draft_content).trim()
  if (!content) throw createError({ statusCode: 400, statusMessage: 'empty content' })

  const res = await dispatchReply({ queryOne, execute }, row.conversation_id, {
    content, sentByUserId: String(user.id), aiGenerated: true,
  })
  await execute(
    `UPDATE social_response_queue SET status = $2, approved_by = $3, approved_at = NOW(),
       draft_content = $4, error = $5, updated_at = NOW() WHERE id = $1`,
    [id, res.ok ? 'sent' : 'failed', String(user.id), content, res.ok ? null : (res.error ?? 'send failed')])
  await execute(
    `UPDATE social_conversations SET automation_state = NULL, updated_at = NOW() WHERE id = $1`, [row.conversation_id])
  if (!res.ok) throw createError({ statusCode: 502, statusMessage: res.error || 'send failed' })
  return { ok: true, platformMessageId: res.platformMessageId }
})
```

- [ ] **Step 3: Reject endpoint**

`server/api/agency/social/inbox/response-queue/[id]/reject.post.ts`:
```ts
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'

/** POST /api/agency/social/inbox/response-queue/:id/reject */
export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const id = getRouterParam(event, 'id')!
  const row = await queryOne<any>(`SELECT conversation_id, status FROM social_response_queue WHERE id = $1`, [id])
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  if (row.status !== 'pending') throw createError({ statusCode: 409, statusMessage: `cannot reject a ${row.status} item` })
  await execute(
    `UPDATE social_response_queue SET status = 'rejected', approved_by = $2, approved_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [id, String(user.id)])
  await execute(`UPDATE social_conversations SET automation_state = NULL, updated_at = NOW() WHERE id = $1`, [row.conversation_id])
  return { ok: true }
})
```

- [ ] **Step 4: Verify suite green**

Run: `pnpm exec vitest run test/social/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/api/agency/social/inbox/response-queue/
git commit -m "feat(social-inbox): response-queue API — list, approve (dispatch), reject"
```

---

## Task 13: Composer "AI draft" button

**Files:**
- Modify: `app/components/social-inbox/Composer.vue`

**Pre-req:** This touches a form. Per CLAUDE.md, invoke the `frontend-design` skill before editing, and keep `UFormField`/Nuxt UI conventions.

- [ ] **Step 1: Read the current composer**

Run: `cat app/components/social-inbox/Composer.vue`
Note the existing `props` (it receives the conversation id), the textarea `v-model`, and the emit used to send. Match those names in the next step.

- [ ] **Step 2: Add the AI-draft action**

In `<script setup>`, add (use the conversation id prop name the file already defines — shown here as `props.conversationId`):
```ts
const aiDrafting = ref(false)
const toast = useToast()
async function aiDraft() {
  if (!props.conversationId) return
  aiDrafting.value = true
  try {
    const res = await $fetch<{ reply: string; confidence: number; risk: boolean }>(
      `/api/agency/social/inbox/conversations/${props.conversationId}/ai-draft`, { method: 'POST', body: {} })
    if (!res.reply) {
      toast.add({ title: 'No draft', description: 'The model needs a human for this one.', color: 'warning' })
    } else {
      draft.value = res.reply // `draft` = the existing textarea v-model ref; rename to match the file
      if (res.risk || res.confidence < 0.6) {
        toast.add({ title: 'Review carefully', description: `Low confidence (${Math.round(res.confidence * 100)}%) — edit before sending.`, color: 'warning' })
      }
    }
  } catch (e: any) {
    toast.add({ title: 'AI draft failed', description: e?.statusMessage || 'Try again', color: 'error' })
  } finally {
    aiDrafting.value = false
  }
}
```

In the template, add a ghost button next to the existing Send button:
```vue
<UButton
  icon="i-lucide-sparkles"
  color="neutral"
  variant="ghost"
  :loading="aiDrafting"
  :disabled="aiDrafting"
  label="AI draft"
  @click="aiDraft"
/>
```

- [ ] **Step 3: Smoke-check it compiles**

Run: `pnpm exec nuxt prepare`
Expected: completes with "Types generated in .nuxt" (the pre-existing `parseCsv` duplicate-import WARN is unrelated and fine).

- [ ] **Step 4: Commit**

```bash
git add app/components/social-inbox/Composer.vue
git commit -m "feat(social-inbox): AI draft button in the reply composer"
```

---

## Task 14: Automation rules management page

**Files:**
- Create: `app/pages/agency/social/inbox/automation.vue`

**Pre-req:** Form-touching — invoke `frontend-design` skill first; use `UFormField` for every field, `USelectMenu`/`USelect` (never raw `<select>`), `UModal` for the editor.

- [ ] **Step 1: Read a sibling page for the layout/client-picker pattern**

Run: `sed -n '1,60p' app/pages/agency/social/inbox/index.vue`
Reuse its `definePageMeta`, client selection, and page-shell structure so this page matches.

- [ ] **Step 2: Write the page**

`app/pages/agency/social/inbox/automation.vue`:
```vue
<script setup lang="ts">
import type { SocialAutomationRule } from '~/types'

definePageMeta({ layout: 'agency', middleware: 'auth' })

const route = useRoute()
const clientId = computed(() => (route.query.clientId as string) || '')

const { data: rules, refresh, pending } = await useFetch<SocialAutomationRule[]>(
  '/api/agency/social/inbox/automation-rules',
  { query: { clientId }, default: () => [], watch: [clientId] },
)

const toast = useToast()
const editorOpen = ref(false)
const editing = ref<Partial<SocialAutomationRule> | null>(null)

const MODES = [
  { value: 'off', label: 'Off — manual only' },
  { value: 'suggest', label: 'Suggest — AI drafts, human sends' },
  { value: 'approval', label: 'Approval — AI drafts, human approves' },
  { value: 'autopilot', label: 'Autopilot — AI sends (guardrailed)' },
]
const PLATFORMS = [
  { value: '__all__', label: 'All platforms' },
  { value: 'facebook', label: 'Facebook' }, { value: 'instagram', label: 'Instagram' },
  { value: 'linkedin', label: 'LinkedIn' }, { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' }, { value: 'google-business', label: 'Google Business' },
]
const CHANNELS = [
  { value: '__all__', label: 'All channels' },
  { value: 'comment', label: 'Comments' }, { value: 'review', label: 'Reviews' },
]
const APPROVERS = [
  { value: 'staff', label: 'Staff' }, { value: 'client', label: 'Client (portal)' }, { value: 'none', label: 'No one (auto)' },
]

function newRule() {
  editing.value = {
    client_id: clientId.value, name: '', platform: null, channel_type: null, mode: 'suggest',
    conditions: {}, action: {}, approval_by: 'staff', rate_limit: 0, confidence_floor: 0.7,
    business_hours: null, priority: 100, enabled: true,
  }
  editorOpen.value = true
}
function editRule(r: SocialAutomationRule) { editing.value = JSON.parse(JSON.stringify(r)); editorOpen.value = true }

async function save() {
  const e = editing.value!
  if (!e.name?.trim()) { toast.add({ title: 'Name required', color: 'error' }); return }
  const payload = {
    ...e,
    platform: e.platform === '__all__' ? null : e.platform,
    channel_type: e.channel_type === '__all__' ? null : e.channel_type,
  }
  try {
    if (e.id) await $fetch(`/api/agency/social/inbox/automation-rules/${e.id}`, { method: 'PATCH', body: payload })
    else await $fetch('/api/agency/social/inbox/automation-rules', { method: 'POST', body: payload })
    editorOpen.value = false
    await refresh()
    toast.add({ title: 'Saved', color: 'success' })
  } catch (err: any) {
    toast.add({ title: 'Save failed', description: err?.statusMessage, color: 'error' })
  }
}
async function toggleEnabled(r: SocialAutomationRule) {
  await $fetch(`/api/agency/social/inbox/automation-rules/${r.id}`, { method: 'PATCH', body: { enabled: !r.enabled } })
  await refresh()
}
async function remove(r: SocialAutomationRule) {
  await $fetch(`/api/agency/social/inbox/automation-rules/${r.id}`, { method: 'DELETE' })
  await refresh()
}
const modeColor = (m: string) => ({ off: 'neutral', suggest: 'info', approval: 'warning', autopilot: 'success' }[m] || 'neutral')
</script>

<template>
  <div class="p-6 space-y-6">
    <div class="flex items-center justify-between">
      <div>
        <h1 class="text-xl font-semibold">Reply Automation</h1>
        <p class="text-sm text-muted">AI-assisted replies for comments and reviews. Autopilot stays dormant until enabled by an operator.</p>
      </div>
      <UButton icon="i-lucide-plus" label="New rule" :disabled="!clientId" @click="newRule" />
    </div>

    <UAlert v-if="!clientId" color="warning" variant="subtle" title="Select a client"
      description="Choose a client from the inbox to manage its automation rules." icon="i-lucide-info" />

    <div v-else-if="pending" class="text-sm text-muted">Loading…</div>

    <div v-else-if="!rules.length" class="rounded-lg border border-dashed border-default p-10 text-center text-muted">
      No automation rules yet. Create one to start drafting AI replies.
    </div>

    <div v-else class="space-y-3">
      <UCard v-for="r in rules" :key="r.id">
        <div class="flex items-start justify-between gap-4">
          <div class="space-y-1">
            <div class="flex items-center gap-2">
              <span class="font-medium">{{ r.name }}</span>
              <UBadge :color="modeColor(r.mode)" variant="subtle" size="sm">{{ r.mode }}</UBadge>
              <UBadge v-if="!r.enabled" color="neutral" variant="subtle" size="sm">disabled</UBadge>
            </div>
            <p class="text-xs text-muted">
              {{ r.platform || 'all platforms' }} · {{ r.channel_type || 'all channels' }} ·
              priority {{ r.priority }} · approve via {{ r.approval_by }}
              <template v-if="r.mode === 'autopilot'"> · floor {{ r.confidence_floor }} · limit {{ r.rate_limit || '∞' }}/h</template>
            </p>
          </div>
          <div class="flex items-center gap-1">
            <UButton size="sm" variant="ghost" :icon="r.enabled ? 'i-lucide-pause' : 'i-lucide-play'" @click="toggleEnabled(r)" />
            <UButton size="sm" variant="ghost" icon="i-lucide-pencil" @click="editRule(r)" />
            <UButton size="sm" variant="ghost" color="error" icon="i-lucide-trash-2" @click="remove(r)" />
          </div>
        </div>
      </UCard>
    </div>

    <UModal v-model:open="editorOpen">
      <template #content>
        <div v-if="editing" class="p-6 space-y-4">
          <h2 class="text-lg font-semibold">{{ editing.id ? 'Edit rule' : 'New rule' }}</h2>
          <UFormField label="Name">
            <UInput v-model="editing.name" placeholder="e.g. Thank 5-star reviews" />
          </UFormField>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Platform">
              <USelect v-model="editing.platform" :items="PLATFORMS" value-key="value" />
            </UFormField>
            <UFormField label="Channel">
              <USelect v-model="editing.channel_type" :items="CHANNELS" value-key="value" />
            </UFormField>
          </div>
          <UFormField label="Mode">
            <USelect v-model="editing.mode" :items="MODES" value-key="value" />
          </UFormField>
          <UFormField label="AI instructions (brand voice)" help="Guides the drafted reply. No prices/dates will be invented.">
            <UTextarea v-model="editing.action!.aiPrompt" :rows="3" placeholder="Warm, concise, Aussie tone. Sign off as the team." />
          </UFormField>
          <div v-if="editing.mode === 'approval'">
            <UFormField label="Who approves">
              <USelect v-model="editing.approval_by" :items="APPROVERS" value-key="value" />
            </UFormField>
          </div>
          <div v-if="editing.mode === 'autopilot'" class="grid grid-cols-2 gap-4">
            <UFormField label="Confidence floor" help="0–1. Below this, sends to approval.">
              <UInput v-model.number="editing.confidence_floor" type="number" step="0.05" min="0" max="1" />
            </UFormField>
            <UFormField label="Rate limit / hour" help="0 = unlimited">
              <UInput v-model.number="editing.rate_limit" type="number" min="0" />
            </UFormField>
          </div>
          <div class="grid grid-cols-2 gap-4">
            <UFormField label="Priority" help="Lower runs first">
              <UInput v-model.number="editing.priority" type="number" min="1" />
            </UFormField>
            <UFormField label="Enabled">
              <UCheckbox v-model="editing.enabled" label="Active" />
            </UFormField>
          </div>
          <div class="flex justify-end gap-2 pt-2">
            <UButton color="neutral" variant="ghost" label="Cancel" @click="editorOpen = false" />
            <UButton label="Save rule" @click="save" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
```

- [ ] **Step 3: Normalise null → sentinel for the selects on load**

Because `USelect` can't bind `null`, after the page sets `editing`, map `null` platform/channel to `'__all__'`. Add to `editRule` and `newRule` right before opening:
```ts
editing.value!.platform = (editing.value!.platform ?? '__all__') as any
editing.value!.channel_type = (editing.value!.channel_type ?? '__all__') as any
editing.value!.action = editing.value!.action ?? {}
```
(The `save()` function already maps `'__all__'` back to `null`.)

- [ ] **Step 4: Compile check**

Run: `pnpm exec nuxt prepare`
Expected: "Types generated in .nuxt".

- [ ] **Step 5: Commit**

```bash
git add app/pages/agency/social/inbox/automation.vue
git commit -m "feat(social-inbox): automation rules management page"
```

---

## Task 15: Approvals (reply queue) page

**Files:**
- Create: `app/pages/agency/social/inbox/approvals.vue`

- [ ] **Step 1: Write the page**

`app/pages/agency/social/inbox/approvals.vue`:
```vue
<script setup lang="ts">
import type { SocialResponseQueueItem } from '~/types'

definePageMeta({ layout: 'agency', middleware: 'auth' })

const route = useRoute()
const clientId = computed(() => (route.query.clientId as string) || '')

const { data: items, refresh, pending } = await useFetch<SocialResponseQueueItem[]>(
  '/api/agency/social/inbox/response-queue',
  { query: { clientId, status: 'pending' }, default: () => [], watch: [clientId] },
)

const toast = useToast()
const edits = reactive<Record<string, string>>({})
const busy = ref<string | null>(null)

function bodyFor(it: SocialResponseQueueItem) { return edits[it.id] ?? it.draft_content }

async function approve(it: SocialResponseQueueItem) {
  busy.value = it.id
  try {
    await $fetch(`/api/agency/social/inbox/response-queue/${it.id}/approve`, { method: 'POST', body: { content: bodyFor(it) } })
    toast.add({ title: 'Sent', color: 'success' })
    await refresh()
  } catch (e: any) {
    toast.add({ title: 'Send failed', description: e?.statusMessage, color: 'error' })
  } finally { busy.value = null }
}
async function reject(it: SocialResponseQueueItem) {
  busy.value = it.id
  try {
    await $fetch(`/api/agency/social/inbox/response-queue/${it.id}/reject`, { method: 'POST' })
    await refresh()
  } finally { busy.value = null }
}
</script>

<template>
  <div class="p-6 space-y-6">
    <div>
      <h1 class="text-xl font-semibold">Reply Queue</h1>
      <p class="text-sm text-muted">AI-drafted replies awaiting your approval. Edit before sending if needed.</p>
    </div>

    <UAlert v-if="!clientId" color="warning" variant="subtle" title="Select a client"
      description="Choose a client from the inbox to review its pending replies." icon="i-lucide-info" />
    <div v-else-if="pending" class="text-sm text-muted">Loading…</div>
    <div v-else-if="!items.length" class="rounded-lg border border-dashed border-default p-10 text-center text-muted">
      Nothing waiting. AI drafts in approval mode will appear here.
    </div>

    <div v-else class="space-y-4">
      <UCard v-for="it in items" :key="it.id">
        <div class="space-y-3">
          <div class="flex items-center justify-between gap-2">
            <div class="flex items-center gap-2 text-sm">
              <UBadge variant="subtle" size="sm">{{ it.platform }}</UBadge>
              <UBadge variant="subtle" color="neutral" size="sm">{{ it.channel_type }}</UBadge>
              <span class="text-muted">{{ it.participant_name || 'Customer' }}</span>
              <UBadge v-if="it.confidence != null" :color="it.confidence >= 0.7 ? 'success' : 'warning'" variant="subtle" size="sm">
                {{ Math.round((it.confidence || 0) * 100) }}% conf
              </UBadge>
            </div>
            <ULink v-if="it.permalink" :to="it.permalink" target="_blank" class="text-xs text-primary">View on platform ↗</ULink>
          </div>
          <p v-if="it.inbound_preview" class="text-sm text-muted border-l-2 border-default pl-3">"{{ it.inbound_preview }}"</p>
          <p v-if="it.guardrail_notes" class="text-xs text-warning">⚠ {{ it.guardrail_notes }}</p>
          <UTextarea v-model="edits[it.id]" :rows="3" :placeholder="it.draft_content"
            :default-value="it.draft_content" class="w-full" />
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" label="Reject" :loading="busy === it.id" @click="reject(it)" />
            <UButton label="Approve & send" icon="i-lucide-send" :loading="busy === it.id" @click="approve(it)" />
          </div>
        </div>
      </UCard>
    </div>
  </div>
</template>
```

- [ ] **Step 2: Seed the editable textarea with the draft**

So `edits[it.id]` starts populated (the textarea binds `v-model="edits[it.id]"`), initialise on load:
```ts
watch(items, (list) => {
  for (const it of list) if (!(it.id in edits)) edits[it.id] = it.draft_content
}, { immediate: true })
```
Add this right after the `edits` declaration.

- [ ] **Step 3: Compile check**

Run: `pnpm exec nuxt prepare`
Expected: "Types generated in .nuxt".

- [ ] **Step 4: Commit**

```bash
git add app/pages/agency/social/inbox/approvals.vue
git commit -m "feat(social-inbox): reply approval queue page"
```

---

## Task 16: Navigation entries

**Files:**
- Modify: `app/layouts/agency.vue` (the "Social Publishing" group, ~line 244-250)

- [ ] **Step 1: Add Automation + Reply Queue nav items**

In the Social Publishing group array, after the existing `Reviews` entry (`to: '/agency/social/inbox/reviews'`), insert:
```ts
      { label: 'Automation', icon: 'i-lucide-bot', to: '/agency/social/inbox/automation', onSelect: close },
      { label: 'Reply Queue', icon: 'i-lucide-clipboard-check', to: '/agency/social/inbox/approvals', onSelect: close },
```
(Named "Reply Queue" — distinct from the existing publishing "Approvals" which is for post approvals.)

- [ ] **Step 2: Compile check**

Run: `pnpm exec nuxt prepare`
Expected: "Types generated in .nuxt".

- [ ] **Step 3: Commit**

```bash
git add app/layouts/agency.vue
git commit -m "feat(social-inbox): nav entries for Automation + Reply Queue"
```

---

## Task 17: Marketing page sync

**Files:**
- Modify: `app/pages/features/index.vue`
- Modify: `app/pages/features/[slug].vue`
- Modify: `app/components/MarketingNav.vue`

- [ ] **Step 1: Add a nav entry in `MarketingNav.vue`**

In the `featuresCol3b` array (the Social/Creative column — where `Engagement Inbox` already lives), after the `Engagement Inbox` entry add:
```ts
  { title: 'Reply Automation', subtitle: 'AI-assisted replies with approval guardrails', icon: 'i-lucide-bot', iconBg: 'bg-rose-500/15', iconColor: 'text-rose-400', to: '/features/social-automation' },
```

- [ ] **Step 2: Add the feature card in `features/index.vue`**

Run: `grep -n "social-inbox\|Engagement Inbox" app/pages/features/index.vue`
Add a sibling entry next to the engagement-inbox card, matching that file's object shape exactly:
```ts
  { title: 'Reply Automation', description: 'AI drafts replies to comments and reviews — suggest, approve, or autopilot, with hard safety guardrails.', icon: 'i-lucide-bot', to: '/features/social-automation' },
```
(Copy the precise key names from the neighbouring entry — if the file uses `slug`/`href` instead of `to`, match that.)

- [ ] **Step 3: Add the detail entry in `features/[slug].vue`**

In the feature map, after the `'social-reviews'` entry, add:
```ts
  'social-automation': {
    title: 'Reply Automation',
    slug: 'social-automation',
    icon: 'i-lucide-bot',
    category: 'Social Publishing',
    categoryIcon: 'i-lucide-share-2',
    categoryIconBg: 'bg-sky-50',
    categoryIconColor: 'text-sky-600',
    description: 'Let AI draft on-brand replies to comments and reviews — suggested for one-click sending, queued for human approval, or sent automatically under strict guardrails.',
    details: [
      {
        title: 'Four Modes, One Engine',
        content: 'Every automation rule runs in one of four modes: off (manual), suggest (AI drafts, your team sends), approval (AI drafts, a human or the client signs off), or autopilot (sent automatically). Pick the level of control per client, per network, and per channel — comments and reviews each get their own rules.'
      },
      {
        title: 'Guardrails You Can Trust',
        content: 'Autopilot never fires blind. A deterministic safety rule forces any complaint, legal threat, or sensitive message to a human — always. On top of that: a confidence floor, per-rule hourly rate limits, business-hours gating, and exactly-one-reply-per-message idempotency. Every action is written to an auditable queue, and a global kill-switch keeps automation dormant until you turn it on.'
      },
      {
        title: 'On-Brand, Never Invented',
        content: 'Drafts come from your brand voice instructions and the full conversation context, and the model is told never to invent prices, dates, or facts. Low-confidence drafts route to a human automatically, so what goes out always reads like your team wrote it.'
      },
      {
        title: 'Client Approval On The Roadmap',
        content: 'Approval rules can route to the client portal, letting clients sign off on their own replies — building on the same audited queue and guardrails that power staff approvals.'
      }
    ]
  },
```

- [ ] **Step 4: Compile + verify all three render**

Run: `pnpm exec nuxt prepare`
Expected: "Types generated in .nuxt", no Vue parse errors.

- [ ] **Step 5: Commit**

```bash
git add app/pages/features/index.vue 'app/pages/features/[slug].vue' app/components/MarketingNav.vue
git commit -m "docs(social): marketing sync — Reply Automation feature pages + nav"
```

---

## Task 18: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full social test suite green**

Run: `pnpm exec vitest run test/social/`
Expected: PASS — 2a suites (inboxStore +1 new assertion, inboxNormalize, inboxProviders, metaWebhook) + 2b suites (guardrails, aiDraft, automationGate, automationEngine, dispatch). Count should be the 2a baseline + the new tests.

- [ ] **Step 2: No NEW type errors**

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | tail -40`
Expected: only the ~60 pre-existing `index.d.ts` errors documented in CLAUDE.md. **Any error referencing a Phase 2b file (`socialInbox/automation*`, `guardrails`, `aiDraft`, `dispatch`, the new pages/endpoints, or the new `app/types` interfaces) is a regression to fix before proceeding.** (A silent OOM at default heap yields a false pass — the large heap flag is mandatory.)

- [ ] **Step 3: Confirm the engine is fully dormant by default**

Run:
```bash
grep -rn "SOCIAL_AUTOMATION_ENABLED" server/ ; echo '---' ; printenv SOCIAL_AUTOMATION_ENABLED || echo 'env unset (correct)'
```
Expected: the gate is referenced only in `automationGate.ts` and read in the cron; the env var is unset. **Do not set it.**

- [ ] **Step 4: Confirm no automatic deploy / cron enablement happened**

Run: `git log --oneline origin/main..HEAD`
Expected: only the Phase 2b feature commits. No wrangler/deploy/cron-trigger changes. Deploy + enabling the cron + flipping the gate are operator steps documented in the handoff, not done here.

- [ ] **Step 5: Stage handoff note (optional, for the PR body)**

The PR description should state: ships dormant; to activate, the operator must (a) deploy, (b) ensure `social-inbox-cron` Worker + `CRON_SECRET` are live (from 2a), (c) connect accounts via OAuth (D2), (d) set `SOCIAL_AUTOMATION_ENABLED=true`. Until then the engine drafts/sends nothing.

---

## Self-Review (completed against the spec §6 + §10 + §11 + §12)

- **§6 four modes** → Task 6 (`resolveEffectiveMode`/`runAutomationForConversation`), Task 10 (suggest), Task 11 (rule mode field). ✓
- **§6 guardrails** (rate limit, confidence floor, HARD negative-sentiment→human, business-hours, idempotency, audit) → Task 3 (`detectReplyRisk`, `isWithinBusinessHours`), Task 6 (`resolveEffectiveMode` applies all; `runAutomationForConversation` enforces one-row-per-message idempotency + writes every action to `social_response_queue`). ✓
- **§6 `SOCIAL_AUTOMATION_ENABLED` global gate** → Task 5 + Task 9 (cron gated). ✓
- **§6 execution never inline at ingestion; cron tick runs engine** → Task 8 (ingestion only flags pending) + Task 9 (cron processes). ✓
- **§6 send uses provider `reply()`** → Task 7 (`dispatchReply`). ✓
- **§10 surface**: `automation.vue` (Task 14), `approvals.vue` (Task 15), composer "AI draft" (Task 13), nav (Task 16), API `ai-draft`/`automation-rules`/`response-queue` (Tasks 10–12). ✓
- **§11 security**: `requireAuth` on every endpoint; client-scoped queries; no user-supplied URLs (provider hosts only, inherited from 2a `reply()`); `~~/` server imports. ✓ *(Note: spec mentions a "Creative permission" gate — 2a used bare `requireAuth`; this plan matches 2a for consistency. If a Creative `requireRole` is desired, it's a one-line follow-up across these endpoints.)*
- **§12 testing**: unit guardrails (explicit negative-sentiment→human tests in Task 3 + Task 6), rule matching, idempotency, mode resolution; dispatch target resolution. ✓ *(Integration webhook→queue→send is exercised via the fakes in Task 6; a live DB integration test is deferred — flagged here as the one coverage gap vs. an ideal.)*
- **Out of scope (correctly excluded):** saved replies, SLA, assignment, analytics (2c); DMs/mentions/portal/real-time (2d). The migration's `approval_by='client'` is stored but the client-portal approve surface is 2d.

**Placeholder scan:** none — every code step contains full code. **Type consistency:** `EngineDb`/`EngineDeps`/`AutomationContext`/`ReplyDraft`/`ModeDecision`/`resolveReplyTarget`/`dispatchReply`/`runAutomationForConversation`/`processPendingAutomation` names are used identically across Tasks 2, 6, 7, 9.

---

## Execution Handoff

Plan complete. Recommended: **subagent-driven execution** (fresh subagent per task, two-stage review between tasks) — mirrors how Phase 2a was built and reviewed.

⚠️ **Standing safety constraint for the executor:** never set `SOCIAL_AUTOMATION_ENABLED=true`, never enable/deploy the cron, never trigger a live `provider.reply()` send. The phase ships dormant.
