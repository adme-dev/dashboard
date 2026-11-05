# Template transport source increment — 5 November 2026

Authenticated registration now accepts only configured source site/slug pairs,
requires current agency publication authority, verifies the exact accepted code
checkpoint and creates private source-account portal visibility. Registration
retries never revive revoked/expired grants. Production configuration admits Kia
only. Northwall requires legitimate initial typed adoption and a typed adapter;
private limousine sites remain excluded.

Migration 502 adds immutable preview receipts and resumable copy receipts. Agency
`POST /api/agency/page-studio/templates` accepts sourceSiteId,
sourceCheckpointId, expectedDigest, slug and name. Agency
`POST /api/agency/page-studio/templates/:versionId/publish-preview` accepts
snapshotId, verifies its exact version binding and private storage receipt, and
probes the actual template hostname before publication. Host provisioning is a
prerequisite; this increment does not create Cloudflare domains automatically.

Each catalogue audience supports `POST .../templates/:versionId/preview` and
`POST .../templates/:versionId/use`. Preview returns only a version-pinned public
URL. Use accepts requestId, name, route (agency also clientId), preserves the
source, reserves destination capacity, invokes private Studio preparation and
atomically accepts a destination-owned typed base plus imported checkpoint.
Retry the same request ID and payload after interrupted preparation. Failed
preparation retains a draft reservation, consuming site capacity; no automatic
reaper or cancellation is included. An accepted replay never rewinds edited
content. Native customer destinations retain their own business ownership;
this increment does not change the workspace's selected setup site.

Native copy checks current original login, account role, explicit catalogue
grant, active plan, website capacity and template page/storage size. Viewer
listing and preview do not require creation capacity. Broad published eligibility
remains disabled. Typed copies remain unavailable. Copies do not inherit source
release pointers or publish a customer domain.

Deploy migration 502 before consumers; deploy Studio's named
CodePageTemplateService entrypoint before adding the native service binding.
Deploy management resolveTemplatePreview/verifyTemplateSnapshot and native
routes, then Studio immutable template delivery, provision the exact template
hostname, and publish the verified receipt. Public previews intentionally do not
require a login but immediately stop resolving when the version or entry is
withdrawn. Their artifact pointer never follows the mutable source head.

Management TypeScript compilation passed. Scoped native compilation traversed
existing application dependencies with pre-existing errors; no template-module
errors remained at the last compile. Full integrated production build and bundle
guard remain required. No new tests or test runs; existing catalogue schema and
route-inventory fixtures were updated to the new schema. Nothing in this source
increment proves hosted readiness, editable-copy acceptance or mobile quality.

## Owned-copy launch follow-up

Native copies now appear under Templates → My template copies and expose an
explicit Open copy action. Its POST selects only a ready receipt in the current
native workspace, verifies the exact current code checkpoint around fresh
owner/plan/login checks and issues the existing short-lived editor handoff for
that destination. The original setup receipt is never repointed. Production
child-session authority also recognizes these retained account-owned copies;
ordinary typed checkpoint transport remains unchanged.

Private management now attaches only an accepted copy's exact derived editor
hostname to the fixed Sandbox service, checks provider identity, then confirms
HTTPS method admission. Use and Open copy cannot report editor readiness until
this succeeds; a pending hostname is safely retryable. It never registers a
wildcard or accepts a caller-selected hostname/service. Native Use is restricted
to the same owner role and platform-managed active plan required by subsequent
editing, so a manager cannot create an unreachable native copy.

GET /api/agency/page-studio/templates/sources supplies the approved source
selector for the agency registration UI. Management compilation passed for the
added provider and resolver methods. Full integrated build and manual hosted
acceptance remain pending; no tests were run or added.

Production template source approvals share the existing `PAGE_STUDIO_CUSTOMER_ACTIVATION` binding as an optional, strictly validated `templateSources` array of `{siteId, slug}`. Existing activation fields and eligibility checks remain unchanged. An explicitly present legacy `PAGE_STUDIO_TEMPLATE_SOURCES` binding takes precedence and malformed values fail closed; an absent approval array allows no sources. This keeps production within Cloudflare’s 150 text-binding limit.

Template preview publication now allocates its exact version-derived hostname through a private management RPC. The bounded Cloudflare adapter fixes the service to `xeroflow-page-studio-client-staging`, verifies the configured zone/domain/certificate identity, and checks the retained registered version and succeeded snapshot before and after provider I/O. Provisioning does not publish a pointer: the agency request still requires fresh publication authority, actual HTTPS health, and its immutable receipt. A pending certificate or provider failure can be retried without selecting a different host. No additional text binding is required.
Private `POST /internal/page-studio/checkpoints/editor-template-copy` accepts an empty object and an existing editor session in `x-page-studio-session`, alongside machine authentication. Its `{ready}` proof requires fresh agency `source:edit` and `workspace:checkpoint` authority, an exact-scope ready destination, and an accepted current checkpoint with matching audit/durable object scope. It grants no source-import capability and remains independent of catalogue withdrawal. Studio uses it only to admit an already authorized copy to the canonical editor.
