# Video studio: structured camera / lens prompt builder

Captured: 2026-11-18
Priority: P2
Status: pending
Source: Review of github.com/Anil-matcha/Open-Generative-AI (MIT, MuAPI front-end), 2026-11-18. Re-implement ideas in Vue/Nuxt; do not copy code. Reference: `buildNanoBananaPrompt` in `CinemaStudio.jsx`.

## Outcome

A "Camera" picker (camera body, lens, focal length, aperture, movement) that deterministically appends cinematography language to the prompt, e.g. focal length → perspective, aperture → depth of field. Aimed at automotive hero and reveal shots.

## Work

1. Small pure mapping module (e.g. `app/utils/video/cameraPrompt.ts`) with unit tests.
2. Picker in `app/components/media/MediaGenerateComposer.vue`; optional defaults per template in `app/utils/video/generationTemplates.ts`.
3. Show the resulting prompt text so staff can edit it.

## Acceptance criteria

- Same picker choices always produce the same prompt fragment (tested).
- Picker is optional; empty selection leaves the prompt untouched.
