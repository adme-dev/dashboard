# Dynamic CMS completion goal

The user requested autonomous completion on 29 September. Only the isolated synthetic staging sites and Dashboard preview are authorised deployment targets for this goal. Customer production activation remains separate.

## Verified

- Customer component generation and acceptance exist for both synthetic scopes.
- Second site: component insertion, saved property edit, reopened draft and current CMS refresh work in the actual browser. Strict checkpoint acknowledgement was repaired in `c54f93033` and verified on preview deployment `c5d0a65b-6e75-4dd5-ad40-8cd3def53b79`.
- Second site: customer saved a named draft, agency submitted the exact checkpoint for review, edit-only actor was denied approval (403, unchanged version), and authorised agency approval succeeded.
- Approved version: `ece160c8-2ce5-4e4e-b843-15cb4290cf70`; checkpoint `checkpoint_769418b3-7f1b-4de0-88a9-a5dc7f272ca4`; digest `81ac4a5cc358258ea3ec2beb595c59fb4ecbacd7b3fe793e079ce18eaec40792`.
- Attempting production publication from preview correctly returned 403.
- Staging activation with idempotency key `b_publish_goal_1` returned 500 before activation. A scoped read-only diagnostic reproduced PostgreSQL `42883`: `character varying = user_role`. Commit `caf0c9951` casts the native enum to text. The corrected publisher snapshot succeeds against isolated staging. The real PostgreSQL publication suite passes 131 checks, one existing skip, with its fixture corrected to use an enum. The same test failed before the fix.
- Standalone customer entry implemented at `/studio`, using invited/provisioned accounts and existing scoped APIs. My sites, CMS and draft history use a product shell. No new billing or publication authority. See the independent-entry architecture document.

## In progress / remaining

1. Build and deploy the enum fix and independent entry to Dashboard preview; verify exact source and runtime configuration.
2. Reconcile the failed activation's native state, then retry the same intent. Verify public GET/HEAD, no-store, current public fields and private/cross-scope exclusion.
3. Edit records without republishing. Publish a second template and restore the earlier release while retaining newer records.
4. Complete the equivalent first-scope browser/publication journey and remaining hosted negative matrix (roles, schema, quota, archive, pointer epochs and revocation).
5. Commit/package/deploy the additional Studio property-field and outline polish; local full build, typecheck, tests and lint passed. Browser suite verified field sizing and label focus at narrow width.
6. Improve closed-tab request recovery and investigate CMS read latency without weakening native authority.
7. Verify the new product entry in the browser, including direct login, assigned sites, builder launch, CMS, return to My sites, denied access and narrow viewports.
8. Refresh paired current-main/CI/QR verification, PR descriptions and release records.

Private request/response receipts and the fixed-scope acceptance harness are under `/private/tmp/cms-typed-acceptance-20260929`. Credentials and raw storage objects are excluded from repository documents. A failed request is never repeated with a new intent simply to make it succeed.
