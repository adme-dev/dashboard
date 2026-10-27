# Dissector upload transport

Implemented and locally verified on 28 October 2026 in the original shared
`banner-editable-artwork` workspace. This is Task 3 transport evidence, not full
R01 ownership, hosted delivery, native-engine, print, or production acceptance.

## Entry boundary

The exact route is `/api/agency/banner-studio/dissect/upload`. The installed
Nitro Pages preset calls `request.arrayBuffer()` before its H3 route executes.
Consequently a limit enforced only by `upload.post.ts` is too late for Pages.

`scripts/banner-engine-pages-guard.mjs` extends its existing checked transform
with `guardBannerDissectionPagesRequest`. Both guards run before the preset's
body read. The reviewed installed preset SHA-256 remains
`63767bf521317b7224e0105f9259e3bb901b276aeed50e0465cba6c041c9ee49`;
an entry change or missing transform fails the build. Only the existing explicit
Nitro dev/prerender entries are exempt from the Pages placement check.

| Boundary | Limit / behavior |
| --- | --- |
| Entire upload body | 10 MiB + 64 KiB = 10,551,296 bytes, inclusive |
| Deadline | 30,000 ms for the whole body read, not per chunk |
| Chunks | At most 65,536, including empty chunks |
| Content-Length | Reject malformed/over-limit declaration before reading; still count actual bytes for absent or false declarations |
| Content-Encoding | Only absent/empty or exact `identity`; reject compression |
| Aliases | Reject recognized percent-encoded, case, slash, backslash, encoded-query and trailing-slash aliases |
| Errors | Sanitized JSON, private/no-store; 400 malformed input, 408 deadline, 413 bytes/chunks/declaration, 415 encoding |

The reader uses one fixed allocation and no per-chunk retention. Failed reads
cancel without waiting for an adversarial cancellation acknowledgement. The
preset receives a Request containing only bounded bytes. Its Cloudflare context
continues to reference the original platform Request, `cf`, environment and
execution context; no socket identity, forwarded-header trust, or artificial
platform marker is introduced.

Engine routes still pass through the original engine guard unchanged: independent
feature flag, internal authentication, 24 MiB body ceiling and 64 KiB cancellation
ceiling. Other routes retain their original Pages behavior. Upload authentication
remains owned by the existing route; the ingress guard is solely a transport cap.

## Coordinator integration contract

The coordinator owns the upload route integration:

```ts
import { ensureBoundedDissectionUploadBody } from '~~/server/runtime/banner-dissection-pages-guard'

const user = await requireWriteAccess(event)
await ensureBoundedDissectionUploadBody(event)
const formData = await readMultipartFormData(event)
```

Call the helper before any body reader. It reads local Node input with backpressure,
removes listeners on completion/cancellation, and shares one promise for repeated
or concurrent calls on an event. On Pages it reuses the preset's bounded Buffer;
it never tries to reread the consumed native Request. It populates the installed
H3 `_requestBody` cache with bounded Buffer bytes, which H3's multipart reader
uses on subsequent calls. Real-handler tests exercise this contract; an H3
upgrade needs these tests rerun. Earlier unrelated middleware that already
buffered a local request cannot gain retrospective prebuffer protection from
this helper.

The route must still enforce file size at 10 MiB, one unambiguous file field,
16 KiB aggregate non-file metadata, duplicate-part rules, supported image bytes,
and all auth/storage/dispatch policies. Those checks and full upload integration
are coordinator-owned; the transport helper does not parse multipart or authorize
an actor. Local rejection pauses input and disables keep-alive so H3 can send its
sanitized error before closing the connection.

## Reproduction and evidence

Use Node 24.18.0 from `/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin`:

```sh
PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH \
  pnpm exec vitest run test/banner/dissectionPagesGuard.test.ts test/banner/enginePagesGuard.test.ts
```

Observed initial red: 15 ingress tests failed against the original checked
transform, including accepted oversized/compressed/aliased requests and the
native unbounded `arrayBuffer()` read. Final focused run: **61 tests passed**.
The engine suite's only change imports/injects the added guard into its existing
installed-entry harness; all engine assertions remain intact. The new runtime
file also passes a standalone TypeScript check (`tsc --noEmit --skipLibCheck
--target es2022 --module node16 --moduleResolution node16`); this is not an
application-wide typecheck.

Evidence includes real Node HTTP rejection and H3 multipart parsing, installed
Pages-entry execution, both guard regressions and a disposable minimal Nitro
Pages build (including prerender). The emitted Pages artifact runs in actual
local workerd with compatibility date `2024-12-01` and flags `nodejs_compat` and
`no_handle_cross_request_promise_resolution`. A test-only fetch wrapper observes
the real workerd Request/env/context; the real Nitro/H3 route proves identity is
preserved, parses the cached multipart body twice, and checks a native binding.
The same runtime rejects streaming oversize, compression and an encoded alias,
and retains engine default-off behavior. Timeout uses controlled timers in the
installed-entry test; this does not measure a deployed deadline.

No dependencies, limits or production settings were changed. No full dashboard
build, deployment, live auth/R2/Neon/queue/provider or native rendering acceptance
was performed. The normal immutable build/startup/size guards and coordinator
release process remain required. Vitest reports the existing Vite `__dirname`
configuration warning; it does not affect the focused results.
