# TheBrief → XeroFlow: one-banner migration pilot

User authorised implementation and a one-banner timeline trial on 5 October 2026.

## Outcome

Import one customer-owned animated HTML5 export, compare it with the original,
and establish whether its text, artwork and animation can become editable native
Banner Studio layers and timeline tracks. Retain original bytes and report any
unsupported effects. Successful HTML playback alone is not timeline conversion.

## Source and access

- Freshly fetched `origin/main`: `8c8a5b5c4`.
- Branch: `feat/thebrief-import-pilot-20261005`, worktree
  `/private/tmp/xeroflow-thebrief-import-20261005`.
- Fast-forwarded the existing release work at `e9647caec` to retain the deployed
  Banner Studio and social workflow; current main is its ancestor (88 ahead,
  zero behind). Existing rollout work remains unmerged; do not discard it or
  release from an older isolated main checkout.
- Safari opened the real TheBrief application and reached sign-in. User asked
  to sign in and open one representative animated banner.
- No identifiable TheBrief ZIP found in Downloads or DriveAgent marketing.
- Real customer compatibility remains unverified until an export is available.

## Delivery sequence

1. **Offline archive inspection (implemented):** inspect a single ZIP or one
   nested set level; record hashes, paths, dimensions and animation/resource
   hints. Reject unsupported/unsafe archives and enforce shared expansion
   budgets. Never run imported code, fetch dependencies or extract to disk.
2. **Real source fixture (pending access):** export one banner as HTML5 and keep
   a reference preview/video. Record duration, looping and network settings.
   Inspect its actual runtime and data; avoid assuming it uses GSAP.
3. **Native adapter (pending fixture):** map supported objects, positions,
   typography, assets, keyframe times and easing into Banner Studio. Explicitly
   report unsupported transitions, masks or runtime behaviour. Keep original
   source separately; do not replace complex animations with a flattened image
   while claiming timeline recovery.
4. **Private project trial:** use existing client-authorised project/asset APIs,
   with duplicate protection and provenance. Test play, scrub, edit one headline,
   save/reload, undo, then render MP4. No automatic publishing.
5. **Visual acceptance:** compare start, entrance, midpoint, exit and loop
   frames; check fonts and click destination. A sample passes only when the
   native timeline and rendered output agree with the original within a
   documented tolerance and any differences are visible to the operator.
6. **Product extension and bulk migration:** expose the verified path in Banner
   Studio with import report, client assignment and per-design failures. Expand
   archive support and source adapters from real evidence. Inventory the full
   library, preserve design/size identities, and make retries idempotent.

## Current tool

```sh
node scripts/thebrief/inspect.mjs /path/to/banner.zip > /path/to/report.json
pnpm exec vitest run test/thebrief/inspectArchive.test.ts
```

The report is a static preflight, not a runtime security certification, complete
dependency graph, imported project or editable timeline. No UI/backend route
exposes it in production yet. ZIP64, encrypted archives, symlinks, legacy
non-ASCII filename encodings, unusual compression and deeper nesting are
explicitly unsupported in this pilot. Limits: 20 MB input per archive, 10 MB per
file, 40 MB cumulative expansion, 500 entries including nested sets.

The earlier detailed architectural research remains in
`docs/research/2026-10-04-thebrief-banner-import.md`. Arbitrary HTML execution
requires its isolated preview and network controls before any product preview.

## Verification — 5 October

- 14 focused tests passed, including a real CLI invocation on a synthetic ZIP,
  same-size variants in nested sets, forged sizes, CRC corruption, conflicting
  filenames, paths, encrypted archives, symlinks and shared limits.
- Scoped ESLint passed for both scripts and the test file.
- `pnpm lint` ran and failed with 62,819 findings across the repository. The
  initial new-file formatting findings were fixed and scoped lint rerun clean;
  no repository-wide clean claim is made.
- Nuxt preparation succeeded. No application bundle, production route or UI
  changed in this slice, so no application deployment was performed.
- Synthetic tests establish inspector behaviour only. Real-banner conversion,
  editable timeline fidelity and a XeroFlow project remain pending.

## Bulk inventory finding

The official [Designs API](https://docs.thebrief.ai/public-api/rest-api/designs)
documents cursor pagination (up to 50 records/page), project/folder IDs and
design IDs. API-generated designs are excluded by default and need an explicit
inventory pass. The eventual migration ledger must account for these plus
templates, rather than assuming one designs-list response is the entire library.
API access and entitlement have not been verified for this account.
