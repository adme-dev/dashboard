# Spec: Co-pilot ↔ Virtual Office Integration (Addendum)

**Status:** Design — implementation-ready
**Parent:** [PRD: Personal AI Co-pilot](../prd/personal-ai-copilot.md)
**Related:** [Phase 0 plan](./ai-copilot-phase-0-plan.md), [Memory architecture](./ai-copilot-memory-architecture.md)
**Created:** 2026-06-19
**Touches:** `feat/virtual-office-1b-media` (unmerged), `server/api/office/*`, `server/utils/office*`, `workers/office-room`

---

## 1. The core finding: two assistants are forming — converge them

The virtual office already ships an **office assistant** that is architecturally *different* from the conversational co-pilot. They are complementary, but they are independently growing **duplicate HITL-approval and audit machinery**. The single most important design decision in this addendum is: **one write/approval/audit spine for the whole product — not two.**

| Dimension | Conversational co-pilot (PRD) | Office assistant (built today) |
|---|---|---|
| Interaction | **Reactive** — "do my work" (`aiChatEngine` → `runToolLoop`) | **Proactive/ambient** — watches → jobs (`officeAssistant.ts`) |
| Trigger | user message | `office_assistant_watches` (`person_available`, `room_occupied`, `co_presence`, `meeting_ended`, `lobby_guest_waiting`) |
| Actions | tools (`create_task`, `propose_*`, …) | `office_assistant_jobs` (`notify`, `schedule_meeting`, `send_follow_up`, `summarize_thread`, `collect_status`) |
| Human-in-the-loop | `ai_pending_actions` (propose → confirm) | `office_assistant_jobs.approval_required` / `waiting_approval` / `approved_by` |
| Audit | (proposed) `ai_action_audit` | `logOfficeAuditEvent` / `office_audit` |
| Engine reuse | full tool-calling agent | **none** — does not call the agent |

**Verdict:** keep the *watches* (they're a genuine capability the agent lacks — ambient triggers). Retire the *parallel job-execution / approval / audit* path in favor of the Phase-0 executor registry + `ai_pending_actions` + `ai_action_audit`. The office assistant becomes a **trigger source that invokes co-pilot skills**, not a second agent.

> This is the non-overlap constraint the rest of the spec depends on. It is added to the Phase-0 plan as an explicit design constraint (WS-B/WS-C must be office-aware from day one).

## 2. The conferencing stack (what we build on)

- **Media:** Cloudflare **Realtime (Calls SFU)** — `server/api/office/[officeId]/realtime/[sessionId]/{tracks,renegotiate,tracks/close}`.
- **Coordination:** `workers/office-room` **Durable Object** (presence, room state).
- **Already present:** live **transcription** (`officeTranscription.ts`), **recordings** (`officeRecordings.ts`), **meeting artifacts + action items** (`officeMeetingArtifacts.ts`), lobbies/zones/guest-badges.
- **Voice loop:** STT (`/api/agency/ai/chat/transcribe`) + TTS (`/api/agency/ai/chat/speak`) + Voice Admin AI (merged, not deployed) — most of the spoken-co-pilot client loop already exists.

## 3. Three integration modes (sequenced easy → hard)

### Mode A — Docked side-panel co-pilot *(easiest; ship first)*
The existing `/agency/ai/chat` agent, embedded in the office UI, **room-scoped**: its `ToolContext` is enriched with `{ officeId, currentMeetingId, presentUserIds, liveTranscriptTail }` so "who's free?", "pull up Acme's pacing", "create a task from what we just discussed" work in-context. Pure reuse of the tool loop + memory + skill-packs. No media engineering.

- New context fields are **read-only additions** to `ToolContext` (`officeId?`, `meetingId?`) — additive, mirrors the existing optional `clientScope`.
- Proposals render in the same confirm cards inside the office panel.

### Mode C — Post-meeting summarize & propose *(medium; high value, low media risk)*
Wire the existing **`meeting_ended` watch** to invoke the co-pilot instead of the bespoke job path:
`meeting_ended` → agent reads the transcript + `office_meeting_artifacts` (action items already extracted) → **proposes** tasks / follow-ups through the unified executor registry → confirm cards delivered to the meeting owner.
This **replaces** `office_assistant_jobs` job types `summarize_thread` / `send_follow_up` / `schedule_meeting` with executors, retiring the duplicate approval/audit path (§1).

### Mode B — Live voice participant *(hard; do last)*
The co-pilot joins the meeting as a **bot track** on the Realtime SFU: consumes room audio → STT → agent turn (tool loop) → TTS → published back as an audio track. "@assistant, …" wake-phrase; spoken answers; actions still go through propose→confirm (spoken confirmation via Voice Admin AI's pattern, plus a visual card for high-risk).

**This is the genuinely hard engineering** and must be scoped honestly:
- Injecting a synthesized TTS track and consuming/mixing room audio is **not just wiring** — it needs a media path in the `office-room` DO (or a sibling media worker): track subscription, audio framing, barge-in handling, turn endpointing.
- Latency budget is tight (STT + tool loop + TTS in a live conversation). Keep the agent's tool use *visible on a panel* so the human isn't waiting on silence.
- High-risk actions (budget changes, Xero pushes) **never** voice-only — always a visual rich-confirm card (per [memory + governance specs] and [Strata HITL 2026](https://www.strata.io/blog/agentic-identity/practicing-the-human-in-the-loop/)).

## 4. Skill-pack in the lounge

The room context informs persona selection: a meeting tagged to a client → the **account** skill-pack; a media-review room → **media_buyer**. Memory (Phase 0) is what makes the voice co-pilot feel real — it recalls the user's accounts, preferences, and routines mid-conversation. The office is therefore a **consumer** of Phase 0, not a parallel build.

## 5. Data / module changes

- **No new approval/audit tables.** Reuse `ai_pending_actions` (mig 171) + `ai_action_audit` (mig 181). Migrate `office_assistant_jobs` execution to executors; keep `office_assistant_watches` as the trigger table.
- **`ToolContext`** gains optional `officeId?`, `meetingId?` (additive, like `clientScope`).
- **New executors** (Phase 0 WS-B registry): `schedule_meeting`, `send_follow_up`, `summarize_meeting` — each wrapping the existing office endpoints/artifacts.
- **Watch→skill bridge:** a thin `triggerCopilotFromWatch(watch, facts)` that maps a fired watch to an agent invocation (or a proposed action), replacing direct `office_assistant_jobs` insertion for the agentic job types.
- **Media (Mode B only):** bot-track media path in `workers/office-room` (or new `workers/office-copilot-media`).

## 6. Sequencing

1. **Phase 0** (memory + unified executor/audit, **office-aware** per §1).
2. **Mode A** — dock co-pilot in the lounge (room-scoped context). Reuse-only.
3. **Mode C** — `meeting_ended` → summarize/propose via executors; retire duplicate job/approval/audit paths.
4. **Mode B** — live voice participant (media engineering). Last, behind its own flag.

## 7. Risks

| Risk | Mitigation |
|---|---|
| **Two HITL/audit systems diverge further** | §1 consolidation as a Phase-0 constraint; new office actions go through executors only |
| Live media (Mode B) underestimated | Treated as its own hard workstream, sequenced last, flag-gated; Mode A/C deliver value without it |
| Voice-only approval of high-risk actions | Visual rich-confirm card always required for `rich_confirm` tier |
| Room context leaks across tenants/offices | `officeId`-scoped membership check (mirrors `office_members` gate in `jobs.post.ts`); memory stays `user_id`-scoped |
| Office feature is on unmerged branches | Land/merge `virtual-office-1b-*` before Mode A; treat integration as additive |

## 8. Acceptance criteria

- [ ] `ToolContext` carries optional `officeId`/`meetingId`; the docked co-pilot answers room-scoped questions (Mode A).
- [ ] No new approval/audit tables introduced; office agentic jobs execute via the Phase-0 executor registry + `ai_action_audit`.
- [ ] `meeting_ended` produces co-pilot-proposed tasks/follow-ups in confirm cards (Mode C).
- [ ] Voice participant (Mode B) is a separately-flagged workstream with its own media path; high-risk actions remain visual-confirm.
- [ ] All flag-gated dormant; no live writes without owner sign-off; zero new type errors; `/code-review high` clean.

---

### Sources
- [Human-in-the-Loop 2026 (Strata)](https://www.strata.io/blog/agentic-identity/practicing-the-human-in-the-loop/) · [Governing the Agentic Enterprise (Berkeley CMR)](https://cmr.berkeley.edu/2026/03/governing-the-agentic-enterprise-a-new-operating-model-for-autonomous-ai-at-scale/) · [Multi-agent vs single-agent (Towards Data Science)](https://towardsdatascience.com/single-agent-vs-multi-agent-when-to-build-a-multi-agent-system/)
