# Agency provisioning role enum correction

The live Page Studio staging database exposed a SQL type mismatch before a full agency job was created. `team_members.user_role` is the `user_role` PostgreSQL enum from `server/database/schema-auth.sql`; `custom_roles.slug` is varchar. The fresh authority join compared those directly, so PostgreSQL rejected it with `operator does not exist: character varying = user_role`. The earlier disposable fixture used TEXT for both and could not catch the defect.

The system-role branch now casts `owner.user_role::text` before comparing with the stored slug. Active staff, current role/custom-role policy, read-only exclusions, PAGE_STUDIO_EDIT, accepted revision, entitlement and whole-job checks remain required. No static-role fallback or permission bypass was added.

The disposable test schema now uses the exact role enum values from schema-auth.sql. With the old query, 13 agency authority cases fail while 21 client cases pass. With the cast, all authority and proposal PostgreSQL cases pass, including revocation and role changes. The first local attempt used an absent OS-named database role; the test cluster's actual `postgres` role was verified before the meaningful red/green runs. This setup error is not represented as the regression reproduction.

GitHub CI now starts an isolated PostgreSQL 14 service and runs the 34 authority plus 3 proposal transaction cases as an explicit gate. Its credentials are disposable CI-only values. The service runs on the existing Ubuntu runner and uses a mapped localhost port with health checks, following [GitHub's PostgreSQL service documentation](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers).

## Verification

- Full suite with real PostgreSQL checks enabled: 13,327 passed, 32 skipped; 2,031 files passed. This includes the 37 checks previously skipped in the default local run.
- Changed TypeScript lint and deployment target guard pass.
- Typecheck has exactly the prior 927 diagnostics, with none added or removed. Corrected preview release evidence will be appended after deployment.
- The security inventory count/classification is unchanged (1,573 rows; 115 identity boundaries). The only changed inventory source line is the enum cast; its new digest is `795cd697a0919c8ed9ab9a6e1a4fa1ac33b69f3216f7279fed05233a4b30c9fa`.
- Local logs: `/private/tmp/agency-enum-red-postgres.log`, `/private/tmp/agency-enum-green-postgres.log`, `/private/tmp/agency-enum-full-tests.log`, `/private/tmp/agency-enum-typecheck.log`. The intermediate green log has the expected stale-inventory failure; the final full run passes after reviewing/updating that pin.
- Temporary authority/proposal schemas were removed. The isolated local cluster was stopped after verification.

## Staging fixture and delivery boundary

Neon project `square-tooth-23821574`, branch `br-long-mountain-a4f73v10` is confirmed as the non-primary `staging/page-studio` branch. Read-only inspection found four synthetic clients, no Xero connection, one existing staging owner (`10000000-0000-4000-8000-000000000002`, domain xeroflow.invalid), and no custom-role records. A persisted permission policy is therefore missing for the intended full-job agency fixture. Do not weaken fresh authorization or substitute a real client's owner; create an explicitly scoped test policy/fixture and record cleanup before running it.

No live permission records, sessions, proposals, jobs or customer resources were created by this investigation. Existing retired 201 fixtures remain retired. Full retained-job acceptance also needs generation-version-2 producer selection and consumer/editor compatibility verification; the current Dashboard builder still omits generationVersion. Those are outstanding integrations, not proof that setup is complete. Production and Fantasy Limo's real website remain unchanged by this source fix.

## Verified release

Source `1637d99fb8b09dec714e44194cd1227bc4734a1e` passed guarded preview deployment.
Cloudflare readback confirms deployment `f29adc27-0df1-4c9a-abe8-199e44b0b84f`,
project agency-dashboard, successful preview stage, exact source and clean marker.
Build, prerender and Worker size guards pass (raw 25,115,698; gzip 6,597,186 bytes).
Anonymous setup GET remains 401. CI `34458649302` passed, including the new real
PostgreSQL authority/proposal gate. No full retained-job success is claimed.

The Docker CLI version check succeeds, but the engine health/version socket
responses have empty bodies and info probes stall. The first info probe required
Ctrl-C after its soft timeout; no daemon/container changes occurred. Foundation
has no repository secrets or deployment environments configured, so no existing
CI deployment credential can be used for the container rollout.
