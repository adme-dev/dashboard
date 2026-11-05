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
