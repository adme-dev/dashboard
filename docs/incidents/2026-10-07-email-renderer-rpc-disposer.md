# Email renderer RPC response rejection — 7 October 2026

Production candidate `ec0c081f1fb2ecdc16af9b79b7e6f3f63adaeefb` was integrated by
Dashboard PR #632 after both CI checks passed. Pages deployment
`def3bcb5-f2dc-4644-b1a0-3dee9b136087` completed at 08:40:43 UTC. The production
renderer version is `6d22cd09-b76f-4cbe-bf13-49465461db04`, deployment
`b512fe7d-59d3-4509-aae6-703c07533267`, tagged with the same source.

The authenticated live email composer could not save its synthetic verification
draft and its stateless preview returned 503. We restored successful Pages artifact
`c2232396-e128-46b0-9712-19f570e3d170` from source
`eeefcc40f5514f4444b4d1021af174b588a28a2a`; provider readback confirms that artifact
is canonical again. The same synthetic preview then rendered successfully.
The private renderer remains deployed for compatibility; no email was sent.
The native customer rollout remains gated and no native production migration ran.

## Cause and prevention

Cloudflare attaches an own `Symbol.dispose` method to RPC object replies. Our
strict JSON boundary rejected every symbol and translated the rejection to 503.
Direct Worker tests serialized the reply immediately and therefore discarded the
transport metadata; mocked client tests returned undecorated plain objects.

A new regression connects the actual built Pages artifact to the real named
renderer Worker and signs in through the local synthetic login handler. It
reproduced the live 503 before the fix. A temporary local-only diagnostic confirmed
the own lifecycle symbol; diagnostic changes were restored and no production
payload logging was introduced.

The client now snapshots an exact descriptor-preserving payload copy while omitting
only the root lifecycle method, then disposes the original reply in `finally`.
Only the five-field response envelope is eligible for descriptor copying; the
existing byte/node/depth checks, unexpected-field validation and nested symbol
rejection remain. Request validation is unchanged. Unit regressions cover original
receiver/disposal, malformed replies, extra symbols and accessor rejection.

The integration harness prefers the emitted production renderer artifact and
builds one into its owned temporary directory when absent. This preserves the
fresh-checkout frozen-release job, which does not share the ordinary CI job's
ignored artifacts. Independent review identified that harness prerequisite and
found no must-fix in the client lifecycle correction.

[Cloudflare RPC lifecycle](https://developers.cloudflare.com/workers/runtime-apis/rpc/lifecycle/)
documents the response decoration and disposal requirements.

Local corrected artifact: all 36 targeted tests pass, including the built Pages
RPC regression. The fresh-checkout path also passes all five boundary tests with
the emitted renderer temporarily absent. Focused lint and artifact isolation pass.
Build raw size is 25,409,040/25,468,928 bytes (59,888 remaining); gzip is
7,020,314/9,750,000. Full-suite and final release evidence are recorded in the
Page Studio resumption ledger as completed.
