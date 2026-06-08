# Voice Admin AI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a hands-free, real-time voice mode to `/agency/ai/chat` that runs the live Groq tool-calling agent — continuous open-mic turns, barge-in, and spoken confirmation of write actions — reusing the existing voice + agent plumbing.

**Architecture:** Engine "A" (continuous turn loop). All decision logic lives in three **pure, unit-tested** units (confirm-utterance classifier, barge-in detector, session state machine). A thin browser composable (`useVoiceSession`) wires those to the existing `useVoiceChat` primitives and the live endpoints. One small new server endpoint (`/speak`) voices the result of a spoken confirm. A presentational `VoiceModePanel` shows session state. No database migration.

**Tech Stack:** Nuxt 4 / Vue 3 `<script setup>`, Nitro (Cloudflare Pages), Workers AI (Whisper STT + MeloTTS TTS), Vercel AI SDK v6 + Groq (already wired), Vitest + happy-dom.

---

## Setup (do once before Task 1)

This worktree (`feat/voice-admin-ai`, off `origin/main`) is fresh. Install deps and prepare Nuxt types so Vitest and `nuxt typecheck` resolve the `~~/` and `~/` aliases:

```bash
cd /Users/paulgiurin/Documents/Projects/dashboard/.worktrees/voice-admin-ai
pnpm install
pnpm exec nuxt prepare
```

- **Run a single test file:** `pnpm test:run <path>` (alias for `vitest run`).
- **Run all tests:** `pnpm test:run`
- **Typecheck:** `pnpm typecheck` — ⚠️ the repo has ~60 PRE-EXISTING TS errors (types only in `index.d.ts`). Only assert that you introduced **no new** errors.
- **Commit cadence:** one commit per task (after its tests pass). Co-author trailer:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

### What already exists (reuse — do NOT rebuild)
- `server/utils/aiVoice.ts` — `speechToText`, `textToSpeech(event, text, { lang })` → `{ audioBuffer, format } | null`.
- `app/composables/useVoiceChat.ts` — returns `{ isAvailable, isRecording, isProcessing, isPlaying, volumeLevel, error, startRecording, stopRecording, cancelRecording, sendVoiceMessage, playAudio, stopAudio }`. `sendVoiceMessage(convId, blob, entities?)` → `{ message, contextSources, transcribedText, audioBase64, audioFormat, sttLatencyMs, proposedAction }`.
- `POST /api/agency/ai/chat/conversations/[id]/voice` — STT → agent (`processUserMessage`) → TTS; returns `proposedAction` when the agent proposes a write.
- `POST /api/agency/ai/chat/conversations/[id]/confirm-action` — body `{ proposalId }` → executes; returns `{ ok, taskId, error? }`.
- `app/components/ai/AiProposedActionCard.vue` — the confirm card (tap path); renders when a message has `.proposedAction`.
- `app/pages/agency/ai/chat.vue` — chat page; gates persona picker on `useRuntimeConfig().public.aiToolsEnabled`; renders the card at the message level.

---

## File Structure

**New (pure, tested):**
- `app/utils/voiceConfirm.ts` — classify a confirm utterance → `affirmative|negative|stop|ambiguous`.
- `app/utils/voiceBargeIn.ts` — stateful-but-pure sustain detector for barge-in.
- `app/utils/voiceSessionMachine.ts` — pure reducer for the session lifecycle.

**New (server, tested):**
- `server/api/agency/ai/chat/speak.post.ts` — TTS endpoint for spoken confirm results.

**New (UI):**
- `app/components/ai/VoiceModePanel.vue` — presentational session-status strip (tested via SSR render).
- `app/composables/useVoiceSession.ts` — browser orchestrator (manual UAT; no unit test).

**Modified:**
- `app/pages/agency/ai/chat.vue` — voice-mode toggle (gated by `aiToolsEnabled`) + wire `useVoiceSession`.
- `app/pages/voice-ai.vue` + `app/pages/features/index.vue` + `app/pages/features/[slug].vue` — marketing sync.

**Tests:** `test/utils/voiceConfirm.test.ts`, `test/utils/voiceBargeIn.test.ts`, `test/utils/voiceSessionMachine.test.ts`, `test/server/api/aiChatSpeak.test.ts`, `test/components/voiceModePanel.test.ts`.

---

## Task 1: Confirm-utterance classifier (`voiceConfirm.ts`)

**Files:**
- Create: `app/utils/voiceConfirm.ts`
- Test: `test/utils/voiceConfirm.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/utils/voiceConfirm.test.ts
import { describe, expect, it } from 'vitest'
import { classifyConfirmUtterance } from '~~/app/utils/voiceConfirm'

describe('classifyConfirmUtterance', () => {
  it('detects affirmatives', () => {
    for (const s of ['confirm', 'Yes', 'yes please', 'go ahead', 'do it', 'proceed', 'yep, do it']) {
      expect(classifyConfirmUtterance(s)).toBe('affirmative')
    }
  })
  it('detects negatives', () => {
    for (const s of ['cancel', 'No', 'nope', "don't do that", 'never mind', 'abort', 'stop']) {
      expect(classifyConfirmUtterance(s)).toBe('negative')
    }
  })
  it('detects session-stop phrases', () => {
    for (const s of ['stop listening', 'goodbye', 'end session', 'exit voice']) {
      expect(classifyConfirmUtterance(s)).toBe('stop')
    }
  })
  it('treats anything else (or empty) as ambiguous', () => {
    for (const s of ['', '   ', "what's the weather", 'create another task', 'maybe later']) {
      expect(classifyConfirmUtterance(s)).toBe('ambiguous')
    }
  })
  it('uses word boundaries (no false positives inside words)', () => {
    expect(classifyConfirmUtterance('snowfall is heavy')).toBe('ambiguous') // not "no"
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run test/utils/voiceConfirm.test.ts`
Expected: FAIL — cannot resolve `~~/app/utils/voiceConfirm`.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/utils/voiceConfirm.ts
/**
 * Classify a transcribed confirmation utterance in voice mode. Only an explicit affirmative
 * executes a guarded write; everything ambiguous is treated as "not confirmed" (safe default).
 */
export type ConfirmIntent = 'affirmative' | 'negative' | 'stop' | 'ambiguous'

// Multi-word session-stop phrases are checked FIRST (so "stop listening" is a stop, not a negative).
const STOP_PHRASES = ['stop listening', 'stop voice', 'end session', 'exit voice', 'goodbye']
const AFFIRMATIVE = [
  'confirm', 'confirmed', 'yes', 'yep', 'yeah', 'yup', 'do it', 'go ahead',
  'proceed', 'approve', 'approved', 'please do', 'sounds good',
]
const NEGATIVE = [
  'cancel', 'no', 'nope', 'nah', "don't", 'do not', 'abort',
  'never mind', 'nevermind', 'stop', 'forget it', 'discard',
]

function normalize(raw: string): string {
  return raw.toLowerCase().replace(/[.!?,]/g, ' ').replace(/\s+/g, ' ').trim()
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** word-boundary containment so "no" doesn't match "snow" but "yes please" matches "yes". */
function hasPhrase(text: string, phrase: string): boolean {
  if (text === phrase) return true
  return new RegExp(`(^|\\s)${escapeRegex(phrase)}(\\s|$)`).test(text)
}

export function classifyConfirmUtterance(raw: string): ConfirmIntent {
  const t = normalize(raw)
  if (!t) return 'ambiguous'
  if (STOP_PHRASES.some(p => t === p || t.includes(p))) return 'stop'
  if (AFFIRMATIVE.some(p => hasPhrase(t, p))) return 'affirmative'
  if (NEGATIVE.some(p => hasPhrase(t, p))) return 'negative'
  return 'ambiguous'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run test/utils/voiceConfirm.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add app/utils/voiceConfirm.ts test/utils/voiceConfirm.test.ts
git commit -m "feat(voice): pure confirm-utterance classifier

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Barge-in detector (`voiceBargeIn.ts`)

**Files:**
- Create: `app/utils/voiceBargeIn.ts`
- Test: `test/utils/voiceBargeIn.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/utils/voiceBargeIn.test.ts
import { describe, expect, it } from 'vitest'
import { createBargeInDetector } from '~~/app/utils/voiceBargeIn'

describe('createBargeInDetector', () => {
  it('stays false below the threshold', () => {
    const d = createBargeInDetector({ threshold: 0.08, sustainMs: 300 })
    expect(d.sample(0.02, 0)).toBe(false)
    expect(d.sample(0.05, 1000)).toBe(false)
  })
  it('requires sustained speech above the threshold', () => {
    const d = createBargeInDetector({ threshold: 0.08, sustainMs: 300 })
    expect(d.sample(0.2, 0)).toBe(false)     // first frame above — starts the clock
    expect(d.sample(0.2, 200)).toBe(false)   // not long enough yet
    expect(d.sample(0.2, 300)).toBe(true)    // sustained >= 300ms -> barge-in
  })
  it('resets the clock when speech drops below threshold', () => {
    const d = createBargeInDetector({ threshold: 0.08, sustainMs: 300 })
    expect(d.sample(0.2, 0)).toBe(false)
    expect(d.sample(0.01, 100)).toBe(false)  // dropped — clock resets
    expect(d.sample(0.2, 200)).toBe(false)   // restart; 200-? not yet 300 from 200
    expect(d.sample(0.2, 500)).toBe(true)
  })
  it('reset() clears state', () => {
    const d = createBargeInDetector({ threshold: 0.08, sustainMs: 300 })
    d.sample(0.2, 0)
    d.reset()
    expect(d.sample(0.2, 100)).toBe(false) // clock restarted at 100
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run test/utils/voiceBargeIn.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/utils/voiceBargeIn.ts
/**
 * Detects when the user starts talking over the assistant's playback (barge-in). The threshold is
 * deliberately higher than the recording silence threshold (0.015) to reject residual echo that
 * leaks past the browser's echo cancellation. Pure: time is injected, no timers, fully testable.
 */
export interface BargeInDetector {
  /** Feed an RMS sample (0..1) at time `nowMs`. Returns true once speech is sustained >= sustainMs. */
  sample(rms: number, nowMs: number): boolean
  reset(): void
}

export function createBargeInDetector(opts: { threshold?: number, sustainMs?: number } = {}): BargeInDetector {
  const threshold = opts.threshold ?? 0.08
  const sustainMs = opts.sustainMs ?? 300
  let aboveSince: number | null = null
  return {
    sample(rms, nowMs) {
      if (rms >= threshold) {
        if (aboveSince === null) aboveSince = nowMs
        return nowMs - aboveSince >= sustainMs
      }
      aboveSince = null
      return false
    },
    reset() { aboveSince = null },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run test/utils/voiceBargeIn.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/utils/voiceBargeIn.ts test/utils/voiceBargeIn.test.ts
git commit -m "feat(voice): pure barge-in sustain detector

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Session state machine (`voiceSessionMachine.ts`)

**Files:**
- Create: `app/utils/voiceSessionMachine.ts`
- Test: `test/utils/voiceSessionMachine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/utils/voiceSessionMachine.test.ts
import { describe, expect, it } from 'vitest'
import {
  initialVoiceSession,
  voiceSessionReducer,
  type VoiceSessionState,
} from '~~/app/utils/voiceSessionMachine'

const at = (overrides: Partial<VoiceSessionState>): VoiceSessionState => ({ ...initialVoiceSession, ...overrides })

describe('voiceSessionReducer', () => {
  it('START enters listening; STOP returns to idle', () => {
    const s = voiceSessionReducer(initialVoiceSession, { type: 'START' })
    expect(s.phase).toBe('listening')
    expect(voiceSessionReducer(s, { type: 'STOP' }).phase).toBe('idle')
  })

  it('a read turn: listening -> processing -> speaking -> listening', () => {
    let s = at({ phase: 'listening' })
    s = voiceSessionReducer(s, { type: 'SPEECH_CAPTURED' })
    expect(s.phase).toBe('processing')
    s = voiceSessionReducer(s, { type: 'RESPONSE', proposalId: null })
    expect(s.phase).toBe('speaking')
    s = voiceSessionReducer(s, { type: 'PLAYBACK_DONE' })
    expect(s.phase).toBe('listening')
  })

  it('a write turn: a proposal moves speaking -> awaitingConfirm on playback end', () => {
    let s = at({ phase: 'processing' })
    s = voiceSessionReducer(s, { type: 'RESPONSE', proposalId: 'p1' })
    expect(s).toMatchObject({ phase: 'speaking', pendingProposalId: 'p1' })
    s = voiceSessionReducer(s, { type: 'PLAYBACK_DONE' })
    expect(s.phase).toBe('awaitingConfirm')
  })

  it('affirmative confirm -> confirming -> listening on CONFIRM_DONE', () => {
    let s = at({ phase: 'awaitingConfirm', pendingProposalId: 'p1' })
    s = voiceSessionReducer(s, { type: 'CONFIRM_INTENT', intent: 'affirmative' })
    expect(s.phase).toBe('confirming')
    s = voiceSessionReducer(s, { type: 'CONFIRM_DONE' })
    expect(s).toMatchObject({ phase: 'listening', pendingProposalId: null })
  })

  it('negative confirm cancels the proposal and re-arms listening', () => {
    const s = voiceSessionReducer(at({ phase: 'awaitingConfirm', pendingProposalId: 'p1' }), { type: 'CONFIRM_INTENT', intent: 'negative' })
    expect(s).toMatchObject({ phase: 'listening', pendingProposalId: null })
  })

  it('ambiguous re-prompts up to twice, then gives up (cancels)', () => {
    let s = at({ phase: 'awaitingConfirm', pendingProposalId: 'p1' })
    s = voiceSessionReducer(s, { type: 'CONFIRM_INTENT', intent: 'ambiguous' })
    expect(s).toMatchObject({ phase: 'awaitingConfirm', repromptCount: 1 })
    s = voiceSessionReducer(s, { type: 'CONFIRM_INTENT', intent: 'ambiguous' })
    expect(s).toMatchObject({ phase: 'awaitingConfirm', repromptCount: 2 })
    s = voiceSessionReducer(s, { type: 'CONFIRM_INTENT', intent: 'ambiguous' })
    expect(s).toMatchObject({ phase: 'listening', pendingProposalId: null })
  })

  it('stop intent during confirm ends the session', () => {
    const s = voiceSessionReducer(at({ phase: 'awaitingConfirm', pendingProposalId: 'p1' }), { type: 'CONFIRM_INTENT', intent: 'stop' })
    expect(s.phase).toBe('idle')
  })

  it('TIMEOUT while awaiting confirm cancels the proposal', () => {
    const s = voiceSessionReducer(at({ phase: 'awaitingConfirm', pendingProposalId: 'p1' }), { type: 'TIMEOUT' })
    expect(s).toMatchObject({ phase: 'listening', pendingProposalId: null })
  })

  it('BARGE_IN only interrupts while speaking', () => {
    expect(voiceSessionReducer(at({ phase: 'speaking', pendingProposalId: 'p1' }), { type: 'BARGE_IN' }))
      .toMatchObject({ phase: 'listening', pendingProposalId: null })
    expect(voiceSessionReducer(at({ phase: 'listening' }), { type: 'BARGE_IN' }).phase).toBe('listening')
  })

  it('ERROR surfaces a message and re-arms (or idles if already idle)', () => {
    expect(voiceSessionReducer(at({ phase: 'processing' }), { type: 'ERROR', message: 'boom' }))
      .toMatchObject({ phase: 'listening', error: 'boom', pendingProposalId: null })
    expect(voiceSessionReducer(initialVoiceSession, { type: 'ERROR', message: 'boom' }).phase).toBe('idle')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run test/utils/voiceSessionMachine.test.ts`
Expected: FAIL — cannot resolve module.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/utils/voiceSessionMachine.ts
import type { ConfirmIntent } from './voiceConfirm'

/** Lifecycle of one hands-free voice session. Pure reducer — the composable owns the side effects. */
export type VoicePhase =
  | 'idle'            // no session
  | 'listening'       // mic armed, capturing a turn (or a confirm utterance)
  | 'processing'      // turn sent to the agent, awaiting reply
  | 'speaking'        // playing the assistant's TTS reply
  | 'awaitingConfirm' // a write was proposed; waiting for a spoken confirm/cancel
  | 'confirming'      // executing the confirmed write

export interface VoiceSessionState {
  phase: VoicePhase
  pendingProposalId: string | null
  repromptCount: number
  error: string | null
}

export const initialVoiceSession: VoiceSessionState = {
  phase: 'idle',
  pendingProposalId: null,
  repromptCount: 0,
  error: null,
}

export type VoiceEvent =
  | { type: 'START' }
  | { type: 'STOP' }
  | { type: 'SPEECH_CAPTURED' }
  | { type: 'RESPONSE', proposalId: string | null }
  | { type: 'PLAYBACK_DONE' }
  | { type: 'BARGE_IN' }
  | { type: 'CONFIRM_INTENT', intent: ConfirmIntent }
  | { type: 'CONFIRM_DONE' }
  | { type: 'TIMEOUT' }
  | { type: 'ERROR', message: string }

const MAX_REPROMPTS = 2

export function voiceSessionReducer(s: VoiceSessionState, e: VoiceEvent): VoiceSessionState {
  switch (e.type) {
    case 'START':
      return { ...initialVoiceSession, phase: 'listening' }
    case 'STOP':
      return { ...initialVoiceSession, phase: 'idle' }
    case 'ERROR':
      return { ...s, error: e.message, pendingProposalId: null, phase: s.phase === 'idle' ? 'idle' : 'listening' }
    case 'BARGE_IN':
      return s.phase === 'speaking'
        ? { ...s, phase: 'listening', pendingProposalId: null, repromptCount: 0 }
        : s
    case 'SPEECH_CAPTURED':
      return s.phase === 'listening' ? { ...s, phase: 'processing', error: null } : s
    case 'RESPONSE':
      return s.phase === 'processing' ? { ...s, phase: 'speaking', pendingProposalId: e.proposalId } : s
    case 'PLAYBACK_DONE':
      if (s.phase !== 'speaking') return s
      return s.pendingProposalId
        ? { ...s, phase: 'awaitingConfirm', repromptCount: 0 }
        : { ...s, phase: 'listening' }
    case 'CONFIRM_INTENT':
      if (s.phase !== 'awaitingConfirm') return s
      switch (e.intent) {
        case 'affirmative':
          return { ...s, phase: 'confirming' }
        case 'negative':
          return { ...s, phase: 'listening', pendingProposalId: null, repromptCount: 0 }
        case 'stop':
          return { ...initialVoiceSession, phase: 'idle' }
        case 'ambiguous':
          return s.repromptCount >= MAX_REPROMPTS
            ? { ...s, phase: 'listening', pendingProposalId: null, repromptCount: 0 }
            : { ...s, repromptCount: s.repromptCount + 1 }
      }
      return s
    case 'CONFIRM_DONE':
      return s.phase === 'confirming'
        ? { ...s, phase: 'listening', pendingProposalId: null, repromptCount: 0 }
        : s
    case 'TIMEOUT':
      return s.phase === 'awaitingConfirm'
        ? { ...s, phase: 'listening', pendingProposalId: null, repromptCount: 0 }
        : s
    default:
      return s
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run test/utils/voiceSessionMachine.test.ts`
Expected: PASS (11 tests).

- [ ] **Step 5: Commit**

```bash
git add app/utils/voiceSessionMachine.ts test/utils/voiceSessionMachine.test.ts
git commit -m "feat(voice): pure session state machine (turns, barge-in, spoken confirm)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: TTS endpoint (`speak.post.ts`)

**Files:**
- Create: `server/api/agency/ai/chat/speak.post.ts`
- Test: `test/server/api/aiChatSpeak.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// test/server/api/aiChatSpeak.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

type TestEvent = { _body?: unknown, _status?: number }

const testGlobal = globalThis as typeof globalThis & {
  defineEventHandler: <T>(fn: T) => T
  readBody: (event: TestEvent) => unknown
  setResponseStatus: (event: TestEvent, code: number) => void
  createError: (opts: { statusCode: number, statusMessage: string }) => Error & { statusCode: number, statusMessage: string }
}

testGlobal.defineEventHandler = fn => fn
testGlobal.readBody = event => event._body
testGlobal.setResponseStatus = (event, code) => { event._status = code }
testGlobal.createError = (opts) => {
  const error = new Error(opts.statusMessage) as Error & { statusCode: number, statusMessage: string }
  error.statusCode = opts.statusCode
  error.statusMessage = opts.statusMessage
  return error
}

const mockRequireAuth = vi.fn()
const mockTextToSpeech = vi.fn()

vi.mock('~~/server/utils/auth', () => ({
  requireAuth: (...args: unknown[]) => mockRequireAuth(...args),
}))
vi.mock('~~/server/utils/aiVoice', () => ({
  textToSpeech: (...args: unknown[]) => mockTextToSpeech(...args),
}))

const { default: handler } = await import('../../../server/api/agency/ai/chat/speak.post')

function evt(body: unknown): TestEvent { return { _body: body } }

beforeEach(() => {
  mockRequireAuth.mockReset().mockResolvedValue({ id: 'u1', role: 'owner' })
  mockTextToSpeech.mockReset()
})

describe('POST /api/agency/ai/chat/speak', () => {
  it('returns base64 audio for valid text', async () => {
    mockTextToSpeech.mockResolvedValue({ audioBuffer: new Uint8Array([1, 2, 3]).buffer, format: 'wav' })
    const res = await handler(evt({ text: 'Done, created the task.' }) as any)
    expect(res).toEqual({ audioBase64: Buffer.from([1, 2, 3]).toString('base64'), audioFormat: 'wav' })
  })

  it('returns 204/null when TTS is unavailable', async () => {
    mockTextToSpeech.mockResolvedValue(null)
    const e = evt({ text: 'hi' })
    const res = await handler(e as any)
    expect(res).toBeNull()
    expect((e as TestEvent)._status).toBe(204)
  })

  it('rejects empty text with 400', async () => {
    await expect(handler(evt({ text: '   ' }) as any)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('rejects over-long text with 400', async () => {
    await expect(handler(evt({ text: 'x'.repeat(2001) }) as any)).rejects.toMatchObject({ statusCode: 400 })
  })

  it('requires auth', async () => {
    mockRequireAuth.mockRejectedValue(Object.assign(new Error('Unauthorized'), { statusCode: 401 }))
    await expect(handler(evt({ text: 'hi' }) as any)).rejects.toMatchObject({ statusCode: 401 })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run test/server/api/aiChatSpeak.test.ts`
Expected: FAIL — cannot resolve the handler module.

- [ ] **Step 3: Write minimal implementation**

```ts
// server/api/agency/ai/chat/speak.post.ts
import { requireAuth } from '~~/server/utils/auth'
import { textToSpeech } from '~~/server/utils/aiVoice'

/**
 * Synthesize speech for short, server-trusted strings the client wants spoken without a full
 * chat turn — primarily the result of a spoken write-confirmation in voice mode. Auth-gated;
 * no DB writes. Returns 204 (null) when the Workers AI binding is unavailable (local dev).
 */
const MAX_TEXT = 2000

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const body = await readBody(event)
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text) {
    throw createError({ statusCode: 400, statusMessage: 'Text required' })
  }
  if (text.length > MAX_TEXT) {
    throw createError({ statusCode: 400, statusMessage: 'Text too long' })
  }
  const lang = typeof body?.lang === 'string' ? body.lang : 'en'

  const result = await textToSpeech(event, text, { lang })
  if (!result) {
    setResponseStatus(event, 204)
    return null
  }

  return {
    audioBase64: Buffer.from(result.audioBuffer).toString('base64'),
    audioFormat: result.format,
  }
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run test/server/api/aiChatSpeak.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add server/api/agency/ai/chat/speak.post.ts test/server/api/aiChatSpeak.test.ts
git commit -m "feat(voice): /speak TTS endpoint for spoken confirm results

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Presentational session panel (`VoiceModePanel.vue`)

**Files:**
- Create: `app/components/ai/VoiceModePanel.vue`
- Test: `test/components/voiceModePanel.test.ts`

This is a pure presentational component: it shows the current phase, a live waveform from `volumeLevel`, an optional error, and a Stop button. All logic stays in `useVoiceSession` (Task 6).

- [ ] **Step 1: Write the failing test**

```ts
// test/components/voiceModePanel.test.ts
import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import VoiceModePanel from '~~/app/components/ai/VoiceModePanel.vue'

const stubs = {
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UButton: { name: 'UButton', props: ['icon', 'label'], template: '<button><slot />{{ label }}</button>' },
}

async function render(props: Record<string, unknown>) {
  const app = createSSRApp({ render: () => h(VoiceModePanel, props) })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  return renderToString(app)
}

describe('VoiceModePanel', () => {
  it('shows a Listening label while listening', async () => {
    const html = await render({ phase: 'listening', volumeLevel: 0.2, error: null })
    expect(html).toContain('Listening')
  })
  it('shows a confirm prompt while awaiting confirmation', async () => {
    const html = await render({ phase: 'awaitingConfirm', volumeLevel: 0, error: null })
    expect(html.toLowerCase()).toContain('confirm')
  })
  it('renders the error when present', async () => {
    const html = await render({ phase: 'listening', volumeLevel: 0, error: 'Mic blocked' })
    expect(html).toContain('Mic blocked')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:run test/components/voiceModePanel.test.ts`
Expected: FAIL — cannot resolve the component.

- [ ] **Step 3: Write minimal implementation**

```vue
<!-- app/components/ai/VoiceModePanel.vue -->
<script setup lang="ts">
import type { VoicePhase } from '~~/app/utils/voiceSessionMachine'

const props = defineProps<{ phase: VoicePhase, volumeLevel: number, error: string | null }>()
defineEmits<{ stop: [] }>()

const LABELS: Record<VoicePhase, string> = {
  idle: 'Voice off',
  listening: 'Listening…',
  processing: 'Thinking…',
  speaking: 'Speaking…',
  awaitingConfirm: 'Say “confirm” to proceed, or “cancel”',
  confirming: 'Confirming…',
}

const label = computed(() => LABELS[props.phase])
const bars = [0.4, 0.7, 1, 0.7, 0.4]
function barHeight(scale: number): string {
  return Math.max(3, Math.min(16, props.volumeLevel * 80 * scale)) + 'px'
}
</script>

<template>
  <div class="flex items-center gap-3 rounded-xl border border-default bg-elevated/70 px-4 py-2.5 backdrop-blur">
    <span
      class="flex size-7 items-center justify-center rounded-full"
      :class="phase === 'awaitingConfirm' ? 'bg-warning/15 text-warning' : 'bg-primary/15 text-primary'"
    >
      <UIcon
        :name="phase === 'speaking' ? 'i-lucide-volume-2' : phase === 'processing' || phase === 'confirming' ? 'i-lucide-loader' : 'i-lucide-mic'"
        class="size-4"
        :class="(phase === 'processing' || phase === 'confirming') ? 'animate-spin' : ''"
      />
    </span>

    <div class="min-w-0 flex-1">
      <p class="truncate text-sm font-medium text-highlighted">{{ label }}</p>
      <p v-if="error" class="truncate text-xs text-error">{{ error }}</p>
    </div>

    <!-- Live waveform -->
    <span v-if="phase === 'listening'" class="flex h-4 items-end gap-0.5" aria-hidden="true">
      <span
        v-for="(scale, i) in bars"
        :key="i"
        class="w-1 rounded-t bg-primary/70 transition-all duration-75"
        :style="{ height: barHeight(scale) }"
      />
    </span>

    <UButton icon="i-lucide-square" color="neutral" variant="soft" size="sm" label="Stop" @click="$emit('stop')" />
  </div>
</template>
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:run test/components/voiceModePanel.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/components/ai/VoiceModePanel.vue test/components/voiceModePanel.test.ts
git commit -m "feat(voice): VoiceModePanel session-status strip

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Session orchestrator (`useVoiceSession.ts`)

**Files:**
- Create: `app/composables/useVoiceSession.ts`

This is the browser glue: it wires `useVoiceChat` + the three pure units + the live endpoints into the continuous loop. It is **not unit-tested** (it depends on `MediaRecorder`/`AudioContext`/timers that happy-dom doesn't provide); correctness of its logic lives in the tested pure units, and the wiring is verified by manual UAT in Task 8. Keep it thin — push all branching decisions through `voiceSessionReducer`.

- [ ] **Step 1: Write the composable**

```ts
// app/composables/useVoiceSession.ts
import { classifyConfirmUtterance } from '~~/app/utils/voiceConfirm'
import { createBargeInDetector } from '~~/app/utils/voiceBargeIn'
import {
  initialVoiceSession,
  voiceSessionReducer,
  type VoiceEvent,
  type VoiceSessionState,
} from '~~/app/utils/voiceSessionMachine'
import type { AiMessage } from '~/types'

interface VoiceTurnResult {
  message: AiMessage
  transcribedText: string
  audioBase64: string | null
  audioFormat: string | null
  proposedAction?: { proposalId: string, resolved: any } | null
}

export interface UseVoiceSessionOptions {
  /** Returns the active conversation id, creating one if needed. */
  ensureConversation: () => Promise<string | null>
  /** Push a completed user+assistant turn into the chat thread. */
  onTurn: (userText: string, assistant: AiMessage, proposedAction: { proposalId: string, resolved: any } | null) => void
  /** Append a short assistant note (e.g. the spoken confirm result). */
  onAssistantNote: (text: string) => void
  /** Clear the open proposal card on the last assistant message (after a spoken confirm/cancel). */
  onProposalResolved: () => void
}

const CONFIRM_TIMEOUT_MS = 15_000

export function useVoiceSession(opts: UseVoiceSessionOptions) {
  const voice = useVoiceChat()
  const state = ref<VoiceSessionState>({ ...initialVoiceSession })

  let bargeRaf: number | null = null
  let bargeStream: MediaStream | null = null
  let bargeCtx: AudioContext | null = null
  let confirmTimer: ReturnType<typeof setTimeout> | null = null
  const detector = createBargeInDetector()

  function dispatch(e: VoiceEvent) {
    state.value = voiceSessionReducer(state.value, e)
  }

  async function start() {
    dispatch({ type: 'START' })
    void runListen()
  }

  function stop() {
    dispatch({ type: 'STOP' })
    teardown()
  }

  function teardown() {
    voice.stopRecording()
    voice.stopAudio()
    stopBargeMonitor()
    if (confirmTimer) { clearTimeout(confirmTimer); confirmTimer = null }
  }

  // --- One conversational turn ---------------------------------------------
  async function runListen() {
    if (state.value.phase !== 'listening') return
    const blob = await voice.startRecording() // resolves on VAD silence / max-duration
    if (state.value.phase !== 'listening') return // stopped or barged mid-record
    if (!blob) { if (state.value.phase === 'listening') void runListen(); return }

    const convId = await opts.ensureConversation()
    if (!convId) { dispatch({ type: 'ERROR', message: 'No conversation' }); return }

    dispatch({ type: 'SPEECH_CAPTURED' })
    try {
      const result = await voice.sendVoiceMessage(convId, blob) as VoiceTurnResult
      const proposal = result.proposedAction ?? null
      opts.onTurn(result.transcribedText, result.message, proposal)
      dispatch({ type: 'RESPONSE', proposalId: proposal?.proposalId ?? null })
      await speakThenAdvance(result.audioBase64, result.audioFormat, proposal)
    } catch (err: any) {
      dispatch({ type: 'ERROR', message: voice.error.value || 'Voice turn failed' })
      void resumeAfterError()
    }
  }

  /** Play the reply (with barge-in armed); then advance to confirm or back to listening. */
  async function speakThenAdvance(
    audioBase64: string | null,
    audioFormat: string | null,
    proposal: { proposalId: string, resolved: any } | null,
  ) {
    if (proposal) {
      // Append a spoken hint so the user knows the exact phrase to use.
      await playWithBargeIn(audioBase64, audioFormat)
      if (state.value.phase === 'speaking') {
        await speakText('Say confirm to proceed, or cancel.')
      }
    } else {
      await playWithBargeIn(audioBase64, audioFormat)
    }
    if (state.value.phase !== 'speaking') return // a barge-in already moved us to listening
    dispatch({ type: 'PLAYBACK_DONE' })
    if (state.value.phase === 'awaitingConfirm') void runConfirm()
    else if (state.value.phase === 'listening') void runListen()
  }

  // --- Spoken confirmation sub-flow ----------------------------------------
  async function runConfirm() {
    if (state.value.phase !== 'awaitingConfirm') return
    armConfirmTimeout()
    const blob = await voice.startRecording()
    if (confirmTimer) { clearTimeout(confirmTimer); confirmTimer = null }
    if (state.value.phase !== 'awaitingConfirm') return
    if (!blob) { void runConfirm(); return }

    const convId = await opts.ensureConversation()
    if (!convId) { dispatch({ type: 'ERROR', message: 'No conversation' }); return }

    // Transcribe the confirm utterance by reusing the voice endpoint's STT (it also runs the agent,
    // but we ONLY use its transcript here; the classification decides whether to execute).
    let transcript = ''
    try {
      const r = await voice.sendVoiceMessage(convId, blob) as VoiceTurnResult
      transcript = r.transcribedText || ''
    } catch {
      transcript = ''
    }

    const intent = classifyConfirmUtterance(transcript)
    const proposalId = state.value.pendingProposalId
    dispatch({ type: 'CONFIRM_INTENT', intent })

    if (intent === 'affirmative' && proposalId) {
      await executeProposal(convId, proposalId)
    } else if (intent === 'negative') {
      opts.onProposalResolved()
      await speakText('Cancelled.')
      if (state.value.phase === 'listening') void runListen()
    } else if (intent === 'stop') {
      teardown()
    } else { // ambiguous
      if (state.value.phase === 'awaitingConfirm') {
        await speakText('Sorry, say confirm to proceed, or cancel.')
        void runConfirm()
      } else {
        // gave up after max re-prompts
        opts.onProposalResolved()
        if (state.value.phase === 'listening') void runListen()
      }
    }
  }

  async function executeProposal(convId: string, proposalId: string) {
    try {
      const res = await $fetch<{ ok: boolean, taskId?: string, error?: string }>(
        `/api/agency/ai/chat/conversations/${convId}/confirm-action`,
        { method: 'POST', body: { proposalId } },
      )
      opts.onProposalResolved()
      const note = res.ok ? 'Done — the task has been created.' : (res.error || 'I could not complete that action.')
      opts.onAssistantNote(note)
      await speakText(note)
    } catch {
      opts.onProposalResolved()
      await speakText('Something went wrong completing that action.')
    } finally {
      dispatch({ type: 'CONFIRM_DONE' })
      if (state.value.phase === 'listening') void runListen()
    }
  }

  function armConfirmTimeout() {
    if (confirmTimer) clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => {
      voice.cancelRecording()
      dispatch({ type: 'TIMEOUT' })
      opts.onProposalResolved()
      if (state.value.phase === 'listening') void runListen()
    }, CONFIRM_TIMEOUT_MS)
  }

  async function resumeAfterError() {
    // brief pause to avoid a tight error loop, then re-arm if still in a session
    await new Promise(r => setTimeout(r, 600))
    if (state.value.phase === 'listening') void runListen()
  }

  // --- TTS helpers ----------------------------------------------------------
  async function speakText(text: string) {
    try {
      const res = await $fetch<{ audioBase64: string, audioFormat: string } | null>(
        '/api/agency/ai/chat/speak', { method: 'POST', body: { text } },
      )
      if (res?.audioBase64) await playWithBargeIn(res.audioBase64, res.audioFormat)
    } catch { /* soft-fail: text already shown in thread */ }
  }

  async function playWithBargeIn(audioBase64: string | null, audioFormat: string | null) {
    if (!audioBase64) return
    await startBargeMonitor()
    try {
      await voice.playAudio(audioBase64, audioFormat || 'mp3')
    } finally {
      stopBargeMonitor()
    }
  }

  // --- Barge-in: listen for the user talking over playback ------------------
  async function startBargeMonitor() {
    stopBargeMonitor()
    detector.reset()
    try {
      bargeStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      })
      bargeCtx = new AudioContext()
      const src = bargeCtx.createMediaStreamSource(bargeStream)
      const analyser = bargeCtx.createAnalyser()
      analyser.fftSize = 256
      src.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)
      const tick = () => {
        if (!bargeCtx) return
        analyser.getByteFrequencyData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) { const n = data[i] / 255; sum += n * n }
        const rms = Math.sqrt(sum / data.length)
        if (detector.sample(rms, Date.now())) {
          voice.stopAudio()
          dispatch({ type: 'BARGE_IN' })
          stopBargeMonitor()
          if (state.value.phase === 'listening') void runListen()
          return
        }
        bargeRaf = requestAnimationFrame(tick)
      }
      bargeRaf = requestAnimationFrame(tick)
    } catch {
      // No mic for barge-in — playback still completes normally.
    }
  }

  function stopBargeMonitor() {
    if (bargeRaf) { cancelAnimationFrame(bargeRaf); bargeRaf = null }
    if (bargeStream) { bargeStream.getTracks().forEach(t => t.stop()); bargeStream = null }
    if (bargeCtx && bargeCtx.state !== 'closed') { bargeCtx.close().catch(() => {}); bargeCtx = null }
  }

  onUnmounted(() => teardown())

  return {
    phase: computed(() => state.value.phase),
    error: computed(() => state.value.error),
    volumeLevel: voice.volumeLevel,
    isActive: computed(() => state.value.phase !== 'idle'),
    start,
    stop,
  }
}
```

- [ ] **Step 2: Typecheck the new composable (no test to run)**

Run: `pnpm typecheck 2>&1 | grep -iE "useVoiceSession|voiceSessionMachine|voiceConfirm|voiceBargeIn" || echo "no new errors in voice units"`
Expected: `no new errors in voice units` (pre-existing repo errors elsewhere are fine).

- [ ] **Step 3: Commit**

```bash
git add app/composables/useVoiceSession.ts
git commit -m "feat(voice): useVoiceSession orchestrator (continuous loop + barge-in + spoken confirm)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Wire voice mode into the chat page

**Files:**
- Modify: `app/pages/agency/ai/chat.vue`

Add a voice-mode toggle (gated by `aiToolsEnabled`, alongside the existing one-shot mic), mount `VoiceModePanel` while active, and provide the `useVoiceSession` callbacks that push turns into the existing `messages` state and resolve the proposal card.

- [ ] **Step 1: Add the session wiring in `<script setup>`**

Add after the existing `// --- Voice Chat ---` block (around line 40, after the `watch(voiceError, …)`):

```ts
// --- Hands-free Voice Session (open-mic, agentic, barge-in) ---
async function ensureConversationId(): Promise<string | null> {
  if (activeConversation.value) return activeConversation.value.id
  try {
    const conv = await createConversation()
    updateUrl(conv.id)
    return conv.id
  } catch {
    toast.add({ title: 'Error', description: 'Failed to create conversation', color: 'error' })
    return null
  }
}

function pushVoiceTurn(
  userText: string,
  assistant: AiMessage,
  proposedAction: { proposalId: string, resolved: any } | null,
) {
  if (!activeConversation.value) return
  messages.value.push({
    id: `voice-user-${Date.now()}`,
    conversationId: activeConversation.value.id,
    role: 'user',
    content: userText,
    contextSources: [],
    tokenCount: null, model: null, latencyMs: null, isError: false,
    createdAt: new Date().toISOString(),
  })
  messages.value.push({ ...assistant, proposedAction: proposedAction ?? null })
  activeConversation.value.messageCount += 2
  activeConversation.value.lastMessageAt = new Date().toISOString()
}

function pushAssistantNote(text: string) {
  if (!activeConversation.value) return
  messages.value.push({
    id: `voice-note-${Date.now()}`,
    conversationId: activeConversation.value.id,
    role: 'assistant',
    content: text,
    contextSources: [],
    tokenCount: null, model: null, latencyMs: null, isError: false,
    createdAt: new Date().toISOString(),
  })
}

function resolveLastProposal() {
  for (let i = messages.value.length - 1; i >= 0; i--) {
    if (messages.value[i].role === 'assistant' && messages.value[i].proposedAction) {
      messages.value[i] = { ...messages.value[i], proposedAction: null } as AiMessage
      break
    }
  }
}

const voiceSession = useVoiceSession({
  ensureConversation: ensureConversationId,
  onTurn: pushVoiceTurn,
  onAssistantNote: pushAssistantNote,
  onProposalResolved: resolveLastProposal,
})

function toggleVoiceSession() {
  if (voiceSession.isActive.value) voiceSession.stop()
  else voiceSession.start()
}

watch(voiceSession.error, (err) => {
  if (err) toast.add({ title: 'Voice', description: err, color: 'warning' })
})
```

- [ ] **Step 2: Add the toggle button + panel in the template**

In the bottom bar's right-hand button group (the `<div class="flex items-center gap-1.5">` that holds the voice + send buttons, around line 1241), add a session toggle **before** the existing one-shot voice button:

```vue
                  <!-- Hands-free voice session (agentic, open-mic) — gated like the persona picker -->
                  <UButton
                    v-if="aiToolsEnabled && voiceAvailable"
                    :icon="voiceSession.isActive.value ? 'i-lucide-square' : 'i-lucide-radio'"
                    :color="voiceSession.isActive.value ? 'error' : 'neutral'"
                    :variant="voiceSession.isActive.value ? 'solid' : 'ghost'"
                    size="sm"
                    class="rounded-lg"
                    :disabled="sending || isRecording || voiceProcessing"
                    :title="voiceSession.isActive.value ? 'Stop voice session' : 'Start hands-free voice session'"
                    @click="toggleVoiceSession"
                  />
```

Then add the status panel just above the input card. Insert immediately before `<div class="bg-elevated border border-default rounded-2xl shadow-lg …">` (around line 1153):

```vue
            <!-- Hands-free voice session status -->
            <VoiceModePanel
              v-if="voiceSession.isActive.value"
              :phase="voiceSession.phase.value"
              :volume-level="voiceSession.volumeLevel.value"
              :error="voiceSession.error.value"
              class="mb-2"
              @stop="voiceSession.stop()"
            />
```

- [ ] **Step 3: Typecheck**

Run: `pnpm typecheck 2>&1 | grep -iE "chat.vue|useVoiceSession" || echo "no new errors in chat wiring"`
Expected: `no new errors in chat wiring`.

- [ ] **Step 4: Run the full voice test suite (regression)**

Run: `pnpm test:run test/utils/voiceConfirm.test.ts test/utils/voiceBargeIn.test.ts test/utils/voiceSessionMachine.test.ts test/server/api/aiChatSpeak.test.ts test/components/voiceModePanel.test.ts`
Expected: PASS (all).

- [ ] **Step 5: Commit**

```bash
git add app/pages/agency/ai/chat.vue
git commit -m "feat(voice): wire hands-free voice session into the AI chat page

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Manual UAT (live mic) — verification gate

**No code.** Voice mode needs a real browser + mic + a deployed (or `pnpm dev`) environment with `AI_TOOLS_ENABLED=true` and the Workers AI binding. Per project rule, do NOT deploy or flip flags without explicit owner go-ahead — this task documents the script the owner (or a browser-driving session) runs.

- [ ] **Step 1: Start the app** (`pnpm dev`, or test against a flag-on preview deploy).
- [ ] **Step 2:** On `/agency/ai/chat`, confirm the new "radio" session button appears only when `AI_TOOLS_ENABLED` is on.
- [ ] **Step 3 (read loop):** Start a session, ask "What tasks are assigned to me?" — verify it transcribes, the agent answers, the answer is spoken, and the mic re-arms automatically.
- [ ] **Step 4 (barge-in):** While it's speaking, talk over it — verify playback stops and a new turn captures.
- [ ] **Step 5 (write + spoken confirm):** Say "create a task to follow up with Acme on the ADME board" — verify the confirm card renders, the read-back + "say confirm" hint is spoken, saying "confirm" executes (task created), and the result is spoken. Repeat saying "cancel" — verify it aborts and nothing is created.
- [ ] **Step 6 (stop):** Say "stop listening" — verify the session ends. Tap Stop — verify it ends.
- [ ] **Step 7 (fallbacks):** Deny mic permission → friendly error, text mode unaffected. Mumble during confirm → re-prompt, then auto-cancel.
- [ ] **Step 8:** Record results in a short note under `.paul/` or the PR description.

---

## Task 9: Marketing sync + final verification

**Files:**
- Modify: `app/pages/voice-ai.vue` (copy now reflects agentic, hands-free, barge-in)
- Modify: `app/pages/features/index.vue`, `app/pages/features/[slug].vue` (per `CLAUDE.md` front-facing sync)

- [ ] **Step 1: Update `/voice-ai` copy.** In `app/pages/voice-ai.vue`, update the hero sub-headline and the "Voice & Text, Together" / pipeline sections to state that the assistant is hands-free (continuous open-mic), can take actions (create tasks, read finance) with spoken confirmation, and supports barge-in. Keep the existing visual structure and dark-mode classes. Example hero edit:

```vue
          <p class="text-[clamp(1.1rem,2vw,1.5rem)] max-w-[600px] mb-10 text-white/80 font-light leading-relaxed hero-entrance hero-delay-2">
            Talk to your AI assistant hands-free. Ask questions, take actions, and confirm changes by voice &mdash; it listens continuously, answers aloud, and you can interrupt any time.
          </p>
```

- [ ] **Step 2: Add/confirm a features entry.** In `app/pages/features/index.vue` and `[slug].vue`, ensure the voice assistant appears under the AI category with copy matching the shipped capability (hands-free, agentic, spoken confirm). Follow the existing entry shape in those files.

- [ ] **Step 3: Full suite + typecheck.**

Run: `pnpm test:run`
Expected: PASS — all suites green (no regressions).

Run: `pnpm typecheck 2>&1 | tail -5`
Expected: only the ~60 documented pre-existing errors; none in any `voice*` file or `chat.vue` additions.

- [ ] **Step 4: Pre-commit deep-dive** (per `CLAUDE.md` Pre-Commit Quality Rules): re-read every new/modified file; verify `~~/` vs `~/` aliases (server uses `~~/`), no empty `USelect` values, reactive `voiceSession.*.value` access in the template, no duplicate UI sections, and that the barge-in `getUserMedia` path is the only new browser-permission surface.

- [ ] **Step 5: Commit + push.**

```bash
git add app/pages/voice-ai.vue app/pages/features/index.vue app/pages/features/[slug].vue
git commit -m "docs(marketing): sync voice-ai + features pages with hands-free agentic voice

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
# Push uses the adme-dev gh account (Paul008 → 403). Open a PR into origin/main.
```

---

## Notes & Guardrails

- **No migration.** Voice turns persist via the existing `processUserMessage` path; proposals use `ai_pending_actions`.
- **Gating.** The session toggle and the agentic loop are gated by `AI_TOOLS_ENABLED` (mirrors the persona picker). `/speak` is `requireAuth` only.
- **Safety.** Writes always go through the server-issued, expiring, atomically-claimed proposal → `confirm-action`. The spoken "confirm" calls the SAME endpoint a tap would; there is no new execution path. Only an explicit affirmative executes; ambiguous never does.
- **Do NOT** flip flags, deploy, or trigger a live write without explicit owner go-ahead. Deploy (when authorized) is `AI_TOOLS_ENABLED=true pnpm deploy:production` from the clean `.worktrees/deploy-prod`.
- **Deferred (out of scope):** streaming DO transport (Option B), wake-word, configurable TTS voices — the pure units + `/speak` boundary leave room to add these later without rework.
