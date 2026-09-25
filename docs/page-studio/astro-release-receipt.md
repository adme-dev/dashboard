# Astro candidate review and artifact promotion

The native publisher prepares an approved saved version once, registers an
immutable review address, and promotes that exact verified `buildId`. Promotion
does not reread source or recompile. Legacy releases remain readable and eligible
for historical rollback. Sealed live-feature websites retain their existing
publication flow until their Astro runtime is ready.

## Retained source and artifact

Migration 430 retains renderer, source identity and toolchain pins. Migration 431
stores an immutable, bounded `astro_release_receipt` on successful Astro builds.
Its scope, identity, wrapper digest, compiler-manifest digest and artifact paths
must agree with the retained row. Pending/failed Astro and legacy rows have no
Astro receipt. Migration 432 binds every Astro reservation to its original review.
The migrations are idempotent and deliberately reject historical Astro rows whose
receipts or approvals cannot be proven; they never invent provenance.

The shared generated verifier validates the receipt against the retained context,
toolchain and trusted generation policy. Delivery independently verifies stored
artifact bytes before native SQL completion. Wrapper and compiler-manifest digests
remain distinct. Readers preserve the verified pointer across preview, activation,
public host resolution and rollback.

New admission, first completion, new preview registration and new activation
require the site's current version and checkpoint to match the retained source,
including tenant/client/site scope and both digests. These checks run under the
site lock. Completed exact retries and historical rollback preserve their original
results after a newer source is saved. Retried requests retain the selected
compiler generation and consume no second build admission.

## Current authority and browser review

The original agency login, publish permission, role, client, site and entitlement
are rechecked before and after SQL work. Revocation, wall-clock expiry or changed
approval rolls back the operation. Artifact verification runs outside SQL, followed
by these fresh checks. Unknown RPC outcomes remain recoverable.

The candidate endpoint accepts only environment and an idempotency header. Source,
compiler, storage paths and review hostname come from native/configured authority.
Its hostname encodes the entire build identity in one DNS label. Existing preview
addresses are never repointed to a different artifact.

The publishing dialog prepares and opens the candidate, requires review confirmation,
and sends its exact `buildId` for activation. Closing/reopening can recover a retained
candidate without another compilation. Mode selection requires Astro configuration
and an explicit `requiresSealedFeatures: false` from the management Worker; older
inspection responses do not silently opt in.

Review grants contain only `workspace:preview`, last at most five minutes and cannot
outlive the native login. A bounded form POST exchanges the grant on the dedicated
review hostname, checks the exact dashboard Origin, sets a host-only Secure HttpOnly
SameSite=Lax cookie and redirects to `/`. Tokens never enter URLs or persistent
browser storage. Every read rechecks native authority. Preview form submission
remains disabled; this is not evidence of real production form delivery.

## Rollout sequence

1. Preflight existing Astro rows. Apply migrations 430–431 before new readers and
   432 before dispatch; retire incompatible old readers before enabling Astro rows.
2. Publish and verify the fixed compiler image and private service generation.
   Preserve historical generations. Build Worker requires a **build-capability**
   registry; Delivery requires a separate **verify-capability** registry, each with
   its matching exact private service bindings and environment.
3. Configure native `PAGE_STUDIO_ASTRO_RELEASE_REGISTRY`,
   `PAGE_STUDIO_ASTRO_CURRENT_TOOLCHAIN_DIGEST`, `PAGE_STUDIO_RELEASE_ENVIRONMENT`,
   `PAGE_STUDIO_BUILD`, `PAGE_STUDIO_DELIVERY` and `PAGE_STUDIO_CHECKPOINTS`.
   Missing or invalid retained configuration fails closed without legacy fallback.
4. Configure the dedicated review suffix with wildcard DNS, routing and TLS. Match
   native `PAGE_STUDIO_RELEASE_PREVIEW_HOSTNAME` to Delivery `PREVIEW_HOSTNAME`;
   set `PREVIEW_SESSION_ORIGIN` to the exact HTTPS dashboard origin. Native signing
   credentials and preview verifier issuer/public key must match.
5. Deploy the management projection and native integration from freshly verified
   current main through their guarded deployment commands. Record source commits,
   target and deployment IDs, and verify established navigation including QR Codes.
6. Save the intended Fantasy checkpoint for review, approve through native authority,
   prepare the candidate, inspect it, and activate the same artifact on the configured
   production destination. Verify real form delivery there. Do not invent a customer
   domain or treat disabled draft submission as delivery acceptance.

No native production migration or deployment has been performed for this increment.
The hosted Fantasy shadcn update is a separate explicit saved-draft snapshot update.

## Local validation

- 340 native release tests passed across 20 suites, with one existing skip.
- 73 real PostgreSQL Astro tests include stale-source races, no side effects on
  rejection, exact replay, quota accounting, terminal receipt immutability, approval
  revocation and historical Astro/legacy rollback. The stale-source regression first
  reproduced five failures, then all 73 passed after the shared gate was added.
- Local full suite: 14,734 passed; one route-inventory failure identified exactly
  the new scoped candidate POST. Both frozen route counts were updated; permission
  classifications and God-mode bypass assertions remain unchanged.
- Production Pages build and size checks passed: 25,336,449 raw bytes and 6,795,530
  gzip bytes. Strict management Worker typecheck and dry build passed. All 43 changed
  source files passed ESLint; launch projection tests passed after type narrowing.
- Local Chrome transport acceptance exercised the real popup helper and Worker
  token exchange with synthetic grants: clean redirect, cookie reuse and no page
  errors. Styled publisher desktop/mobile, keyboard, pickers and no-JS checks were
  verified separately. Hosted Fantasy acceptance remains a deployment gate.
- Generated verifier source digest:
  `6f742154e9120318daa56bfff55a3e9ab080bdcc872ae19ae3b1ef37dbd928da`.
- Repository-wide native TypeScript remains affected by existing errors elsewhere;
  these are not clean global typecheck results. Focused changed-file and management
  checks pass. Independent code review found no remaining material issue.

Evidence: `/private/tmp/shadcn-native-release-acceptance.log`,
`/private/tmp/shadcn-stale-source-{red,green}.log`,
`/private/tmp/shadcn-native-full-{scan,tests}.log`,
`/private/tmp/shadcn-native-inventory-final.log`,
`/private/tmp/shadcn-native-final-build.log`, and
`/private/tmp/shadcn-management-build.log`.
