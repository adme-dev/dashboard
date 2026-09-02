# Page Studio Phase 2: Pages and CMS

## Objective

Expose the canonical Page Studio page tree in the dashboard without creating a parallel CMS or bypassing the existing review and immutable release workflow.

## Delivery

- Mount a permanent Pages workspace in each website management screen.
- Read and save the existing revisioned `page_studio_documents` draft through the governed document endpoint.
- Support hierarchical page selection, top-level pages, subpages and duplication.
- Manage titles, canonical nested routes, draft/visible/archived state and per-page SEO.
- Manage header and footer inheritance modes.
- Select exactly one homepage while preserving the previous homepage as a routable page.
- Manage permanent and temporary redirects without allowing a redirect to replace a live page route.
- Launch the existing visual Studio directly for the selected site.

## Governance boundaries

- This phase mutates only the editable draft document.
- Optimistic revision locking prevents silent concurrent overwrites.
- Existing tenant scope, Page Studio RBAC, page entitlements and audit events remain authoritative.
- Production changes still require checkpoint creation, review, approval, server-owned build verification and release activation.
