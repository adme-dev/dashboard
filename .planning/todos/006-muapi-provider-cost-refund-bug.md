# Bug: MuAPI provider ignores object-shaped cost and refunds

Captured: 2026-11-18
Priority: P1 (if MuAPI is still used) / cleanup otherwise
Status: pending
Source: Review of github.com/Anil-matcha/Open-Generative-AI (MIT, MuAPI front-end), 2026-11-18. Re-implement ideas in Vue/Nuxt; do not copy code.

## Problem

`server/utils/video-generation/providers/muapiProvider.ts:75` only reads `json.cost` when it is a number. MuAPI returns `cost` as an object (including `amount_credits` and `refunded`), so jobs record a null actual cost and refunds are never noticed.

## Work

1. Confirm whether any production client/model still routes to MuAPI.
2. If yes: parse the object shape, record actual cost and refunds, and reconcile refunds in `liabilityReconciliation.ts`; add tests from a real response fixture.
3. If no: remove the legacy provider and its registrations.

## Acceptance criteria

- Either MuAPI jobs record correct cost/refund values (tested against a real-shaped fixture), or the provider is removed with no remaining references.
