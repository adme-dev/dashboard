# Scoped native activation source candidate — 20 October 2026

This candidate enables the reviewed two-workspace native acceptance window. It is not a public rollout or hosted acceptance receipt. No deployment, merge, database write, CMS grant, executor policy, secret or resource change was performed by this source-preparation task.

## Authority and scope

Ordinary signup/onboarding receipts are retained under `.verification/release-20261020/native-owner-{a,b}-onboarding.json`. The release operator separately confirmed the active, verified sole owners and active operator through production read-only queries in `native-owners-readback.json` at 03:27 UTC. No customer identity, workspace or session is fabricated.

| Workspace | Approval ID |
| --- | --- |
| `64326ad7-7354-42e6-871d-8dea401a7798` | `2dee4ab1-e1a7-4f4f-8322-abdefa9afeb3` |
| `a8ca805f-751f-484a-b074-688f8a82fe41` | `a0511e75-a010-4b9b-bea0-51a448c07ccc` |

Both approvals select `limousine-v1`, operator `6a5d2e15-315c-4790-b64e-5e3e17001c8e`, expiry `2026-10-22T12:00:00Z`, 10 pages, 104857600 storage bytes, 10 monthly builds and 104857600 monthly traffic bytes. Expiry matches the bounded signup window; it is not a renewal mechanism.

## Exact source changes

- Dashboard production adds one `PAGE_STUDIO_CUSTOMER_ACTIVATION` JSON string with precisely five fields: previewEnabled, previewApprovals, cmsSetupEnabled, browserEnabled and editorEnabled. The four booleans are true and approvals contain only the two workspaces above. All five corresponding legacy scalar keys remain absent.
- Pages and production management set `PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED=true`. The management deployment guard now requires this reviewed true value while preserving exact native services, bucket and origin. Generated management types match.
- Studio `wrangler.native-preview.jsonc` sets only `PAGE_STUDIO_CUSTOMER_WORKSPACE_ENABLED` and `PAGE_STUDIO_CUSTOMER_BROWSER_ENABLED` to true. Both hosted AI flags remain false, the legacy canary is empty, and Pi is unbound. Existing native control-plane, content router, checkpoint bucket, container, key requirement and custom hostname remain unchanged.
- Production completed-site editor and Forms flags remain absent. CMS grants, readiness proof and exact owner/site authority remain required. No native executor scope policies are included; real preview site IDs do not exist yet.

The Pages budget becomes **47 configured strings + 99 retained secrets + 4 generated strings = 150**, using the retained provider inventory from `corrected-pages-binding-preflight.json`. Release must recount provider state immediately before uploading; there is no spare text-binding capacity. No secret was removed or inspected by this task.

## Verification and release handoff

Dashboard source started at `b9e4296c4befc650b0139058b389d97b442f850a` on PR #671, including freshly fetched main `3a6193e6a48708a551a2a637e1b8bbcf0ad94dba`. Studio started on freshly fetched main `379b9121146a10ad35ac696d423018c05fad76ba` with a new branch `feat/native-scoped-editor-activation-20261020`.

Focused checks: Dashboard 7 files / 134 tests passed, covering exact scope, flattened config, binding budget, atomic reader, native runtime and management deployment/admission. Scoped ESLint and management TypeScript checks passed. Structural comparisons prove every other Pages, management and native editor configuration field is unchanged. Pages `deploy:check` and management staging/production `--check-only` passed. Studio 3 files / 11 tests passed, covering native isolation, deployed config and established staging; scoped Biome passed after sorting one test fixture's keys. Full builds/install were intentionally excluded under the assigned low-disk constraint; latest CI and independent review remain release gates.

Next: independent review and CI for both exact heads, recount bindings, guarded current-main release with exact active-version readbacks, then ordinary owner preview creation. Separately reviewed real-site CMS/executor grants precede CMS/editor acceptance. Pi activation remains after hosted transfer and account-isolation acceptance.

Rollback is a reviewed source change restoring Pages and management selectors false, removing this activation bundle while keeping all five scalar keys absent, and restoring the two native editor booleans false. This does not revoke already issued database grants or renew expired ones; handle any subsequently created grants through their existing operator controls.

CI run `39364592707` rejected the first candidate for a generated management declaration header mismatch. Regenerated both declarations through `pnpm --dir workers/page-studio-management run types` with repository-pinned Wrangler 4.110.0; only the production header changed to canonical hash `ad383f10ac9bff8ea665a63d36d6cbb4`. The canonical generator preserves module-local exports and GlobalProps. Management typecheck passed; latest-head CI must pass before release.
