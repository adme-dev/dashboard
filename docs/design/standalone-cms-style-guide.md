# Standalone CMS interface guide

Reference requested by the user on 1 October 2026:
[Framer CMS](https://www.framer.com/cms/). Reviewed the live page and its embedded
CMS interface examples. This is an interpretation for our own customer product;
it is not an official Framer design specification.

## Direction

Use a quiet, content-focused workspace: persistent navigation, searchable rows,
clear draft state and a detail panel. The website's content provides the visual
interest. Keep the agency dashboard and the visual page canvas separate from
this customer management surface.

```text
Product / websites                                  Account
Website name                                      Open Studio
┌────────────────┬──────────────────────────────────────────┐
│ Overview       │ Pages                         Refresh    │
│ Pages & SEO    │ Search                         Visibility │
│ Media library  │ Title / URL    Visibility   SEO    Forms  │
│ Forms          │ …                                        │
│                │                                          │
│ Collections    │ Results                       Pagination │
│ Draft history  │                                          │
└────────────────┴──────────────────────────────────────────┘
                                             Details → panel
```

## Tokens and components

- Preserve Nuxt UI's semantic neutral palette: `bg-default` for the content,
  `bg-muted/30` for navigation, `bg-elevated` for selected or raised surfaces,
  `border-default` for boundaries, `text-highlighted` for headings and
  `text-muted` for secondary metadata. Use semantic status colors only when a
  status genuinely requires attention. Do not hardcode Framer's colors or assets.
- Use the existing application sans-serif. Website title: 24px, semibold;
  section title: 20px; controls/body: 14px; metadata: 12px. Sentence case.
- Spacing: 4/8/12/16/24/32px. Header controls stay compact. Main content panels
  have 16px mobile and 24px desktop padding. Navigation is 192px from 768px up.
- Frame radius: 12px. Inner content radius: 8px. Avoid decorative shadows,
  oversized statistic cards, uppercase eyebrow text and repeated green accents.
- Nuxt UI v4 throughout: `UButton`, `UFormField`, `UInput`, `USelect`, `UTable`,
  `UBadge`, `UPagination`, `USlideover` and the existing loading/error components.
- At narrow widths, navigation wraps and filter controls stack using container
  breakpoints. A wide data table may scroll inside its panel; the page must not.

## Interaction rules

- Label search and filters. Use a non-empty `all` sentinel for selects.
- Search by useful customer terms: page title, URL and SEO title. Reset paging
  when search, visibility or source data changes. Explain an empty result and
  provide Clear filters.
- Clicking a page title or Details opens its saved metadata without a route
  change. Details remain readable when editing is unavailable. Show why the
  editing action is disabled.
- Saved visibility is not live publication status. Use Visible/Hidden/Draft/
  Archived for saved pages; do not label an unpublished draft as Live.
- Keep genuine counts, current permissions and connection states. Never add
  simulated analytics or non-working Publish/AI controls to make a demo richer.

## Applied in the Fantasy Limo demo

The standalone customer shell is more compact, its site workspace has neutral
sidebar selection, and the Pages screen provides search, visibility filtering,
12-row pagination and a details slideover. The overview uses a restrained summary
row. These read the saved Fantasy checkpoint and respect customer authorization.

## Ideas for subsequent CMS work

Framer's reference illustrates collections/fields, references, structured tables,
content-detail editing, draft/preview/publish workflows and AI-assisted content
operations. Adapt these through our existing PRD, not as assumed shipped scope:

1. Collection browser with customer-defined fields, relationships and saved views.
2. Image thumbnails and detail inspection using authenticated media routes;
   uploads and AI image generation stay tied to explicit storage/credit state.
3. Form detail workspace combining entries, redirects, notifications, customer
   replies, outbound integrations and delivery history.
4. AI changes presented as a reviewable draft, with validation and undo/history
   before they affect published content or customer data.
5. Contextual SEO and publication readiness, with an explicit distinction between
   saved changes, an approved release and the live website.

Implementation status and remaining demo connections are recorded in
[the Fantasy Limo demo handoff](../plans/2026-10-01-fantasy-limo-demo.md).
