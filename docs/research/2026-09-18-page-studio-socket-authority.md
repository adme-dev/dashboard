# Page Studio ongoing socket authority — 18 September 2026

## Result

R06d.3 now includes a Worker-owned relay for established preview/editor sockets.
Every message in both directions gets a fresh Dashboard authority and Studio
ledger check. Idle sockets are checked every 15 seconds, authority requests time
out after five seconds, and signed expiry closes the connection independently.
Denial, timeout, expiry or peer failure closes both ends and drops queued frames.
The pre-send JavaScript queue is bounded to 64 messages/1 MiB; platform send
buffers and global connection limits are not covered by that bound.

The implementation uses Cloudflare's coordinated half-open close mode and binary
ArrayBuffers, verified against current official WebSocket documentation and
Workers types 5.20260917.1. It preserves negotiated subprotocols and strips
credential/private headers. Hosted sockets remain read-only.

## Source and release

- Studio source: `85c6d09375969a9fe88bc0be1cf8910185d85a0b`.
- Fresh main included: `f3495cfe8ae17fb74eb9d9d7674662f4d64c2c43`.
- Staging Worker: `xeroflow-page-studio-sandbox-staging`.
- Version: `61373e90-4694-4ba4-9456-c17da646c69c`.
- Deployment: `b46b786b-30e3-49ed-99a7-f943d46f4718`.
- Dashboard staging remains `a5bed71a-fc84-4f9f-8ea4-eb6aaaf11ced`.
- Production Dashboard remains `8798c363-6e9c-472a-a78f-47d8ce780ef4`.
- Container version15/image4342f54e… unchanged; bindings and control gateway
  unchanged. Worker-only rollout, no production release or database migration.

## Verification

- Failing reproductions: three actual-route access-loss cases plus two guarded
  upgrade assertions; 28 other route cases passed before the fix.
- 44 targeted cases and four actual workerd lifecycle cases pass.
- Full Studio suite: 3,125 tests pass, with unchanged package results reused by
  Turbo. Build, typecheck and lint (863 files) pass. Independent review found no
  remaining Critical/Important issue.
- Fresh authenticated browser launch renders desktop/mobile editor controls,
  page tree and save status. No page edit or publication was performed.
- QR Codes page renders for the existing restricted test login; its data access
  correctly remains forbidden. Permitted synthetic-role API verification is
  recorded in the live acceptance report.
- Six live acceptance cases pass: two independent handshakes, hosted history
  reads, active-message denial after logout, idle closure in 11.39 seconds,
  independent-login preservation, and permitted QR API200. Synthetic identities
  are retired with zero active grants and the site head unchanged. Details:
  `socket-staging-acceptance.json`.

The initial live probe confirmed actual hosted control handshakes and reads, then
found no Vite HMR endpoint. Hosted port4173 is the controlled static checkpoint
renderer, not a Vite dev server. That first run is retained separately and its
synthetic logins were retired. Generic upgrades/subprotocol behavior is proven
locally in real workerd; no live Vite acceptance is claimed.

Evidence is under `.verification/page-studio-builder-rnd-20260917/socket-*`.

## Remaining gates

R06 remains open. This is message admission and bounded idle detection, not
atomic write-commit authorization. Already-admitted work may complete after
concurrent revocation. In-flight job cancellation, write-commit fencing, preview
script isolation, CPU containment, full two-customer browser/expiry acceptance,
and production promotion remain open. Generated customer code stays disabled.
Existing sockets on a previous Worker version require a fresh editor launch.
