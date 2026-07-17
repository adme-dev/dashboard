# Handoff — Social news client portal and News Inbox UI audit — 2026-07-17

## Outcome

The client-scoped social-news approval workflow is implemented and deployed to production. Clients can review news-derived drafts with platform-specific content, attribution, target accounts, package/SLA context, and audit history, then approve, reject, or request changes without bypassing XeroFlow's internal publish gate.

The News Inbox client-content UI was also audited and cleaned up. Platform and evidence checkboxes now update independently, checkbox groups retain accessible option names, connected accounts require deliberate selection, and the profile/evidence/guidance sections use clearer labelled layouts and safer actions.

## Release evidence

- Production: `https://app.xeroflow.io/`
- Cloudflare deployment: `https://367c3385.agency-dashboard-6cm.pages.dev`
- Feature commit: `1afeb93c feat(social): add client portal news approvals`
- UI cleanup: `5b47e2f3 fix(social): clean up news profile controls`
- Accessible checkbox groups: `a6ea3377 fix(social): label checkbox groups accessibly`
- Explicit draft targets: `64517482 fix(social): require explicit draft targets`
- Production migrations applied: `255_social_news_portal_approvals.sql` and the previously missed idempotent dependency `216_social_publishing_audit_events.sql`.

## Verification

- Final social publishing suite: 112 test files / 728 tests passed. A first cold-clone run hit one unrelated 5-second dynamic-import timeout in `test/ai/executors.test.ts`; the test passed alone and the complete suite rerun exited successfully.
- Production build and Cloudflare worker compilation passed under Node 24.
- Authenticated agency UAT on Arctic Campers:
  - the News Inbox loaded without a dynamic-import error;
  - Facebook and Instagram toggled independently while the other four platforms remained unchanged;
  - all 91 connected accounts opened unselected;
  - draft creation remained disabled until an account target was deliberately chosen;
  - the client profile, compact evidence empty state, collapsed Slack importer, and approved-guidance form rendered with the revised layout.
- Authenticated portal UAT:
  - `GET /api/portal/social/news-drafts` returned HTTP 200;
  - the payload included its summary and zero drafts for the current client;
  - the News & Social Content section rendered with no server error.
- No live customer draft was fabricated merely to exercise a production decision. Approve, reject, and request-changes transitions—including publishing audit, feedback provenance, portal activity, and cross-client denial—are covered by the route-level integration tests.

## Known repository baselines

- Repository-wide typecheck still reports 781 unrelated pre-existing errors; filtering produced no errors in the social-news portal files.
- The legacy `news.vue` file retains its pre-existing formatting and `any` lint debt. New utilities and tests pass targeted ESLint, and the production build passes.
- The existing high-severity transitive OpenTelemetry advisory remains in the locked dependency graph and was not introduced by this release.

## Rollback

Roll back the Cloudflare Pages deployment or revert commits `64517482`, `a6ea3377`, `5b47e2f3`, and `1afeb93c`. Migrations 216 and 255 are additive; do not drop their tables or columns during an application rollback because the audit table is shared infrastructure and the approval columns are inert when unused.
