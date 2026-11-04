# Page Studio template catalogue: scoped list increment

The standalone Page Studio admin needs a Templates entry separate from its sites.
This increment supplies a server-scoped list and preparation status. It does not
publish a template, create a public preview, or copy a site.

## Scope

- Portal users open `/studio/sites?view=templates`; native customer users open
  `/studio/dashboard?view=templates` using their existing, separate sessions.
- Agency, portal and customer GET adapters resolve authority on the server.
  A client cannot submit another account's scope. Ambiguous session families are
  refused. Responses are private and must not be cached.
- Additive migration 501 stores entries, immutable source-bound versions,
  mutable withdrawal status and explicit audience grants. It contains no seeds,
  source registrations or active grants. Broad published eligibility is reserved
  in metadata but is not enabled by the list query.
- Preparation cards expose only public display fields and opaque version IDs.
  Preview and Use template remain disabled until those flows exist and pass
  their own acceptance checks. Source keys and account IDs are not returned.

Kia and Northwall Arc are automotive template candidates. Fantisy Limo,
Fantasea, Mornington and Yarra Valley are individual sites and must not be
registered as templates by this work.

## Release dependencies

The branch begins at native import PR843, commit
`3e56da111d9594e5c3f60d2e3e1065a86e7ea5a6`. Merge the parent only after green CI,
then move only this increment onto its merged main revision before release.
The corresponding Studio import source is merged in PR241 at
`41f71616f8650c623f40b3e747885510646e3ed3`.

No remote migration, registration, account grant, deployment or publication is
part of local implementation. The original no-production instruction remains in
effect pending the owner's explicit environment decision. The actual Automotive
Templates account's preview service uses production resources even though its
deployment command contains the word staging.

## Local verification

The combined six-file API/domain/component/customer-navigation run passes 54
tests. The separately verified PostgreSQL run passes 19 database tests; its
source manifest matches the reviewed files. Changed-file ESLint and strict
shared/domain TypeScript checks pass. Independent review closed two important
findings: portal listing no longer requires site-creation admission, and agency
tenant selection must match fresh server-owned organization scope.

Customer sign-out, refresh and account errors remain visible beside the
catalogue. Authenticated setup retains only the exact `view=templates` value.
Signed-out magic-link return retention remains a follow-up: users can select
Templates after login, but the email verification round trip does not preserve
that selected view yet.

The broader server typecheck was stopped after approximately four minutes with
no diagnostics while traversing the existing Nuxt import graph; it is not a
passing check. Full application build/typecheck/test/lint and the new branch's
remote CI are not claimed complete. Green focused tests do not establish hosted
catalogue availability. The disposable local database was stopped and removed
after preserving its evidence; no persistent account database was touched.

Remaining delivery work includes reviewed source registration, signed-out public
preview pinned to one immutable version, desktop/mobile viewer, independent
destination-owned copying with capacity and retry protection, supported manual
editing, and the complete hosted user journey. The T4–T9 acceptance tasks stay
open until those user-visible behaviors are demonstrated.
