# Page Studio image and credit operations

This release is limited to the two synthetic staging customers recorded in
[acceptance evidence](images-staging-acceptance-2026-09-30.md). It does not enable
customer production generation, merge either feature branch, or activate live
payments. See [test payment boundaries](image-payments-test-mode.md).

## Generation and attribution

The worker requires an explicitly named Cloudflare AI Gateway. Staging uses
`studio-images-staging`, Workers AI and owned R2 assets. The two admitted models
are FLUX.1 Schnell and Stable Diffusion XL. Synthetic pricing is
10 credits per image, version `synthetic-20260930-v1`; this is an acceptance
fixture, not commercial pricing. A customer buys application credits, not an
individual Cloudflare account balance.

Gateway metadata includes tenant, customer, website, native job and price version.
Prompt and response payload collection is disabled. Cache is skipped and the
provider gets one attempt. A native wallet lock reserves the quote atomically;
replayed queue deliveries cannot re-invoke a claimed job. The saved image receipt
binds validated PNG bytes, SHA256, size and an owned site-specific R2 key.

## Recover a delayed request

1. Read the native job and reservation using the exact staging tenant, customer,
   website and job identity. Preserve the current receipt before any action.
2. Check the deterministic worker R2 claim, output and completion receipts and
   Gateway metadata for that same job. Do not copy another customer's asset or
   infer success from a provider log alone.
3. If an immutable successful output exists, let the scoped reconciliation path
   validate the owned asset and complete the native job. Replays settle once.
4. A confirmed provider rejection or invalid output may release the reservation
   through the existing signed failure path. Preserve the evidence.
5. If the provider outcome remains unknown, leave the job under reconciliation
   and the credits reserved. Do not requeue it for a new provider call, delete its
   journal or grant replacement credits to make the totals look balanced.

The original SDXL request `15ee5f1e-e222-4056-b94c-e4141eee1824` remains unknown
with 10 credits reserved. Later successful requests do not resolve it. Any
commercial goodwill adjustment would need its own authorised, idempotent journal
entry and supporting decision; none has been made here.

## Reconcile customer wallets

Use the primary database, never a cached balance. In a transaction, lock the exact
customer/environment wallet first, then inspect reservations, generation receipts
and payment purchases. The wallet balance must equal the sum of immutable credit
deltas, and its reserved total must equal the sum of immutable reserved deltas
and outstanding reservation amounts. Compare native job completion with the owned
R2 output receipts. A negative balance can be legitimate after a refund or dispute
of credits already spent; do not erase generation history to remove that debt.

Keep a restricted operator evidence record with the scope, source/deployment,
job or payment identifiers, before/after totals, provider evidence and operator
identity. Never include credentials, session cookies, raw payment bodies or card
information in source control or public support notes.

## Refunds, disputes and restricted accounts

Use Stripe's test dashboard to initiate test refunds; the application does not
expose a browser refund endpoint. Stripe must deliver signed events to the exact
configured webhook. Verify the native event receipt and immutable credit journal,
including duplicate deliveries and delayed funding. Partial refunds debit the
proportional credit value rounded up. Failed/cancelled refunds restore their
recorded value once. Overlapping refunds and disputes cannot debit more than the
pack's credit value. A won dispute restores only the eligible remainder.

Restrictions are deliberately sticky. Before considering a manual release,
verify every purchase for the wallet has no active or lost dispute requiring a
hold, all refund states are reconciled, the balance covers all reservations, and
no unrelated manual restriction remains. Keep the provider and journal evidence
and obtain the normal billing decision. Any authorised release must lock and
recheck that exact wallet in one transaction and record the operator decision;
do not run a blanket `frozen=false` update. This preview provides no self-service
unfreeze or live-payment activation control.

## Disable or roll back safely

Remove generation admission for the affected customer/model to stop new quotes.
Retain recovery scopes, native receipts and R2 evidence so accepted jobs can
finish. An empty recovery-scope deployment stops automatic reconciliation; preserve
the two staging scopes when deploying the image worker. Do not delete queues,
reservations or payment records as a rollback shortcut.

Disable new checkout by removing admitted scopes while retaining account and
webhook configuration for existing purchases. Delayed settlement/refund/dispute
events still need processing. Removing webhook secrets entirely makes processing
fail and requires provider retries and operator follow-up. Restore a verified
prior application artifact only after checking its compatibility with the
additive image/payment migrations and recording the exact source and deployment.

## Build and private provider boundary

The Stripe SDK is deployed as `xeroflow-page-studio-payments-staging`, bound only
in Pages preview. It has no public route, wallet authority or database binding.
Deploy it before the Pages preview that references it; missing binding or test
configuration leaves checkout unavailable. Do not add this binding to production
as part of the staging release.

The Pages raw/gzip size guards are unchanged. Postbuild compression preserves
static SQL text exactly, lazily decoding it once per isolate. Query parameters
and dynamic SQL stay outside this cache. Unit and workerd tests compare exact
query bytes and different request parameters through the full compaction chain.
A successful `pnpm build` and `pnpm deploy:check` are still required before release.
