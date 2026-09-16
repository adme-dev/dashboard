# Pages startup recovery — 16 September 2026

## Failure and change

The guarded readiness deployment from current main 2df6924e6 passed the raw/gzip
budget but Cloudflare rejected startup CPU time. Failed deployment:
`d34cc6cb-e28b-4538-a3bb-3de28fd78c49`. Provider readback confirms production
remains on successful `de6e24be-e05b-4127-8da0-07f542c95048`, source 708b321f.

The dispatcher eagerly imported the 7.3 MB Nitro runtime. Load it on the first HTTP
or scheduled event instead. Native module caching initializes it once, including
concurrent first requests. The independent WebSocket handlers retain their route
matching, decoded IDs, error handling, environment and context delegation.

The first HTTP request still pays the initialization cost; this change removes
that work from isolate startup. It does not remove application features or change
Cloudflare limits. See Cloudflare's startup guidance:
https://developers.cloudflare.com/workers/platform/limits/#worker-startup-time

## Verification

- Eager static graph: 7,306,223 bytes across 4 modules before; 5,065 bytes across 2
  modules after. This is dependency-graph size, not measured CPU time.
- Wrangler's local CPU profile did not capture useful initialization samples;
  do not treat that profile as proof of production startup latency.
- Regression failed before the fix. 22 dispatcher/compactor tests pass, including
  no Nitro initialization for WebSockets, concurrent HTTP requests, and scheduled
  events with and without a handler.
- Full production build passes. Raw 25,468,284/25,468,928 bytes (644 remaining);
  gzip 6,623,203/9,750,000. Budgets unchanged.
- Full Dashboard suite: 13,810 passed, 259 existing skips. Run after build because
  Nuxt temporarily replaces the generated tsconfig files during build.
- Changed test file lint passes. The compactor has one unchanged pre-existing
  quote-style lint diagnostic in compactSqlWhitespace; no new lint issue.
- No application TypeScript changed. PR562's comparison still establishes 918
  existing diagnostics with zero added or removed.
- The full suite includes four passing built-Nitro Miniflare tests covering
  real dispatcher/H3/request bindings, authentication and R2. Its existing harness
  stubs optional unavailable modules. Direct local Pages dev instead hit an
  existing pngjs/Node-compatibility bundling problem and is not claimed passing.
- CI and production deployment/browser acceptance remain pending.
