# Handoff — QR program (2026-08-25)

## Shipped to production today
- #460 UI/UX overhaul, scan geo (suburb/postcode/lat-lng), scan cluster map (migs 350–351)
- #461 UTM + `xf_qr` tagging on redirect, per-code `utm_source`/`utm_medium`, lead attribution, "Where leads live" map (migs 352–353), CRM promotion carries `xf_qr`
- #462 God-mode mutation families for all QR write routes (owners got 503 on every QR write since #449)

## In flight
- #463 S1 hosted landing pages (migs 354–355). Merge on green → `pnpm deploy:production` from a clean `origin/main` worktree with its own node_modules (`~/.claude/worktrees/qr-deploy` pattern).
  - Mig 355 also fixes a pre-existing bug: every `lead_created` conversion publish failed `conversion_events_attribution_check2` (gaClientId). Check lead webhook logs after deploy.
  - Remaining UAT: hero/logo upload through the editor in the browser (server path unit-tested, not click-tested).

## Spec
`docs/superpowers/specs/2026-08-25-qr-landing-pages-competitions-design.md` — S2 competitions + legal vault + permits, S3 CTA frames, S4 bulk/variant codes, S5 presets, S6 A/B, S7 client-360 export. Paul: "bake all of this in"; clients apply for permits → attach approvals/contracts as immutable, hashed evidence; each entry records the T&Cs version accepted.

## S2 build notes (next)
- Tables in spec (migration 356): qr_competitions, terms_versions, entries, draws, documents.
- Entries are leads (`source: 'qr'`) + entry row; entrant_hash = sha256(normalised mobile|email + competition id); partial unique index when max_entries_per_person = 1.
- Permit auto-flag thresholds (dated 2026-08, confirm before relying): NSW authority > $10k total prize; ACT permit ≥ $3,001; SA licence > $5k or any scratch-and-win; NT ≥ $5,001 unless holding another state's permit; VIC/QLD/WA/TAS none for standard draws; skill comps none.
- Documents: R2 via `uploadFile('attachments'|'media-image', …)`, serve through a UUID-pair route like `server/api/q/assets/[pageId]/[assetId].get.ts` but **staff-only** (`requireQrCodeAccess`-style); store sha256, size, uploader; soft delete with reason.
- Draw: `crypto.getRandomValues` shuffle, store seed hash + ordered ids + filters; reserves; re-draw appends.
- Register every new write route in `server/utils/qr/godModeMutations.ts` FAMILIES and bump `test/config/godModeIsolationInventory.test.ts` counts.
- Page template `competition` should link `qr_pages.competition_id`; submit route must enforce open window + eligibility + dedupe before acceptLead.

## Gotchas learned
- Dev server watcher misses edits: `pkill … ; rm -rf .nuxt/dev node_modules/.vite; pnpm dev` (CHOKIDAR_USEPOLLING=true).
- Chrome extension can't screenshot `localhost:3111/q/*` — verify public pages with curl.
- `leaflet` ESM has no default export; `leaflet.markercluster` is UMD (use supercluster). Nuxt `.client.vue` refs are unbound in `onMounted` → `watch(el)`.
- Agency layout wraps pages in `overflow-hidden` → pages need `h-full overflow-y-auto`.
- Probe any new write route from the owner session before calling it shipped (503 = unregistered God-mode family).
