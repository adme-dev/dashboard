# Customer domains, email and runtime completion

15 September 2026 Melbourne. User requested completion of both workstreams. This
record keeps the full acceptance scope separate from individual passing fixes.

## Domain verification increment

Based on freshly fetched Dashboard main `52ed8304f310cc2057218f872f559d173993792a`.
The previous refresh operation inferred DNS readiness from Cloudflare hostname
status. A prevalidated certificate/hostname could therefore activate a domain
whose traffic still pointed at the old website. Nine regression cases failed on
that source.

The candidate now requires the configured target in a connected CNAME chain,
hostname activation and active TLS together. It rejects mismatched provider
identities and prevents a refresh from reviving a concurrently detached record.
Provider/DNS requests have timeouts and refuse redirects. Creation stays pending
until a later DNS check, even if the provider immediately reports active TLS.

The agency workspace displays distinct ownership and certificate TXT records,
the configured CNAME target, existing-email preservation and rollback guidance.
Missing records are not invented. Verification errors remain visible and the
button recovers for another attempt. The public feature description is updated
with this bounded behaviour; email setup is not described as finished.

Validation: 51 tests passed across eight domain/UI/publication files; changed
source and marketing files pass ESLint. Independent review found no must-fix
issues in this increment. Chrome verified the actual component with Nuxt UI in
an isolated local Nuxt fixture at393×650 and1440×900: no horizontal overflow,
vertical scrolling reached the DNS action, the mobile modal fit361×316, and a
synthetic verification503 displayed an error and re-enabled retry. The header
now stacks at narrow container widths. Initial fixture-only missing-icon
warnings were fixed by bundling the installed icons; no new warnings/errors
followed the reload. This checks the component, not authenticated customer or
production acceptance. No deployment, customer DNS edit or email was performed.

Primary references checked on15 September:

- [Hostname and certificate verification](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/).
- [Cloudflare custom-hostname API](https://developers.cloudflare.com/api/resources/custom_hostnames/methods/create/), including distinct `ownership_verification` and `ssl.validation_records` fields.
- [Migration order](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/zero-downtime-migration/).

## Domain/email completion gates still open

- [x] Review and locally browser-check the current domain candidate.
- [ ] Integrate and release the current candidate with
  exact-source/target verification and existing font/QR navigation checks.
- [ ] Customer portal configuration with site membership and active-entitlement
  enforcement, persistent operations and conflict-safe attach/retry/detach.
- [ ] Reconcile creation whose provider response or database save is lost;
  recover existing pending records after provider setup without duplicate hosts.
- [ ] Complete apex/proxied DNS verification. The current fix verifies visible
  CNAME chains; flattened/proxied records remain unproven, not automatically active.
- [ ] Health freshness, failure handling and atomic release/domain mapping;
  verify rollback to the previous website without changing unrelated DNS.
- [ ] Confirm customer DNS/mail providers and collect an approved domain plus a
  controlled recipient before live changes or messages. Never copy credentials
  into these documents.
- [ ] Customer sender/reply-to/alias settings; ownership and SPF/DKIM/DMARC
  verification; inbound/outbound provider wiring; outbox, suppression and event
  delivery acceptance. Existing mailboxes and their MX/TXT records must survive.
- [ ] Run actual HTTPS and email tests, record results, remove scoped fixtures and
  hand over the working configuration to a customer user.

## Customer runtime completion gates still open

The implementation inspected has Workers for Platforms dispatch namespaces and
isolated customer D1/Worker provisioning. A search of executable source/config
found no Worker Loader binding or `LOADER.load/get` invocation. Generated type
declarations are not implementation evidence. Cloudflare's
[Dynamic Workers API](https://developers.cloudflare.com/dynamic-workers/api-reference/)
and [capability bindings](https://developers.cloudflare.com/dynamic-workers/usage/bindings/)
describe that separate mechanism. Do not mark generated-code execution complete
from dispatch provisioning alone.

- [ ] Reconcile the necessary deployed protocol, provisioning, dispatch and
  content services onto maintained Foundation main in dependency-closed slices.
- [ ] Complete production provisioning acceptance after D1429 failure recovery
  and staff-session revocation fixes. The failed a3c7 fixture is recovery-only;
  do not reseed it. Its cleanup is not yet verified complete.
- [ ] Controlled runtime/schema upgrades with immutable source identity,
  tenant-scoped authorization, migration compatibility and rollback evidence.
- [ ] Resource cleanup/retention and interruption recovery without deleting
  another customer's data or accepting an ambiguous provider outcome as success.
- [ ] Request/resource usage metering, customer quotas and operational budgets.
- [ ] Real two-customer production isolation, lifecycle, failure and cleanup
  acceptance; then controlled scheduler activation.
- [ ] Resolve the separate Worker Loader experiment against the approved
  component-execution requirements; keep typed component/form editing working.

This increment does not close either full workstream. Other original platform
and Fantasy Limo brief requirements remain in the overall goal.
