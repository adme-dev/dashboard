# FigFlow disabled-foundation release review — 2026-11-01

## Verdict

**No code-level pre-commit blocker found in the reviewed disabled-release candidate. Recommend this fallback over the private-service cutover when the matching JWT source is unavailable.**

The candidate preserves existing template PATCH/DELETE in Pages, excludes every new design endpoint and its transport from Pages, and ships no `EMAIL_DESIGN` binding. It therefore needs **no new JWT_SECRET value, copy, rotation, or private-service provisioning**. The existing Pages authentication requirements remain unchanged; this is not a claim that Pages needs no JWT at all.

Migrations **491 and 492 can remain unapplied** for this flag-off/local-legacy release. They remain a paired prerequisite for any future design-service activation, not for existing template CRUD.

This is a disabled foundation only. It does not complete or enable the staff UI, native EDM bridge, module workflow, publishing, or real email-client acceptance. A flag alone cannot activate the excluded endpoints; activation requires a separately reviewed source/configuration release.

## Review scope

- Worktree: `/Users/paulgiurin/orca/workspaces/dashboard/figflow-edm-release-20261101`
- HEAD at review: `6fd02628065bf5f4597a4e00ee8daeac28b37001`
- Read the complete current `git diff` and all 11 changed files end to end.
- Also inspected the canonical handlers, legacy template utility, conflict translator, migrations 491/492, emitted Worker references, and recorded build/test logs.
- `git diff --check` passed. No source file was edited, no test/build was rerun, no database was accessed, and no deployment was performed.

## Exact source evidence

### Existing writes remain local and authorized

- `server/api/email/templates/[id].patch.ts:1` directly re-exports `templateUpdateHandler`, not `designTransport`.
- `server/api/email/templates/[id].delete.ts:1` directly re-exports `templateDeleteHandler`, not `designTransport`.
- `templateUpdateHandler.ts:19` retains `requireWriteAccess`; lines 28–30 retain existing-client and requested-client scope checks. Its body schema, renderer call, not-found behavior, and owned-conflict translation remain intact.
- `templateDeleteHandler.ts:7` retains `requireWriteAccess`; line 12 retains `assertEmailClientAccess` against the stored client. Owned-conflict translation remains intact.
- Actual-route tests now import those URL handlers rather than bypassing them through utility imports: `emailClientScope.test.ts:399–434`, `emailDesignLegacyRoutes.test.ts:25–28`, and `emailTemplateClients.test.ts:14`.
- `godModeIsolationInventory.test.ts:209–225` still requires the canonical write/scope gates and no God mode registration. Its lexical counts remain correct because source inventory includes ignored design files while the two legacy guards remain outside route files.

### Design endpoints and service dependency are absent

- `nuxt.config.ts:419–422` documents disabled endpoints and sets `nitro.ignore` to `**/api/email/design/**`. This covers the draft handlers and the transport catch-all, not merely drafts.
- The working diff removes both preview and production `EMAIL_DESIGN` service blocks from `wrangler.toml`; the current file contains no `EMAIL_DESIGN` binding.
- No remaining Pages route imports `designTransport`.
- A read-only search of the measured `dist/_worker.js` found no `EMAIL_DESIGN`, `/api/email/design`, or `designTransport` reference.
- `test/workers/emailDesignDeploy.test.ts:50–56` pins both the all-design exclusion and binding absence while retaining all private Worker target guards.
- `workers/email-design/README.md:7–16` accurately describes the disabled release; lines 79–103 require a future reviewed activation, paired migrations, service provisioning, matching key/origin configuration, and hosted verification.

### Migrations are unnecessary for current legacy behavior

- `server/utils/email-marketing/templates.ts:55–57` reads only `edm_templates`.
- Its update at lines 112–143 writes the pre-existing template columns and does not reference `email_design_revision_id` or any design table.
- Its delete at lines 146–152 likewise uses only `edm_templates` and client scope.
- The complete legacy utility contains no `email_design_documents`, `email_design_revisions`, `email_design_revision_receipts`, or `email_design_revision_id` reference.
- `designConflict.ts` only translates named database errors; it performs no query and creates no schema dependency. With migrations absent, those new constraints simply do not arise. Keeping the translator preserves future behavior and avoids a byte-saving behavior change.
- Runtime design-table consumers are in the excluded design modules/routes, not the local legacy CRUD graph. For future activation, 491 supplies the design tables/base trigger and 492 supplies metadata columns plus the matching projection trigger; both current revision writers require 492, so the pair must still be applied together then.

## Build and regression evidence

The final build log independently inspected at `/private/tmp/figflow-disabled-foundation-build.log:5158` records:

```text
[worker-size] raw 25468238 / 25468928 bytes (690 remaining); gzip 7338615 / 9750000 bytes (2411385 remaining)
```

The immutable budgets in `scripts/check-worker-size.mjs:10–11` are unchanged. The 690-byte raw margin is narrow but passing; no further optimization is recommended for this candidate.

Inspected logs also confirm:

- `/private/tmp/figflow-local-legacy-green.log`: **54 tests across 5 files passed**.
- `/private/tmp/figflow-disabled-foundation-tests.log`: **398 tests across 24 files passed**.
- Parent reports focused lint clean; `git diff --check` was independently rerun here and passed.

These are focused candidate checks, not a full-suite, hosted-service, or product-completion claim. The build artifact is local candidate evidence; a clean integrated release must retain the normal current-main/source verification and guarded deployment checks.

## Release boundary

Safe release shape:

1. Commit exactly the reviewed disabled-foundation change set after reconciling current main.
2. Do not provision or deploy `workers/email-design`, add `EMAIL_DESIGN`, restore the transport route, or set a draft flag as an activation mechanism.
3. Leave migrations 491/492 unapplied for this release.
4. Run the clean-source build and deployment guards, then deploy only through the repository's guarded Pages path.
5. Verify existing template update/delete and QR navigation on the real host, recording source and deployment identities. Preserve the prior Pages artifact for rollback.

Future design activation must separately restore the transport, provision the service and matching approved key/origin, apply 491+492 together, and complete hosted and product acceptance.

## Current SHA-256 manifest

Changed files reviewed end to end:

| Path | SHA-256 |
|---|---|
| `docs/superpowers/plans/2026-10-30-figflow-edm.md` | `18c44d0286a8839667594b2857725aea5d7f12459b1789d110152db837792443` |
| `nuxt.config.ts` | `9962590f089fe1ecd8e4a999c8ea0acd5cae1d9f6a389db10a4e2f397f36e778` |
| `server/api/email/templates/[id].delete.ts` | `6c2c9a89dfa5e7c3a4685512fb5dfc76405fc888565beff0f02165cbdfe95cc7` |
| `server/api/email/templates/[id].patch.ts` | `aa12b631a727e5a17cb84a8320b890f58744d8579164afb65828e43275daa0f8` |
| `test/config/godModeIsolationInventory.test.ts` | `0a0c568aee75d13d94009e691ec1b943672750a083d503c3a651ed5563e83986` |
| `test/server/api/emailClientScope.test.ts` | `3e674fd95831d61cde0f5878a4955ab448cc03bf595b52320e2674588c97c657` |
| `test/unit/emailDesignLegacyRoutes.test.ts` | `ba1755782f1aa291f8682e723054cdcbf55f19d004ba33c77e8b5d29e625da47` |
| `test/unit/emailTemplateClients.test.ts` | `37fa93f4c9003b9a70a99bfe9984c9d05561bab421282cdc78dd36793bda26f2` |
| `test/workers/emailDesignDeploy.test.ts` | `256ccfaa941b4928c07f179d8a8ad35fbebfdb7691dcdeb5ed66cda83b37ce4e` |
| `workers/email-design/README.md` | `894b80fce12832f96ba5bccb6a7fba88b9085b69658549e2ecb6eaec8a46b2ad` |
| `wrangler.toml` | `c03a9760de3a367e9f612c83a599062e8d131eaf4aa51802b2e712e87976fa6c` |

Supporting evidence files:

| Path | SHA-256 |
|---|---|
| `server/utils/email-marketing/templates.ts` | `2599d65c0b517701fe46e7d8bfe547591761c6cffeb8789d1a2d3c8303b1fb50` |
| `server/utils/email-marketing/templateUpdateHandler.ts` | `b04c4d3edc9fb1af8db3c88853750e49b96ec4a2ea8a3c1d2d6164533e26e5df` |
| `server/utils/email-marketing/templateDeleteHandler.ts` | `fc092c3b8bb302b0c9983188ae32f319b4f4b4b26d3a38f8d1a9f22e09626bb1` |
| `server/utils/email-marketing/designConflict.ts` | `8a65675b153adc9d8831771b840baa92c3731600ab50db1ce242d4ec509adce8` |
| `server/database/migrations/491_email_design_revisions.sql` | `202c0350d39140f85a30f2d04b6bcccaa0762cecae77c9a8cfe6676d4c40201e` |
| `server/database/migrations/492_email_design_revision_metadata.sql` | `a839de86d4145950116508e6e49fad4bef69a325d44b90776abbe7affb99c5ef` |

Hashes describe the reviewed working-tree snapshot. Any subsequent source change requires a new diff review, build measurement, and hash manifest rather than reusing this verdict.
