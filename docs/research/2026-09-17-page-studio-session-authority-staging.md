# Page Studio session authority — staging release

17 September 2026. **Staging deployed and verified. Production rollout remains open.**

The Dashboard endpoint, private control gateway and Studio Sandbox Worker now
check current session authority on every authenticated editor request. Existing
signed tokens are denied after access is removed in Dashboard.

## Exact release

| Component | Source | Target | Deployment / version |
| --- | --- | --- | --- |
| Dashboard | `bd2d700c53eb7b2fb4c2b30061177eb44fc2de3e` | `agency-dashboard`, branch `preview` | `0f373740-b48f-4376-b976-a66278ee1a42` |
| Control gateway | same Dashboard commit | `xeroflow-page-studio-control-staging` | deployment `e824e521-c659-4343-8a78-cc69504805dd`; version `ae600b00-4f10-4be4-9577-ac5aedb7ca30` |
| Studio | `a555798e4ec1819a2df802d81b87c8515fd0e895` | `xeroflow-page-studio-sandbox-staging` | deployment `c46ceba2-c5c6-4890-a2da-3e27c9f1de01`; version `8ee93a83-6ebb-4020-96a6-934828863f29` |

Dashboard includes freshly fetched main `a917386dde67f06921843fd6e3a1ed1b4b984c6f`;
Studio includes `f3495cfe8ae17fb74eb9d9d7674662f4d64c2c43`. Both code changes remain
local commits, not merged or pushed. The public Dashboard repository has not been
used to publish the still-production-relevant security reproduction.

Staging: https://preview.agency-dashboard-6cm.pages.dev/agency/page-studio

The guarded `pnpm deploy:check` and `pnpm deploy:preview` ran from a clean owned
checkout. Worker dry runs passed; rollout followed Dashboard → control → Studio.
Studio used `--containers-rollout=none`. Provider readback confirmed unchanged
Worker settings/bindings and container application version 15, image digest
`4342f54e8dd9ced65fd7655eea3a81eea2b1f7deb12d5c9406a2d13553924dd2`.
Production Dashboard deployment remains `8798c363-6e9c-472a-a78f-47d8ce780ef4`.
No production deployment command, migration or new secret was run.

## Acceptance

- **13 live request checks passed** with temporary synthetic client/staff accounts.
  Fresh sessions issued through deployed Dashboard APIs passed current authority;
  membership downgrade, client/staff deactivation, read-only agency role,
  entitlement/site suspension, AI allowance removal and Dashboard nonce revocation
  each returned `403 SESSION_AUTHORITY_DENIED`. Restored access and an independent
  session continued to pass the authority check.
- Positive admission used an intentionally incomplete workspace request and
  asserted its downstream `400 Workspace scope is required` result. This proves
  the real Studio → private gateway → Dashboard → staging database path. It does
  not claim successful workspace mutation or model execution.
- Authenticated Chrome acceptance: client website list and management page load;
  Launch Studio opens the synthetic staging website with desktop/mobile previews,
  page tree and `Save status: waiting for changes`. No editing or publication.
- QR Codes renders in Chrome. The existing staging operator has only Page Studio
  permissions, so its QR data request correctly returns 403. A permitted synthetic
  account_manager received 200 and an empty scoped QR list. No role was changed
  for a real user.
- Synthetic fixtures retired. Independent readback found zero unrevoked Studio
  sessions, active sites/entitlements/client users/staff for that fixture. No
  customer session was revoked. Temporary DB credential removed after verification.

## Checks and limits

This release uses the locally verified implementation: 985 Dashboard Page Studio
cases, 86 separately executed PostgreSQL cases, 15 actual-source cross-repository
scenarios, and Studio full build/test/typecheck/lint passed. Dashboard changed-file
lint and full build passed. Its 913 whole-repository type errors exactly match
untouched main; the repository-wide typecheck is not green.

The clean release build passed the Worker size guard at 25,466,786 raw bytes:
**2,142 bytes remain**. Do not increase the limit to accommodate future growth.

R06 remains open: logout-to-nonce linkage, open connections, in-flight jobs,
commit-time authority, generated-script origin isolation, CPU containment and
latency/capacity measurement are not closed by this rollout. The full
cross-customer browser/expiry/public-cache matrix remains pending. Generated
customer code stays disabled. Production promotion and source integration remain
separate release steps.

## Evidence

Root `.verification/page-studio-builder-rnd-20260917/`:

- `session-staging-before.json`, `session-staging-after-dashboard.json`,
  `session-staging-after.json`: provider readback and preservation assertions.
- `session-staging-dashboard-deploy.log`, `session-staging-control-deploy.log`,
  `session-staging-sandbox-deploy.log`: build and deployment output.
- `session-staging-acceptance.json`: all 13 request results and fixture retirement.
- `session-staging-final-verification.json`: release/acceptance summary.
- Earlier `session-authority-*` logs: local regression and baseline comparisons.
