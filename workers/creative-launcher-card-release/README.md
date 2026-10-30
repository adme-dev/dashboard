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
