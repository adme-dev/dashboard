# Standalone customer site ownership

## Scope

This is the internal site-creation prerequisite for customer CMS PRD RND-20. It follows the workspace foundation (#602) and verified signup (#603). A trusted server caller can retain one approved preview site for an active workspace owner. No public route invokes this service, and it does not provision a content database, dispatch a worker, grant editor access, charge a payer or report a website Ready.

Workspace/identity/site/entitlement records are platform control-plane metadata. Customer operational content still belongs in the customer's own database. That database is allocated by the existing private provisioning engine in the next integration slice; this change does not substitute a shared content store.

## Ownership and compatibility

Migration444 adds `page_studio_business_owners`. Each immutable mapping names either an agency client or a standalone customer workspace. Legacy business IDs remain exactly the agency-client IDs. Standalone businesses receive separate UUIDs and server-derived tenant scopes; a workspace UUID is never passed off as an agency-client ID.

Only the two direct owner foreign keys on `page_studio_sites.client_id` and `page_studio_entitlements.client_id` move to the registry. The physical `client_id` column is retained as a compatibility business scope, and all tenant/business/site/entitlement compound foreign keys remain intact. Existing agency client inserts register their scope automatically. Deleting an unused agency client remains possible; a client with retained sites/entitlements remains protected.

A workspace cannot simultaneously acquire a standalone owner and a legacy client binding. Both database write paths advance the workspace row version without changing its name, so a stale repeatable-read transaction fails with a serialization error instead of retaining a second ownership claim. Existing agency/portal routes keep their selected-tenant, client membership and native login checks; they are not converted to accept standalone identities. Image-credit billing, versions, publication audit and provider actor protocols still require their own customer adapters.

## Trusted preview creation

`createCustomerPreviewSite` accepts authenticated identity/workspace IDs, an idempotency request UUID and validated website name/route/starter. Its dependency receives an explicit server-side policy with an approval UUID, active staff approver, absolute expiry and page/storage/build/traffic limits. There is no default trial policy and no customer-controlled policy payload. The caller must retain the same approved policy for retries.

The service locks and freshly verifies identity, workspace and owner membership, rejects legacy bindings, and validates the approver and expiry. It atomically inserts the business scope, trial entitlement, draft site and immutable customer creation receipt. All grant fields are explicit: one preview, zero AI credits, zero custom domains, portal creation disabled and publishing metadata disabled. This metadata is not itself publication authorization; no runtime path is enabled here.

A matching retry returns the retained site only after fresh authority and entitlement checks. Changed requests/policies conflict; another request cannot reset the preview allowance, even if the original site has been archived. A failed receipt write rolls back every newly allocated control-plane record. The receipt carries the actual customer identity instead of impersonating an agency/client audit actor.

## Migration and rollback

Apply migration444 only after402 and442. It runs in a transaction, backfills legacy owners, checks conflicting ownership, replaces the two owner foreign keys, and installs registration/exclusivity/immutability triggers. Replays are tested. The backfill holds a `SHARE ROW EXCLUSIVE` lock on `agency_clients`; review production table size and concurrent write traffic before scheduling deployment.

Local application used a dedicated disposable PostgreSQL17 database `cms_customer_sites_20260930` on loopback port55483. No production connection string was used.

Rollback should first stop every caller of the new service. Leaving the unused registry is safe. Restoring direct agency-client foreign keys is possible only after proving every referenced business is a real agency client; standalone site/entitlement/receipt records make that rollback invalid. Preserve those records and reconcile forward instead of deleting customer ownership. Do not blindly reverse this migration after standalone creation has started.

## Verification

- 30 PostgreSQL tests cover replay, legacy IDs/inserts/deletes, ownership and compound foreign keys, explicit policy, concurrency at read-committed/repeatable-read isolation, fresh owner access, expired/suspended grants, immutable receipts and atomic rollback.
- 110 focused tests include customer workspace/signup and established agency/portal site paths; focused ESLint passes.
- Server TypeScript output exactly matches the existing 289-diagnostic baseline after worktree path normalization. This is no new diagnostic, not a clean project typecheck. No frontend code changed.
- The final repository suite passed 15,136 tests (1,612 environment-dependent skips); the separately scheduled CRM route-scan suite passed another54. The Page Studio/QR regression selection passed2,157 tests before the final concurrency fix; the complete repository run includes that fix.
- CI explicitly runs the customer-site suite against PostgreSQL17. Remote build/check completion remains a release gate.

## Next integration

The internal actor/session, retained-intent and checkpoint adapter is now implemented in the follow-on [customer provisioning slice](page-studio-customer-provisioning.md). The sequence below remains the rollout/acceptance order; hosted proof and the customer-facing handoff are still outstanding.

1. Extend Dashboard and Studio's private provisioning actor protocol with a distinct customer identity and retained login session; never fabricate a portal user.
2. Recheck workspace owner/grant, session, immutable business scope and approved entitlement at every provider effect and completion callback.
3. Adapt checkpoint/content receipt authority, then reuse existing D1 allocation and worker provisioning with retained resource receipts and lost-response reconciliation.
4. Verify two independent customer databases, interrupted/revoked jobs and retry behavior before returning Ready.
5. Connect customer site creation, dashboard and editor handoff; resolve public trial/billing policy and activate the complete preview separately.

## Review follow-up

The fresh review's important repeatable-read race was reproduced with two failing tests and fixed; both request orders now reject a second claim. One minor test extension is deferred: build an additional fixture with legacy sites/entitlements already present before the first migration444 application. Current tests cover registry backfill, replay and legacy creation/deletion after migration. Include a populated legacy upgrade rehearsal before production migration.
