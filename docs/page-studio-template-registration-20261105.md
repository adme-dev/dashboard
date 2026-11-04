# Internal code-template registration

This increment records a private, immutable template version from an explicitly
selected accepted code checkpoint. It does not change the source site's head,
history or content, create grants, publish a preview or expose an HTTP endpoint.

The trusted caller must supply current mutation authority and explicit approval
of the exact source and catalogue slug. Registration derives client scope from
native records, verifies the existing complete content package, then rechecks
authority and accepted metadata in a final transaction. Entry locking and unique
version identity support exact retries without duplicating a version. Conflicting
metadata is refused. Existing withdrawn state is never restored by registration.

The code verifier returns its verified inventory digest and minimal immutable
review provenance so the registrar does not trust browser-supplied metadata.
Typed content is explicitly unsupported by this increment. Northwall's preserved
typed package still requires its own validated import and registration path.

The owner explicitly requested implementation without further tests or skill
workflows and intends to test manually. No tests were added or run for this
increment. It is unverified implementation, not a completed hosted feature.
Existing tests and authority checks remain in place. No real registrations,
migrations, account changes, deployments or publication occurred.

Next integration work: connect an authenticated operator transport with explicit
source approval, register the approved hosted Kia checkpoint, provide a pinned
public preview, and implement independent copying. The original no-production
restriction remains pending an explicit owner override.
