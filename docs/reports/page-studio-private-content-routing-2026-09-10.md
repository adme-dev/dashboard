# Page Studio private content routing — 10 September 2026

The content workspace can now use the private Page Studio dispatch bridge for
provisioned sites without a per-site service binding. Dashboard still checks the
current authenticated actor, site membership, role, site status and entitlement
before making a content request. It derives tenant/client/site from the fresh
query and businessId from clientId, matching the existing provisioning authority
model. A configured environment is required.

An exact existing named binding takes precedence for the original synthetic
fixtures. Missing mappings use PAGE_STUDIO_CONTENT_ROUTER, while ambiguous or
malformed mappings fail closed. The bridge resolves activated routes freshly;
Dashboard never accepts a browser-selected script, namespace or database.
Submission reads now include full scope when calling the bridge, while named
per-site readers retain their existing options contract. Inactive routes display
pending setup (503), and arbitrary service diagnostics remain private. Response
scope, actor and revision checks continue to apply to both paths.

Preview binds only xeroflow-content-router-staging. The existing CRM isolation
allowlist test now requires that exact additional private service. Production
and inherited environments have no router binding. Existing fixture maps and
booking entrypoints are unchanged. Feature pages describe website-specific
content/form access and pending activation; navigation already links this same
Page Studio feature and needs no new category.

Validation: 41 focused tests pass across adapter, API and binding tests. Target
guard and touched-file lint pass. Full build passes with 25,069,362 raw Worker
bytes (399,566 below the guard). The full suite passes 13,222 tests with 48
skipped (2021 passing files); database-only fixtures are not enabled in this run.
Global typecheck reports the existing 927 errors, with zero diagnostics in the
changed files. Guarded preview run 34400642124 succeeded at source
35290e0456777d8afd0983fd4841c855afe8b7c6. Independent Cloudflare readback verifies
deployment bb6cecbf-376f-407c-924e-1198bfc174dc on the preview branch/environment,
the exact PAGE_STUDIO_CONTENT_ROUTER -> xeroflow-content-router-staging binding,
and no production router binding. The immutable feature page returns HTTP 200:
https://bb6cecbf.agency-dashboard-6cm.pages.dev/features/page-studio .
The stable preview alias points to that deployment.

Foundation router source 4fb547d is deployed privately as
8ea6d415-748b-4278-976c-a82e606bb4f3 with 100% verified; six live scope/activation
denial checks pass. Foundation evidence and lifecycle limits
are recorded in its docs/research/2026-09-10-private-content-router.md.

The router is an integration boundary, not completed self-service provisioning.
Positive activated-site acceptance, real executor lease handling, second-site
isolation and the chatbot-to-published-form customer journey remain required.
There is no customer/production activation or Fantasy Limo launch in this change.
