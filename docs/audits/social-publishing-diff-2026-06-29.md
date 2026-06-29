# Social Publishing Branch and PRD Diff

**Date:** 2026-06-29
**Compared:**

- `origin/feat/social-publishing`
- `docs/prd/social-publishing-enterprise-overhaul.md`
- current `main` at `175d114d`

## Summary

Do not merge `origin/feat/social-publishing` directly. The branch is old and its tree would delete large areas of current `main`, including newer social publishing components, analytics work, AI planner work, paid-media spend work, and unrelated platform features.

The branch's social-publishing product intent has been rebuilt and advanced on `main` through later commits. Treat the branch as cleanup-only unless a future regression needs a targeted historical reference.

## Branch Findings

Unique social-publishing commits still visible on the old branch:

- `79ebc751` data model
- `ce7a059e` provider registry
- `ffb56afc` publish core
- `2b044bcf` accounts list/delete
- `2902f4b7` posts CRUD/manual publish/dispatcher
- `1a235842` slots/queue/approvals
- `4fb2ec04` composer
- `209e2778` calendar/queue/approvals/accounts/analytics/planner pages
- `57cb2c1a` sidebar/marketing sync
- `5e2b47bf` type/runbook pass
- `fadb011b` timezone-safe time picker

Current `main` already contains equivalent or newer product capability:

- suite shell, tile nav, and selected-client context
- nav counts endpoint and tests
- calendar route with month/week/day views and drag-reschedule
- compose route with save draft, approval request, schedule, queue, live previews, AI caption/image, Banner Studio picker, and timezone-safe schedule controls
- queue route with slots, drag reorder, and fill-from-drafts
- approvals route with post preview, checklist, approve/reject, and edit handoff
- accounts route with Meta/Google Business connect flow, selection modal, connected-state cards, and token-safe list API
- analytics route with workflow cards, reporting metrics, top content, cadence, growth, and AI summary
- planner route flag-gated with campaign manager, board, planner agent, and draft generation

## PRD Checklist Status

Implemented or advanced:

- Slice 1: suite shell, tile nav, global client context, nav counts.
- Slice 2: calendar route and scheduling handoff to Compose.
- Slice 3: queue slots, reorder, fill-from-drafts, and planner board/agent under flags.
- Slice 4: content approvals and publishing analytics/AI summary.
- Compose live preview, per-network overrides, draft save, and approval request.

Still open as future slices:

- bulk/CSV scheduling
- external client-portal content approval comments/threading
- dedicated Google Business preview component
- AI best-time-to-post
- AI approval pre-checks
- AI reply suggestions linked from inbox
- activation checklist for Google Business Profile publishing before enabling the production flag

## Slice Shipped From This Diff

Added accounts-page polish to match the PRD's "50+ accounts" future note:

- local search over account name, platform account id, platform, and connection error
- no duplicate rows created by search/filtering
- loading and no-result states
- OAuth callback query cleanup now preserves durable query params such as `client`

Verification:

- `pnpm exec vitest run test/social/socialPublishingAccounts.test.ts test/social/accounts.test.ts`
- Result: 2 files passed, 8 tests passed.

## Decision

`origin/feat/social-publishing` should be marked superseded/cleanup-only. Continue social publishing from current `main` using the remaining PRD slices above, not by merging the old branch.
