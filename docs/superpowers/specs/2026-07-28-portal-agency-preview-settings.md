# Portal Agency Preview Settings Design

## Goal

Make `/portal/settings` clearly represent agency-opened portal sessions as a read-only preview while preserving an editable, well-composed profile experience for real client users.

## Decisions

- Agency portal access is an explicit authenticated-user property named `agencyAccess`.
- The server derives agency access from the reserved `@portal-access.local` identity created by the agency access endpoint.
- Agency proxy profiles cannot be updated through `PUT /api/portal/profile`.
- Agency sessions see a prominent preview alert plus a compact read-only identity summary. The synthetic proxy email is never rendered.
- Real client sessions retain profile editing. Every field uses Nuxt UI `UFormField`, paired fields use a consistent responsive grid, and Save Changes stays adjacent to the form.
- Portal modules remain the source of truth for effective access and retain their existing destinations.

## Layout

The page remains full width. The upper content becomes a responsive two-column composition:

- Primary column: agency preview identity or client profile form.
- Secondary column: compact account summary.

Below it, Portal Access remains full width. Team access and access-health content remain permission-gated.

## Verification

- Unit-test agency access classification in client authentication.
- Unit-test `agencyAccess` in `/api/portal/auth/me`.
- Unit-test rejection of profile mutation for agency access.
- Add a settings source contract test for the read-only branch, synthetic-email exclusion, Nuxt UI form fields, and module destinations.
- Run focused tests, typecheck, build, and production browser/HTTP checks.
