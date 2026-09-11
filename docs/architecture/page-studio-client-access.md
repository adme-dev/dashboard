# Page Studio client website access

Status: reconciled onto freshly fetched main `3369a09edef497439d2e4ab7fa2e8e7b4828136d`
on 11 September 2026, in `feature/page-studio-client-setup`. This candidate is
not yet merged or deployed. Reviewed implementation from `5a3907e58` was applied
without merging its old release lineage or replacing current save protections.

## Operator workflow

The agency website portfolio is called **Client websites** in the sidebar.
Staff with write access and `PAGE_STUDIO_EDIT` can select an active agency
client, site name, route and industry starter, then create a draft through the
existing scoped site API. The server checks the client's effective entitlement
and remaining site allowance. Draft creation does not publish the site or
provision a runtime. The standalone editor remains the editing authority.

Under **Subscriptions**, staff with write access and
`PAGE_STUDIO_SUBSCRIPTIONS` can grant explicit trial or active website access.
The grant records the selected tenant, client, actor, plan reference, effective
period, permitted modules, creation permission, limits and reason. Trial access
must expire; active access may have no scheduled end. This operation does not
create a payment, invoice or paid subscription. Module permission alone does
not activate an unconfigured service.

The UI uses Nuxt UI modal forms, labelled controls, calendar pickers and
container-responsive columns. The portfolio owns its vertical scroll area.
Public Page Studio feature copy describes access administration and its limits.

## Integrity and authorization

`POST /api/agency/page-studio/subscriptions` derives actor and tenant from the
authenticated agency permission check. Strict input rejects supplied tenant
scope, unknown modules and invalid limits. Agency clients use the existing
global client registry; entitlement and receipt lookups are tenant-bound.

Every grant locks the active client row inside the database transaction before
checking existing access. A non-cancelled entitlement prevents replacement.
The entitlement and immutable audit receipt commit together. Matching retries
return the original receipt, including after expiry; changed terms, actors or
ambiguous receipts are rejected. The form preserves its request ID after an
uncertain response and creates a new ID when terms change.

Migration `416_page_studio_access_audit.sql` adds the compatible audit table,
request lookup index and append-only trigger for Page Studio access evidence.
It was applied automatically to the application Neon database after checking
the exact Fantasy Limo site, client and tenant. Table, index and enabled trigger
were read back. No client access grant or commercial terms were created.

## Verification and remaining work

- 34 focused checks pass: six real disposable PostgreSQL tests and 28 unit,
  endpoint and component checks. Coverage includes concurrent matching and
  competing requests, foreign-tenant receipts, audit mutation denial, atomic
  rollback, migration reapplication, permission denial and form retry identity.
- CI explicitly runs the access database tests against its disposable
  PostgreSQL 17 service. Local tests use only an isolated generated schema in
  `page_studio_checkpoint_cas_test_current_main_20260911` on localhost.
- Full suite: 13,100 passed, 50 skipped across 1,998 passing files after updating
  the API inventory for the new POST route. Browser/Worker tests require local
  process access; the initial sandbox run could not start those processes.
  The six grant database checks passed separately, including migration replay.
- Changed-file lint and production build pass: 25,463,602 raw bytes against
  25,468,928 (5,326 remaining); gzip 6,609,034 bytes. The source/target preflight
  passes with freshly fetched main3369. Recover bundle headroom before adding
  more server functionality; do not raise the release budget to conceal growth.
- Final remote CI and rendered UI verification remain pending.
- This increment does not complete paid self-service checkout, renewals, plan
  changes, setup proposal review/provisioning, production business admin or the
  Fantasy Limo delivery brief. Reconcile those separately onto current main.
- Preserve the original brief and missing client facts. Do not substitute
  keyword detection for confirmed domain, contact, fleet or pricing details.

The broader checklist remains in the standalone Foundation repository under
`docs/research/page-studio-rnd-checklist.md` and
`docs/research/page-studio-open-items-ledger.md`. Local Graph Wiki context lives
at `graphify-out/wiki/page-studio-application-platform.md` in the root Dashboard.
