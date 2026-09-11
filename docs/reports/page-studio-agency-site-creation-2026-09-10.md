# Agency client website creation

The agency Website Builder listed sites as non-customer demos and exposed no
creation action, even though its scoped agency create endpoint already existed.
Staff with PAGE_STUDIO_EDIT and write access can now select an active client,
website name, route and industry starter, then create a draft from that view.
The server's current entitlement, site-limit, active-client and tenant checks
remain authoritative. No subscription grant, billing or resource provisioning
is implied by this action. Portal proposal creation retains its existing flow.

The portfolio and sidebar now say Client websites. The dashboard uses Nuxt UI's
header/body slots so its body owns scrolling. The modal is scrollable, fields
use full-width labelled Nuxt UI controls, and its footer wraps at narrow widths.
The public Page Studio feature entry documents the draft-creation behavior.

## Verification and review

Four mounted Vue behavior tests exercise the chosen client/template request,
missing-client rejection, read-only/revoked editing permission, and a server
entitlement denial that preserves the draft without retrying. The initial test
failed because the component did not yet exist. Focused creation, navigation,
agency endpoint and site-storage checks pass: 28 tests in five files.
The full suite passes 13,229 tests / 48 skipped in 2,022 passing files after
rerunning with local socket permission; the sandboxed run failed runtime socket
fixtures with EPERM. Changed-file lint passes after formatting corrections.
Nuxt typecheck finishes with the existing 927 global errors and none in the
changed files. It caught a new Cancel handler return type, which was corrected;
the affected tests pass again. An earlier direct invocation lacked the repo's
heap setting and exhausted memory, so verification used `pnpm run typecheck`.
Build and authenticated visual acceptance remain release checks; this report
does not claim production deployment.

Review confirms explicit agency API usage, server-side ownership/subscription
checks, no raw form controls, no empty select values, no server import changes,
no new URL fetch destinations or schema changes, and no publication side effect.
Submission is guarded while pending; input is retained on failure. Creation
returns the portfolio to page one so the newly created site is visible. New agency
form state is separate from the portal setup proposal. Marketing navigation
already links this feature and needs no additional category.

## Fantasy Limo delivery state

Authenticated production lookup found no Fantasy/Limo-named client. The normal
client-create API created Fantasy Limo at the user's direction, and a separate
read verified active client `0595e5aa-59b4-461e-b8ff-7fe529ca9667` with no Page
Studio entitlement. Its note marks contact/commercial terms as unconfirmed,
including the API's default payment terms. No invoice, invitation or email was
sent. Client portal ownership is awaiting a name/email response.

There is still no saved Fantasy Limo website or review URL. Next required work
is explicit entitlement administration, then draft/content/checkpoint and a
reviewed build/preview with a working booking enquiry form. Do not silently
grant a paid plan or substitute a synthetic reference site for this client.
