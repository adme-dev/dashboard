# Send Scanner Threat Model

## Scope and security objective

This model covers the path from completed private R2 upload through Queue,
Cloudflare Worker, ClamAV Container, and canonical Neon finalization. The objective is
simple: no uploaded file becomes downloadable unless the exact stable object received a
verified clean result. Availability failures must not become publication success.

## Trust boundaries

1. R2 event and internal Queue bodies are untrusted wake-ups.
2. Neon scan jobs and file rows are canonical state.
3. R2 HEAD/body data is hostile file evidence, not policy or identity.
4. Container output is untrusted until strict schema, job ID, ETag, MIME, and post-scan
   object stability checks pass.
5. ClamAV signatures and engine are a maintained security dependency, not proof that
   all malicious content can be detected.
6. Logs, traces, Queue/DLQ, Durable Object state, and operator tools are separate data
   disclosure surfaces.

## Assets

- private quarantined file contents;
- tenant/transfer/file isolation and generated R2 keys;
- scan result and publication-gate integrity;
- ClamAV engine/signature freshness;
- Queue/DLQ capacity, scan leases, and Container concurrency;
- Hyperdrive and Worker binding authority;
- audit evidence that is useful without containing file or capability data.

## Threats and controls

| Threat | Control | Required evidence |
|---|---|---|
| Forged/cross-file Queue body | Strict schemas; expected account/bucket; generated key shape; canonical lookup | Poison messages ack without DB/R2/scanner work |
| Duplicate/redelivered message | Unique file job; row lock; bounded lease; attempt fence; terminal no-op | Duplicate tests and single event row |
| Presigned single PUT overwrite after completion | Job unavailable until capability expiry; post-expiry HEAD becomes canonical | No scan call before `available_at` |
| Stale multipart event or substituted object | Multipart ETag must equal canonical completed ETag | Pre-scan mismatch fails closed |
| Object changes during scan | Second HEAD must match key, size, type, and ETag | Terminal object-changed error |
| Malicious/replayed Container result | Strict normalized result; exact job ID and ETag; attempt fence | Invalid/mismatched result cannot finalize |
| Scanner outage or timeout | Three bounded attempts; terminal quarantine/error; Queue/DLQ and reconciliation | Outage drill never reaches clean |
| Zip bomb, archive recursion, oversized stream | Product byte bound, ClamD stream/scan limits, 13-minute timeout, two-consumer cap | Safe archive-limit fixture remains inaccessible |
| Misleading MIME/extension | Declared MIME is a hint; bounded magic-byte evidence; mismatch rejected | PDF/HTML/SVG/executable fixture matrix |
| Active content execution | No public preview; evidence records active content; download must be attachment-only | T11 response headers and browser test |
| File exfiltration from Container | Internet disabled; R2 virtual binding; FreshClam path/method allowlist; no URL/credential | Egress-denial test and config review |
| Secret/content leakage in telemetry | Allowlisted structured fields only; no body/key/filename/ETag/raw output | Log snapshot and prohibited-key DB checks |
| Denial of wallet/capacity | One-file batches; max concurrency two; fixed attempts; logical quarantine | Backlog/cost telemetry and kill switch |
| Stale/malicious definitions | Engine/signature versions persisted; FreshClam restricted; freshness launch gate | Signature age dashboard and outage runbook |

## Residual risk

- Malware scanning is probabilistic. A clean verdict does not make content safe to
  render, so attachment-only delivery and recipient warnings remain necessary.
- Very large clean files may exceed the Queue wall-time budget. Non-production 2 GB
  benchmarking must pass or product/provider architecture must be reconsidered through
  a new decision; silently lowering an approved limit is prohibited.
- The FreshClam allowlist still permits reads from its official database hostname. The
  handler restricts method and path, but signature supply-chain monitoring and image
  digest evidence remain operational requirements.
- A Queue event can arrive before the Neon completion transaction. The consumer retries
  canonical lookup; reconciliation must recover DLQ or missing-wake-up drift.

## Data handling

File bytes are streamed from private R2 to the Container and are not written to Neon,
Queue payloads, Worker logs, or public responses. Durable Object state temporarily
stores only job ID, object key, ETag, and expected MIME for a single Container instance
and is deleted after the scan call. Canonical evidence contains no filename, object key,
URL, token, raw provider output, or signature name.
