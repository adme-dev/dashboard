# Bounded ReelMotion Render Split Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans inline, with the user-requested Astra High worker owning container/Worker/graph work.

**Goal:** Produce the real editable ReelMotion reel through the native queue within the existing render deadline.
**Architecture:** Server derives a strictly eligible graphics sibling plus managed source pin from the same banner revision; Worker verifies R2 objects; FFmpeg handles footage and numeric authored zoom while Chromium handles graphics.
**Tech Stack:** Nuxt/Nitro, Cloudflare Worker/Container/R2, Chromium, FFmpeg, Vitest.
**Spec:** docs/superpowers/specs/2026-11-20-reelmotion-render-split-design.md

## Global Constraints

- Keep original editable artwork and legacy full HTML; optional descriptor is additive.
- Preserve source timing,14 authored zoom points, centered crop, cut resets, final hold and all graphics.
- Resolve client-owned managed assets server-side; same-object ETag/size checks before Worker reads.
- No arbitrary source URLs/raw expressions, timeout increase, billing/provider generation or client delivery.
- Qualify immutable image bytes; preserve others' work and native failed-job evidence.

## Review Focus

- Cross-client/missing/mutable assets must not be used by the split.
- Unsupported masks/placement/easing/visual tracks retain whole-artwork capture.
- First nonzero PTS/VFR must match Chromium's media clock at cuts.
- Upper graphics and font/copy timing remain identical across the split.
- Old queue consumers remain correct; pinned storyboard jobs reject an unexpected descriptor.

## Tasks

- [ ] Root: failing eligibility/authorization/compatibility tests, shared typed descriptor, strict pure layer selector, managed source resolver and render dispatch; retain full HTML and create graphics sibling only for eligible managed content.
- [ ] Astra High: failing Worker pin/compatibility and first-PTS/VFR/zoom tests, Worker adapter plus TS/MJS graph and container support, no changes to root-owned producer/shared files.
- [ ] Review all changes, run scoped tests, qualify exact new image including signals and full real composite with20 picture checks, retain immutable digest/context/receipt.
- [ ] Current-main CI and integration; release Worker/container first, guarded Pages producer release, separate live readbacks and monitored native export/download acceptance.
