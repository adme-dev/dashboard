# Page Studio generated verifier security refresh — 24 October 2026

## Problem

Three checked-in native verifier exports embed Zod 4.4.3. Updating Studio's package lock does not update these generated modules. GHSA-mrhx-c7xc-m3w5 affects versions below 4.6.6; the reviewed Studio dependency pin is 4.6.7. Package-manager audits do not inspect vendored module contents.

Advisory: https://github.com/advisories/GHSA-mrhx-c7xc-m3w5

## Source and generation

Regenerate both native exports using Studio's existing official scripts and deterministic `--check`. Copy the builder export to `shared/pageStudio/generated` and `workers/page-studio-management/src/generated`; copy the transfer export to the latter directory's `managed-transfer-copy` subdirectory. Do not edit generated source, fixtures, declarations or hashes by hand.

Studio dependency commit: `78bd718`. Final namespace-import source commit: `f1a7aa67f7f63e5a8f9bc0269903b906d8cc5ce0` (normal full hook passed; postcommit deterministic checks passed). The import uses the established `import * as z` pattern in shared-forms, with its scoped Biome explanation, and changes no schema rules. Named namespace-object import retained unused Zod APIs/locales. The paired export uses current reviewed Studio schemas, including the existing snapshot verification export; it is not an old application branch deployment.

The builder provenance source digest is `009136a0325189393f790a62a9c96d68b49b62de6bfa8b5a592fbc5e17e7f812`; transfer digest is `b63c83d25863e5e271c0256cabbb3bbcd97ab5ea9dad902dfb187be6e6ce2a93`. Both manifests report Zod 4.6.7, esbuild 0.28.2 and TypeScript 6.0.3.

## Compatibility scope

This is not a claim that every old accepted/rejected input is unchanged. The shared Dashboard export also synchronizes already-reviewed current Studio schema support for shared form libraries and action bindings, quote handoff, focal points, motion and header styles. It now rejects invalid reserved paper/poster theme tokens. The builder export adds `verifyBuilderApplicationSnapshot` without removing any prior export. Its snapshot extraction preserves checkpoint binding through the same version-digest equalities. Management builder and transfer-copy nondependency source changes are limited to the shared-forms namespace import. Existing compatibility fixtures pass; native consumers still independently enforce current authority and record locks.

## Size decision

The prior shared builder export minified to180,736 bytes with function names retained. The naive current-schema patched export retained unused APIs and failed the190,000-byte component allowance at585,427 bytes. The namespace import reduces the actual final export to206,814 bytes. A separate probe using the exact historical schema and patched Zod still measured202,612 bytes; keeping the old component allowance would exclude the security patch even without newer schemas.

The reviewed proposal increases only this component allowance to210,000 bytes (3,186 bytes headroom). Total Pages deployment budgets remain25,468,928 raw bytes and9,750,000 gzip bytes. The previous full packaging build atc6d2bb55c measured25,371,816 raw bytes and7,377,674 gzip bytes. A new full build must pass the unchanged total guards; the arithmetic estimate alone is not release evidence.

## Verification and release state

- Regression first: all3vendored dependency tests failed on4.4.3 before regeneration.
- Regeneration: official source export and deterministic checks passed. No generated output hand edits.
- Compatibility:104tests across11files pass, including graph/save/checkpoint/action, Astro identity/release and native transfer consumers.
- Management Worker typecheck and changed-test ESLint pass.
- New inventory test checks all3dependency pins, dependency input versions, source manifest digest and output hashes, including transfer-copy.
- Studio's namespace import passes75protocol files/795tests and protocol typecheck.
- Independent review approved the generated exports, API compatibility and component allowance after documenting the schema scope above. Management Worker staging dry-run passed: 3,516.46 KiB upload / 618.42 KiB gzip. Full Pages build passed: 25,397,149 raw bytes (71,779 bytes below the unchanged limit), 7,388,123 gzip bytes. No deployment or customer activation is implied.

Operational receipts and build hashes are in `Documents/XeroFlow Imports/Recovery 2026-10-24`. Preserve the original dirty Dashboard and Studio recovery checkouts.
