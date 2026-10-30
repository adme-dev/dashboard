# Banner Studio launcher card release

This is a narrow release for `creative.xeroflow.io`, served by the standalone
`xeroflow-creative-tools` Cloudflare Worker. It adds a seventh card linking to
`https://app.xeroflow.io/creative/banner-studio` and its 1586 × 992 WebP cover.
It does not ship the untracked, unfinished creative project-library candidate.

The `source/` files are exact snapshots of the active Worker script and launcher
HTML from Worker version `e7902982-b062-4db9-9778-77dfdf0d1274`. `build.mjs`
checks their SHA-256 values, changes only the launcher response and adds a public
cover response, then writes `dist/worker.js`. The release uses Cloudflare's
`keep_assets` version-upload option to retain every existing editor asset and
inherits the existing `ASSETS`, `CREATIVE_AUTH_KEY`, and `MOTORSTACK_API_KEY`
bindings. It keeps the active compatibility date `2026-10-27`.

Run `node build.mjs`, then `node --test build.test.mjs` with Node 24. Upload the
generated script as a new Worker **version** using the API with `keep_assets: true`,
inspect that version's bindings and assets before deploying it at 100%, and verify
the custom domain and workers.dev origin. The previous version is the rollback
target. Never deploy a partial asset directory with Wrangler: that would remove
the six existing editor asset sets.

The full creative Worker source currently lives only in an untracked worktree at
`/private/tmp/xeroflow-creative-bucket-20261029/workers/craft-editors/`. The same
card and cover were applied there for later reconciliation. When that source is
committed and released, carry this launcher card forward rather than treating
the bundled snapshot here as the long-term source of truth.

## Production release — 30 October 2026

- Source and current `origin/main` at release: `b668cbcdf2391a86e0f7411a019c4cd84434d800` (PR #757).
- Target: Cloudflare Worker `xeroflow-creative-tools`, serving `creative.xeroflow.io` and `xeroflow-creative-tools.adme-dev.workers.dev`.
- Previous 100% version: `e7902982-b062-4db9-9778-77dfdf0d1274` (rollback target).
- Uploaded version: `4ac68720-79ab-450a-a38f-6a5c81294269`; deployment: `0ddd8bf0-96c3-4855-94fd-c2e85e9bf6f1` at 100%.
- Uploaded version inspection confirmed the existing static asset configuration, `ASSETS` binding, both secret bindings, and compatibility date `2026-10-27`.
- Build and three release tests passed from the merged main commit. Production and workers.dev launcher responses both returned HTTP 200 with seven cards and SHA-256 `fb2fc948e352d12bae19d0b51ee702215ce56f44d2b998cdd3fa8c01b8525a3e`, matching the built HTML.
- Production cover returned HTTP 200 as `image/webp`, 169,880 bytes, SHA-256 `7b5029367fc3df50d02d55ccb09dceb79eef1161fc8507eb6896c6c9f493e677`, matching the source image. All six existing covers returned HTTP 200, and unauthenticated editor requests retained their HTTP 401 behavior.
- The Banner Studio card links to `/creative/banner-studio`, which reaches the application login redirect for an unauthenticated request. The established `/agency/qr-codes` route responded with HTTP 200. A browser visual check showed the new card centered below the original six with its cover rendered.
