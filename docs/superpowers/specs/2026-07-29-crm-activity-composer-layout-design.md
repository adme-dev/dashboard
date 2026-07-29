# CRM Activity Composer Layout Design

## Goal

Make the Communications & activity composer in the CRM record slideover visually consistent with the newly widened person editor, while preserving all existing communication logging, filtering, deletion, refresh, and toast behavior.

## Scope

The change is limited to `app/components/crm/CommTimeline.vue` and focused component tests. It applies automatically to both agency CRM and client-portal CRM because the component already selects its API base through the injected `crmApiBase`.

No API endpoints, database schema, timeline entry rendering, channel semantics, permissions, or marketing pages change.

## Composition

The composer remains an always-visible bordered section above the timeline.

- The root becomes a semantic `<form>` using `@submit.prevent="log"`.
- The form establishes an `@container` so layout responds to slideover width instead of viewport width.
- Every field uses Nuxt UI v4 and is wrapped in `UFormField`.
- Activity type and direction use `grid grid-cols-1 gap-4 @md:grid-cols-2`.
- Direction remains visible only for email, call, and SMS.
- When direction is not applicable, the activity-type field spans both available columns at the container breakpoint.
- Subject is full width, labelled `Subject`, and marked optional with the form-field hint rather than placeholder-only labelling.
- Details is a full-width `UTextarea`, labelled `Details`, with four visible rows.
- The action moves into a clean right-aligned footer and uses a standard small Nuxt UI button labelled dynamically as `Log note`, `Log email`, and so on.
- The button remains disabled until subject or details contains non-whitespace text.

The channel filter and timeline remain below the composer with their existing visual and behavioral contracts.

## Responsive Behavior

At narrow panel widths, all controls stack in one column.

At `@md` container width:

- channel and direction share a row when direction applies;
- channel spans the row for note and meeting;
- subject and details remain full width.

All select, input, and textarea controls use `w-full`.

## Data and Error Flow

The existing POST contract is unchanged:

- `client_id`
- either `person_id` or `company_id`
- `channel`
- conditional `direction`
- nullable trimmed `subject`
- nullable trimmed `body`

Successful submission still clears subject and details, refreshes the timeline, and shows the success toast. Failures still retain the entered content and show the error toast. Delete and filter behavior remain unchanged.

## Accessibility

- Visible labels are supplied by `UFormField`.
- Form submission works from the submit button and keyboard Enter semantics where appropriate.
- The textarea remains the primary multiline entry surface.
- The disabled state communicates when there is no loggable content.
- Existing Nuxt UI focus, dark-mode, and keyboard behavior is retained.

## Verification

Add DOM-level component tests that verify:

- every composer control is labelled and full width;
- the field grid is container-responsive;
- the type field spans when direction is hidden;
- direction appears for email, call, and SMS;
- submit sends the unchanged portal/agency API payload;
- successful logging clears fields and refreshes the timeline;
- empty submissions remain disabled;
- the timeline filter and existing entry rendering remain connected.

Run targeted Vitest, ESLint, Nuxt preparation, the social-publishing gate, deployment guards, and the guarded production build before publication.
