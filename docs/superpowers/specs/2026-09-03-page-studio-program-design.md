# Page Studio Program Design

## Product boundary

Page Studio has two deliberate surfaces:

- **Studio** is the external visual authoring environment. It owns canvas editing, responsive previews, component composition, and checkpoint creation.
- **XeroFlow** is the management and governance control plane. It owns sites, pages, versions, reviews, releases, domains, subscriptions, audit history, and AI policy.

The dashboard must never become a second visual builder. Every site instead has a permanent management page from which an authorised operator can launch Studio and govern the full path to production.

## Non-negotiable release model

- A build may only consume an immutable checkpoint already stored in the Page Studio checkpoint R2 bucket.
- The browser supplies identifiers and operator intent, never a manifest or build asset payload.
- The server verifies tenant, client, site, version, checkpoint, digest, approval, hostname, and current release before invoking a build worker.
- Build output remains immutable and content-addressed.
- Release activation updates the active release and all derived site metadata in one database transaction.
- Rollback restores the release and matching navigation, footer, theme, SEO, locale, page, and integration metadata in one transaction.
- Existing release history is never rewritten.
- Mutations retain RBAC, tenant isolation, idempotency, audit trails, read-back verification, and drift inspection.

## Delivery phases

### Phase 1: Governed publishing

- Permanent site management route and navigation
- Approved-version, build, domain, and release visibility
- One-click server-orchestrated build, verification, and publish
- Automatic manifest metadata synchronisation
- Governed rollback with release metadata restoration
- Release drift and failure visibility

### Phase 2: Pages and CMS

- Hierarchical page tree
- Add and duplicate
- Parent and subpage selection
- Route and title management
- Draft, visible, and archived status
- SEO settings
- Header and footer inheritance
- Homepage selection
- Redirect management

The canonical hierarchy remains the Page Studio site tree. XeroFlow provides governance and management, while Studio provides visual editing.

### Phase 3: Components, templates, and presets

- Canonical header and footer primitives
- Landing-page sections
- Service pages
- Contact pages
- Campaign pages
- Blog layouts
- Complete site templates

Templates compose canonical components. They do not create a parallel collection of bespoke, ungoverned markup.

### Phase 4: Governed AI builder

- AI-assisted page and section creation
- AI editing against the canonical component schema
- Brand, accessibility, SEO, and content-policy constraints
- Proposed changes represented as drafts or checkpoints
- Human review and approval before release
- Full prompt, decision, output, and release auditability

### Phase 5: Content operations and measurement

- Media library and asset lifecycle
- Forms, CRM routing, and consent controls
- Analytics, conversion, and experiment instrumentation
- Reusable content and structured data
- Operational health and submission monitoring

### Phase 6: Domains and production operations

- Domain onboarding and DNS guidance
- Ownership verification
- SSL and certificate health
- Environment and hostname controls
- Redirect and canonical-domain enforcement
- Delivery health, cache invalidation, and incident recovery

## Management information architecture

The website navigation remains Page Studio, Reviews, Releases, Domains & DNS, and Subscriptions. Page Studio lists managed sites. Each site opens its own management page for Overview, Pages, Builds, Releases, Domains, and Settings. Studio is launched from the site context rather than replacing it.

## Source of truth

- Database rows are the source of truth for scope, approval, build, release, domain, and audit state.
- Immutable R2 checkpoints are the source of truth for authored manifests.
- Immutable R2 artifacts are the source of truth for published output.
- Derived site metadata is synchronised from the manifest selected by the active release.

