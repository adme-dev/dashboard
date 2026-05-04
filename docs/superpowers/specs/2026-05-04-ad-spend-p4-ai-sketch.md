# P4 — AI Layer (Sketch Only)

**Status:** Exploratory — not committed
**Roadmap:** [Ad Spend Roadmap](2026-05-04-ad-spend-roadmap.md)
**Date:** 2026-05-04

## Status

This is a sketch, not a PRD. It exists so we have a north star while building P1–P3, and so we can revisit with informed input once those ship. Acceptance criteria deferred until we know if P3's plain alerts already deliver 80% of the value.

## Likely shape

**Daily AI narrative card** at top of spend page:
- Once-per-day Groq call summarizing pacing/anomalies in 2–3 sentences
- Cached in KV (`spend:ai-narrative:${orgId}:${date}`) for ~6h
- Example output: "3 clients overpacing this month — Acme leads at 142% of budget. 1 underpacing (Beta at 41%). Total bank-charged variance vs. platform: −$1.2k."

**Per-row "explain" tooltip** on flagged rows:
- Hover triggers Groq call (debounced)
- Cached per `(client_id, period)` for ~24h
- Example: "Acme spend up 47% vs. 7-day average, driven by 3 Meta campaigns launched 2026-04-30."

**Reallocation suggestions panel:**
- Input: current pacing data from P2
- Output: ranked list of "Move $X from Acme to Beta — Acme is at 142% with 12 days left, Beta at 41%."
- Below the spend table, collapsible

**Conversational sidebar:**
- Reuses `useAiChat` from existing AI infrastructure
- Persona pinned to "spend analyst", context pre-loaded with current page's spend summary
- Example asks: "Which clients are underspending?" / "What's the projected overspend this month?"

## Open questions

- **Token cost vs. utility** — daily narrative is cheap; per-row explain on hover could be expensive at scale. Need to measure with real traffic.
- **Where the line is** between "useful summary" and "noise" — operators may prefer a 3-second scan over reading text.
- **Fine-tuning** — should we use base Groq model or fine-tune for agency vocabulary? Decision deferred until we have ~3 months of corrected/validated narratives.
- **Failure modes** — Groq downtime should degrade gracefully (no card shown, no error toast).

## Dependencies on other phases

- P3 alerts must ship first — AI narrative consumes alert events as input
- P2 pacing must ship first — projection numbers feed the narrative
- No new infra needed — existing Groq SDK + KV cache + AI chat composables cover it

## Decision point

After P3 ships and runs for 2 weeks, evaluate:
- Are operators reading the activity feed daily? If yes, add narrative card. If no, AI may not solve the underlying engagement problem.
- Are alerts firing too often? AI summarization could reduce noise. Otherwise, skip P4 entirely.
