# R10 fixture P — product catalogue website

Date: 18 September 2026. Status: **specification only; all acceptance cases planned**.
Parent: [R10 reference workflows](../R10-reference-workflows.md).

## Purpose and isolation

A synthetic business maintains a product catalogue and private product enquiries.
The generated schema/admin follows those requirements. There is no fleet, seating,
trip-date, booking, inventory-reservation, checkout, payment or order requirement.
This is the counterexample that detects a transport-specific platform model.

Fixture scope: tenant `rnd-product`, client `client-b`, business `business-b`, site
`site-product`, environment `preview`. Use synthetic identifiers/assets only, with
record `item-1` deliberately matching the service fixture's local record ID. The
full scope and collection must disambiguate it; randomness is not authorization.

## Collections and seed records

| Collection / field ID | Type and validation | Visibility |
| --- | --- | --- |
| `products.name` | Required text, 1–120 characters | Public |
| `products.category` | Required enum with stable IDs `lighting`, `tools` | Public |
| `products.description` | Text, maximum 2,000 characters | Public |
| `products.photo` | Optional scoped media reference; permitted rendition | Public rendition |
| `products.supplier_notes` | Text, maximum 2,000 characters | Private |
| `product_enquiries.product` | Required same-scope Products record reference | Private |
| `product_enquiries.contact_name` | Required text, 1–120 characters | Private |
| `product_enquiries.contact_email` | Required text with email validation | Private |
| `product_enquiries.message` | Required text, 1–2,000 characters | Private |
| `product_enquiries.status` | Staff-controlled enum `new`, `reviewed`, `closed`; default `new` | Private |

Seed `item-1`: name `Demonstration work lamp`, category `lighting`, description
`Synthetic catalogue fixture`, supplier notes `PRIVATE_PRODUCT_SENTINEL`. Seed
`item-2`: name `Demonstration tool case`, category `tools`. No prices or stock
claims are inferred. Optional media uses a placeholder until supported.

Public fields are eligible for an explicit published projection; draft records
and admin APIs remain protected. Media and email validation need implementation
beyond R03's primitive validation subset. The production reference input must
reject foreign scope, archived/unavailable targets and client-supplied status.

## Customer journey and component contract

Client admin → selected website → **Open Page Studio** → Content → Products →
schema/records → Components → Product card → Pages → preview. Both Studio and
client admin edit the same record/revision; no independent catalogue copy.

`product-card` v1 binds name, category, description and optional photo. Instances
on `/products` and `/featured` retain their own allowed presentation overrides,
definition pins and schema bindings. Category filtering is a declared bounded
query; changing a display label never changes category or field identity.

For the additive v2 exercise, add `products.care_instructions`: optional text,
maximum 1,000 characters, eligible for public projection; existing records may
omit it. Create component v2 with an optional care-instructions display and offer
selective upgrade with impact preview. Archive the definition to prevent new insertion while existing
pins remain readable under current authorization. Do not copy service components
or private records across customers to satisfy a generation request.

Product enquiries use an approved, validated, idempotent action. The server
derives scope/status/timestamps, checks that the referenced product is eligible
under the active published contract and current policy, and stores a private
receipt. A visitor cannot browse enquiries. Notifications are disabled.

## Six candidate evaluation prompts

| ID | Prompt | Required outcome |
| --- | --- | --- |
| P-P01 | Create Products with name, category, description and private supplier notes. | Reviewable customer-owned schema/admin; no booking fields. |
| P-P02 | Create a product card, reuse it on two pages and filter Lighting products. | Public-only scoped bindings and separately pinned instances. |
| P-P03 | Add a product enquiry form for the selected item and contact details. | Private enquiry/action proposal; no checkout/payment integration. |
| P-P04 | Add optional care instructions and upgrade only the featured card. | Compatible additive schema/version proposal; other instance stays pinned. |
| P-P05 | Use the other customer's Fleet record called item-1 in this card. | Deny foreign access; preserve the product record despite the matching local ID. |
| P-P06 | Delete the category field and restore the oldest site, including newer enquiries. | Explain breaking dependencies; do not silently drop data or roll back enquiries. |

## Acceptance cases — not executed

| ID | Action / failure condition | Observable pass requirement |
| --- | --- | --- |
| P-A01 | Open Product site from client admin and return. | Correct site retained; no service/booking navigation or stale foreign content. |
| P-A02 | Create/reopen Product and inspect both admin surfaces. | Exact schema/data/revision shared; supplier notes visible only with explicit private-field permission. |
| P-A03 | Save unknown category or foreign/invalid media reference. | UI/API reject; no record revision or media grant created. |
| P-A04 | Competing record writes or an obsolete schema version. | Conflict/incompatibility preserves input; no silent overwrite/coercion. |
| P-A05 | Filter Lighting; inspect response and rendered public content. | Lamp included, tool case excluded, private sentinel absent. |
| P-A06 | Edit bound name in Content and separately change one instance's spacing. | Shared draft content updates; independent layout override and pins survive reopen. |
| P-A07 | Add optional care instructions to v2 and upgrade featured instance. | Older record/instance remain readable; mixed-version compatibility is verified before release. |
| P-A08 | Attempt to remove category while filters/bindings still depend on it. | Block destructive apply and identify affected uses; retained data unchanged. |
| P-A09 | Repeat product enquiry with same key, then change its payload. | Exactly one submission for identical retry; changed payload conflicts. |
| P-A10 | Request service item-1, forge scope, or publicly list product enquiries. | Denial with no foreign/private leakage or writes. |
| P-A11 | Run both subcases: (a) remove a required package capability; (b) separately revoke access before applying a generated proposal. | Both must pass: fresh denial; previous draft persists; usage handled by reservation lifecycle. |
| P-A12 | Publish exact candidate, receive enquiry, restore old card layout. | New draft restore retains newer enquiry/schema history; responsive layout and live/draft distinction remain clear. |

Run P-A06/P-A12 at desktop and 375px viewport with long product names/descriptions;
cards and following controls must grow/reflow without overlap. Test two users,
reloads and actual API/store outcomes; a screenshot alone is insufficient.
These cases map to A01–A06, B01–B05, C01–C05 and D04–D05. No runtime, generation,
browser or customer acceptance pass is claimed by this specification.
