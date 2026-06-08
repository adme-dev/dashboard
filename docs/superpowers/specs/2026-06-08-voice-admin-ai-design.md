# Voice Admin AI — Design

**Date:** 2026-06-08
**Status:** Approved design → ready for implementation plan
**Branch / worktree:** `feat/voice-admin-ai` (off `origin/main` @ `fb9b89f4`)
**Migrations:** none
**Builds on:** AI tool-calling Slice 1 + 1.5 + Slice 2 (live in prod behind `AI_TOOLS_ENABLED`)

---

## 1. Problem & Vision

Agency staff can already chat with an agentic AI that reads business data (finance, margins,
ad-spend, anomalies, clients, projects) and performs guarded writes (`create_task`) with a
confirm→execute step. Today that agent is driven by **typing**, with a one-shot voice mode
(click mic → record → send → hear reply).

We want a **real-time, hands-free voice admin assistant**: tap once to open a session, then
speak naturally — the assistant listens, answers aloud, **and takes actions by voice** — with
**barge-in** (interrupt it mid-answer) and continuous turn-taking until you stop. It is the
same agent, now conversational and hands-free.

This is a **conversational real-time** experience (continuous turns, no button presses), not a
sub-second streaming pipeline — that is an explicit, deferred upgrade (see §11).

## 2. Goals (v1)

- Hands-free **open-mic session**: arm → speak → auto-detect end of utterance → agent → spoken
  reply → **re-arm automatically** → repeat, until the user stops.
- **Both reads and writes** over voice, from day one — full agentic tool-loop.
- **Barge-in**: speaking over the assistant interrupts playback and starts a new turn.
- **Voice-safe write confirmation**: spoken "confirm"/"cancel" **plus** the existing visible
  confirm card (tap fallback). Writes never bypass the server-side proposal/execute guard.
- Lives as a **voice mode inside `/agency/ai/chat`** — reuses conversations, history, personas,
  context, the tool-loop, and cost tracking. Voice turns are saved as text in the same thread.
- Gated behind `AI_TOOLS_ENABLED` and agency-staff auth (same gate as the agent today).

## 3. Non-Goals (v1) — YAGNI

- **No streaming STT/LLM/TTS pipeline** and **no Durable-Object voice session** (deferred §11).
- **No wake-word / always-on background mic** ("Hey Xero"). Activation is an explicit tap.
- **No speech-to-speech realtime model** (OpenAI Realtime / Gemini Live). Tool-calling stays on
  Groq exactly as it is today.
- **No configurable TTS voice / multi-voice personas.** MeloTTS single voice.
- **No new write tools.** Whatever the agent can do today, voice can do — nothing more.

## 4. Decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Real-time engine | **A: continuous turn loop**, reusing the live Groq agent + Whisper STT + MeloTTS TTS | Marries voice to the agent already shipped & UAT-verified; lowest risk; keeps safety + cost work intact |
| 2 | Core job | **Reads + writes, equally** | Full admin agent over voice |
| 3 | Surface | **Voice mode in `/agency/ai/chat`** | Least new surface; reuses conversations/personas/tool-loop |
| 4 | Write confirmation | **Spoken confirm + visible card** | Hands-free, with a tap fallback; explicit affirmative phrase required |
| 5 | Activation | **Open-mic session** (tap start/stop, no wake-word) | Pragmatic, private, ships in v1 |
| 6 | Confirm interpretation | **Client-side explicit phrase match** | Zero extra latency/round-trip; safe with an explicit allowlist + card fallback |
| 7 | Confirm-result speech | **New tiny TTS endpoint** `POST /api/agency/ai/chat/speak` | `confirm-action` returns no audio today; needed to speak the result of a spoken confirm |

## 5. What already exists (reuse — do NOT rebuild)

All present on `origin/main`:

- **STT** — `speechToText()` (Whisper v3 Turbo, Workers AI) in `server/utils/aiVoice.ts`.
- **TTS** — `textToSpeech()` (MeloTTS, Workers AI) + `stripMarkdown` + format sniffing, same file.
- **Mic capture** — `app/composables/useVoiceChat.ts`: `getUserMedia` (echo cancel + noise
  suppression + AGC), RMS volume meter, silence detection (`SILENCE_THRESHOLD`/`SILENCE_TIMEOUT`
  + grace period), 60s max, cancel, base64 playback, cleanup.
- **Voice endpoint** — `POST /api/agency/ai/chat/conversations/[id]/voice`:
  STT → `processUserMessage` (**the same agentic pipeline as text**) → TTS → returns
  `{ message, contextSources, transcribedText, audioBase64, audioFormat, sttLatencyMs, proposedAction }`.
  **It already returns `proposedAction`** when the agent proposes a write.
- **Agentic tool-loop** — `server/utils/ai/toolLoop.ts` + `toolRegistry.ts` + 18 tools
  (reads + `create_task`), gated by `shouldUseToolLoop()` in `server/utils/ai/gate.ts`
  (`AI_TOOLS_ENABLED` + has-event + non-trivial intent).
- **Proposal / confirm guard** — `server/utils/ai/pendingActions.ts`
  (`proposeAction` / `executeProposal` / `loadOpenProposal`; server-issued, expiring, atomic
  claim, idempotent) + `POST /api/agency/ai/chat/conversations/[id]/confirm-action`
  (executes, posts a `✅ Created task "…"` message into the thread, returns `{ ok, taskId }`).
- **Rehydrate open proposals on reload** (#123), **named personas** (#124), **cost tracking**
  (mig 172, #131).

**Implication:** a voice turn already runs the full agent and already comes back with a
`proposedAction`. The remaining work is almost entirely **client-side orchestration + UI**, plus
**one small TTS endpoint**.

## 6. Architecture

### 6.1 New / changed units

**New (client):**
- `app/utils/voiceConfirm.ts` — **pure** classifier for a confirm utterance →
  `'affirmative' | 'negative' | 'stop' | 'ambiguous'`. Explicit allowlists (see §8). TDD.
- `app/utils/voiceSessionMachine.ts` — **pure** state-machine reducer for the session
  (states + transitions in §7). TDD. Keeps orchestration logic testable without a mic.
- `app/composables/useVoiceSession.ts` — orchestrator that wraps `useVoiceChat`, drives the
  state machine, handles re-arm, barge-in, and the spoken-confirm sub-flow.
- `app/components/ai/VoiceModePanel.vue` — voice-mode UI: state indicator
  (idle/listening/thinking/speaking/awaiting-confirm), live waveform (`volumeLevel`), the
  current transcript, a stop button, and an error→text fallback.

**New (server):**
- `server/api/agency/ai/chat/speak.post.ts` — `requireAuth` + per-user rate limit; body
  `{ text: string, lang?: string }`; calls `textToSpeech()`; returns
  `{ audioBase64, audioFormat }`, or `204` when the AI binding is unavailable (local dev).
  Used to voice the `confirm-action` result and any client-side spoken hints. No DB writes.

**Changed:**
- `app/composables/useVoiceChat.ts` — minimal additions to support (a) **barge-in** (a
  lightweight mic meter that can run during playback) and (b) being driven by the session loop
  (expose the pieces `useVoiceSession` needs; keep the one-shot API intact).
- `app/pages/agency/ai/chat` (the chat page) — add a **voice-mode toggle** gated by
  `runtimeConfig.public.aiToolsEnabled`; mount `VoiceModePanel`; append voice turns + the
  confirm card into the existing thread (the card component already exists for text mode).
- **Marketing sync** (per `CLAUDE.md`): update `/voice-ai` and the relevant `features/*` pages
  to describe the now-real, agentic, hands-free voice assistant.

### 6.2 No new persistence

Voice turns persist exactly like text turns (`ai_messages` via `processUserMessage`); proposals
use `ai_pending_actions`. **No migration.**

## 7. Data flow — the session loop

State machine (`voiceSessionMachine.ts`):

```
idle ──(tap Start)──▶ listening
listening ──(VAD silence | 60s max)──▶ processing        // send blob to /voice
listening ──(tap Stop | "stop listening")──▶ idle
processing ──(reply, no proposedAction)──▶ speaking
processing ──(reply WITH proposedAction)──▶ speaking_readback ──▶ awaiting_confirm
speaking ──(playback ends)──▶ listening                  // auto re-arm
speaking ──(BARGE-IN: user speech)──▶ listening          // kill TTS, capture new turn
awaiting_confirm ──(capture next utterance → STT → classify):
        affirmative ─▶ confirming ─▶ speaking_result ─▶ listening
        negative    ─▶ speaking("Cancelled.") ─▶ listening
        stop        ─▶ idle
        ambiguous   ─▶ reprompt (max 2) ─▶ awaiting_confirm ; after 2 ─▶ auto-cancel ─▶ listening
awaiting_confirm ──(timeout ~15s)──▶ auto-cancel ─▶ listening
any ──(error)──▶ surface toast + fall back to text input ; session pauses to idle
```

- **Turn:** capture blob → `sendVoiceMessage()` → append transcript + assistant text to thread →
  play `audioBase64`.
- **Proposal turn:** when `proposedAction` is present, the panel renders the confirm card
  (tap path unchanged) **and** the loop speaks the read-back. The spoken read-back =
  `message.content` followed by a client-appended hint "Say confirm to proceed, or cancel."
  (No server change to the read-back text required.)
- **Confirm:** an affirmative classification calls the existing `confirm-action` endpoint with
  `proposedAction.proposalId`; on `{ ok: true }`, speak a short result via `/speak`
  ("Done — created the task."). This is the **same** endpoint a tap would hit — voice adds no
  new execution path.

### 7.1 Barge-in & echo

- `getUserMedia` already enables `echoCancellation`, so the mic largely rejects the assistant's
  own playback. Barge-in detection uses a **higher** volume threshold and a short sustain
  (~300 ms) to avoid false triggers from residual echo.
- On barge-in: stop the `HTMLAudioElement`, discard the rest of the reply, transition to
  `listening`, and capture the interrupting speech as the next turn.

## 8. Confirm-phrase classification (`voiceConfirm.ts`)

Pure function over the transcribed confirm utterance (lowercased, trimmed):

- **affirmative:** `confirm`, `yes`, `yep`, `yeah`, `do it`, `go ahead`, `proceed`, `approved`,
  `confirmed`, `yes do it`, `please do`.
- **negative:** `cancel`, `no`, `nope`, `don't`, `do not`, `abort`, `never mind`, `nevermind`,
  `stop that`.
- **stop (ends session):** `stop listening`, `stop`, `end session`, `exit`, `goodbye`.
- **ambiguous:** anything else → re-prompt.

Safety: only an explicit affirmative executes. Ambiguous never executes. Negative/stop/timeout
all abort. Exact lists are finalized in the plan; the matcher is unit-tested against each class.

## 9. Error handling & fallbacks

- **STT no-speech (422):** speak/show "Didn't catch that" and re-arm (don't break the session).
- **Voice processing 500 / TTS soft-fail:** keep the **text** reply (already returned), show it
  in the thread, surface a toast, and let the user continue by voice or typing.
- **Mic permission denied / no device:** show the existing `useVoiceChat` error; voice mode
  cannot start; text mode is unaffected.
- **Rate limit (429):** pause the loop, toast, allow retry. (Shared 12 msg/60s limit applies.)
- **AI binding unavailable (local dev):** `/speak` returns 204 and `voice.post.ts` already soft-
  fails TTS → text-only behavior; no crashes.

## 10. Safety & gating

- **Gate:** voice mode UI + `/speak` available only when `AI_TOOLS_ENABLED` (writes) — same gate
  as the agent. RBAC inside each tool is unchanged.
- **Writes:** always via the server-issued, expiring, atomically-claimed, idempotent proposal →
  `confirm-action`. The spoken "confirm" triggers the identical endpoint; no bypass.
- **Auth/ownership:** `/speak` is `requireAuth`; confirm/voice endpoints already verify the
  caller owns the conversation.
- **Privacy:** audio is processed ephemerally (no audio stored); only the text transcript is
  persisted — consistent with today's voice endpoint and the `/voice-ai` copy.

## 11. Out of scope / future

- **Option B — streaming on a Durable Object** (WebSocket session, streaming STT via Deepgram,
  streamed Groq tokens, sentence-chunked TTS, native barge-in; sub-second first audio). The v1
  boundaries (session machine + panel + `/speak`) are drawn so B can replace the transport
  without reworking the agent or the confirm guard.
- **Wake-word** activation.
- **Speech-to-speech realtime model** (would re-platform tool-calling).
- **Configurable / per-persona TTS voices.**

## 12. Testing

- **Unit (pure):** `voiceConfirm.ts` (all four classes + edge cases); `voiceSessionMachine.ts`
  (every transition incl. barge-in, proposal→confirm, ambiguous re-prompt, timeout, stop).
- **Server:** `speak.post.ts` — returns audio with a mocked AI binding; 204 without; 401 unauth;
  429 over the rate limit; rejects empty/oversized text.
- **Component:** `VoiceModePanel` renders each state; toggle hidden when `aiToolsEnabled` is off.
- **Manual UAT (deferred, needs a browser + prod):** live mic loop, barge-in, a spoken read +
  a spoken write→confirm→result, error fallbacks.

## 13. Logistics

- **Build on `origin/main`** in `.worktrees/voice-admin-ai` (`feat/voice-admin-ai`). The
  repo-root `main` checkout is diverged (15 behind / 11 docs-only ahead) and **lacks the entire
  tool-calling layer** — do not build there.
- Fresh worktree needs `pnpm install` (or symlinked `node_modules`) + `nuxt prepare` before
  Vitest; trust exit codes.
- **Deploy discipline (carry-forward):** every prod deploy is
  `AI_TOOLS_ENABLED=true pnpm deploy:production` from the clean `.worktrees/deploy-prod`
  (flag is build-baked); pushes need the `adme-dev` gh account.
- **Never** enable a live write path or flip gates without explicit go-ahead.

## 14. Open questions

- Final affirmative/negative allowlists — lock during planning (kept conservative for safety).
- Whether to voice the read-back via the model's own `message.content` only, or always append
  the "say confirm" hint client-side (current plan: append the hint).
