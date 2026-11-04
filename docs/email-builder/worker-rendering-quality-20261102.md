# M05 generated email rendering quality — 2 November 2026

Task `task_0704d5730001`, dispatch `ctx_6979af13b28d`.
Branch `adme-dev/email-rendering-quality-20261102` begins at integrated `3f4271900`;
the old authority branch and brand commit are retained. Parent owns integration,
current-main reconciliation, CI, deployment and actual recipient-client acceptance.

## Implementation plan

- Add focused failing HTML assertions, admission cases and RPC parity fixtures.
- Add a shared bounded rendering-quality contract, generated-only theme wrapper,
  per-image dark logo, opt-in VML CTA and visual mobile reversal.
- Add coherent existing composer controls with Nuxt UI and UFormField; retain
  authored defaults and imported full-document identity.
- Verify published dark-logo asset scope without widening native/designer grants.
- Run scoped tests, lint, types and changed SFC compiles; inspect every changed
  file and commit the result. Record exact evidence and remaining acceptance.

## UI direction

Retain the agency inspector's semantic `bg-elevated`, `text-muted`,
`border-default` palette and existing sans-serif hierarchy. Use compact,
left-aligned labeled sections and single-column controls suitable for a narrow
inspector; the dark email palette controls appear only after explicit opt-in.
Copy distinguishes visual mobile reversal from source/focus order and generated
email CSS from recipient-client compatibility.

## Delivered source contract

The canonical private HTML compiler owns these optional properties. Existing
`DocumentRenderOptions` and native/designer operation allowlists are unchanged.

| Block | Property | Contract |
| --- | --- | --- |
| EmailLayout | `darkMode` | Explicit boolean; only `true` emits generated dark metadata/CSS. |
| EmailLayout | `darkBackdropColor`, `darkCanvasColor`, `darkTextColor` | Optional six-digit hex; defaults `#111827`, `#1f2937`, `#f3f4f6`. |
| Image | `darkSrc` | Optional static public HTTPS URL, at most 8192 characters; empty clears it; merge tokens, private hosts and unsafe protocols refused. |
| Button | `outlookVml` | Explicit boolean; only `true` selects generated VML plus non-MSO HTML fallback. |
| Button | `outlookWidth` | Optional integer 32–960px; capped to the available rendered column estimate. Default 200px, or available width when `fullWidth` is selected. |
| ColumnsContainer | `reverseStacking` | Explicit boolean; visual reversal inside the existing 620px mobile breakpoint, with unchanged source order. |

Root width still uses `resolveEmailContentWidth`: integer 320–960px, otherwise
600px. The new width input allows intermediate typing and normalises an invalid
value on blur/Enter. Turning on dark styling adds both `color-scheme` and
`supported-color-schemes` metadata, `prefers-color-scheme: dark` rules and
`[data-ogsc]` selectors. Default generated Heading/Text colors receive a dark
text class. Explicit block colors and explicit container/column backgrounds
remain authored; default text inside an authored light panel is not recolored.
This does not infer palettes, globally invert artwork or restyle imported HTML.

An Image's dark variant emits two safely encoded image references only when
root dark styling is enabled. The normal logo is the fallback; the alternate is
hidden inline and behind a non-MSO conditional boundary until the generated
CSS reveals it. The Word/MSO source branch contains the normal logo. Both
variants retain the original alt text and enclosing link. No renderer fetch,
font download, pixel inspection, browser canvas or raster export is involved.

The opt-in CTA contains an MSO-only `v:roundrect`, VML/Word namespaces,
`w:anchorlock`, bounded deterministic shape dimensions, fill/foreground, radius
and font choices. A downlevel-revealed non-MSO anchor uses the same encoded
logical label and destination. Sizes use the existing button size choices;
explicit width takes precedence over Full/Auto. Generated shape mode supports
solid fills and fixed geometry, not arbitrary visual effects. Existing advanced
shadow/border/background-image effects are not translated to VML. Long labels,
personalized labels, zoom and font substitution require recipient-client review;
fixed shape dimensions are not browser-measured or promised to auto-fit text.
The existing tracking helper rewrites both VML and anchor href attributes to the
same signed click URL, covered by a focused regression without changing sender
code or sending anything.

Mobile reversal uses `flex-direction: column-reverse` on the opted-in row inside
the existing mobile stylesheet. It deliberately retains DOM order, keyboard
order and compiler traversal/condition numbering. This is progressive visual
behavior in clients that support the CSS; it does not claim to change screen
reader order or certify an accessible reading sequence for arbitrary content.

Nuxt UI/UFormField controls are in the existing layout and block inspectors.
The dark palette appears only after opt-in. Block-wide quality controls are
disabled while editing mobile overrides; inherited quality fields are filtered
from mobile prop updates, just like the existing canonical condition field.
No parallel settings panel, builder shell or save/history owner was introduced.

## Admission, identity and authority

`shared/emailRendering/renderingQuality.ts` is the shared safe field contract.
Both renderer graph admission and canonical design validation call it. New
fields reject truthy strings, malformed objects, misplaced flags, invalid
colors, out-of-range dimensions and unsupported mobile placement. VML also
checks the styles/URLs on which its generated attributes depend. Reversal
checks bounded columns, gaps and declared widths. Unknown pre-existing block
extensions retain their existing contract; this change does not claim to
validate every historical block property. Strict RPC options remain unchanged.

Absent flags preserve the captured golden HTML exactly. Root `primaryColor`
remains authoring-only; renderer fallback color still comes from the existing
render option/default. Conditions still resolve before the single merge pass;
metadata uses the integrated text-context resolver and one HTML encoding pass.
Compiler-owned condition markers and protected/legal subtree rules are unchanged.

A complete imported `Html` document with `documentMode:'email'` still returns
through the existing isolated document bypass before any generated wrapper,
metadata, theme or reversal CSS. Its head, media rules, conditional comments and
source bytes remain exact when no recipient substitution is requested. The
existing intentional single-pass substitution applies when variables are given.
Both direct and actual Workerd RPC tests prove this byte-preserving regression.
No global stylesheet inliner was added; the R&D's optional inlining/juice item
is outside this approved slice.

Coordinator-approved asset boundary:

- An already-saved legacy public HTTPS `darkSrc` survives the deterministic
  server-derived first conversion exactly, with `assets:[]`. These legacy
  references are not certified immutable media.
- A browser-supplied differing variant cannot masquerade as that first
  conversion: the real canonical writer compares it to the persisted source.
- Staff/native content returns cannot change `darkSrc`; it is not added to
  default content grants or designer/native operation schemas. No-op returns
  preserve source, dependencies, module pins and descriptors.
- Module/template publication uses the existing `verifyDesignModuleAssets`
  collector, extended with coordinator approval to check BOTH light and dark
  URLs against registered publication, stored client scope, canonical signed
  delivery URL, actual bytes and immutable digest/MIME/dimensions. Unknown,
  foreign-client, altered descriptor and altered dark bytes are refused.

The URL controls operate in the existing composer. For an already-versioned
protected draft, changing these design properties locally does not grant a
content-only staff PATCH or native return permission. Parent owns future typed
selection from registered published assets and any explicit additional
canonical designer authoring capability. This worker does not silently widen
those permissions or claim those future controls are already saved by native.

## Verification

Node: `/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node`.
Final scoped run: **601 tests pass across 53 files**, with cache disabled and
one worker. Actual Workerd RPC agrees with direct rendering and records zero
outbound requests. Scope includes canonical design/brand/locks/modules and
publication, conditions/markers, golden HTML, full-document preservation,
encoding/singlepass values, VML source and signed link parity, default dark text,
mobile order, width bounds, inspector output and live Vue control events.
The database/storage publication fixtures are deterministic local adapters;
they do not certify PostgreSQL concurrency or deployed storage behavior.

```sh
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH \
node node_modules/vitest/vitest.mjs run \
  test/unit/emailDesign*.test.ts test/unit/emailConditions.test.ts \
  test/unit/emailContentWidth.test.ts test/unit/emailMergeTags.test.ts \
  test/workers/emailRendering*.test.ts \
  test/components/emailRenderingQualityControls.test.ts \
  test/components/emailEdmBlockSettingsPanel.test.ts \
  test/app/edmBuilderStore.test.ts test/emailRendering \
  test/utils/emailTrackingLinks.test.ts --cache=false --maxWorkers=1
```

Private Worker strict TypeScript, strict shared rendering/design contract types,
scoped authoring store/types, changed-source ESLint, both changed Vue SFC script
and template compilations, and `git diff --check` pass. The authoring scope uses
the repository's non-strict convention and DOM/DOM.Iterable libraries. This is
not a full Nuxt typecheck/build. The suite emits the existing Vite
`configLoader:'native'`/`__dirname` migration warning; no test failures remain.

Evidence logs are local and content-free:
`/private/tmp/email-quality-suite.log`, `email-quality-types.log`,
`email-quality-shared-types.log`, `email-quality-authoring-types.log`,
`email-quality-lint.log`, `email-quality-sfc.log` (same directory).

All changed/new files were reviewed before commit, including aliases, field
values, controlled-input behavior, duplicated sections, six-digit theme colors,
URL admission, condition ownership and Worker dependency isolation. Full Nuxt
and Rust builds, installs, configured DB/provider operations, migrations,
deployment and actual email sends were not run. Parent retains current-main,
independent integration/CI and release/public-feature-page synchronization.

## Remaining recipient acceptance

No browser screenshot or synthetic HTML assertion is an Outlook/Gmail/Apple Mail
certificate. Parent should use approved fixture recipients to inspect classic
Outlook Windows (VML/link/dimensions/font substitution), Outlook web/mobile
(data-ogsc behavior), Gmail web/mobile (CSS stripping/auto-inversion/fallback
logo), and Apple Mail light/dark (metadata, logo swapping and palette). Review
normal/reversed two- and three-column layouts at 320/600/700/960px widths,
personalized CTA copy, nested light panels and supported/unsupported CSS cases.
Verify keyboard/screen-reader source order against the actual content separately.
No client compatibility claim or provider receipt is made here.

## Research provenance

Read the approved adoption note and the exact local R&D at base `3f4271900`.
The R&D remains design reference only; no Beefree code was copied.

- `docs/research/email-builder-roadmap-2026-11-02.md` SHA-256:
  `969c418df989aa5ba84a313bb168098e4dea025d17638060ca21014d63cac9b8`.
- `docs/research/email-builder-roadmap-adoption-2026-11-02.md` SHA-256:
  `60150ef2ab09472abcfb23fdc24da3e286f2c136f6c2cd0bb8393bd0989fdb2f`.

Source conventions were checked against Microsoft's
[VML RoundRect reference](https://learn.microsoft.com/en-us/windows/win32/vml/msdn-online-vml-roundrect-element)
and MDN's [color-scheme metadata](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/meta/name/color-scheme)
and [prefers-color-scheme reference](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-color-scheme).
These describe source syntax and browser behavior, not delivered-email acceptance.
