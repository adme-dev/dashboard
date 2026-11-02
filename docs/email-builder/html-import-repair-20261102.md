# Complete HTML import repair — 2 November 2026

PR821 is merged and live from exact main
`0147807dcbc9a66819d40c3e32adb959723ac5f5`.

- Pages `agency-dashboard`, production/main:
  `802602e9-99f4-4027-8fa3-e0b36f12196e`.
- Private renderer `xeroflow-email-rendering-production` version:
  `ba8667a1-e71e-4735-9004-4c20b42c99ca`.
- Guarded Worker deployment, `pnpm deploy:check` and `pnpm deploy:production`
  passed. The source guard matched current main before and after building.
  No provider target, capability, credential or campaign activation changed.
- The artifact includes paired Page Studio compatibility PR820. Its owner
  retains Management/Studio operations; Dashboard deployment does not prove their
  hosted save/restore or customer-site acceptance.

## Repair and evidence

Full HTML imports retain sanitized stylesheets, media rules, class hooks,
backgrounds, fonts, hidden alternatives and Outlook conditional fragments. The
editor isolates them in a scriptless iframe. The private renderer emits one
complete document at its own width. Fragment import policy is unchanged.

All three supplied designs were repaired through scoped normal template APIs,
using existing asset uploads and existing draft IDs in `Import review`:

| Source | Draft |
| --- | --- |
| Ford October newsletter | `2647db7b-0b96-5f72-a6ca-cb2d4d9e9228` |
| Nissan summer service | `ebdfaf24-23b5-5e7b-ab39-0c98bfb0e8e6` |
| Cinco de Mayo 4x4 | `be474a21-512b-513a-abb4-a94b17a9ddca` |

Immediately before each PATCH, the current source hash matched the original
import receipt. No staff changes were overwritten. Live import-preview output
matched the reviewed prepared HTML exactly before writing; GET readback confirmed
canonical source, compiled HTML hash, original name/client/kind/folder/metadata.
No additional drafts, assets, revisions or actual email sends were created.

Browser original/repaired comparisons at desktop (600/680px) and 390px matched
width, body height, headings and visible image counts for all three. Hosted Ford
composer after reload measured 600px/6171px and 390px/6075px (rounded), with one
charging image, one Power Promise navigation link and one Unsubscribe link in
each view; no broken images. Real component click/type/Tab editing preserved the
head, ten source style blocks and 49 conditional branches. No email-client
certification is inferred from these browser checks.

Focused tests: 95 passing across nine import/editor/renderer suites; Worker
TypeScript and frozen lockfile passed. Focused lint had no errors (two existing
legacy v-html warnings). Kimi reviewed and cleared three corrected findings.
Normal broad CI remained running; these results are the bounded local evidence,
not a claim that the full CI pipeline passed.

Private source/assets/receipts and screenshots remain under
`/private/tmp/figflow-customer-imports-20261102/` and
`/private/tmp/figflow-html-import-*` / `figflow-import-repaired-hosted-*`.
Raw source, recipient-bearing click queries and delivery signatures are not
committed. Full native FigFlow authoring remains a separate open milestone.
