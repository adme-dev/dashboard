# FigFlow delegation hop and template extraction

Read-only check of `/Users/paulgiurin/orca/workspaces/dashboard/figflow-edm-release-20261101`. No source edits. No routes were moved.

## Verdict

The existing Pages transport cannot revalidate an already accepted signed delegation on the other side of the service-binding hop. That limit does not block canonical template `PATCH` and `DELETE`. Those two routes are not successful delegated targets today. Keep that denial. Do not add a second delegation owner or a raw actor header.

Normal JWT sessions are a different path. `requireAuth` on the worker resolves the session and permission groups from the database when `event.context.user` is absent.

## The hop cannot replay a consumed delegation

`server/middleware/auth.ts` calls `acceptGodModeInternalExecution` before cookie or bearer auth. That calls `consumeGodModeInternalExecutionDelegation`. A present `x-god-mode-internal-execution` header is verified, bound to method, path, and body digest, then inserted into `god_mode_mcp_request_nonces`. `ON CONFLICT (jti) DO NOTHING` makes a second insert return 409 `Internal execution delegation already consumed`.

The same H3 event can see the marker again without a second insert (`trustedExecutionByEvent`, lines 582–586). `getTrustedTask5DelegatedExecution` documents that the marker is keyed by the event and WeakSet-branded, so a clone, shared context, JSON, or a caller header cannot carry it (`internalExecutionDelegation.ts` lines 477–487). The private worker is a new event. The design proxy forwards the original request, including that header, and does not mint a replacement claim (`server/api/email/design/[...path].ts`). A second `acceptGodModeInternalExecution` on an allow-listed route would 409.

There is no existing verify-without-consume path on that transport. Inventing one, or forwarding `event.context.user` as authority, would be a new delegation owner. Do not do that.

## Template PATCH and DELETE are not that flow

`allowedTargets` (lines 90–107) is agency tasks, briefs, social publishing, spend plan, spend budget, bulk budget, budget alerts, expenses, EOM, CRM opportunities, CRM activities, quotes, and proof status. No email template mutation is in that list.

`isAllowedGodModeInternalExecutionTarget` (lines 279–283) is exact: `GET` uses the read table, two `POST` paths are special-cased, and every other method must match `allowedTargets`. `DELETE` matches nothing. `parseClaim` also allows only `GET`, `POST`, `PUT`, and `PATCH`, and it calls the same allow function before a claim can be signed.

Email entries in `allowedReadTargets` are only:

- `/api/email/campaigns`
- `/api/email/campaigns/:uuid/events`

`getTrustedTask5DelegatedExecution` checks `isAllowedGodModeInternalExecutionTarget` again before it returns a marker (line 519).

`fetchInternalExecution` strips a caller-supplied delegation header and mints only through `mintInstalledGodModeInternalExecutionDelegation`. Signing uses `parseClaim`, so a disallowed path fails before a nonce exists. Current callers are CRM, budget, finance, creative proof, delivery, and spend executors. None target `/api/email/templates`.

So a template update or delete cannot be a successful delegated call today. Pages auth rejects a header whose claim is not an allowed target with 401 before `readBody` and before the nonce insert (`verifyGodModeInternalExecutionClaim` returns null, then `deny(401)`). A valid claim for some other route, presented on a template path, fails the path comparison with 403 after `readBody` and still before the nonce insert. The handler, and therefore any hop, does not run.

## What extraction must keep

Forward the original header unchanged. Stripping it would turn a delegation failure into the cookie or bearer slow path.

Leave template `PATCH` and `DELETE` out of `allowedTargets` and `allowedReadTargets`. The worker's `requireAuth` already calls `acceptGodModeInternalExecution` before session auth, so a forwarded bad header still throws and does not reach `updateTemplate` or `deleteTemplate`.

Regression assertions worth keeping:

- `isAllowedGodModeInternalExecutionTarget('PATCH', '/api/email/templates/<id>')` is false.
- `isAllowedGodModeInternalExecutionTarget('DELETE', '/api/email/templates/<id>')` is false.
- `signGodModeInternalExecutionClaim` rejects those paths.
- A valid delegation for a different allow-listed route, sent to template `PATCH`, returns 403, inserts no nonce, and writes no template.
- Header absent still uses the session slow path.

Do not treat this as clearance to move an allow-listed route. Those routes do consume a nonce on Pages, and this proxy cannot redeem that nonce again.

## Session path and body

With no delegation header, `consumeGodModeInternalExecutionDelegation` returns null before `readBody`. `getTrustedTask5DelegatedExecution` returns null before `readBody` when the event has no marker. Ordinary template `PATCH` and `DELETE` bodies are still available for a later clone.

On the worker, `requireAuth` misses `event.context.user` because Pages middleware does not run there. It then skips a missing delegation header and uses the forwarded cookie or bearer token. `validateSession` reloads the live `team_members` row, and the slow path calls `resolveUserPermissions` when `permissionGroups` is absent (`server/utils/auth.ts` lines 200–236). That is the session behavior to keep. It does not preserve a consumed delegation, and these template routes do not have one to preserve.

The earlier size choice stands only with this denial left in place: measure a template `PATCH`/`DELETE` move before calling the budget cleared, and do not shave the design-proxy guards. No code was moved in this review.
