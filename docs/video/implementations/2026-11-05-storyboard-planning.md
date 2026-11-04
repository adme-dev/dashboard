# T04 — Reviewable storyboard planning and copy approval

Completed locally on 5 November 2026. The candidate schema is applied to the verified agency database. The application is not deployed and the storyboard feature remains default-off. This completes the bounded T04 backend slice in the [implementation plan](../../superpowers/plans/2026-11-04-video-storyboard-producer.md); it does not complete R1 or add a visible editor workflow.

## Source and behavior

Branch `adme-dev/video-storyboard-contracts-20261104`, worktree `dashboard/video`. Task base: `40ec1f0112acb046a18c999bd696654bb66cc509`. Fresh fetch confirmed `origin/main` `4372b8c98`, with no base divergence. The commit containing this receipt identifies the implementation source; re-fetch/reconcile before integration or release.

- POST `/api/agency/video/projects/:id/storyboard/plan` creates a persistent candidate through either `method: ai` or `method: manual`. It requires write/project access, the deployed feature flag, expected current plan/reference pointers, human copy content, duration/format and canonical inventory IDs. Reference sets must already exist through T03's reference endpoint. Frame rate comes from the active project timeline.
- AI planning uses the existing model-routing and invocation-telemetry layer with feature key `video_storyboard_planning`. Output is restricted to shot purposes, integer durations, authorized visual IDs and exact copy assignments. Asset titles, directives, URLs, hashes and approval fields are excluded from model inventory. Brief, optional direction and copy are explicitly untrusted data. Unknown fields (including invented prices/copy), unauthorized IDs, missing/reordered speech and incorrect durations are rejected.
- There is one initial model response and at most one semantic repair. Invalid raw output is never embedded in repair prompts or failure records. Provider failure returns an actionable error and keeps the manual path available. The existing Groq transport retains its SDK/gateway fallback behavior; the two-response bound is a semantic planning bound, not a promise of exactly two underlying HTTP attempts.
- Canonical candidate operations are reserved before inference, outside the model call's transaction. Identical completed requests replay their stored result. Changed bodies, pending/ambiguous operations and terminal failures return 409 without automatically redispatching. A new explicit operation is needed for another attempt. Finalization rechecks project access, active pointers, FPS and inventory fingerprints before storing a result; it never advances the editable draft.
- Candidates return a content hash, structural diff and advisory findings. Unchanged shots retain their shot and cue IDs when moved. The diff includes added/removed/changed shots, order, copy, settings/input mode and reference-set changes.
- POST `/storyboard/revisions` requires the candidate ID/hash, original expected revision, operation ID and `acceptChanges: true`. Acceptance rechecks canonical dependencies and uses the T03 locked compare-and-swap store. Competing acceptances cannot overwrite one another. Accepted-operation replay remains available after later edits.
- `approveCopy` is explicit human intent. Approval actor/time and content hash are stamped in the acceptance transaction. Candidates cannot supply approval identities. Human content changes create a new unapproved copy identity; exact text, Unicode and whitespace remain intact. A new approved-script revision cannot be accepted without approval.
- Manual candidates use the same structure, inventory and copy validation without a model dependency. They can carry unresolved media for later editing. Neither path changes timelines, invokes paid media generation, renders, or globally approves assets.
- Owner planning uses the existing external-operation coordinator, storing only the candidate receipt ID in its ledger. Canonical replay reauthorizes and verifies the receipt. Revision acceptance uses the transaction coordinator; ordinary staff retain canonical idempotency independently of the owner ledger.

## Recipes and scope decisions

The existing five recipe IDs and legacy picker shape/defaults remain compatible. Version-1 dealer offer, product reveal and brand-story structures now guide the planner; testimonial/event guidance is also present. Resolved format/duration drive plan fields. Movement, visual look, pacing and optional direction reach the shot guidance. Empty optional direction retains the base guidance. Movement is a single typed setting, explicitly labelled prompt guidance; it does not claim a provider-native camera control.

This slice deliberately keeps all narrative/product/offer copy human-entered in both `idea` and `approved_script` modes. AI proposes shot structure and placement only. Free-form draft narration suggestions need a later separate review contract; the current restriction prevents inferred product/financial claims by construction. User-authored manual direction remains editable content.

Candidate findings are not an assembly approval. T05 still owns measured asset duration, complete cue/media readiness and usage eligibility; T06/T08 own atomic application, obligations and render acceptance. The inherited T03 conservative fingerprints and audio access limitations remain as documented in its receipt. A replayed candidate is a historical proposal, not a current eligibility token.

No new forms or public storyboard marketing claims were added. T07 owns the editor UI and T09 the visible release/marketing synchronization. Official [Cloudflare Pages binding documentation](https://developers.cloudflare.com/pages/functions/bindings/) was checked; the existing deployed-binding-first gate and request bucket path are retained without introducing new infrastructure or secrets.

## Migration and database evidence

Migration: `server/database/migrations/502_video_storyboard_candidates.sql`.
SHA-256: `e147dbdfb81db287dd20bf5e7283da70b55c54b406f2d2818f17bfb61339fe01`.

The additive table has project-scoped operation uniqueness and same-project revision/reference foreign keys. Its transition trigger allows only pending-to-completed/failed transitions and preserves identity and terminal results. Existing storyboard/media rows are not rewritten.

| Target | Provenance | Result |
| --- | --- | --- |
| Isolated | Neon agency project `square-tooth-23821574`, branch `br-muddy-wind-a4u7axf9` (`video-t02-revision-test-20261104`), host `ep-hidden-meadow-a4m2e772.us-east-1.aws.neon.tech`, database `neondb` | Migration and idempotent repeat passed. T04 SQL 4/4; T03 storage SQL regression 5/5. |
| Configured agency | Same project, production branch `br-small-hall-a4qtwjgo`, configured host `ep-lively-fog-a4dum154-pooler.us-east-1.aws.neon.tech`, database `neondb` | Migration committed; readback confirms table, transition trigger, three FKs and one operation uniqueness constraint. |

Neon branch/endpoint metadata and the main checkout's configured environment were checked without printing credentials. SQL tests are locked to the exact isolated endpoint and cleaned up their synthetic projects. The branch is retained. No customer data mutation, provider inference, media upload or application deployment was performed during validation.

## Checks and review

- Test-first failures: 13 pure planner cases, 10 route/candidate cases and two copy-approval cases, followed by passing implementations.
- Actual SQL initially passed 3/4 T04 tests and exposed acceptance after an FPS change. The transaction-time check fixed it; all **4/4 passed** on rerun (87.10 seconds). Tests cover offline manual operation, exact approval/new copy revisions, immutable candidates, same-key model-call exclusion, failed-candidate persistence, historical reads, competing acceptance and project access. Model/HEAD responses are synthetic; SQL and races are real.
- Existing isolated persistence regression: **5/5 passed** (88.03 seconds), covering plan/reference races, replay, immutable storage, revocation and access. No underlying transaction behavior regression found.
- Final local regression: **188 tests passed across 23 files**, including legacy recipe/producer rail/assembly and media save/render APIs.
- Fresh independent reviewer passed 43 tests/8 files and found one Important shot-identity defect plus a diff-visibility omission. Both were fixed in one pass: three new tests failed first, then the planning suite passed 16/16 and the full 188-test regression passed. The diff omission was treated as material because acceptance must expose input-mode/reference changes. No second reviewer was dispatched after the tested fix pass.
- Scoped ESLint passes. Standalone strict checking reports no errors in added/modified code, but remains non-green with the same 66 existing dependency/auto-import diagnostics documented in T03. Full Nuxt build/typecheck, browser acceptance and live model output quality are not claimed.

Pre-commit review reread all changed/new files, checked server aliases, bounded input/output, canonical IDs, transaction/replay paths, source permissions and no arbitrary URL fetching. Local logs are under ignored `.verification/video-t04/`; this receipt preserves the durable evidence.

Next: T05 canonical media resolution and multi-lane timeline compilation, then T06 atomic application and recovery.
