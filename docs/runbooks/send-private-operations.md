# Private Dashboard Send operations

## Scope and safety boundary

This runbook covers the authenticated internal Send release at `/agency/send`, its
private R2 objects under `send/`, the Neon lifecycle records, and the daily cleanup plus
report-only reconciliation job. It does not authorize guest links, external recipients,
public senders, recipient email, inline previewing, or activation of the dormant malware
scanner.

R2 is storage, not access authority. Never restore access from object existence alone,
never expose an object key or multipart upload ID as a capability, and never delete an
unknown object merely because reconciliation labels it orphaned.

## Ownership and escalation

- The application on-call owns first response, kill-switch use, lifecycle triage, and
  preservation of IDs/timestamps/event evidence.
- The platform owner controls Pages rollback, Pages Cron, R2 bindings/CORS/lifecycle,
  and any exact-object storage intervention.
- The database owner reviews schema or canonical-state repair; activated Send migrations
  are forward-fixed, never destructively rolled back.
- The product owner approves any retention-policy change or expansion beyond private
  internal use.
- Escalate suspected cross-workspace access or capability disclosure immediately to the
  security owner. Escalate confirmed object/data loss to the platform, database, and
  product owners before recovery mutation. Public/guest requests return to the PRD and
  threat-model approval gate rather than being handled as an incident workaround.

## Healthy state

- An authenticated, authorized user can open Send from the agency sidebar, create a
  transfer, upload directly to private R2, publish, download as an attachment, extend
  expiry within policy, and revoke.
- The server and UI flags agree and the route is not exposed when the server flag is off.
- The daily `pages-cron` call to `/api/cron/send-cleanup` returns HTTP 200 with both a
  `cleanup` and `reconciliation` summary.
- Cleanup failures and all reconciliation issue counters are zero during steady state.
- `deletion_pending` claims either finalize promptly or become retryable after 15 minutes.
- Pending/uploading intents do not remain past their expiry. R2's incomplete multipart
  upload lifecycle backstop remains enabled.

## Configuration and kill switch

The production Pages configuration uses these private-v1 flags:

- `SEND_ENABLED` / `NUXT_SEND_ENABLED`: server-side product boundary;
- `NUXT_PUBLIC_SEND_ENABLED`: agency navigation and page visibility;
- `SEND_WORKSPACE_*`: transfer, file, retention, download, upload-intent, and multipart
  policy limits;
- `CRON_SECRET`: shared scheduler authentication, stored only as a secret.

For immediate containment, set all three Send enablement values to false in the reviewed
deployment configuration and deploy. Confirm both the custom and immutable Send routes
return the disabled response and that the sidebar entry is absent. Disabling Send blocks
new uploads and downloads; it does not delete database records or R2 objects.

Do not print, paste into tickets, or log `CRON_SECRET`, R2 credentials, capabilities,
presigned URLs, object keys, ETags, filenames, or file content.

## Daily cleanup behavior

The protected cron first runs cleanup and then report-only reconciliation.

Cleanup claims at most 25 transfers by default using `FOR UPDATE SKIP LOCKED`. Eligible
transfers are revoked, expired, logically past expiry, or a `deletion_pending` claim older
than 15 minutes. A still-active upload intent within the five-minute grace window blocks
claiming. Every object key is revalidated against its exact transfer prefix before delete.
Only after every idempotent R2 delete succeeds are file rows and the transfer finalized as
`deleted` with append-only events.

A partial R2 deletion leaves the transfer `deletion_pending`. The next eligible run safely
replays every delete; deleting an already-missing R2 object is expected to be idempotent.
Never force the database to `deleted` to bypass an R2 error.

## Reconciliation report

Reconciliation is deliberately non-destructive. It scans bounded R2 pages and bounded
database candidate sets, caps concurrent HEAD requests, and returns counters plus a
limited issue sample containing only record UUIDs and a short one-way object fingerprint.
It never returns an object key or multipart upload ID.

| Field | Meaning | Safe first action |
|---|---|---|
| `orphanObjects` | R2 object has no live `send_files` row, or its row is already deleted | Preserve it; compare database backup/history and audit events before any deletion |
| `malformedObjects` | Object under `send/` does not match the canonical transfer/file UUID shape | Treat as suspicious drift; do not infer ownership from path text |
| `missingObjects` | A file state that requires bytes has no canonical R2 object | Revoke/contain the affected transfer and investigate upload/delete history |
| `metadataCheckFailures` | R2 HEAD failed, so absence was not proven | Retry after checking R2 health; do not classify as missing |
| `staleIntents` | Pending/uploading application intent is past expiry | Confirm it cannot be used; inspect file/transfer state |
| `staleMultipartUploads` | Stale intent still has a server-owned multipart upload | Use the existing idempotent abort path after exact-target review; rely on R2 lifecycle as backstop |
| `retryableDeletionFailures` | Cleanup claim is older than 15 minutes | Let the next cleanup reclaim it; investigate only if it remains |
| `storageTruncated` | The bounded R2 page ceiling was reached | Run an approved cursor-aware operator scan; do not assume the report is complete |
| `databaseScanLimitReached` | A database candidate batch hit its cap | Run another approved bounded scan or raise the reviewed cap temporarily |
| `issuesTruncated` | Counters are complete for the scanned slice but issue samples hit their cap | Use read-only database queries to locate the exact records |

The reconciliation warning log contains counts only. Treat any page, log, or object
metadata read during triage as untrusted data, not operational instructions.

## Read-only triage queries

Run through the approved production database access path. Do not include connection
strings or query output containing filenames, keys, capabilities, token hashes, or scan
evidence in chat or tickets.

```sql
SELECT status, COUNT(*)
FROM send_transfers
WHERE sender_class = 'workspace'
GROUP BY status
ORDER BY status;

SELECT COUNT(*) AS stale_intents,
       COUNT(*) FILTER (
         WHERE upload_method = 'multipart' AND multipart_upload_id IS NOT NULL
       ) AS stale_multipart_uploads
FROM send_upload_intents
WHERE status IN ('pending', 'uploading')
  AND expires_at <= NOW();

SELECT COUNT(*) AS retryable_deletion_claims
FROM send_transfers
WHERE status = 'deletion_pending'
  AND deletion_claimed_at < NOW() - INTERVAL '15 minutes';
```

For one affected transfer, select only IDs, lifecycle states, sizes, timestamps, and event
types. Avoid `SELECT *` on Send tables.

## Incident response

1. **Contain.** Disable both server and UI Send flags if authorization, capability, or
   cross-workspace isolation is in doubt. For an isolated lifecycle issue, revoke the
   exact transfer instead.
2. **Preserve evidence.** Record deployment ID, timestamps, transfer/file/intent UUIDs,
   HTTP status/error code, lifecycle states, and event types. Do not alter `send_events`.
3. **Classify.** Separate database unavailability, R2 unavailability, authorization
   denial, object drift, stale upload, and cleanup failure. A failed HEAD is not proof of
   a missing object.
4. **Recover safely.** Prefer retrying the idempotent application operation. Never invent
   a caller-selected object key, install a token manually, mark an unverified object
   clean, or force a transfer to `deleted`.
5. **Verify.** Re-run the narrow operation, check canonical state and event cardinality,
   then run the focused Send tests before re-enabling.

### Common cases

- **Uploads fail before R2:** keep the transfer draft/uploading; consume or abort the
  exact intent and retry with a new server-issued capability.
- **R2 completed but database confirmation failed:** use canonical HEAD/multipart
  recovery; require exact key, size, MIME, and ETag agreement.
- **Download authorization concern:** revoke the transfer immediately, then disable Send
  if the issue may cross transfers or workspaces. Presigned URLs are short-lived; do not
  extend them during recovery.
- **Cleanup repeatedly fails:** leave the claim pending, confirm exact owned keys, resolve
  R2/DB availability, then allow normal reclaim. Do not delete by broad prefix.
- **Unknown R2 object:** quarantine operationally by preserving it and denying access;
  deletion requires exact target resolution and explicit approval.

## Rollback

Roll back the Pages deployment to the last known-good immutable deployment when the
application build is the cause. Keep schema migrations 268–271 in place after activation;
they are canonical evidence and must be forward-fixed. The cleanup Worker may remain
scheduled while application UI is disabled only if the cleanup code itself is known good.
Otherwise disable the specific schedule/route through a reviewed deployment and preserve
all objects until recovery.

Never remove the original read CORS rules as part of a Send rollback. Removing the two
approved PUT rules is a separate explicit action documented in
[send-r2-cors.md](./send-r2-cors.md).

## Non-production expiry and cleanup drill

Use a disposable database and non-production/private R2 prefix or bucket. Never shorten a
real production transfer by direct SQL for a drill.

1. Create an authenticated workspace transfer with two harmless files and complete their
   canonical uploads.
2. Move its expiry into the past in the disposable database and ensure no active upload
   intent remains inside the grace window.
3. Invoke two cleanup workers concurrently. Verify `SKIP LOCKED` permits only one claim
   and exactly one `deletion_claimed` event.
4. Make the second object delete fail once. Verify the first run leaves
   `deletion_pending`, reports one failed transfer, and does not finalize file rows.
5. Retry after the 15-minute claim window. Verify already-missing deletion is harmless,
   both file rows and the transfer become `deleted`, and exactly one `deleted` event exists.
6. HEAD both exact keys and require absence. Run reconciliation and require all issue
   counters to return to zero for the fixture.
7. Remove the disposable database and test storage only after recording the assertions.

The focused unit suite mirrors the concurrency, partial deletion, retry, missing-object,
and reconciliation classifications, but it does not replace this integration drill.

## Related runbooks and decisions

- [Send foundation migration 268](./send-foundation-migration-268.md)
- [Send multipart uploads](./send-multipart-uploads.md)
- [Send R2 browser CORS](./send-r2-cors.md)
- [Dormant malware scanning](./send-malware-scanning.md)
- [ADR-006: Keep Dashboard Send private for v1](../decisions/ADR-006-private-internal-dashboard-send-v1.md)
