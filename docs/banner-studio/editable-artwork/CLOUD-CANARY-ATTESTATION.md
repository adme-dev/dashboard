# Native canary outer-image content attestation

27 October 2026. This completes finding 2's **local outer-image content attestation** for the exact retained image and package. It is not hosted acceptance, a registry publication receipt, or permission to enable the canary.

## Result

**Passed locally.** The final verifier streamed the existing image without building, running, pulling, pushing, deploying, provisioning, pruning, or retaining an image archive. No image content was executed and no secrets were read.

Final evidence:

- Verifier: `scripts/banner-studio/attest-engine-canary-image.mjs`, SHA-256 `08549557c78b01bcfbf991c935ede45d13f545d4e5315caecd347b92aba5955b`.
- Focused tests: `test/banner/engineCanaryImageAttestation.test.ts`, SHA-256 `7b468faef1403ba2918f8cba400ccb338456e1b867c6f0ec025cab2b887deb08`.
- Final receipt: `workers/banner-engine/canary/.artifacts/outer-content-attestation-final.json`, SHA-256 `e85514e6ba32b6cb344d5aeb80923dd75a8ac28b4ee0ec2e887ff42b20b13d96`, status `passed`, started `2026-10-27T11:19:37.248Z`, duration 5,411 ms.
- The earlier parser-failure receipt remains preserved at `.artifacts/outer-content-attestation.json`; it records verifier failure, not an image mismatch. The intermediate passing receipt is also retained separately as `.artifacts/outer-content-attestation-success.json`.

Reproduce against the retained local image on Node 24.18.0:

```sh
node scripts/banner-studio/attest-engine-canary-image.mjs
```

This writes a fresh JSON result to stdout. To preserve a new receipt rather than overwrite existing evidence:

```sh
node scripts/banner-studio/attest-engine-canary-image.mjs \
  --receipt workers/banner-engine/canary/.artifacts/<new-receipt>.json
```

The receipt writer uses exclusive creation. Timestamps and duration naturally differ between runs; all content correlations are recomputed.

## Exact identity and content correlation

| Object | Verified result |
| --- | --- |
| Local manifest / Docker inspect ID | `sha256:12158e33bb5a22ed0ff01b0f9d1cde28e24d44904f3c1819e4ef379fe4f47472`; the OCI index descriptor exists and the referenced manifest bytes hash to this exact value |
| Outer config | `sha256:e7bfa3ca18487c5c231229ca24164de533eff36934f1a78c29b96b57f1301805`; manifest descriptor and config bytes match |
| Platform and launch configuration | Linux AMD64, user `root`, entrypoint exactly `["node","/opt/canary/supervisor.mjs"]` in both inspect and saved config |
| Layers | All 24 manifest layer descriptors match their streamed compressed bytes and sizes; all 24 uncompressed hashes match `rootfs.diff_ids` in config order |
| Package manifest | `.artifacts/context/package.json` hashes to `60d764cfd1fefc45e5437fe87e9cf424b2ddd5318aba53244f5b5cb9a876d339` |
| Packaged files | `/opt/canary/package.json`, `pins.mjs`, `policy.mjs`, `supervisor.mjs`, both fixtures, and `inner.tar` match retained-context SHA-256 and byte size exactly; every file is `0444` |
| Inner archive | `/opt/canary/inner.tar` is 121,223,680 bytes with SHA-256 `86cecd78b2054c7167d703548cca6e6977087dd276c69be37acee074c82af1c4` |
| Packaged directories | `/opt/canary` and `/opt/canary/fixtures` are directories with final mode `0555` |

The verifier applies layers in config order, handles whiteouts, opaque directories, links, repeated directory metadata, PAX/GNU names, and trailing tar bytes. It drains each layer completely after its end markers before finalizing raw and diff hashes. The receipt records every layer descriptor and diff ID individually.

## Launch dependencies proved from filesystem bytes

No executable was launched. The verifier resolves commands through the saved image `PATH`, follows symlinks, checks execute bits on commands, parses AMD64 ELF program headers and dynamic tables, and recursively resolves interpreters and `DT_NEEDED` libraries.

| Launch requirement | Resolved content |
| --- | --- |
| `/bin/sh` | `/bin/busybox`; interpreter `/lib/ld-musl-x86_64.so.1` and its musl dependency exist |
| `mountpoint` | `/bin/busybox`; same resolved musl closure exists |
| `mount` | `/bin/busybox`; same resolved musl closure exists |
| `node` | `/usr/local/bin/node`; interpreter `/lib/ld-musl-x86_64.so.1`; libraries `/usr/lib/libstdc++.so.6`, `/usr/lib/libgcc_s.so.1`, and `/lib/ld-musl-x86_64.so.1` exist |

This establishes the static launch dependency closure used by the repaired entrypoint. It does not prove hosted mount privileges, entrypoint-override behavior, Node startup, nested daemon startup, rendering, cleanup, or termination.

## Digest boundary and incomplete proof

The local manifest digest and config digest are distinct and were independently recovered from their respective bytes. Docker inspect also lists `banner-engine-native-canary@sha256:12158e33…`, but no registry request was made. **No hosted registry digest is proved.** A future immutable registry digest must be recorded separately after root publishes this exact retained image; it must not be inferred from either local digest.

This attestation also does not supply the real release Worker bundle/config/deployment identity or resolve any runtime finding. Admission must remain disabled until root separately satisfies those release gates.

## Bounds and verification

- Docker save timeout: 180 seconds; final run took 5.411 seconds.
- Streamed archive member payload: 313,938,622 bytes, below the 2 GiB cap. Tar framing is additional; no save archive was written to disk.
- Reconstructed layer entries: 2,020, below the 500,000-entry cap.
- Relevant ELF byte cache: bounded to 256 MiB; JSON members and per-file reads are separately bounded.
- Free disk remained above the required 3 GiB reserve; final observed free space was 25 GiB. No cleanup was performed to obtain it.
- `node --check scripts/banner-studio/attest-engine-canary-image.mjs`: passed.
- `pnpm exec eslint scripts/banner-studio/attest-engine-canary-image.mjs test/banner/engineCanaryImageAttestation.test.ts`: passed.
- `pnpm exec vitest run test/banner/engineCanaryImageAttestation.test.ts`: **4 tests / 1 file passed**. Compressed and uncompressed archives are streamed in 31-byte chunks; tests cover adjacent-entry prefetch, complete trailing-byte hashes, layer-descriptor mismatch rejection, and config diff-ID mismatch rejection. The only diagnostic was the existing Vite native-config `__dirname` advisory.

The historical build-budget breach remains explicitly preserved: **1,268,305,705 observed bytes against a 943,718,400-byte ceiling**, not accepted. This successful content attestation neither erases nor re-measures that breach.

Only the new verifier, focused test, this report, and new attestation receipts were changed. Existing canary source, core/candidate code, retained package context, deployment configuration, and release-gate files were not edited.
