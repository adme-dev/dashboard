# Phase E — Watch Improvements (AI + Power Features)

**Date:** 2026-04-29
**Status:** Approved (design)
**Builds on:** Phase A (reasons), Phase B (snooze), Phase C (quiet hours, digest).

## Scope (7 features)

1. **AI importance scoring** — rule-based heuristic populates `notifications.importance_score` on write. Inbox gets a "Sort by importance" toggle.
2. **Smart digest narrative** — Groq generates one-sentence summary per board on top of the existing digest endpoint.
3. **Auto-watch suggestions** — record board visits; if user opens a board ≥3 times in 7 days without subscription, surface a one-click "Watch" toast.
4. **Contextual "Why this notification?" tooltip** — Groq generates one-sentence explanation per notification, lazy-loaded on info-icon click.
5. **Auto-acknowledge for assignments** — opt-in user pref. When set, posts "👋 Got it" comment automatically on assignment.
6. **Smarter snooze options** — End of day, Next workday (calendar-aware) added to BoardHeader popover.
7. **Keyword subscriptions** — text-keyword (ILIKE) match notifications dispatched to subscribers. Semantic embedding match deferred to a later phase that introduces Vectorize integration.

## Migration

`080-watch-phase-e.sql`:
- New `board_visits(user_id, board_id, visited_at)` table with index for 7-day visit lookups
- `team_members.auto_ack_assignments BOOLEAN DEFAULT FALSE`
- New `keyword_subscriptions(user_id, keyword, created_at)` with case-insensitive uniqueness per user

## Architecture decisions

- **Rule-based importance, not LLM.** `createNotification()` is called from utils without H3Event in scope, so Workers AI binding access is awkward. Heuristic (mention=0.9, assigned=0.8, watching_item=0.5, watching_board=0.3, direct=0.4) is fast, deterministic, and free. Phase E2+ may add LLM refinement via a delayed scoring queue.
- **Groq for generative tasks.** Smart digest narrative and "why this notification" use Groq (LLAMA_8B for speed), fallback gracefully to count-list / static template on error.
- **Keyword match runs in app, not SQL.** Full table scan of `keyword_subscriptions` is fine until ~10k subs. Beyond that, switch to PG full-text search or Vectorize ANN. Dispatcher excludes already-notified users to avoid duplicates.
- **Auto-watch threshold = 3 visits / 7 days.** Conservative to avoid nagging. One-shot toast; no banner persistence.
- **All AI features fail gracefully.** Try/catch around every Groq/inference call; primary paths never block on AI.

## Cost guardrails

- `digest.get.ts` only calls Groq when `?narrative=true`. Frontend always loads counts first (fast), then makes the narrative call (slower).
- Narrative capped to top 5 boards by activity (otherwise unbounded).
- "Why" endpoint is on-demand — only runs when user clicks the help icon.

## Acceptance criteria

- [ ] Migration 080 applied
- [ ] New notifications carry an `importance_score` between 0 and 1
- [ ] Inbox "Sort: Recent | Importance" toggle works
- [ ] Digest tab shows narrative paragraph per board when AI succeeds, falls back to badge counts otherwise
- [ ] Visiting a board 3 times in 7 days surfaces a "Watch?" toast with one-click subscribe
- [ ] Clicking the info icon on a notification opens a popover with an LLM explanation
- [ ] Setting `auto_ack_assignments=true` and being assigned to a task creates a comment automatically
- [ ] Snooze popover offers End of day, Tomorrow, Next workday
- [ ] Adding a keyword on the Watching page creates a `keyword_subscriptions` row; matching notification text fires an extra "Keyword match" notification

## Out of scope (deferred)

- Workers AI inference for importance refinement (no H3Event from utils)
- Semantic embedding-based keyword match (needs Vectorize setup as separate phase)
- Smart Snooze powered by calendar / blocker dependencies (needs calendar integration)
- Auto-draft replies for assignment beyond the static "Got it" template
- Per-user importance learning from dismissal patterns
