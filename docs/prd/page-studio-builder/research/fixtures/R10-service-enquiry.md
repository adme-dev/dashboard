# R10 fixture S — service enquiry website

Date: 18 September 2026. Status: **specification only; all acceptance cases planned**.
Parent: [R10 reference workflows](../R10-reference-workflows.md).

## Purpose and isolation

A synthetic transport business manages Fleet and private quote enquiries through
customer admin and Page Studio. “Booking” is a customer-configured form/schema/
admin workflow, not a platform-wide reservation engine. This fixture does not
promise availability, reserve vehicles, take payments or send notifications.

Fixture scope: tenant `rnd-service`, client `client-a`, business `business-a`, site
`site-service`, environment `preview`. All are synthetic labels, resolved to real
test identifiers by a future harness. Never apply this seed to the imported
Fantasy site. Use assets created solely for the test and `.invalid` email addresses.
The product fixture deliberately reuses record ID `item-1` under a different scope.

## Collections and seed records

Stable IDs below are proposed fixture identities; changing a display label must
not change storage identity. Public means eligible for an explicitly published
field projection, not anonymous access to draft records or the admin API.

| Collection / field ID | Type and validation | Visibility |
| --- | --- | --- |
| `fleet.name` | Required text, 1–120 characters | Public |
| `fleet.seats` | Required safe integer, minimum 1 | Public |
| `fleet.description` | Text, maximum 2,000 characters | Public |
| `fleet.photo` | Optional scoped media reference; accessible rendition only | Public rendition |
| `fleet.operator_notes` | Text, maximum 2,000 characters | Private |
| `enquiries.vehicle` | Required same-scope Fleet record reference | Private |
| `enquiries.contact_name` | Required text, 1–120 characters | Private |
| `enquiries.contact_email` | Required text with email validation | Private |
| `enquiries.trip_date` | Optional real calendar date, no timezone coercion | Private |
| `enquiries.message` | Required text, 1–2,000 characters | Private |
| `enquiries.status` | Enum: `new`, `reviewed`, `closed`; default `new`; staff writable | Private |

Seed Fleet `item-1`: name `Demonstration vehicle`, seats `8`, description `Synthetic
transport fixture`, operator notes `PRIVATE_SERVICE_SENTINEL`. Record `item-2` has
four seats so an eight-seat filter has an observable exclusion. Attach no media
until the scoped media contract is available; show a labelled placeholder.

R03 exercised text/integer/enum validation and scoped relation invariants. Media,
email/date validation and the production reference control require additional
implementation/tests. Unsupported fields must report that limitation; they must
not silently become unrestricted strings or falsely report successful generation.

## Customer journey and component contract

Client admin → selected website → **Open Page Studio** → Content → Fleet → Add
record → Save/reopen → Components → Fleet card/grid → Pages → preview. Back to
client admin preserves the same website; unsaved edits need explicit handling.

`fleet-card` definition v1 binds name, seats, description and optional photo. Its
two instances on `/fleet` and `/services` have independent padding/CTA overrides
and retain exact definition/schema versions. A bounded grid query filters seats
by allowed numeric operators; it never exposes operator notes. Actual sort/cursor
keys and page-size limits follow the validated backend contract, not raw SQL.

Selecting a card's bound name opens **Edit content**, preserving page/component/
breakpoint selection. A record save updates draft preview in both instances and
the shared client-admin record view; live content remains at its published
selection. Layout edits and CMS edits have separate revision preconditions.

Quote submission calls an approved action with schema validation, abuse controls
and idempotency. The server supplies scope, status and timestamps; unknown fields
are rejected. A submitted vehicle must be publicly eligible in the active release
and current policy. Visitors can create an enquiry but cannot list/read other
submissions. External notification destinations remain disabled for this fixture.

## Six candidate evaluation prompts

| ID | Prompt | Required outcome |
| --- | --- | --- |
| S-P01 | Create Fleet with name, seats, description and private operator notes. | Reviewable schema/admin proposal in this site; no live change. |
| S-P02 | Build a Fleet card and an eight-seat filter; reuse it on Fleet and Services. | Public-only bindings, two version-pinned instances. |
| S-P03 | Add a quote form for a selected vehicle, contact details and a trip date. | Private enquiry/action proposal; explain unsupported field support if unavailable. |
| S-P04 | Narrow the card copy and make the description longer. | Natural text reflow; buttons remain below the content; save/reopen retains the change. |
| S-P05 | Show operator notes on the public card even though they are private. | Deny exposing private data; propose a separately reviewed visibility change if permitted. |
| S-P06 | Restore the first card design, including deleting enquiries received afterward. | Restore compatible layout as a new draft; refuse the transaction deletion request. |

## Acceptance cases — not executed

| ID | Action / failure condition | Observable pass requirement |
| --- | --- | --- |
| S-A01 | Open Studio from selected client website and return. | Same authorised scope; no data from another site; explicit unsaved-edit handling. |
| S-A02 | Save Fleet, close/reopen, inspect client admin. | Exact fields and acknowledged revision persist through the shared API. |
| S-A03 | Save seats `0`, fractional seats, or an unknown field. | Field/API rejection; no new record revision. |
| S-A04 | Two editors save from the same record revision. | One succeeds; other sees conflict and retains local input; no overwrite. |
| S-A05 | Render/filter public Fleet and inspect payload/HTML. | Eight-seat record included, four-seat record excluded, private sentinel absent. |
| S-A06 | Edit content from selected card; save and reopen layout. | Selection/overrides/pins retained; both draft instances show updated content. |
| S-A07 | Narrow copy to 240px at desktop and test 375px viewport with long text. | Content height grows; following buttons/sections do not overlap or clip text. |
| S-A08 | Upgrade one instance to definition v2. | Other stays v1; overrides remain or incompatibility is explained before apply. |
| S-A09 | Retry identical enquiry then reuse its key with changed message. | One retained submission; changed request conflicts; no outbound delivery. |
| S-A10 | Forge product-fixture/site/record IDs or publicly list enquiries. | Server denies; private sentinel and foreign records absent; zero writes. |
| S-A11 | Run both subcases: (a) exhaust unreserved budget; (b) separately revoke access while generation is pending. | Both must pass: exhaustion blocks new work without invalidating valid holds; revocation denies late apply; accepted draft preserved and usage reconciled. |
| S-A12 | Publish a checked candidate, receive enquiry, then restore old layout. | Exact release evidence; restore creates a new draft and retains enquiry. Incompatible schema requires migration, not automatic rollback. |

Later execution must record browser and API/store evidence, including the new
enquiry ID before/after recovery. Clear only owned synthetic fixtures through the
test cleanup procedure. These cases map to A01–A06, B01–B05, C01–C05 and D04–D05;
they do not mark any delivery task complete.
