# Original animation for dashboard launchers

Implemented on `feat/reference-ai-orb-20261007`, based on freshly fetched
`origin/main` at `12d2b3226`. The existing working checkout was preserved.

The agency Activity Hub and flag-gated Portal Assistant now use a shared Nuxt UI
launcher containing the user's original GIF. Their existing open handlers,
visibility conditions, portal flag and Activity Hub unread badge are retained.
The older, unmounted `AiChatWidget` is not an active layout entry point.

## Artwork

- Source: user-supplied `af7b6ee82ae6de2df640d6d40c8fe8a4-1.gif`.
- Public asset: `/animations/ai-orb-reference.gif` (400 × 300, 4,585,443 bytes).
- SHA-256: `32d63b7b7f8011a008a017f2d6a9d59afeee3a97997a364954cede04cb65b67b`.
- File is byte-identical to the supplied GIF; no re-encoding or colour changes.
- CSS crops the surrounding padding into a feathered circle. The original black
  background remains visible on light surfaces. No added ring or solid fill.
- The hit target is 72 × 72 CSS pixels. Reduced motion displays a captured frame
  of the same image. CSS hiding stops visible animation, not GIF downloading.

## Verification and delivery

- Nuxt prepare passed and registered both new auto-imported components.
- Focused Vitest run passed: 5 tests across reduced-motion frame capture and
  existing portal activity navigation.
- New component/test lint passed. Existing parent components retain their
  baseline 6 and 31 lint errors, with no new errors.
- Component preview production build passed.
- Real Chrome preview: dark/light surfaces rendered; pointer and Enter-key
  activation emitted clicks; reduced-motion canvas displayed; mobile preview at
  390px had no horizontal overflow; no browser warnings/errors were observed.
- Preview uses the actual shared launcher and Nuxt UI button. Authenticated
  dashboard/portal chat flows and a full application production build have not
  been exercised in this change.
- Implementation and local verification complete. Not merged or deployed.

Local review: `http://127.0.0.1:8770/` while the preview server is running.
