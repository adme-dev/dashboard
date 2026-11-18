# Video studio: workflow-first composer with declared media slots

Captured: 2026-11-18
Priority: P1
Status: pending
Source: Review of github.com/Anil-matcha/Open-Generative-AI (MIT, MuAPI front-end), 2026-11-18. Re-implement ideas in Vue/Nuxt; do not copy code. Reference: `packages/studio/src/lib/videoWorkflows.js`.

## Outcome

Staff pick the job first (animate image, start & end frames, references, edit video, extend video, motion transfer), then a model. Each model declares the media slots it accepts, their limits and cross-slot rules, and the composer builds itself from that declaration.

## Current state

- `server/utils/video-generation/types.ts` models capabilities as three booleans: `extendVideo`, `endFrame`, `videoToVideo`.
- `end_image` is handled only in `server/utils/video-generation/cfInputs.ts` and `app/utils/videoGenerationForm.ts`.
- `app/components/media/MediaGenerateComposer.vue` hard-codes its inputs.

## Work

1. Add a typed `mediaSlots` declaration to `server/utils/video-generation/modelRegistry.ts` (slot kind, min/max, accepted media types, cross-slot budget, e.g. "a reference video uses 3 of 7 reference slots").
2. Validate submissions server-side against the declaration (never trust the UI).
3. Drive `MediaGenerateComposer.vue` from the selected workflow + model slots.
4. Migrate the three booleans to the new shape without breaking existing models/templates.

## Acceptance criteria

- Changing workflow shows only models that support it; changing model shows only its slots.
- Over-limit or wrong-type media is rejected by the server with a clear message.
- Existing generation templates and models still work unchanged.
