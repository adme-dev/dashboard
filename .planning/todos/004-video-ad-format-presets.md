# Video studio: ad-format reference presets

Captured: 2026-11-18
Priority: P2
Status: pending
Source: Review of github.com/Anil-matcha/Open-Generative-AI (MIT, MuAPI front-end), 2026-11-18. Re-implement ideas in Vue/Nuxt; do not copy code. Reference: `MarketingStudio.jsx` (UGC, Tutorial, Unboxing, Product Review formats with product/avatar image slots).

## Outcome

Ready-made ad formats (UGC, tutorial, unboxing, product review, plus automotive formats such as walkaround and feature highlight) that pre-fill structure, shot list and required inputs.

## Current state

`app/utils/video/producerRecipes.ts` is 23 lines.

## Work

1. Extend `producerRecipes.ts` (and/or `generationTemplates.ts`) with format presets: purpose, shot structure, required media slots, default duration/aspect.
2. Surface presets in the composer / storyboard entry point.
3. Respect existing compliance and approved-source rules for client brands.

## Acceptance criteria

- Picking a preset pre-fills the composer/storyboard and lists the media it needs.
- Presets pass existing compliance checks; no new unrestricted generation path.
