# Page Studio production service connections

Prepared 14 September 2026 from freshly fetched Dashboard main
`7579a17f88736c40426c92567f4d2cfd737ca265`.

The production Pages configuration connects `PAGE_STUDIO_PROVISIONER` to
`xeroflow-provisioning-production` and `PAGE_STUDIO_CONTENT_ROUTER` to
`xeroflow-content-router-production`, with explicit production scope variables.
Preview retains its staging services and isolated Hyperdrive origin. No top-level
service binding, executor credential, raw customer D1 binding or dispatch access
is added to Pages. Existing APIs continue deriving and checking client, tenant,
site, entitlement and actor authority before private calls.

## Deployed prerequisites

All three private Workers were uploaded from clean Foundation source
`4c2b4b7d5b9298e31ac56e64c0f3bff44781633f`, including freshly fetched Foundation
main `a363b003d36904612e73356e7b8fb523aabbf11b`:

| Service | Version |
|---|---|
| Executor | `1600454a-dbfa-4cb4-add6-2c3083c5b54b` |
| Coordinator | `dfd9c525-bf88-4bb1-b4a6-2e48f3a2cf8c` |
| Content router | `9615e850-7359-41f4-8a20-0b1af345494d` |

The 720,334-byte customer runtime was rebuilt in the clean checkout, tested,
uploaded to private R2 and downloaded again. Both copies have SHA-256
`2dd87c86b6d909889e4fa2dc60dbca45b660144d5169d054e8a1fcd8b737ce83`.
Eighteen exact-artifact/config checks pass. Fifteen live private rejection/read
checks pass, with all four production registry tables empty before and after.
The first local proxy failed to start because its bundled runtime supports only
2026-08-18; the corrected local proxy passed. Deployed service dates were retained.

Wrangler deployments keep workers.dev, preview URLs and cron disabled. Independent
Cloudflare metadata verification is recorded by the release owner before consumer
promotion; source config alone does not prove live state. Management credentials
remain only in the private executor, and must be renewed before expiry.

## Release and acceptance

1. Finish the combined content and portal-booking preview journey on the owned
   synthetic clients, including independent database reads and fixture retirement.
2. Run current-main ancestry, review, focused environment/binding checks, the full
   required CI and the unchanged production bundle-size gate.
3. Release Pages only through `pnpm deploy:check` and `pnpm deploy:production` to
   `agency-dashboard`; record exact source and Cloudflare deployment ID. Verify
   live Geist, QR export, navigation, existing editor policy and new bindings.
4. Use two fresh synthetic production customers for normal scoped creation,
   approval and provisioning, and content/booking isolation acceptance. Process
   only their owned jobs while cron remains disabled; record complete lease/phase
   timing. Retire their routes, accounts, sessions and entitlements afterwards.
5. Enable scheduling only after authority, lease timing and cleanup checks pass.
   Connecting this coordinator alone queues requests; it does not schedule work.
   Do not promise unattended setup before the scheduler is verified.

This connection does not publish Fantasy Limo, change its DNS, submit a real
customer enquiry, send a message or charge a payment. Public signup, availability,
customer confirmation, notifications, paid billing, domains/email, verified client
facts, full migration and client handover remain separate roadmap outcomes.
The Foundation checklist and Graph Wiki retain the full objective.
