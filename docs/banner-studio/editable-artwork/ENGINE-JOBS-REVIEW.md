# Engine jobs independent security and correctness review

27 October 2026. Independent reviewer lane; only this document is reviewer-owned.

## Verdict

**Accepted for the bounded local implementation and evidence below.** One P1
(unknown cleanup termination) and two P2 findings (Pages request integration and
transport chunk overhead) were reported, corrected and independently rechecked.
No unresolved P1/P2 remains in this reviewed source snapshot. All **31 source
hashes** in the final integration manifest match the current files.

Acceptance covers default-off job authority, private artifact transfer, the
installed Pages adapter/entry guard, durable uncertainty holds and local native
render-preview integration. It grants no hosted deployment, production user/R2
acceptance, full dashboard build, editable-layer import or print acceptance.

## R1 — P1: unknown container termination becomes terminal failure

Status: **resolved**. Correction, independent regression, final source hashes and
the coordinator's durable integration evidence were reconciled.

Initial affected locations:

- `workers/banner-engine/runtime/render-preview.mjs`, `cleanupOwnedContainer()`:
  deliberately throws `LinuxRuntimeError('cleanup-failed')` if removal or positive
  absence readback fails.
- `workers/banner-engine/runtime/index.ts:17-18`: collapses that error to
  `EngineAdapterError('engine-failed')`.
- `workers/banner-engine/runner/index.ts:301`: classifies any settled adapter
  promise, including that rejection, as `termination: 'adapter-settled'`.
- `workers/banner-engine/transport/index.ts`: accepts that receipt termination.
- `server/utils/banner/engineJobs.ts`, service `fail` action: `engine-failed` plus
  `adapter-settled` becomes terminal `failed`, or `cancelled` during cancellation.

Reproduce without Docker by mocking `renderLinuxPreview()` to reject
`LinuxRuntimeError('cleanup-failed')`, invoking the real Linux adapter through the
runner/transport with a synthetic claimed request, and inspecting its failure
receipt and failure upload. The initial implementation labels termination
`adapter-settled`; supplying that upload to the authority terminalizes the job
instead of holding `uncertain`. Repeat with cancellation racing adapter cleanup.
The existing cleanup helper tests cover rejected cleanup, but did not exercise
this composed path.

This does not bypass the permanent replay holds or publish a successful PNG.
It does misstate an unknown owned execution as known terminal failure, violating
the plan's termination and operator-reconciliation contract. Preserve explicit
cleanup uncertainty through the adapter and runner, including cancellation-race
handling, and verify that the transport/server retain `uncertain`.

Correction inspected: `EngineAdapterError` now carries explicit termination,
defaulting to `unconfirmed`; the Linux wrapper preserves unknown cleanup rather
than collapsing it into known termination. The runner tracks both promise
settlement and positive adapter cleanup confirmation, including errors arriving
during cancellation grace. `test/banner/engineTermination.test.ts` exercises the
real runtime adapter/runner/transport with mocked Docker processes, including
removal failure, failed readback, residual containers, cancellation, unknown
errors and settlement after the grace period. Independent regression passed
**96 tests across four files**, including all 13 new termination cases. The final
SQL proof also confirms `engine-failed` plus `unconfirmed` becomes immutable
`uncertain` for both running and cancelling attempts, cannot be reclaimed, and
rejects a late successful completion.

## R2 — P2: installed Pages bridge prebuffers and rejects valid requests

Initial unguarded boundary: `nuxt.config.ts:418` selects `cloudflare_pages`. The installed
`node_modules/nitropack/dist/presets/cloudflare/runtime/cloudflare-pages.mjs`
reads `Buffer.from(await request.arrayBuffer())` before invoking the route through
`nitroApp.localFetch`. Consequently route authentication and the new streaming
byte/time limits occur after the body was already consumed. A bounded Node HTTP
test does not establish an entry-level memory or streaming bound for Pages.

Reproduced against installed Nitro **2.13.4**, node-mock-http **1.0.4** and H3
**1.15.11**. The Pages entry SHA-256 was
`63767bf521317b7224e0105f9259e3bb901b276aeed50e0465cba6c041c9ee49`;
the node-mock-http `dist/index.mjs` SHA-256 was
`c8f58ec03a371abbe33529794078c754aab5caae8fa809b70d3b0a2ab901bb9e`.

There are two additional incompatibilities with that exact bridge:

- `assertEngineServiceAuth()` reads `event.web.request` or the synthetic Node
  socket, not the native platform Request retained in
  `event.context.cloudflare.request`. The installed `node-mock-http` marks its
  socket encrypted only for `protocol === 'https'`, while this preset supplies
  `url.protocol`, which is `'https:'`. Valid service authentication rejects 403.
- `readEngineJobJson()` accepts a native web body or an actual Node `Readable`.
  `node-mock-http` supplies its own synthetic `IncomingMessage` with a prebuffered
  `body`, neither accepted shape; valid JSON rejects 400.

The reviewer reproduced both failures without building, deploying or running
native code. Use `fetchNodeRequestHandler(toNodeListener(app), url.pathname, ... )`
from the installed `node-mock-http`/H3 packages, passing the exact preset arguments:

```ts
const request = new Request('https://engine.example/api/internal/banner-engine', {
  method: 'POST',
  headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  body: '{"action":"claim"}'
})
const url = new URL(request.url)
const body = Buffer.from(await request.arrayBuffer())
const bridgeOptions = {
  context: { _platform: { cloudflare: { request, env: {}, context: {} } } },
  host: url.hostname, protocol: url.protocol,
  method: request.method, headers: request.headers, body
}
```

In the H3 handler invoke `assertEngineServiceAuth()` with the matching token and
loopback disabled: observed **403**. Omit only that auth call and invoke
`readEngineJobJson()`: observed **400**. Both responses passed through
`engineJobHttp()` with sanitized errors.

The required correction is an entry-level bound before prebuffering plus native
Pages request compatibility. Merely reading the prebuffered `.body` or trusting
forwarded headers would not fix the resource-bound requirement.

Correction reviewed: the helper now resolves only native `Request`
instances from Nitro's trusted platform context and bounds the raw consumed
`Buffer` before decoding. A new Rollup plugin pins the exact installed Pages
entry SHA-256 and inserts `guardBannerEnginePagesRequest()` before its
`arrayBuffer()` call; missing/changed entry integration fails the build. The
guard checks the deployment enable binding, private errors, service TLS/bearer,
ambiguous route spellings, declared and actual sizes, time and chunk counts. It
preserves the original native platform Request and passes unrelated routes
unchanged.

Status: **resolved at the local installed-adapter boundary**, with matching final
hashes. The reviewer passed **31 guard tests**, skipping
only the minimal Nitro build integration case owned by the implementation lane.
The reviewer then independently composed the transformed installed Pages entry,
the actual node-mock-http bridge and real engine HTTP/config/auth/body helpers:

| Case | Observed result |
| --- | --- |
| Enabled valid native HTTPS request | 200, exact parsed JSON |
| Disabled binding | 503, zero body pulls |
| Incorrect service token | 401, zero body pulls |

All three responses were private/no-store. This repeats the original failing
boundary through the added entry guard; it is stronger than testing the helper
or guard in isolation. It remains local installed-adapter proof, not a deployed
Cloudflare acceptance claim.

## R3 — P2: transport byte cap does not bound per-chunk allocation

Initial `workers/banner-engine/transport/http.ts` races each `reader.read()`
against the same pending `aborted` promise and retains each chunk in an array
before `Buffer.concat`. An input response can stay under the 24 MiB byte cap yet
yield millions of tiny chunks. Each iteration retains another reaction on the
pending abort promise and another array/chunk object, consuming worker-host
memory outside the native adapter's process limits. A deliberately stalled body
can retain this overhead until the request timeout.

Reproducer: supply the configured endpoint's input response as a valid JSON
`ReadableStream` emitting one-byte chunks; increase the count while keeping total
bytes under the limit. Inspect per-chunk promise registration and retained chunk
entries. No native execution is needed. Avoid a full 24-million-chunk run on a
shared host. The server reader has already adopted one timer race around the
whole loop and a fixed bounded buffer; the transport should use the same
allocation discipline and preserve abort/late-response cancellation behavior.

The reviewer ran a bounded isolated reproducer: **10,017 bytes** of valid input
JSON, delivered as one-byte chunks, produced **10,019 races against the same
pending abort promise**. No external request, native engine or container ran.

Status: **resolved**, with independent regression and matching final hashes.

Correction inspected: the transport now uses one fixed bounded allocation, one
race for the whole body loop and a 65,536-chunk cap. The identical reviewer probe
now registers **two races**, independent of chunk count. The initial independent
41-test transport rerun passed 40 cases and exposed a separate timing-sensitive
80 ms deadline assertion: execution had correctly stopped before adapter start,
but the test demanded `adapter-settled` instead of `not-started`. The test now
waits for real adapter invocation before advancing a fake deadline. Independent
rerun passed all **41 transport tests**, alongside the 40 Pages-helper and 13
termination tests (**94 total**).

## Boundaries reviewed

| Boundary | Assessment of implementation |
| --- | --- |
| Default-off and service auth | Requires enabled setting, nonempty trusted pins, token and dedicated bucket binding; binding values override environment fallback. Timing-safe bearer comparison occurs before body parsing. Forwarded TLS headers cannot authorize plaintext. |
| User and client authority | Submission/cancel routes require write access. Reads require authentication. The authority locks current project and client membership, protects null-client ownership and rejects historical output when client/creator changes. Shared service authentication supplies no user access. |
| Saved source | Canonical server hash covers saved canvas, owner, client and revision. Submit checks saved revision twice around storage; claim/input/complete inspect current source. Private output reads recheck access and source after storage I/O. |
| Cancellation and source races | Final success transaction runs after output I/O and locks the job and project. Running cancellation/source invalidation prevents success; late results cannot promote terminal or uncertain states. Cancellation after already accepted success does not revoke that result. |
| Lost acknowledgements | Authority uses the explicit nonretrying transaction boundary. Claim cannot requeue; expiry holds running/cancelling as uncertain. Conditional private writes never overwrite and no acknowledgement error authorizes deletion. Worker sends at most one completion and never sends failure after a possibly accepted completion. |
| Durable local claims | Exclusive attempt directories and fsynced journals precede input execution; partial/existing claims hold replay. Missing/malformed runner receipts are unconfirmed. Neither token is persisted in transport journals. |
| Private storage | All keys are server-derived under the dedicated binding, output access remains authenticated, sizes/hashes are checked, responses are private/no-store, and no public asset is created. Bucket privacy itself is an operator provisioning fact, not demonstrated by binding presence. |
| Hostile payloads | Strict schemas reject arbitrary commands/paths/URLs/tenant IDs, extra fields and prototype keys. Canonical base64, stream byte/time limits, result identity/pins, bounded PNG dimensions/encoding/chunks/CRC and decoded pixels are checked. |
| SSRF and native isolation | Transport uses one configured origin and fixed path, forbids redirects and rejects changed response URLs. Job data selects no fetch destination or executable. Native process isolation remains the trusted Linux adapter's responsibility. |
| Filesystem parents | Leaf/descendant symlinks and hard-linked artifact files are rejected. Configured parent aliases are canonicalized; existing ancestor uid/mode and hostile same-user mutation are not checked. Private, durable, operator-owned parent directories are an explicit prerequisite, not a demonstrated hostile-host defense. |

## Independent verification

The reviewer ran this exact scoped command without opting into PostgreSQL or
native execution:

```sh
pnpm exec vitest run test/banner/engineJobsContract.test.ts test/banner/engineTransport.test.ts test/banner/engineRunner.test.ts test/banner/engineContract.test.ts test/banner/engineLinux.test.ts test/server/utils/bannerEngineJobs.test.ts test/server/utils/bannerEngineJobBoundaries.test.ts test/server/utils/bannerEngineResult.test.ts test/server/api/bannerEngineJobs.test.ts --maxWorkers=1
```

Initial result: **179 tests passed across nine files**. The existing Vite
`__dirname` configuration warning appeared. These tests include real local Node
HTTP route invocation with mocked authority and synthetic adapters/filesystem
receipts; passing them does not close R1 or prove native execution.

After the R1 correction, the reviewer ran:

```sh
pnpm exec vitest run test/banner/engineTermination.test.ts test/banner/engineRunner.test.ts test/banner/engineTransport.test.ts test/server/utils/bannerEngineJobs.test.ts --maxWorkers=1
```

Result: **96 tests passed across four files**. Mocked Docker child processes test
the real runtime adapter/runner/transport composition; no native process or
container was launched by these tests.

At the stable helper/transport checkpoint, the reviewer also ran:

```sh
pnpm exec vitest run test/server/utils/bannerEnginePagesBridge.test.ts test/banner/engineTransport.test.ts test/banner/engineTermination.test.ts --maxWorkers=1
```

Result: **94 tests passed across three files**. The 40 Pages-helper cases use both
the root and Nitro-resolved installed HTTP bridge, including trusted native TLS,
consumed raw buffers, default-off, UTF-8 and actual byte limits. This closes the
helper compatibility defect; the separate entry guard must still close earlier
prebuffering. The subsequent guard and composed proof described in R2 close that
local defect.

## Final integration evidence reconciliation

Final accepted manifest:
`output/editable-artwork-engine-jobs/proof-2026-10-27T05-26-57-516Z/postgres-proof.json`.
The reviewer recomputed **all 31 hashes** and found no mismatch, including the
Nuxt wiring, entry guard/plugin, bridge helpers, wire contracts, authority,
migration, transport/CLI, runner/runtime, regression tests and capability files.
The manifest records `passed: true`, `sourcesUnchangedDuringProof: true`, exit 0,
`ownedClusterStopped: true` and `cleanedUp: true`.

The coordinator executed **12 local PostgreSQL/native cases**, including actual
endpoint modules, concurrent admission/claims, cancellation/source races, lost
post-COMMIT acknowledgements, clock expiry, assignment revocation and unknown
cleanup holds. The reviewer inspected the test code and retained proof; the
reviewer did not start PostgreSQL or native execution. The proof uses synthetic
user sessions/rate-store behavior and private in-memory storage. The installed
production transaction driver, deployed authentication and real R2 are not
proven by those fixtures.

The accompanying `native-http-evidence.json` records both successful native
previews. The reviewer independently hashed and decoded the retained private
PNGs and confirmed the following values against the evidence:

| Engine | PNG dimensions | Transparent pixels | Partly transparent pixels | Digest |
| --- | --- | ---: | ---: | --- |
| PhotoCraft | 256 × 256 | 37,180 | 27,590 | Matches evidence |
| VectorCraft | 640 × 360 | 207,661 | 11,016 | Matches evidence |

Both accepted receipts explicitly retain `editableImport: false`.

The reviewer also inspected the coordinator's machine-readable regressions:

- `output/editable-artwork-engine-jobs/final-regression-20261027.json`:
  **326 passed across 15 files**, no failures.
- `output/editable-artwork-engine-jobs/final-pages-regression-20261027.json`:
  **32 passed in one file**, including the minimal installed Nitro Pages fixture
  build with the dashboard plugin order. This is a small fixture build, not the
  full dashboard build or deployed Cloudflare runtime acceptance.

Earlier proof directories predate some corrections and are not the accepted
source snapshot. Final acceptance is bound to the manifest above.

## Remaining release and evidence gates

- Actual hosted user authentication, PostgreSQL deployment, dedicated private R2
  access/conditional-write behavior, TLS/routing and Pages resource ceilings are
  separate acceptance gates. Local fixture auth/private map storage prove none
  of those hosted facts.
- Future Nitro entry changes require explicit guard review: the build-time hash
  and required-placement gate intentionally fail closed on unreviewed adapters.
- No daemon, scheduler, global resource admission, automatic retry, upload
  recovery or retention/reconciliation workflow is supplied. Uncertain attempts
  retain artifacts and replay holds; deletion/requeue is not recovery authority.
- A successful result is a render-preview PNG with `editableImport: false`.
  It is not editable-layer import, native document round-trip, artwork fidelity,
  managed-QR acceptance or commercial print proof.
- The reviewer performed no application/source/test edits, Git operation,
  deployment, provider change, DB activation or container/native execution.
