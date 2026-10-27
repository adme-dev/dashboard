# Protected Dissector asset delivery

Status: bounded delivery implementation and local mocked integration proof, 28 October
2026, in the original shared `banner-editable-artwork` workspace. This does not enable
scoped admission or establish bucket privacy, hosted delivery, browser acceptance,
export acceptance or release readiness. No Git, deployment, provider, live database,
browser, sibling-worktree or migration operation was performed by this worker.

## Public contracts

`shared/bannerDissectionDelivery.ts` exports:

- `ScopedDissectionAsset`, `scopedDissectionAssetSchema`: strict object with `assetId`,
  `attemptId`, `key`, `mimeType: 'image/png'`, `byteLength` and lowercase SHA-256.
- `DissectionDelivery`, `dissectionDeliverySchema`: strict `{version: 1, assets}`;
  assets are keyed by the identical entry asset ID. Maximum 300 entries; each PNG
  is at most 10 MiB. IDs and paths must already be canonical lowercase UUIDs.
- `MAX_SCOPED_DISSECTION_ASSETS`, `MAX_SCOPED_DISSECTION_ASSET_BYTES`.
- `scopedDissectionAssetKey(jobId, attemptId, assetId)` produces
  `scoped-dissection-assets/{jobId}/{attemptId}/{assetId}.png`.
- `scopedDissectionAssetLocator(jobId, assetId)` produces
  `/api/agency/banner-studio/dissect/{jobId}/assets/{assetId}`.
- `parseScopedDissectionAssetLocator(value: unknown)` returns
  `{jobId, assetId} | null`; `isScopedDissectionAssetLocator` tests canonical form.
- `isScopedDissectionAssetReference` is the broader exclusion recognizer for
  malformed, absolute, encoded and namespace references. Recognition is never
  authorization. Consumers must reject recognized references that do not parse.
- `isProtectedDissectionStorageKey` recognizes both `scoped-dissection-assets`
  and `scoped-banner-exports`, including encoded/backslash/case aliases.

`server/utils/banner/dissectionDelivery.ts` exports:

```ts
resolveScopedDissectionAsset(event: H3Event, actorId: string, locator: string):
  Promise<{ bytes: Uint8Array; mimeType: 'image/png'; jobId: string;
    sourceSha256: string }>

deliverScopedDissectionAsset(event: H3Event, headOnly = false): Promise<Response>

uploadScopedDissectionAsset(event: H3Event, input: {
  jobId: string; attemptId: string; assetId: string; bytes: Uint8Array
}): Promise<{
  key: string; url: string; size: number; assetId: string;
  mimeType: 'image/png'; sha256: string
}>
```

The upload helper is a server storage primitive, not an authorization boundary.
The coordinator must validate generated PNG content, authorize immediately before
calling, and reauthorize plus atomically insert the asset row and registry entry
under the current execution attempt afterward. The helper bounds bytes, checks the
PNG signature, writes native R2 with no-store metadata, then reads back and verifies
size, MIME and SHA-256. It does not decode the PNG, insert rows, append registry,
sign URLs, retry uncertain operations, delete objects or call a public fallback.

## Read authority and response behavior

The GET and HEAD endpoints use the same reader. They authenticate the request and
require the actor to equal the original uploader. The reader uses the coordinator's
`withDissectionAuthority(jobId, actorId, 'read', callback)` with the existing fresh
`dissectionAccess` policy. There is no duplicate role policy or executor-actor
inference. The supplied actor must be nonempty.

The first short transaction validates server source/ingestion, requires client or
project scope (including personal projects), validates the entire bounded registry,
then locks and checks the asset row. All of `id`, `r2_key`, `uploaded_by`, `client_id`,
`mime_type`, `file_size` and `url` must agree with the selected registry entry and
frozen owner. `client_id` is checked for consistency; it does not grant access.

Native request `event.context.cloudflare.env.MEDIA_BUCKET` is the only storage
source. Missing binding fails closed even locally. Storage work happens after the
first transaction ends. The reader allocates only the schema-bounded expected
length, cancels oversized/invalid streams, and checks exact bytes, MIME, PNG
signature and SHA-256. A second fresh transaction repeats authorization and all
identity checks. Full parsed source, ingestion, selected entry and asset-row values
must match the first snapshot before bytes return. Changes to unrelated progress
or the job's current attempt are intentionally ignored: older registered assets
remain usable while their original source authority remains valid.

Both GET and HEAD perform full bounded reads/hash checks and final authorization.
They return 200 with `private, no-store`, nosniff and same-origin resource policy;
HEAD has no response body. Range and conditional headers are ignored, with no
304/206 path or ETag. The route sets no-store before authentication, including
error responses. Remote reads never run inside authority transactions.

## Bypass closures and compatibility

The public signed route explicitly refuses both protected storage namespaces while
retaining its existing signed legacy key validator and HEAD/range/conditional
behavior. A valid token naming a protected row cannot fetch its bytes. The generic
`_uploads` route denies protected prefixes and encoded/traversal/backslash aliases
before filesystem access. Normal legacy and managed-QR local reads remain intact.

The generic asset catalogue excludes protected rows in SQL before ordering and
pagination. It does not reveal their internal keys or broaden uploader-only access
to client colleagues. Protected assets remain available through authorized job and
saved-canvas flows owned by the coordinator. Managed QR assets with non-null client
IDs continue to use the original signed path and QR verification logic.

A private prefix is not an R2 ACL. Direct r2.dev/custom-domain access was not tested
or changed; admission must remain disabled until the coordinator proves the bucket
has no public bypass. This implementation cannot revoke bytes already downloaded
or decoded in a browser or retained in an authorized offline export.

## Verification

The absent-module run failed. A temporary no-op delivery implementation produced
32 behavioral failures with 11 pure-schema/parser cases passing. After implementation
and adversarial review, the final command passed **190 tests in eight files**:

```sh
/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node node_modules/vitest/vitest.mjs run \
  test/server/api/bannerDissectionAssetDelivery.test.ts \
  test/server/api/bannerDissectionLocalDelivery.test.ts \
  test/server/api/bannerAssetDeliveryRoute.test.ts \
  test/server/utils/bannerAssetDelivery.test.ts \
  test/server/api/bannerAssetList.test.ts \
  test/server/api/bannerProjectManagedQr.test.ts \
  test/server/api/bannerPlatformQr.test.ts \
  test/banner/platformQrAiProtection.test.ts --maxWorkers=1
```

Delivery tests exercise real `withDissectionAuthority` and `dissectionAccess` code
with mocked transaction/SQL, auth and R2 adapters. They cover denial before storage,
actor mismatch, inactive user, assignment/permission/session revocation before and
after the read, personal-project reassignment/deletion, missing/malformed source and
registry, forged row/entry/generation/hash/size/MIME, final frozen snapshot changes,
missing native binding, GET/HEAD cache/range handling, public signed denial, local
aliases, catalogue exclusion and QR compatibility. Schema review additionally
fixed malformed-key refinement throwing and trailing-newline alias acceptance.

The standalone strict TypeScript check for the pure shared module passed. A scoped
TypeScript program using generated server compiler options reported zero diagnostics
in the shared module, delivery module and two new routes; its transitive dependency
graph reported 137 diagnostics. This is not a passing full-project typecheck.
Vitest emitted the existing `__dirname` configuration warning.

No real PostgreSQL lock/race test or synthetic workerd was run in this slice. The
mocked transaction checks prove the reader does not deliberately hold a transaction
across R2; they do not prove PostgreSQL lock behavior or hosted native binding
semantics. Coordinator acceptance still requires atomic registry/pipeline/import
integration, saved-canvas and export integration, real local transaction/race proof,
private-bucket and hosted browser/renderer checks, current-main reconciliation and
the immutable guarded build/release procedure.
