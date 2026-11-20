# Video render hardening design

The user approved proceeding with the source-backed recommendations in
`docs/research/video-platform-rendering-rd-20261120.md`. Preserve the accepted
portrait renderer, source pinning, copy authority, native draft and test evidence.

Stage one implements whole-job render budgets, container process supervision,
completed-file streaming and measured capture/encode/upload progress. The native
Cloudflare API migration is a separately qualified stage; no browser-export or
GPU rewrite is implied. Larger-media support requires its own identity/transport
assessment; do not remove current input bounds.

Approach: extend the existing awaited Queue→Container→R2 flow. Early queue
acknowledgement would require a new durable dispatch/completion protocol. A media
engine replacement would invalidate the already qualified artwork fidelity.

Implementation defaults chosen by the implementer:
- Render-work budget 720,000 ms from job start; leave 180,000 ms of the documented
  900,000-ms queue limit for failure handling, persistence and cleanup.
- Each format remains capped at 600,000 ms and shares the job's remaining budget.
- Container POST /render-composite accepts optional x-render-execution-id (UUID)
  and x-render-timeout-ms (positive integer, maximum 600000) headers. Legacy callers
  get a generated execution ID and the existing 600000-ms cap.
- Internal GET /render-progress/<executionId> returns only stage, counters and
  timestamp. ID is unguessable, per HTTP attempt; the endpoint is reached only
  through the private Container binding. Bound retained records to 32 and 60s. If all 32 slots are active, reject new execution with 503 before reading inputs; never evict active records.
- Progress shape: stage preparing/capturing/encoding/streaming; optional framesDone,
  framesTotal, encodedTimeMs, durationMs; updatedAtMs. Worker maps preparing to
  rendering, streaming to uploading. Keep completed-format done/total separate.
- Capture reports actual frame counts; encoding reads FFmpeg machine progress;
  output upload may report transferred bytes. Never infer successful publication
  from a percentage. Advisory telemetry failures must not fail rendering.
- Poll at most once per 2500 ms with a bounded 2000-ms status request. Stop and
  settle all polling when the format ends/aborts; stale execution replies ignored.
- Container owns timeout/client-disconnect cancellation of its FFmpeg/Chromium
  processes, bounded stderr retention and temporary files. Graceful rollout
  SIGTERM/SIGINT must still drain accepted healthy requests. Kill hung owned
  children after a 5000-ms grace; do not kill unrelated processes.
- Stream the already completed MP4 with its Content-Length; clean scratch only
  after response streaming settles. Preserve Worker FixedLengthStream validation.

Acceptance: deadline shared across formats and input reads; late rendering cannot begin publication and its output is discarded;
an atomic publication issued before expiry may commit after its response becomes
unavailable. Preserve those bytes and reconcile authoritative status on retry; real child termination and disconnect
cleanup; successful service drain under both signals; slow/broken output streams;
measured stage counters and advisory outages; existing frame/voice/copy parity;
qualified exact container image and native authenticated export before completion.
