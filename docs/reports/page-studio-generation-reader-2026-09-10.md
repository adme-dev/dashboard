# Accepted setup generation reader compatibility

Foundation source 14ee4b735ea417b07417c6136243ede4cf7512ed implements explicit
version-2 setup generation from the accepted pages, collections and modules.
Its generation version is part of immutable seed and Worker ownership identity.
The Dashboard's strict retained-job reader previously rejected that new field,
so live authority could not return a version-2 job even with valid current scope,
owner, proposal and entitlement.

This companion change accepts only the optional literal `generationVersion: 2`
in retained jobs and returns it unchanged from the existing fresh authority check.
Unsupported versions still fail before database access. A generation mismatch in
creation acknowledgement is rejected. Existing dispatch still emits no generation
version; legacy seed identity and retry behavior remain unchanged. The new reader
is not producer activation and does not create Cloudflare resources.

The failing authority regression reproduced the old rejection before the fix.
All 57 provisioning actor, authority and endpoint tests now pass. They include
version-2 fresh permission denial, unsupported-version rejection, acknowledgement
version mismatch and legacy dispatch preservation. Modified-file ESLint passes.
No SQL or UI changed; existing setup-proposal marketing descriptions remain
accurate. No live deployment is claimed in this report.

Before producer activation, deploy this reader alongside compatible Foundation
coordinator, executor, editor Worker, sandbox container/CLI/overlay and Build
Worker. Then prove authenticated setup, D1 content, checkpoint, editor, reviewed
release and stored submission. The executor's dedicated Cloudflare credential
is still a dependency; production promotion remains separate from source pushes.
See Foundation `docs/research/2026-09-10-accepted-setup-projection.md` and REUSE-06.
