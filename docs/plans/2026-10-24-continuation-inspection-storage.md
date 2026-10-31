# Private continuation inspection snapshots

Status: internal transport helper only. No route, native dispatcher, customer activation or production storage writes are introduced here.

The native collector needs the complete retained request while its authority callback carries a small immutable reference. This helper stores canonical request bytes under a fixed private prefix scoped by tenant, client, site, original operation and invocation. A conditional first write prevents replacing the winning snapshot. Exact retries reuse the original expiry and digest; an unknown write response is resolved by readback, never a blind second write.

References reject additional fields and path traversal. Reads verify actual streamed byte counts, strict UTF-8, canonical encoding, scope, identity, expiry and the full request digest. Caller-owned request objects are snapshotted before the first await. An overall eight-second storage deadline, clamped to expiry, spans get, put and all stream reads. Late read bodies are cancelled. A timed-out put may still commit remotely; a timeout never represents rollback or permission to issue effects.

The five-minute expiry is logical. Physical deletion is not implemented by this helper. A private-prefix lifecycle/cleanup owner is required before a controller enables storage writes. No SQL lock may span this I/O.

The 16 MiB request cap matches the private native contract; the wrapper has a separate bounded allowance. Canonicalization and verification allocate multiple buffers. This is not a 16 MiB heap guarantee or concurrency measurement. Before exposure, the integrating controller must measure supported aggregate proof sizes and peak Worker memory, establish admission limits and refuse unsupported requests. Full native contract validation is also mandatory both before persistence and after loading: the helper validates only the transport envelope and operation/invocation identity. Current owner, operator, plan, journal and native-head authority are independently required around remote work.

Focused tests cover immutable retries, unknown-write readback, foreign scopes, caller mutation, invalid identities and expiry, streamed bytes/UTF-8, canonical encoding, expiry during I/O, stalled operations, late-read cleanup and two competing conditional writers. These are local storage-contract tests, not R2 production or hosted customer acceptance.
