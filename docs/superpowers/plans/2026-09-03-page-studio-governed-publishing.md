# Page Studio Governed Publishing Plan

## Objective

Deliver a permanent per-site management surface and replace the manual build/publish sequence with one server-owned, auditable release operation.

## Work packages

1. Add the per-site management route and link it from the Page Studio site list.
2. Present current site, approval, release, domain, and subscription state using existing control-plane APIs.
3. Add an immutable release-metadata snapshot to build records.
4. Load and verify the approved checkpoint directly from R2 on the server.
5. Add an agency endpoint that builds, verifies, and activates a release from identifiers only.
6. Apply manifest-derived navigation, footer, theme, locale, SEO, pages, and integrations atomically during activation.
7. Restore the matching metadata atomically during rollback.
8. Add governed publish and rollback controls with explicit expected-release concurrency checks.
9. Add focused unit, endpoint, and UI tests.
10. Apply the migration, run the Page Studio battle-test surface, merge, and deploy through the guarded production command.

## Acceptance criteria

- The site list exposes both Manage site and Launch Studio actions.
- A user can inspect a site's current version, release, domains, approvals, and history without entering Studio.
- Publish requests contain no manifest or asset body.
- A missing, mismatched, unapproved, or digest-invalid checkpoint fails closed before a build starts.
- A successful publish leaves the site pointer and manifest-derived metadata on the same release.
- A rollback restores both the target release pointer and its metadata.
- Duplicate idempotency keys replay the original operation and conflicting payloads fail.
- Every mutation is tenant-scoped, role-gated, audited, and read back.
- Existing release rows remain immutable.

## Rollout

1. Apply the additive build metadata migration.
2. Deploy the control-plane and UI changes.
3. Exercise the synthetic demo site through build, publish, read-back, and rollback.
4. Confirm the live demo hostname and dashboard agree on release, routes, header, footer, forms, and SEO.
5. Retain the prior release as the immediate rollback target.

