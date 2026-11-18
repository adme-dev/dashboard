# Video studio: motion-transfer and start/end keyframe modes

Captured: 2026-11-18
Priority: P3 (model-dependent)
Status: blocked: needs a supported model
Source: Review of github.com/Anil-matcha/Open-Generative-AI (MIT, MuAPI front-end), 2026-11-18. Re-implement ideas in Vue/Nuxt; do not copy code.

## Outcome

Workflows for (a) motion transfer: subject/vehicle image + driving video, and (b) start + end frame interpolation, for vehicle reveal shots.

## Current state

`lip-sync` and `video-extension` modes exist in `server/utils/video-generation/types.ts` but no registered model offers them.

## Work

1. Track which Cloudflare AI Gateway / approved provider models support these modes.
2. Implement on top of the media-slot composer (todo 002) once a model is approved.

## Acceptance criteria

- Mode is only offered when a registered, compliance-approved model supports it.

Depends on: 002-video-workflow-first-composer-media-slots.md
