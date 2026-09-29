# CMS editor save acknowledgement — 29 September 2026

Managed page saves persisted successfully but Studio rejected their HTTP 200
responses because internal graph metadata exceeded the strict transport schema.
`commitPageStudioEditorCheckpoint` now returns exactly the four checkpoint
receipt fields; `acceptPageStudioAiProposal` returns those fields plus versionId.
The coordinator still owns authorization, atomic persistence and current-head
authority. Studio validation is unchanged.

## Validation and preview release

Both ordinary and AI response regressions failed before the fix. Final focused
validation passed 86 tests, including disposable PostgreSQL graph/authority,
exact retries and a superseded retry without duplicate commits. Changed-file
ESLint, diff checks and the full production build passed.

- Application source: `c54f93033b36847054c87fc6fc1f5b456149c3b4`.
- Current main included: `642980e448e9cfb9d898f1282274bd3cd9c246d6`.
- Target: `agency-dashboard`, branch `preview`, through `pnpm deploy:check` and `pnpm deploy:preview`.
- Deployment: `c5d0a65b-6e75-4dd5-ad40-8cd3def53b79`.
- Alias: https://preview.agency-dashboard-6cm.pages.dev
- Runtime digest: `c67adbab33650675260b6acba1dfa7413207796cb2bc5f56dd24d6eeaf55075e`.

Provider readback verifies deployment success, source, alias and runtime digest.
The preserved portal editor Retry reported **Saved**, retaining the original
checkpoint and operation with no duplicate insertion. Editing the existing
component heading also reported Saved. Reopening retained the heading and current
public CMS title/description in both desktop/mobile frames; private notes were absent.
QR Codes and existing dashboard navigation load with the synthetic fixture.

## Continuation

Studio PR #108 holds the dialog redesign and the deployed 90-second library/data
read deadlines. It is authenticated editor UI, including client-portal users;
public website visitors do not see this dialog. Same-tab generation recovery,
portal library acceptance and native record create/edit/reload are verified.

Full CMS acceptance remains open: native review/approval, explicit synthetic
staging publication, current-record SSR, rollback, both positive scope journeys
and remaining authority/quota/revocation/epoch negatives. Closed-tab request
recovery and native request latency remain UX follow-ups. Standalone product
entry outside the agency dashboard is documented but not implemented.

Keep all acceptance on the two synthetic staging sites and Dashboard preview.
Customer production is not authorized. Do not regenerate or reaccept existing
components. Second synthetic fixture expiry is 2026-09-29 10:22:35 UTC; only its
expiry changed, using full-row CAS.

Private evidence is retained in `/private/tmp/cms-typed-acceptance-20260929/`,
including preview provider receipt `preview-receipt-provider-1790663277.970013.json`,
original-save readback `second-ui-accept-state-1790663299821.json` and heading-save
readback `second-ui-accept-state-1790663545725.json`. No credentials or raw logs
belong in the repository.
