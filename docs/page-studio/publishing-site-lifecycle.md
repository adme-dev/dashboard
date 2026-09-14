# Site lifecycle during publication

First successful Page Studio activation now transitions a draft site to active in
the same PostgreSQL transaction that creates its release, advances the hostname
pointer, marks the version published and writes the activation audit. A published
site remains active when a subsequent approved build is activated.

Both activation and rollback lock the scoped site and require its current status
to be draft or active. Archived and suspended sites receive `SITE_NOT_PUBLISHABLE`
(409), including when replaying an earlier activation key. This does not provide
a reactivation path for disabled sites. Rollback preserves the site's status.

Existing build approval, digest validation, private artifact verification and
expected-release conflict checks remain in place. Any transaction failure rolls
back the site status along with the release, pointer and version changes. This
fix does not activate existing drafts in bulk, change entitlement policy or
alter public intake authorization.

The disposable PostgreSQL suite covers staging and production first publication,
idempotent replay, disabled sites, stale pointers, failed builds, rejected reviews,
digest mismatches, failure after the status write, and active republish/rollback.
Release-action endpoint tests cover failed artifact verification before either
activation or rollback can open its transaction.
CI runs this suite against its runner-local PostgreSQL service; no migration is
required.
