# Engine jobs: Pages entry guard

27 October 2026. Local implementation and fixture-build evidence for review R2.

`server/runtime/banner-engine-pages-guard.ts` runs at the beginning of the
installed Nitro Pages `fetch`, before its websocket/static branches and before
`Buffer.from(await request.arrayBuffer())`. It covers only the current
`/api/agency/banner-studio/engine-jobs` and `/api/internal/banner-engine` route
families. The existing preset receives the original Request object unchanged for
every other route, including its original bytes and headers.

The entry requires the actual Pages binding `BANNER_ENGINE_ENABLED === 'true'`.
Missing, false, boolean or malformed values return sanitized 503 without acquiring
a body reader or consuming the body; it never consults `process.env`. Internal
requests additionally require a valid configured service token, native HTTPS URL
and timing-safe bearer comparison before reading. Caller-supplied forwarding
headers cannot establish TLS. Pages has no trusted local loopback exception.
The existing routes still enforce user authentication, full configuration,
capabilities, schemas, client authority and their own body limits.

The guard rejects non-identity content encoding and invalid/oversized declared
lengths before reading. It counts actual chunks independently of the length
header, with a 24 MiB body ceiling and 64 KiB for user cancellation paths. A
single fixed-size accumulator and one 30-second deadline race avoid per-chunk
retention and accumulating timer-promise handlers. The 65,536-chunk ceiling also
terminates empty/tiny-chunk microtask floods. Oversize, stalled and failed streams
are cancelled without awaiting a producer's cancellation acknowledgement; errors
are fixed, content-free messages with private/no-store headers.

Canonical trailing slash paths are allowed. Encoded, case-changed and repeated
slash spellings that resemble these families are rejected conservatively. This
includes `%3F`: installed H3 decodes it before its router strips the query, so a
raw `URL.pathname` prefix check alone would miss a real accepted route alias.
No URL is rewritten or forwarded under a normalized spelling.

Successful guarded reads reconstruct a Request with bounded bytes for the
existing preset to consume. The transform keeps `_platform.cf` and
`_platform.cloudflare.request/env/context` attached to the original trusted
platform objects. The companion `engineJobHttp` correction reads that trusted
Request for transport checks and accepts the already bounded synthetic body
through the installed node-mock-http/H3 bridge. The original native body has
already been consumed and must not be read again downstream.

## Build placement and upgrade gate

`scripts/banner-engine-pages-guard.mjs` is wired after the two existing custom
Rollup plugins in `nuxt.config.ts`. It pins the complete reviewed Nitro 2.13.4
`cloudflare-pages.mjs` source SHA-256:

`63767bf521317b7224e0105f9259e3bb901b276aeed50e0465cba6c041c9ee49`

Every replacement requires one exact match, and the injected guard must precede
the prebuffer. Bundle emission fails if the source changes or the expected entry
was not transformed. Only the explicit installed Nitro dev and prerenderer
entries are exempt from requiring this Pages transform. Dependency/preset
upgrades therefore require review and updated fixture evidence, not an automatic
hash refresh. No dependencies or installed package files were modified.

## Reproducible local verification

```sh
pnpm exec vitest run test/banner/enginePagesGuard.test.ts --maxWorkers=1
pnpm exec eslint server/runtime/banner-engine-pages-guard.ts scripts/banner-engine-pages-guard.mjs test/banner/enginePagesGuard.test.ts
```

The guard file has **32 passing tests**, including evaluation of the transformed
installed preset fetch with the real installed node-mock-http/H3 bridge, H3
accepted encoded aliases, default-off zero-read behavior, internal pre-read auth,
actual undeclared oversize chunks, cancellation limits, endless empty chunks,
stalled reads with never-settling cancellation, sanitized failures, valid bounded
bytes, original platform-context identity and unrelated binary-byte identity.

The same test file builds a minimal temporary Nitro `cloudflare_pages` fixture
using the dashboard's plugin order, compatibility date and Node compatibility.
Successful bundle emission exercises the actual transform and placement gate;
the fixture and generated files are removed afterwards. This is an actual small
Nitro build, separate from the runtime-shaped composition tests. The emitted
Cloudflare bundle is not executed under Node, whose native ESM loader does not
support its `cloudflare:` imports. The pre-existing Vite `__dirname` warning is
unchanged. Scoped lint passes.

This worker performed no full dashboard build, deployment, Git operation,
provider change, database action or native rendering. Root owns final combined
validation and independent review. Hosted authentication, private R2 behavior,
actual Pages resource ceilings and runtime acceptance remain separate gates.
The per-request accumulator is bounded; platform stream allocations, Request
and preset copies, and concurrent requests are not a global memory-admission
guarantee. The feature remains default-off.

## Primary API references

Cloudflare documents Request construction/body APIs and preserving request
properties through reconstruction in its [Request reference](https://developers.cloudflare.com/workers/runtime-apis/request/).
The guard uses the native readable body described in the [Workers Streams reference](https://developers.cloudflare.com/workers/runtime-apis/streams/).
[Nitro's Cloudflare deployment documentation](https://nitro.build/deploy/providers/cloudflare)
describes provider integration; the installed, hash-pinned 2.13.4 preset is the
authority for the specific prebuffer and context layout tested here.
