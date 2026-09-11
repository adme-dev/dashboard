# Agency website setup management — 10 September 2026

Agency-managed drafts now have a Website setup card in the existing management workspace. Staff can create or revise a proposal from the saved starter and an optional brief, review pages/features and missing facts, approve or request changes, and request preparation of the accepted revision. The brief option uses the existing proposal planner; it is not presented as an AI conversation. The management root owns vertical overflow so additional setup content remains reachable.

## Boundaries and review

`GET /api/agency/page-studio/sites/:siteId/setup-proposal` requires PAGE_STUDIO_VIEW, a UUID site, a fresh tenant-scoped site/latest-proposal query and no-store responses. Only the latest accepted revision reads the private staging coordinator. Its returned scope and full job schema are verified; management receives phase and update time without raw executor errors or provider IDs. Unsupported starters hide this setup card.

Mutation controls retain separate PAGE_STUDIO_EDIT and PAGE_STUDIO_APPROVE checks, read-only restrictions and captured site/revision confirmation. Server endpoints remain authoritative for permissions, entitlement and plan checks. No automatic provisioning retry is introduced. Failed loading hides mutation controls; failed actions retain the confirmation/error. Setup completion says initial content is saved, without claiming Studio access or publishing.

The real Nuxt UI browser check found closed confirmation overlays remaining visible and blocking pointer events after successful requests. Disabling this confirmation's exit animation removes that dependency; subsequent browser checks showed zero dialog elements and empty body pointer/overflow locks. The close control is disabled while saving. Typechecking also caught the Cancel changes expression returning a boolean; it now uses a void handler with a saving guard.

Review covered scoped parameterized SQL, server `~~/` imports, returned data minimization, revision changes, duplicate submissions, error recovery, Nuxt UI controls/labels, responsive widths, scroll ownership and marketing synchronization. No new dependencies or migrations are needed. The pre-existing marketing-nav lint findings are identical to HEAD.

## Verification evidence

- Full Dashboard suite: 13,290 passed, 69 skipped; 2,029 files passed. An initial sandbox run failed because localhost listeners/browser processes were restricted; the unrestricted rerun passed.
- Final focused suite: 31 passed across component, endpoint, management and security-inventory tests. The new component has nine behavioral cases and the new endpoint seven.
- Changed functional files pass ESLint. Marketing feature index/detail pass; MarketingNav retains exactly the same 35 diagnostics as HEAD.
- Final typecheck: 927 errors, exactly the same diagnostics as the recorded backend baseline; no new or removed diagnostics. Global typecheck is not clean. Preview build/deployment remains pending at this source checkpoint; append verified release results below.
- `pnpm deploy:check` passes for the immutable agency-dashboard target with CRM search dormant.
- Real Nuxt UI local fixture at 320×568 and 1024×768: document width equals viewport width; vertical scroll reached 1,074px and 210px respectively for long proposals. Mobile form controls measured 256px within their card. The approval dialog measured 288×326px at x16/y121, within the mobile viewport.
- Browser interactions saved a synthetic website brief, approved it and queued an accepted local setup. Both dialogs were removed afterward and page interaction restored. The fixture does not write customer records or Cloudflare resources. This is component-browser evidence, not an authenticated full-management or deployed provisioning acceptance test.
- Local logs: `/private/tmp/agency-setup-ui-full-tests-unrestricted.log`, `/private/tmp/agency-setup-ui-focused-final.log`, `/private/tmp/agency-setup-ui-typecheck-final.log`, `/private/tmp/agency-setup-ui-functional-lint.log`, `/private/tmp/agency-setup-final-browser-result.json`. Final screenshot: `screenshot_20260910_183455.945.png` in the Kimi screenshot directory.

## Release and remaining work

Dashboard backend source bb2bad7a3 CI 34450750184 passed, but deployment jobs were skipped. Compatible Foundation staging executor/coordinator receivers are already deployed; the staging control gateway points to https://preview.agency-dashboard-6cm.pages.dev. This UI must ship with its backend through the guarded Dashboard preview command before a retained job is attempted.

Production remains the separately integrated release/send-scan-foundation line. Selectively integrate these changes while preserving its newer checkpoint/AI protections; do not overwrite production with the older broad feature branch. The production Fantasy Limo draft remains at `/agency/page-studio/c34f6347-cc63-4ed7-9a5a-da165ebefed2`. Full retained-job acceptance, other consumer/editor compatibility, initial content/checkpoint, scoped Studio activation and a working booking/review website are outstanding. Missing client facts and commercial approval remain prerequisites for dependent live actions.

## Verified preview release

Guarded `pnpm deploy:preview` completed successfully from clean source
`271600cd73c82d0df16631cee78a2961b71cf090`. Build, prerender and Worker checks pass
(raw 25,115,692 bytes; gzip 6,597,192 bytes). Cloudflare independently confirms
preview deployment `4b488f6c-55db-46b3-aa62-32bd21fd556b` on agency-dashboard,
source commit and clean marker, with alias https://preview.agency-dashboard-6cm.pages.dev.
The public feature route returns 200 and anonymous setup GET returns 401.
No authenticated full-management or retained-job acceptance is claimed: the
previous preview browser tab was closed. Production integration and Fantasy Limo
content/editor/booking delivery remain outstanding.

Release logs/readback: `/private/tmp/agency-setup-preview-deploy.log`,
`/private/tmp/agency-setup-preview-readback.json`. Foundation preserves a portable
copy at `docs/research/evidence/2026-09-10-agency-setup-preview.json`.
