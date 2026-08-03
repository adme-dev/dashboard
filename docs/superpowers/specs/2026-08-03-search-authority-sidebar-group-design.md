# Search Authority Agency Sidebar Group

## Goal

Replace the single agency-sidebar Search Authority link with an expandable group that makes the two agency routes discoverable without adding unrelated navigation.

## Chosen interaction

The **Search Authority** item is a navigation trigger with the existing `i-lucide-search-check` icon. It contains:

- **Overview** → `/agency/search-authority`
- **Connections** → `/agency/search-authority/connections`

The group opens by default whenever the current route is `/agency/search-authority` or one of its descendants. Selecting either child closes the mobile sidebar through the existing callback.

## Alternatives considered

1. **Expandable trigger with two children — selected.** It preserves one compact feature entry, gives both routes clear labels, and avoids ambiguous parent navigation.
2. **Parent link that also has children.** Rejected because one click would need to choose between navigation and expansion.
3. **Two flat links.** Rejected because it adds sidebar clutter and weakens the feature hierarchy.

## Access and scope

- Preserve the existing `canAccessMediaBuying` permission boundary.
- Preserve the existing public Search Authority feature flag.
- Keep the group in the **Budget Tracker** agency-sidebar section.
- Do not change client-portal navigation, route middleware, API access, public marketing navigation, or feature entitlements.

## Implementation boundary

Update the existing `searchAuthorityNavItems` helper to accept the current route and return the grouped Nuxt UI v4 navigation structure. Pass `route.path` from the agency layout. No new component or state store is required.

## Verification

- Disabled feature returns no navigation items.
- Enabled feature returns one Search Authority trigger with the exact Overview and Connections destinations.
- The trigger defaults open for the overview route, the connections route, and future descendants.
- It remains closed for unrelated routes.
- Focused navigation tests and lint pass.

