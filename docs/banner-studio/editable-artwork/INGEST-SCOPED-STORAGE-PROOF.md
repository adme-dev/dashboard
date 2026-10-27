# Protected export local native-R2 storage contract proof

Verified 28 October 2026 in the original `banner-editable-artwork` workspace.
The bounded proof is [bannerScopedStorageRuntime.test.ts](../../../test/workers/bannerScopedStorageRuntime.test.ts).
It adds no application behavior and uses installed dependencies only.

## Observed result

| Run | Result | Duration |
| --- | --- | --- |
| Invalid fixture metadata (`provenance: "{}"`) | Exit 1; 1 expected assertion failure, 13 passed, no skips | 624 ms |
| Valid fixture metadata | Exit 0; 14 passed, no failures or skips | 620 ms |

The negative run happened before the final passing run. It failed at the exact
roundtrip metadata comparison, which expected the production-generated provenance
and received `{}` from native R2. It was not a startup failure or an inverted
assertion that always passes. The same test and assertions run in both cases;
the opt-in environment variable changes only fixture metadata before the put.

Commands, run from the repository root with Node **v24.18.0**:

```sh
BANNER_STORAGE_PROOF_INVALID_METADATA=1 node node_modules/vitest/vitest.mjs run test/workers/bannerScopedStorageRuntime.test.ts --reporter=verbose
node node_modules/vitest/vitest.mjs run test/workers/bannerScopedStorageRuntime.test.ts --reporter=verbose
```

The first command is deliberately expected to exit 1. Retained local logs:
`/private/tmp/banner-scoped-storage-red.log` and
`/private/tmp/banner-scoped-storage-green.log`.
Installed versions: Miniflare `4.20260708.1`, workerd `1.20260708.1`, Vitest
`4.1.10`, esbuild `0.28.1`. Compatibility date: `2024-12-01`.
The existing Vite configuration emits its `__dirname`/future native-loader
warning; neither run changes that configuration.

## What executes

- Production `scopedExportMetadata` and `parseScopedExportProvenance` execute
  unchanged in Vitest. The containing module transitively imports SQL/authority
  code, so database exports are replaced with functions that throw if called.
  No DB operation is part of this proof.
- esbuild emits a temporary worker importing the actual production
  `readBoundedBannerObjectBody`. Native workerd executes that reader against
  real `MEDIA_BUCKET.get()` streams, with no substituted R2 implementation.
- Miniflare's native R2 proxy performs single puts carrying encoded bytes,
  `customMetadata.provenance`, HTTP metadata and SHA-256 together. The worker
  independently observes R2 GET and HEAD and hashes the bounded bytes with
  Web Crypto. Node computes the expected hash independently.
- The fixture uses `mkdtemp(join(tmpdir(), ...))`, an explicit `modulesRoot`,
  and a disposable R2 directory. It binds to loopback, disables CF discovery,
  denies worker outbound requests, and asserts zero outbound calls.
- Cleanup awaits the owned `Miniflare.dispose()` promise, then asserts fresh
  binding access fails with `ERR_DISPOSED` before removing its temporary store.
  Both retained runs logged that positive disposal result.

## Contract assertions

1. A PNG independently decoded by `pngjs` to one red RGBA pixel is stored as
   **70 bytes**, SHA-256
   `7d91c846b70d9450a30d1ea73dc15d2e7888dfa3b2a84b297bb5272ae23daf39`.
   The returned put ETag equals the GET/HEAD ETag; their size, custom metadata,
   HTTP metadata and stored SHA-256 checksum are equal. The bounded stream
   produces the same size and digest.
2. Eight unique dependencies and non-null owner/session fields roundtrip in
   exactly **1,800 UTF-8 bytes** of provenance. Fractional-second precision in
   the synthetic source revision pads the schema-valid object to the exact
   ceiling; this is a boundary fixture, not a claim that canonical saved
   revisions normally use that precision. Production generation and parsing
   reject 1,801 bytes; production generation rejects a ninth dependency.
3. `contentType: image/png` and `cacheControl: private, no-store` survive both
   R2 reads unchanged.
4. Missing/malformed provenance, wrong export identity, wrong project identity,
   mismatched target project and duplicate dependency IDs survive native storage
   unchanged and are rejected by the production provenance parser afterward.
5. A schema-valid altered output digest is detected by comparison with the
   actual native stream digest. The parser itself accepts this shape: provenance
   is not signed. The application delivery path separately compares the digest;
   this suite does not execute or establish acceptance of that authenticated path.
6. Native R2 rejects a checksum-invalid initial put without creating an object.
   It rejects a checksum-invalid replacement while retaining the original bytes,
   metadata, checksum and ETag. This proves the tested local single-put behavior,
   not crash durability or lost-acknowledgement recovery.
7. The production bounded reader rejects a maximum below object size, an expected
   size smaller than the body, and an expected size larger than the body, with
   its exact size/overflow/truncation errors.
8. Raw and percent-encoded object paths, the application's download-shaped path,
   and the test observation path return empty 404s for GET and HEAD, including
   Range headers. The sole local POST observation handler returns metadata,
   byte count and digest; it never returns encoded image bytes. There is no
   public HTTP asset route or public bucket configuration in this fixture.

## Acceptance boundary and remaining work

This is local workerd/native-R2 contract evidence only. It does **not** establish
authenticated-route behavior, authorization/revocation or SQL transaction
correctness against a real DB, hosted R2 configuration, service binding or
renderer acceptance, deployment, provider delivery, or a full application build.
No hosted API, credentials, live DB, provider, canary, sibling workspace,
dependency installation, Git operation or deployment was used. Root owns
remaining application fixes and final build/release checks.

During harness setup, the first startup attempt exposed workerd rejecting a
temporary module outside its default module root. Setting `modulesRoot` to the
owned temporary directory fixed the fixture. An initial image fixture also
failed independent decoding and was replaced with the valid PNG above before
the retained final red/green pair. These setup failures are not counted as
contract evidence.
