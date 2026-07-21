# Send multipart upload operations

Dashboard Send uses R2 multipart upload for files at or above
`SEND_WORKSPACE_MULTIPART_THRESHOLD_BYTES` (default 100 MiB). Smaller files keep the
single presigned `PUT` path. The persisted part size defaults to 16 MiB and must stay
between R2's 5 MiB and 5 GiB limits.

## Security boundary

- The server derives every `send/{transferId}/{fileId}` object key.
- The R2 multipart upload ID stays server-side. It is never accepted in a request or
  returned to the browser.
- A short-lived capability, authenticated actor, transfer ID, file ID, and intent ID
  must all match before the server lists parts or signs a part URL.
- Completion lists R2's canonical parts and validates part number, size, uniqueness,
  completeness, and ETag before calling complete. Caller-supplied ETags are not accepted.
- Resume responses expose only part numbers and sizes. Responses are `no-store` with a
  `no-referrer` policy.

## Retry and resume

The browser requests the existing intent again with the same scoped idempotency key,
then calls the resume endpoint using the refreshed capability. R2 is the canonical source
for completed parts. Already-complete byte ranges are skipped; incomplete parts are safe
to retry at the same part number. Completion and abort are idempotent at the application
boundary, including recovery when R2 completed the object before database confirmation.

## Expiry and abandoned uploads

Application upload intents expire after 15 minutes by default. Part signing never extends
past that intent expiry. Abort removes the active R2 multipart upload before releasing the
transfer's declared byte/file budget.

R2 automatically aborts incomplete multipart uploads after seven days by default. Keep
that platform lifecycle safety net enabled. T13 reconciliation must additionally find
expired application intents that retain a multipart upload ID, attempt an idempotent R2
abort, and record retryable failures without logging the upload ID, capability, signed URL,
or object contents. Cloudflare documents the default cleanup and multipart constraints in
[Upload objects](https://developers.cloudflare.com/r2/objects/upload-objects/) and the
[Workers R2 API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/).

## Configuration checks

1. Keep `SEND_ENABLED=false` and `NUXT_PUBLIC_SEND_ENABLED=false` until rollout approval.
2. Apply migration `269_send_multipart_geometry.sql` before enabling multipart behavior.
3. Confirm the live `agency-files` CORS rules still allow origin-restricted `PUT` requests;
   use [send-r2-cors.md](./send-r2-cors.md).
4. Run an interruption/resume smoke with non-sensitive bytes. Verify the final HEAD size and
   content type, then delete the completed object. If the smoke stops before completion,
   abort the multipart upload instead.

## Failure handling

- `NoSuchUpload` during resume/signing: treat the intent as unavailable; do not create a
  caller-selected replacement.
- `NoSuchUpload` during completion: HEAD the canonical key. Continue database confirmation
  only when exact size and MIME type match.
- `NoSuchUpload` during abort: HEAD the canonical key. If an object exists, refuse to mark
  the intent aborted so completion recovery can finish.
- Invalid, duplicate, missing, or wrong-sized R2 parts: refuse completion and preserve the
  intent for an explicit retry or abort.
