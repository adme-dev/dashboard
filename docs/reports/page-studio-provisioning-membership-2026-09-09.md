# Page Studio provisioning membership check

The portal provisioning POST previously checked the user's client and global
manager/admin role, but did not require assignment to the selected site. A
manager could therefore dispatch an accepted proposal for another site in the
same client account.

The endpoint now joins `page_studio_site_memberships` on tenant, client, site
and authenticated user, requiring the `editor` role. It uses `queryOneFresh`
so cached membership or proposal acceptance cannot authorize a new dispatch.
A missing assignment returns 404 before calling the provisioner. The existing
global role gate, accepted revision requirement and Worker response scope
validation remain in force.

Verification: seven provisioning, setup proposal, route registration and role
inventory suites pass 38 tests. The new regression checks denial before any
Worker call and the fresh query's complete membership scope. Scoped ESLint,
`git diff --check` and `pnpm deploy:check` pass. These are endpoint/query-contract
tests, not proof of a live resource provisioning flow.

The first typecheck exhausted Node's default heap. With a 16 GiB ceiling it
completed and reported 926 existing repository diagnostics, with none in either
modified source/test file. The repository is not globally type-clean.

The extracted endpoint query also ran against PostgreSQL on the isolated Neon
staging branch (`br-long-mountain-a4f73v10`) using CTE-only synthetic rows. All
nine cases matched: assigned editor allowed; viewer, missing assignment, wrong
membership tenant/client/site, foreign client/site and stale revision denied.
This read-only experiment changed no persisted rows and dispatched no resources.
The exact query is retained at
`/private/tmp/page-studio-provision-membership-sql-proof.sql`.

Fresh `pnpm build` passes the unchanged Worker size guard: raw 25,058,216 bytes
(410,712 remaining), gzip 6,582,239 bytes. Build evidence is
`/private/tmp/page-studio-provision-membership-build.log`.

ONB-04 remains open: the handoff still derives `businessId` from `clientId`,
selects staging, and needs trusted resource lifecycle/binding ownership and
end-to-end customer setup acceptance. This fix must be included before enabling
that flow for customers.
