# TikTok Direct Post — unavailable pending eligibility

The implementation supports creator OAuth grant storage, explicit privacy/interaction/disclosure consent,
reviewed owned media, accepted receipts and bounded reconciliation. **Production readiness remains false.**
TikTok's [Content Sharing Guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines)
exclude internal utilities for accounts managed by a team. XeroFlow's actual product/use case has no
recorded eligibility approval; code, mocks and OAuth cannot establish it. Do not enable an alternative
sender or bypass this restriction. No staff comment/inbox-send operation is offered.

## Evidence required before any activation decision

Record actual product eligibility, app audit/product grants, exact creator `video.publish` scope,
account/client mapping, creator consent, and a verified owned HTTPS media property. Creator OAuth is
separate from Marketing API advertiser access; paid reporting reuses existing services and paid
mutations remain unsupported. Keep credentials and content out of this record.

[Creator info](https://developers.tiktok.com/docs/en/content-posting-api-reference-query-creator-info)
is fetched for the posting form and fresh submit/review/dispatch validation. Privacy has no default;
comments, Duet and Stitch are off unless selected. Creator restrictions and video duration are checked.
There is no invented commercial-capability field. Branded content cannot use `SELF_ONLY`.
Photos use a separate 90-character title and 4000-character description; video caption allows 2200.
Video AIGC belongs inside `post_info`, photo AIGC at top level. Captions are never silently truncated.

## Media and storage

Migration `486_tiktok_publish_reconciliation.sql` adds target evidence and permits 35 asset references
only for TikTok-only posts. Additive migration `487_tiktok_opaque_publish_id.sql` accepts the
documented opaque receipt format (including `~` and `.`), bounded to 64 characters; applied 486
remains unchanged. Other platform storage/validation remains capped at 10. TikTok accepts one
video or 1–35 JPEG/WebP photos, never mixed media. Photo ceiling is 20 MB and video ceiling 4 GB;
video duration must be known in the stored asset and fit the fresh creator limit (at most ten minutes).
Frame rate/codec and exact image resolution require upstream asset validation and provider acceptance;
the current stored asset model does not contain verified probes for these properties.

The existing two-hour signed media URLs pin client ownership, MIME/size and ETag and serve bytes directly.
They cover the [documented one-hour pull window](https://developers.tiktok.com/docs/en/content-posting-api-media-transfer-guide).
This does not prove TikTok property verification, public reachability, no intermediate redirects, or
provider retrieval. Record those external checks before activation. Do not loosen byte or tenancy pins.

## Receipts and recovery

A [Direct Post init](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post)
`publish_id` is **accepted**, with sanitized code/log ID and no profile URL presented as a post.
Timeout/transport/5xx or missing receipt is **unknown**, never automatically replayed. Target evidence
is reserved before init; interrupted reservations are held unknown after ten minutes.

The existing social-dispatch cron Worker calls authenticated `/api/cron/reconcile-social-posts`.
Each invocation claims at most five accepted rows using database leases and `SKIP LOCKED`. Reads
recheck requester/reviewer/client authority, exact revision/account and reviewed media; they never call
init. Backoff begins at 30 seconds, caps at one hour, and holds unknown after 20 reads or 24 hours.
These are local operational bounds, not a TikTok SLA. A lost read lease cannot overwrite its winner.
Only [`PUBLISH_COMPLETE`](https://developers.tiktok.com/docs/en/content-posting-api-reference-get-video-status)
becomes published. Private completion does not require public IDs. `FAILED` is terminal for that ID;
unknown status/invalid ID is held. Public IDs are retained only as exact digit strings or safe
integers; an unsafe JSON int64 number is omitted rather than rounded into a fabricated post ID. Status lookup failure alone never proves content failure.
Initial revision `dispatch_outcome` stays immutable; target evidence/current post projection advance.
A new publication after a terminal failure requires a distinct review, never a cron replay.

## Configuration and acceptance record

No new binding is introduced. Existing creator key/secret configuration, `CRON_SECRET`, `MEDIA_BUCKET`
and `RENDER_LINK_SECRET` are reused; do not provision or activate TikTok merely to deploy disabled code.
The 27 October binding preflight leaves no spare slot after the conditional LinkedIn/staff plan;
creator activation would require a separate capacity decision. Existing production creator credentials
were reported absent, and this task neither reads nor changes them.

Unverified: actual use-case eligibility, audit/scopes, hosted OAuth exchange/rotation/revocation,
media property/retrieval, reviewed idempotent live init receipt, terminal provider status, public
visibility/moderation, deployed cron and operation-specific provider reporting. Local fixtures prove
code paths only. Root owns release and any externally permitted live acceptance.
