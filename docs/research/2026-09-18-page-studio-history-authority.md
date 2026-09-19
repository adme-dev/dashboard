# Page Studio — native draft history authority

18 September 2026. R06d.3 follow-up. Native agency/portal restore and named-version writes now check current login authority inside their transaction. Local verification, the four-case live staging acceptance and browser checks pass. R06 remains open.

## Change

The history POST handler passes the real authenticated H3 event into the history writer. Missing login context fails before opening a transaction. After locking the scoped site with `FOR NO KEY UPDATE`, the writer resolves the original agency or portal credential and binds its native-login record without clearing logout tombstones. It then locks and verifies current staff/user, role permissions, site, client, entitlement and portal membership. History does not require an editor grant or an AI allowance.

The current-authority check uses `clock_timestamp()` and repeats before both replay and normal successful returns. The login and permission locks remain held through commit. Restore uses the existing compare-and-swap checkpoint writer; named versions retain their existing idempotency and audit behavior. History GET behavior is unchanged.

The site lock permits logout audit foreign-key checks while a history write is waiting. See PostgreSQL's [row-lock compatibility table](https://www.postgresql.org/docs/17/explicit-locking.html#LOCKING-ROWS). The native → parent ordering matches logout; subsequent site-lock upgrades happen after the parent lock is owned.

## Verification

- Initial RED: six actual PostgreSQL failures reproduced missing-event writes and writes after completed logout, across agency/client and restore/name. Two endpoint forwarding checks and one missing-login unit test also failed before implementation.
- Dashboard full suite: 13,962 passed; 452 skipped, including separately run PostgreSQL suites.
- Changed-file ESLint: clean; the touched inventory retains its exact eight-error pre-existing baseline, with no additions.
- Final history PostgreSQL: 48 passed (31 new authority cases, 17 retained history cases).
- Existing authority/PostgreSQL regressions: 193 passed. Total database checks: 241.
- Focused endpoints, login boundary and history component: 12 passed.
- Dashboard typecheck: exact existing 913-error baseline, no added or removed diagnostics.
- New security inventory: exactly two staff-role checks classified as identity boundaries. Removing those new rows reproduces the complete prior digest; no application-control bypass was added.
- Source review: no Critical or Important findings. The real logout orders, replay, actor/permission changes, native/parent/entitlement expiry and operation without editor grants are covered.

Evidence is local under `.verification/page-studio-builder-rnd-20260917/history-*`.

## Release and acceptance

The guarded clean Dashboard preview release passes. Provider readback confirms:

- Source: `af8ef391499a21986f66ba4c2848d884b9566ded`.
- Fresh main: `a917386dde67f06921843fd6e3a1ed1b4b984c6f`, included in the candidate.
- Preview: `311e5803-4692-44c3-8b36-a8380b6c1f45` at https://preview.agency-dashboard-6cm.pages.dev; source marked clean.
- Production remains `8798c363-6e9c-472a-a78f-47d8ce780ef4`.
- Studio control deployment remains `6fc44bd4-cfc1-4d2a-91a7-366c2a9825c1`; sandbox deployment remains `07225c0a-c690-4b16-bd9e-e22fed27b3a8`. Provider settings, bindings and container are unchanged.
- Raw Worker bundle: 25,466,806 / 25,468,928 bytes, with 2,122 bytes remaining. The configured guard was not raised.

Four live cases pass: native authentication/history read and permitted QR API; observed history write blocked inside the database; actual logout completed and both revocations observed before unlocking; HTTP 401 with unchanged checkpoints, versions and heads and only the legitimate logout audit. The synthetic actor, role, login and grant are retired, zero active resources confirmed, and the private local connection file removed. Authenticated browser checks show both History views and the save/restore controls. QR navigation renders with the expected permission denial for the restricted browser account; the authorized synthetic QR API returns 200. Browser acceptance is read-only; positive mutations for both roles/actions are covered by PostgreSQL tests. This is not the full two-customer browser matrix.

The live probe creates one editor grant only to exercise logout audit foreign keys; the no-editor-grant guarantee is tested in disposable PostgreSQL. It holds the site row, admits a native named-version request, completes actual logout, independently observes revocation before unlocking, then requires HTTP 401 and unchanged checkpoints, versions and heads. A timeout is a failed acceptance, never permission to claim success. Cleanup is explicitly best effort under fatal connection loss or database idle timeout.

The temporary clean release checkout was retired after verification. The implementation worktree retains the local commits for reviewed integration; it is not merged to main or released to production. The task pack remains mirrored in the owned worktree and root planning files.

## Remaining

Provisioning and job lifecycle authority, preview script isolation, CPU containment, exact expiry at the COMMIT instant, orphan collection and the full two-customer/browser/public matrix remain open. Restore writes its blob before final database acceptance and can leave an orphan when later denied. The previous checkpoint probe's first logout timeout remains unlocalized; this section does not claim to fix its cause.

Production integration and the 26 customer CMS/component delivery tasks remain separate. The approved CMS direction is client-admin entry linked to Studio, shared collection/record authority and content editing inside Studio. Generated customer execution remains disabled.
