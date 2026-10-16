# Native managed transfer intent

This is a private prerequisite for moving an already-managed native customer
website from staging authoring to production authoring. It is not a transfer
endpoint, completed migration, production editor admission or publication.

`managedTransferAuthority.ts` requires both the original native owner's login
and a current built-in platform owner/admin login. It derives the website's
workspace, business and tenant from native ownership. It pins the exact active
publishing entitlement and its terms; a preview plan, manager membership,
replacement login or unrelated account cannot substitute for that authority.
Authority dependencies and the site are locked without waiting. Every SQL phase
rechecks real expiry and authority after its work and rolls back if either has
changed. The entitlement digest uses epoch strings for timestamp fields so
database session timezones cannot change its identity.

`managedTransferIntent.ts` provides two internal operations:

- `reviewManagedTransferSource` returns a redacted review challenge. Its digest
  binds the current authority and plan to the source metadata.
- `reserveManagedTransferIntent` requires that exact challenge and saves an
  immutable intent before any provider work. Exact retries return the same
  destination generation and provisioning request key. Another operation for
  the same site, a substituted request or a changed source fails closed.

The source snapshot includes the managed storage target and generation, accepted
application and checkpoint, schema selections, content head, record heads and
accepted object history. The history preserves logical clocks even when a newer
head has been restored to an older revision. Native snapshots are bounded to
1,000 object rows, 1,000 record heads and 1.5 MB of canonical metadata. These are
metadata limits, not a promise that the later private copy accepts that many
objects: its own selected graph and body limits still apply.

Migration 457 adds only `page_studio_managed_transfer_intents`. Composite foreign
keys bind the existing site, source scope and entitlement. The operation,
destination generation and per-site reservation are unique, and an immutable
trigger prevents updates or deletion. Original login hashes stay inside this
private coordinator tables; the review and reservation responses contain none. No
general-purpose audit payload receives credentials. There is no change to an
existing scope, selected checkpoint, preview, published release or domain.

The current reservation supports one initial staging-to-production transition
per site. Explicit recovery and cancellation must retain this original identity
and use separate records; deleting or replacing the intent is not recovery.

## Still required before activation

The next coordinator phase must use the existing provisioner under exact-purpose
native admission, and bind its independently verified production resources to
the retained request. It must recheck original authority around every remote
phase and retain resumable outcomes. A reserved generation is not a resource
receipt, graph proof, schema-upgrade receipt or transfer completion.

The final SQL transaction must compare all captured source heads and clocks,
verify the complete imported graph and draft history, retain old published
release authority and atomically select the production authoring graph. Public
actions on the original live release must remain correctly scoped. Hosted
two-account editor/form/email-template acceptance and existing release checks
are still required. Customer production activation remains a separate gate.

## Verification

`pageStudioManagedTransferAuthorityPostgres.test.ts` uses independent real
PostgreSQL connections in disposable localhost `studio_cms_*` databases. It
checks revocation, expiry, rollback, concurrent authority edits, competing
requests, immutable retry identity, changed source/plan/history, metadata bounds
and credential-free receipts. Only the default production database adapter is
replaced, and it throws if an injected disposable transaction is omitted.

## Resource-only preparation

`prepareManagedTransferResources` retains one immutable production resource request
under an existing transfer intent. It uses the original operator login, original
checkpoint anchor and server-reviewed `content-attachment-v1` artifacts. The
request can feed the existing resource-only attachment setup; it must never be
sent through normal provisioning completion, which seeds a replacement design.
Migration 458 stores this private request separately. The returned progress
receipt contains no login hashes. Retries cannot substitute artifacts or scopes.

`authorizeManagedTransferResources` is a private executor boundary. It resolves
the original native owner and operator from the immutable intent, rechecks their
current authority and the complete captured native source, and requires the exact
retained resource request. Use it before and after each remote operation. No
transaction is held across provider I/O, and a successful check is not a permanent
capability. Ordinary attachment admission is unchanged.

The private `/internal/page-studio/managed-transfers/resources/authorize` route
requires machine authentication and a trusted production provisioning binding
before reading input. It never uses ordinary attachment authority. It is not a
customer endpoint, and no hosted executor calls it yet. The resource request is
not a provider ownership receipt. Wiring allocation, exact physical
resource binding, source fencing, explicit interrupted-operation recovery and the
final graph selection remains outstanding. No customer route or authoring
selection changes as a result of preparation.
