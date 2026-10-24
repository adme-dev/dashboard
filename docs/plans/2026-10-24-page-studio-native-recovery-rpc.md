# Native recovery RPC compatibility

Cloudflare named RPC properties return fresh callable wrappers on repeated lookup.
Comparing `service.method` with a previously read function incorrectly rejected
valid recovery requests. The actual workerd two-Worker test reproduced this,
then passed with one captured callable and its original receiver.

`captureRecoveryRpc` retains the native callable once and invokes it with
`Reflect.apply`. Own accessors are rejected without evaluating them. Replacement
of an own method, addition of an own shadow, or descriptor changes are rejected.
Callers retain their independent binding/configuration and fresh database authority
checks around asynchronous work. There is no fallback, automatic retry, permission
change or new customer activation.

The correction covers recovery inspection/closure, admission preparation and
verification/enable, source discovery, and source upload/install control. Five
regressions use the real disposable PostgreSQL lifecycle with native-style fresh
wrappers. Those proxies do not substitute for the separate actual runtime test.

Validation receipts are under `Recovery 2026-10-24/dashboard-native-*`.
The new helper/runtime/fixture lint passes and strict scoped types pass. Including
the four existing large PostgreSQL fixtures exposes nine pre-existing annotation
errors; compiling exact HEAD copies reproduces the same error signatures. No
assertion or type-check setting has been relaxed. Full database regression and
exact-head CI/release outcomes are recorded separately in the handoff.

This change is source-level recovery compatibility. It is not evidence of a
production deployment, hosted account isolation, or customer transfer completion.
