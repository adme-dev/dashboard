# Standalone customer website overview

Implemented as the next RND-21 slice, stacked on the native customer provisioning adapter. The canonical product/task ledger remains `docs/prd/page-studio-customer-cms-prd.md` in documentation PR #601. This change is a gated staging preview journey, not public CMS activation.

## Customer journey

Successful business setup and returning completed setup navigate to `/studio/dashboard`. The overview shows the saved business name/type/timezone, website preparation progress, help and sign-out. An explicitly approved customer can create one preview; uncertain replies refresh the retained status before offering a safe resume. A failed refresh disables stale create/resume actions. Desktop, 390px and 320px layouts use the shared customer shell and Nuxt UI components.

| State | Customer action |
| --- | --- |
| Setup required | Return to business setup |
| Approval pending | Contact support; no allocation |
| Available | Create preview |
| Preparing | Refresh; resume only when retained authority permits dispatch |
| Verification pending | Refresh; final runtime/storage checks still required |
| Needs attention | Contact support; keep the existing setup |
| Unavailable | Refresh later; do not allocate a replacement |

A coordinator `complete` phase means **Awaiting verification**, not Ready. No editor launch, publishing, payment or placeholder CMS modules are exposed. Revoking the original initiating login intentionally blocks its retained job; a subsequent login cannot silently substitute itself. The subsequent [provisioning recovery adapter](page-studio-customer-provisioning-recovery.md) adds explicit audited recovery with matching private workers.

## Native authorization and retention

`GET /api/portal/page-studio/customer/dashboard` uses the native customer cookie and returns only presentation fields and allowed actions. It does not allocate resources. `POST /api/portal/page-studio/customer/preview` accepts exactly `{}` and requires the configured same origin and a fail-closed request limit. Neither route accepts agency/portal login cookies or caller-selected workspace, site, actor, approval, plan or resource identifiers.

The service derives the workspace from completed setup and requires current verified owner membership without a legacy agency binding. Site creation and immutable intent preparation share a database transaction. The saved setup request ID and existing site receipt prevent duplicate sites; dispatch reuses the retained request key. Native authority is checked before and after external status reads. A pre-intent receipt also requires fresh entitlement and approving-staff authority before offering Resume. Provider resources, login digests, IDs and raw provider errors are omitted from the response.

## Staging configuration

Existing native signup configuration and migrations 442–445 are prerequisites. No new migration is added here. In addition:

- `PAGE_STUDIO_CUSTOMER_PREVIEW_ENABLED=true`; defaults off.
- `PAGE_STUDIO_PROVISIONING_ENVIRONMENT=staging`; production is rejected.
- Private `PAGE_STUDIO_PROVISIONER` service binding with both `createProvisioning` and `readProvisioning` methods.
- `PAGE_STUDIO_CUSTOMER_PREVIEW_APPROVALS`: JSON array of at most 100 distinct workspace approvals. Missing means no approved customers; malformed or duplicate entries disable creation.

Each approval contains `workspaceId`, `starterVersion` (an existing supported starter), and `policy`: `approvalId`, active staff `approvedBy`, future ISO `expiresAt`, `pagesPerSiteLimit`, `storageBytesLimit`, `monthlyBuildLimit`, and `monthlyTrafficBytesLimit`. IDs are UUIDs. Page capacity must be 3–1000 because the current native starter plan contains three pages. Other limits follow the existing preview policy schema. Operators must provide actual reviewed limits; this adapter does not invent a public trial allowance.

Approval is server-owned configuration, never customer input. The retained preview entitlement has one site, no custom domains or AI credits, and publishing disabled. Configuration changes do not rewrite an existing immutable receipt/policy. To stop new or resumed dispatch, disable the preview flag; revoke native authority where existing work must be stopped. Follow the provisioning adapter's reconciliation procedure for accepted work; do not delete receipts or replace request keys to retry.

## Verification and limitations

- Real PostgreSQL tests cover no-allocation reads, approved creation/replay, native ownership and revocation, interrupted creation, mismatched coordinator responses, and redacted status.
- Final review found two actionable gaps: revoked pre-intent authority could offer Resume, and insufficient page capacity could offer Create. Four regression cases failed before the fixes and passed afterwards; the focused suite passes all 70 cases.
- HTTP tests cover exact cookie/origin, strict body, disabled/production/missing-binding/malformed-approval configurations, request limiting and error redaction. Mounted UI tests cover refresh failure, uncertain create replies, sign-out and redirects.
- Local browser acceptance used real native PostgreSQL identity/setup/site/intent persistence with a local coordinator fixture. Verification → overview → Create preview, completed status, simulated failure/recovery, keyboard refresh and sign-out passed. Desktop, 390px and 320px layouts were inspected. The temporary fixture plugin was removed and its owned development server stopped. This is not evidence of hosted Cloudflare provisioning or customer storage isolation.
- Full regression validation passed 15,184 tests plus 54 separately scheduled route-scan cases, with 1,612 environment-dependent skips. Focused ESLint and whitespace checks passed. Server TypeScript exactly matches the existing 289-diagnostic baseline; this is not a clean project typecheck. The local Nuxt development build rendered the real page; a fresh production build is left to remote CI because local disk capacity is constrained.
- Hosted two-customer receipts and editor capability/handoff remain required before Ready/editor access. Public signup/preview activation, billing and production deployment are outside this slice. Marketing claims remain unchanged while the capability is gated and unshipped.
