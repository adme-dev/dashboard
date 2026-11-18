# Video studio: provider price estimate before submit

Captured: 2026-11-18
Priority: P2
Status: pending
Source: Review of github.com/Anil-matcha/Open-Generative-AI (MIT, MuAPI front-end), 2026-11-18. Re-implement ideas in Vue/Nuxt; do not copy code. Reference: `estimateV2VCost`.

## Outcome

Where a provider exposes a pre-submit price, show it and use it for the budget check instead of the flat per-model figure.

## Current state

`estimateVideoGenerationCostCents` in `server/utils/video-generation/costs.ts` uses a fixed per-model price; budget display in `app/utils/video/generationBudget.ts`.

## Work

1. Check which providers (Cloudflare AI Gateway models first) actually offer a quote endpoint; record findings here before building.
2. Optional `estimateCost` on the provider interface, falling back to the current flat estimate.
3. Feed the quote into the server-side budget check and `app/utils/video/generationBudget.ts` and show it in the composer.

## Acceptance criteria

- Providers without a quote behave exactly as today.
- A quote that fails or times out never blocks generation; it falls back to the flat estimate.
