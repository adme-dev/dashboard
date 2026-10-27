# Release gate inventory reconciliation

The current-main frozen inventory reproduced exactly at 1,613 rows and digest `cef85f34a2fd968996632bfc6e7377f6e4b960c7a7bf61dd22a4d0b2bad5fbf4`. The Banner candidate adds 20 lexical rows and removes eight: 1,625 rows, digest `3d200d48926a51804066ebd3bd4753b88515ef95169b791dd83f7990a16d8cd5`.

Reviewed differences are explicit write access on editing/job/QR mutations; assignment of the existing creation user; authoritative request-bound cron/OpenAI credentials; removal of four ambient S3 reads; request-aware Dissector configuration; and a local-only dispatch fallback. There is no new God-mode bypass registration or change to identity/tenant classification. The test pins every added and removed row as well as aggregate counts and digest. This updates the source inventory after reviewed functionality; it does not weaken any runtime access check.

The first reconciled run failed on the old frozen row count (expected 1,613, actual 1,625), while the other 44 tests passed. Rerun evidence belongs to the release ledger. Main source at reconciliation: `704fb5caf`.

Final reconciliation regression: all 45 tests across gate inventory, Pages text bindings and Google Business environment passed on Node 24.18.0. Scoped ESLint and diff whitespace check passed.

## Full-suite mechanical isolation inventory

CI run 40474424617 passed 20,327 tests and failed only the old mechanical inventory assertion. Independently enumerating committed API files at base 704fb5caf and the candidate reproduces 2,283 to 2,294 routes, 1,245 to 1,254 mutations, 410 to 422 inline guarded mutations, and 49 to 50 guarded transactions. Latest main eb294e860 changes only form redirect handling and does not affect this inventory.

Eleven added routes are artwork generation, lettering and lettering repair; dissection cancellation; engine status, output, cancellation and submission; platform QR insertion; dissection cron recovery; and internal engine service. Artwork and QR handlers delegate to requireWriteAccess and independent project/client checks. Internal routes require their machine credentials. Nine existing mutations gain inline write gates, three added mutations have inline gates, and dissection import adds a transaction. No runtime policy, bypass registration, inventory algorithm or assertion strength is changed.

Reviewed classification changes (vectors are route, mutation, inline gate, guarded transaction):

- `server/api/agency/banner-studio/ai/copy-suggest.post.ts`: [1, 1, 0, 0] → [1, 1, 1, 0]
- `server/api/agency/banner-studio/ai/decompose.post.ts`: [1, 1, 0, 0] → [1, 1, 1, 0]
- `server/api/agency/banner-studio/ai/generate.post.ts`: None → [1, 1, 0, 0]
- `server/api/agency/banner-studio/ai/lettering.post.ts`: None → [1, 1, 0, 0]
- `server/api/agency/banner-studio/ai/repair-lettering.post.ts`: None → [1, 1, 0, 0]
- `server/api/agency/banner-studio/assets/[id].patch.ts`: [1, 1, 0, 0] → [1, 1, 1, 0]
- `server/api/agency/banner-studio/dissect/[jobId]/cancel.post.ts`: None → [1, 1, 1, 0]
- `server/api/agency/banner-studio/dissect/[jobId]/import.post.ts`: [1, 1, 0, 0] → [1, 1, 1, 1]
- `server/api/agency/banner-studio/dissect/process.post.ts`: [1, 1, 0, 0] → [1, 1, 1, 0]
- `server/api/agency/banner-studio/dissect/upload.post.ts`: [1, 1, 0, 0] → [1, 1, 1, 0]
- `server/api/agency/banner-studio/engine-jobs/[jobId].get.ts`: None → [1, 0, 0, 0]
- `server/api/agency/banner-studio/engine-jobs/[jobId]/cancel.post.ts`: None → [1, 1, 1, 0]
- `server/api/agency/banner-studio/engine-jobs/[jobId]/output.get.ts`: None → [1, 0, 0, 0]
- `server/api/agency/banner-studio/engine-jobs/index.post.ts`: None → [1, 1, 1, 0]
- `server/api/agency/banner-studio/projects/[id].patch.ts`: [1, 1, 0, 0] → [1, 1, 1, 0]
- `server/api/agency/banner-studio/projects/[id]/duplicate.post.ts`: [1, 1, 0, 0] → [1, 1, 1, 0]
- `server/api/agency/banner-studio/projects/[id]/qr.post.ts`: None → [1, 1, 0, 0]
- `server/api/agency/banner-studio/versions/restore.post.ts`: [1, 1, 0, 0] → [1, 1, 1, 0]
- `server/api/cron/banner-dissection-recovery.post.ts`: None → [1, 1, 0, 0]
- `server/api/internal/banner-engine.post.ts`: None → [1, 1, 0, 0]
