# Storyboard producer release and recovery

R1 is implemented locally for a bounded static-copy profile. It is not accepted for hosted rollout. Use the [release evidence index](../video/releases/2026-11-05-storyboard-r1/README.md) to track the remaining gates. R2 production and R3 continuity remain outside this release.

## Supported content

The [T08 receipt](../video/implementations/2026-11-05-storyboard-render-enforcement.md) defines the supported profile: static Latin/basic punctuation, supported system fonts, opaque high-contrast backing, default caption styling, no overlapping required-copy surfaces, at most 60 seconds per copy-bearing clip and 16 MiB aggregate pinned inputs. A 120-second edit can contain multiple supported clips. Unsupported content must produce an actionable finding; do not remove obligations to make it render. The editor caption preview differs from the measured output layout, so inspect actual output before acceptance.

## Prepare an isolated pilot

1. Fetch current main and reconcile the candidate. Record the exact candidate and main SHAs. Use Node 24.18.0 and run `pnpm deploy:check`; never bypass the target or source guards. Run the focused regression suite, repository CI, relevant lint/typecheck and `pnpm build`. The build script sets a 10 GiB Node old-space limit (`--max-old-space-size=10240`); this is not a cap on total process memory or disk usage. A guard pass is not a build pass or deployment receipt.
2. Verify migrations 500–503 on the intended database using content-free schema checks. Migration 503 is additive and was verified during T08; a different preview database still needs its own migration receipt.
3. Use isolated database, private R2 bucket, queues, dead-letter queues and worker/container bindings for preview. The checked-in `audio-jobs` configuration names shared resources; it is not an isolated preview configuration. Do not bind a test producer to the production consumer.
4. Verify the Pages `STORYBOARD_MEDIA_PROBE` service binding, `VIDEO_RENDER_QUEUE` and storage configuration against the same isolated worker/database. The checked-in probe binding is production-only. Verify worker `HYPERDRIVE`, `AUDIO_BUCKET`, `RENDER`, callback origin and matching `STORYBOARD_RENDER_SECRET` presence without printing values.
5. Resolve callback-origin isolation before deployment: `callStoryboardRenderAuthority` currently accepts only `https://app.xeroflow.io` or `https://agency-dashboard-6cm.pages.dev` (the production project's own subdomain; bare `agency-dashboard.pages.dev` belongs to an unrelated project). A branch preview URL is rejected. Add an explicitly reviewed exact preview-origin policy and tests, or provision an equivalently isolated supported route. Do not point preview callbacks at production and do not broadly allow arbitrary URLs.
6. Build and exercise the actual Linux Docker image with its installed Chromium, Liberation fonts, Puppeteer and FFmpeg. Check available disk and memory first; the full application build can require substantial swap on a busy machine. Record image digest, platform and versions. Exercise measurement, capture, HTTP output and all three formats, plus negative copy fixtures. Local macOS module tests are supporting evidence only.
7. Keep all storyboard flags off initially. Enable only `VIDEO_STORYBOARD_ENABLED='true'` in the isolated pilot after capabilities pass. Deployed Cloudflare bindings take precedence over local environment values. Keep R2/R3 flags off. Use ordinary staff, owner, wrong-client and two-tab accounts on synthetic, agency-authorized fixtures.
8. Use only guarded Pages deployment commands for an authorized target. Record deployment ID, exact source/main, environment and flag states. Worker/container changes require their own deployment receipt; a Pages deployment alone does not release them. Recheck source freshness before release.

## Acceptance journey

Run dealer offer, product reveal and brand-story recipes with owned synthetic assets. Record recipe/source revisions and eligibility separately from human approval. Do not use upstream showcase assets. Verify exact copy and frame totals, asset reuse across shots, missing-price rejection and explicit copy revision approval.

Inspect portrait, square and landscape exports for full copy, placement, clipping, fonts, timing and audible intended audio. Exercise stale/revoked/wrong-client sources; two-tab conflicts; repeated operation IDs and timeouts; trim/reorder/replace followed by adjusted-edit review; named version restoration and flag-off rendering. Do not accept a transport success as proof of correct output.

Verify keyboard, narrow and dark layouts in the signed-in application. Recheck audio-only and legacy AV projects, manual source generation, overlays/captions, versions, library saves, portal/social entry points and QR Codes/navigation. Do not send externally or incur paid generation solely to satisfy a checklist without the corresponding authorization.

Measure the pilot's baseline and completion time separately from synthetic test execution. Keep R1 acceptance pending until the release matrix and pilot criteria pass.

## Disablement and recovery

Set `VIDEO_STORYBOARD_ENABLED` off to stop new planning/application. Saved plans, receipts and timelines remain available. Existing obligated timelines still require lineage and render enforcement; disabling entry does not exempt them. Adjusted-edit review can approve changed copy and eligible media/Banner references without generating content. Pinned brand-kit changes still require the flag-enabled reference workflow and remain a documented flag-off recovery limitation.

For uncertain render publication, reconcile the existing job/manifest and retained output; do not regenerate or create a new paid job as a retry. Do not delete outputs while a callback timeout, 408, 429 or server error leaves publication uncertain. Investigate the original job identity using content-free diagnostics.

Before rollout, record a verified compatible rollback artifact and its deployment ID. An artifact predating lineage enforcement is not a safe automatic rollback for already-obligated projects. Prefer disabling new entry while retaining enforcement. If no compatible artifact exists, block rollout until recovery is established. Leave additive schema and immutable evidence in place; do not drop approval/obligation tables as rollback.
