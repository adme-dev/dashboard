# Dealership campaign and email module refresh

## Intent and scope

The previous five industry CTAs repeated one dark heading/copy/button skeleton. The module preview additionally emitted FlyHub font keys as CSS font names, causing a browser serif fallback. The gallery's three original screenshots included a 3074px browser canvas around a 600px email. Saved cards only displayed 184px of content and appeared under an unexplained Unfiled group. Successful DELETE requests left stale cards until a refresh.

The refresh retains the existing editors, stored documents and authentication. It adds three campaign starters and thirteen sections, bringing the visible catalog to eleven starters and sixty coordinated sections plus ten basic blocks. Existing IDs remain compatible. Nothing migrates or rewrites saved customer content.

## Approved visual baseline

The user explicitly selected GlideX, FuturaX and Aviro as the baseline: bold sans-serif typography, strong vehicle/product imagery, clear hierarchy and composed email layouts. Their source designs remain unchanged. New industry headings use sans-serif stacks too; the previous soft serif-led direction is removed. OEM research informs refinements rather than replacing this baseline.

## Research used

Sources inspected on 29 October 2026. Public guidelines and live-site observations are different evidence categories; these XeroFlow modules are not OEM-approved templates.

- Toyota visual system: https://brand.toyota.com/guidelines/visual/layout and https://brand.toyota.com/guidelines/visual/typography. Use deliberate grids, clear space, strong weight/size hierarchy, image-led compositions and aligned actions. Adapt those principles with email-safe system stacks; do not redistribute proprietary font files.
- Nissan creative-expression guidelines: https://www.nissanbrandceg.com/brand-foundations/brand-fonts and https://www.nissanbrandceg.com/channel-guidelines/website. Readable type, restrained contrasting foregrounds and clear vehicle storytelling. Reference assets stay reference-only.
- Volkswagen passenger-car retail site: https://www.volkswagen.com.au/en.html. Observe broad photography, model-specific stories and direct offer/configuration actions. Volkswagen Group corporate identity is a separate system.
- Mitsubishi Motors Australia: https://www.mitsubishi-motors.com.au/ and https://www.mitsubishi-motors.com.au/vehicles/outlander. Observe clear vehicle range, test-drive/quote actions and explicit offer information. Mitsubishi Electric and Mitsubishi Corporation brand manuals were excluded.
- Geely Australia: https://www.geely.com.au/ and https://www.geely.com.au/geely-ex2-australia-roadshow. Observe product imagery, concise product benefits, and venue/date/address event information. No partner-approved email manual was obtained.
- ZEEKR Australia: https://www.zeekrlife.com/en-au/. Observe restrained premium layouts, product photography and clear specification groupings. The user's shorthand ZK was interpreted as ZEEKR; no ZEEKR-specific approved identity is claimed.

## Campaign terminology

Register your interest gathers launch news/arrival-update requests. It is not an attendance confirmation, vehicle order or paid reservation. Real examples: https://www.nissan.com.au/vehicles/browse-range/new-z.html and https://www.penrithtoyota.com.au/enquiries/register-your-interest/.

Vehicle Launch RSVP requests attendance at an identified dealership reveal. The template includes editable event date, time/timezone, venue/address, RSVP deadline and guest information. The action links to a hosted attendance form, not an in-email form. Real dealership examples are https://sunshinecoastnissan.com.au/page-see-all-new-nissan-navara/ and https://www.toowoombamitsubishi.com.au/new-gen-triton-launch-rsvp/. Sunshine Coast Nissan separates attendance RSVPs from a keep-me-informed option. An automotive RSVP workflow example is https://help.everlytic.com/knowledgebase/create-workflow/ (RSVP example). No event-capacity, dates or guest allowance is invented.

Grand Automotive Sale Weekend is a timed retail promotion. The template contains example Save thousands wording, selected-vehicle qualification, vehicle cards, start/end dates, location and explicit editable offer conditions. No numeric price, finance approval or stock count is fabricated. The example savings need replacement with a substantiated live offer before sending.

## Visual and technical choices

Photo splits, reversed image/copy layouts, image posters, a retail offer masthead, vehicle cards, compact dealership headers and a structured event-detail table replace repeated colour-only CTAs. These are editable Html-backed email tables using the existing inline text/image/link editor, with responsive column stacking and inline email-safe styles. Existing native blocks remain editable and compatible.

A shared pure font map keeps editor and private Worker stacks aligned without importing renderer implementation into Pages. Original previews are captured from the actual 600px email element after local image loading; versioned preview URLs avoid stale browser images. Saved cards use the same 320px-wide/430px-high preview framing. No-folder templates remain saved normally; redundant Unfiled labels are removed, with named folders and drafts retained.

Confirmed deletes remove the card locally and update computed counts immediately. Failed deletes retain the row and retry controls. A set of confirmed deleted IDs prevents older in-flight list responses from restoring removed cards. Existing client-scoped server authority stays unchanged.

## Acceptance

Focused tests cover complete starter rendering, CTA destinations, interest/RSVP distinction, sale conditions, sender identity gating, editable layouts, font parity, deletion success/failure and repeat-submission protection, and saved preview framing. Desktop/mobile browser checks verify image loading and no 375px overflow. Original previews require visual inspection of the top content, not merely HTTP 200. Hosted acceptance must additionally check all eleven gallery cards, saved-template preview geometry, stateless renderer output, disposable-template deletion without reloading, and established QR Codes navigation. Do not send real campaign emails for these checks.

Preview regeneration: `pnpm exec tsx --tsconfig .nuxt/tsconfig.server.json scripts/email-template-previews.ts`. It uses local checked-out assets, captures the 600px email element, rejects broken images, and records dimensions in `.nuxt/email-template-preview-evidence.json`.
