# DriveAgent newsroom Facebook handoff

Prepared from XeroFlow `origin/main` commit
`c7c52b490fd5e9d820365aee2b38aba07b883d92` on
`feat/newsroom-social-handoff-20261013`. This document records implementation,
not deployment or activation. No public post is needed to verify setup.

## Ownership and machine boundary

The DriveAgent newsroom reviews and approves copy. XeroFlow stores that approved
handoff in the existing `social_posts` table and delivers through the existing
claim-and-publish dispatcher. Existing cron/Workflow execution remains the
scheduled delivery mechanism. No independent Facebook delivery pipeline is added.

`POST https://app.xeroflow.io/api/internal/newsroom/social` requires
`x-newsroom-secret`. Only this exact route bypasses staff-session middleware;
its own secret authorization still runs before reading the request body.
Cloudflare request bindings take precedence over local process environment:

- `NEWSROOM_SOCIAL_ENABLED=true`
- `NEWSROOM_SOCIAL_SECRET`: at least 32 characters; provision a randomly generated secret.
- `NEWSROOM_SOCIAL_CLIENT_ID`: the fixed agency client UUID.
- `NEWSROOM_SOCIAL_ACCOUNT_ID`: the fixed connected Facebook account UUID.

The caller cannot choose a client or account. Health checks validate configuration,
authorization and the active fixed account with a read-only database query.
They neither contact Facebook nor publish anything. Health is not proof that a
Facebook token is valid or that a real post was delivered.

## Request and receipt

All requests have `action`: `health`, `submit`, `status` or `cancel`.
`status` and `cancel` carry `postId` and `articleId`, using the stable newsroom
post identity rather than the remote UUID. `submit` additionally carries:

```json
{
  "action": "submit",
  "postId": "newsroom-post-id",
  "articleId": "article-id",
  "articleUpdatedAt": "2026-10-13T01:00:00.000Z",
  "approvedBy": "editor-id",
  "body": "Reviewed copy",
  "link": "https://driveagent.news/news/article-slug",
  "imageUrl": null,
  "mode": "next-slot",
  "scheduledAt": null
}
```

Modes are `now`, `exact`, and `next-slot`. `exact` requires a future timestamp;
other modes accept a null or omitted timestamp. Links must be canonical
DriveAgent article links with no query or fragment. The website adapter removes
its own tracking before handoff; XeroFlow applies normal delivery tracking.
Images are optional and limited to HTTPS DriveAgent `/api/news/media/{id}` or
`/api/news/artwork/{id}` endpoints.

Health returns `{ "ok": true }`. Other actions return
`{ id, status, scheduledAt, publishedAt, url, error }`. Absent status reads return
`id:null,status:"not_found"` and null receipt fields. XeroFlow `cancelled` is
reported as `rejected`. A scheduled result is not publication. The website
requires a Facebook URL and publication timestamp before displaying a published
receipt. Partial legacy results only count as published if Facebook succeeded.

## Duplicates, capacity, and failure handling

The shared `news-autopost:{clientId}` PostgreSQL transaction advisory lock
serializes article identity and capacity allocation with existing automatic
news ingestion. Reads are inside that transaction. Article ID, stable newsroom
post ID and canonical legacy `link_url` matches prevent a second handoff.
A legacy editable draft creates a conflict; its old copy is never approved by
this route. A published legacy match receives dedicated identity aliases in its
metadata for later status reconciliation, preserving its original content,
source ownership and publication fields.

Next-slot chooses a genuinely free saved general/news Facebook slot within
30 days, accounting for existing noncancelled Facebook rows and slot capacity.
Duplicate slot definitions do not multiply capacity. Exact-time collisions
require available capacity at the saved slot or are rejected. The client advisory
lock coordinates this route and the existing automatic producer; legacy manual
scheduling routes do not acquire this lock and can still deliberately assign a
conflicting time. This bridge does not introduce a global calendar constraint.

Now submissions first persist a schedule due immediately, then use the existing
atomic dispatcher. A crash before dispatch leaves work recoverable by cron.
Repeated submits return the existing handoff without a second dispatch attempt.
A response lost after dispatch must be reconciled by status. Failed provider
sends are never automatically retried by this route.

Cancellation is a conditional update of an owned, unpublished, unattempted row.
It clears the schedule and retains the row. A missing handoff, a live/claimed
post, any attempted provider send, or a legacy post cannot be confirmed cancelled.
An attempted failed send may have reached Facebook and requires operator
investigation. A cancelled article identity is permanently terminal: changed
copy, a new local post ID, or a delayed submit cannot resurrect it. No live post
is deleted and there is no automated reset/reapproval path in this contract.

## Approval preservation at dispatch

The durable `created_by=driveagent-newsroom` marker identifies owned rows even
if editable metadata is removed. Normal dashboard mutations are blocked by the
shared post-access guard. An HMAC over approved copy, media, destination,
schedule, target account and source metadata detects tampering on any other path.
Disabling configuration or rotating its signing secret holds pending posts.

Immediately before provider dispatch, XeroFlow fetches only
`https://driveagent.news/api/news/articles/{slug}`, with `redirect:error`, no cache,
and a timeout. Article ID, slug, published status and exact `updatedAt` must
match the approval. Supercars content additionally requires the website's
current `socialDistributionEligible=true`; missing permission fails closed.
Withdrawal, redirect, changed revision, unavailable evidence or failed approval
verification holds the post as failed before a provider attempt. This check has
the normal small time window between reading current source and calling Facebook;
it does not provide a cross-system transaction with article retraction.

## Verification and release prerequisites

The focused backend suite covers secret/config validation, input restrictions,
slot occupancy, duplicate and conflicting submissions, uncertain delivery,
terminal cancellation, source revision/withdrawal, signed-copy tampering,
dashboard ownership and middleware route isolation. Database dependencies are
mocked; no production DB or Facebook calls occur in these checks. A local
PostgreSQL concurrency integration was not run because this environment's
`initdb` cannot resolve its effective user ID.

An additional opt-in test imports the actual website adapter from a supplied
checkout and round-trips its tracked input and real receipts through this backend:

```sh
NEWSROOM_WEBSITE_CHECKOUT=/path/to/driveagent-website pnpm exec vitest run test/server/utils/newsroomSocialCrossContract.test.ts
```

Its five cases cover now/exact/next-slot delivery, status, cancellation, missing
handoffs, and a delayed post-cancellation submit. It performs no external network
requests. Without the environment variable this cross-repository test is skipped;
it is not claimed as ordinary standalone-suite coverage.

The social regression suite passed (120 files, 783 tests) before the final added
boundary cases. The final focused suite, including the real-adapter cross-repository test,
passes 146 tests across 11 files. Full-repository lint currently has extensive pre-existing
findings; new source/tests pass scoped ESLint. Full-suite limitations include
missing shared `qrcode` and `stripe` dependencies, Chromium launch failures, and
Nuxt UI head-hook compatibility. The new route's mechanical God mode inventory
count was updated and its test passes.

Release both compatible applications before enabling the bridge. Provision the
same machine secret on the website and fixed XeroFlow target bindings, confirm
an authenticated read-only health response, and keep existing automatic/news
backlog policies under explicit operator control. Do not approve or publish
backlog as a setup test. Record the final source commits and live deployment
versions separately; this implementation has not deployed or activated them.
