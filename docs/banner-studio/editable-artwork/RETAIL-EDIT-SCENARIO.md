# Retail invitation editing acceptance scenario

User-supplied example, 26 October 2026. The native-letter invitation example is now implemented and proven locally; see RETAIL-IMPLEMENTATION.md for actual Nuxt screenshots and fixture limits. The supplied flat originals remain untouched.

## Source and intended edit

Use the current leafy suburban family lifestyle references, including the updated-map-artwork front/back. The back’s existing letter mentions pizza, drinks and test drives. Promote that invitation into a compact visual panel immediately above the map, reduce excess heading/letter space, and retain the personal greeting and Luke’s sign-off. A warm early-evening hospitality image may be proposed for human review; do not represent an invented showroom as the actual dealership.

Suggested copy supplied in the discussion:

> COME CELEBRATE OUR NEW HOME  
> Launch night · Thursday 12 November  
> PIZZA • DRINKS • TEST DRIVES  
> Explore our new showroom and discover Subaru and XPENG.  
> Call (03) 9126 0251 to RSVP and confirm the time.

Keep the $500 voucher prominent and retain its exact eligibility/terms. Any reminder using “$500 off any new Subaru or XPENG.*” must agree with the approved copy fixture; the model must not simplify legal restrictions away.

## Invariants and acceptance

- Sale dates 11–14 November and Thursday launch night are distinct. Do not invent a start time or add “free” without approved source copy.
- Map, contact details, managed platform QR, voucher, legal terms and OEM assets remain intact. Do not regenerate the full poster just to edit this region.
- Propose a bounded layout/copy/image change with before/after composition preview and visible affected layers. Any shortening of body copy needs human approval; commercial facts and merge fields remain exact.
- Native text remains native and editable. Image lettering remains explicitly raster. The inserted QR retains its platform record, deterministic source and destination-management link.
- Apply is one undo operation; undo restores the original letter/layout/reference metadata, and save/reopen retains the approved result.
- A flattened source requires extraction and clean-background repair before safe replacement. Current native-layer editing is supporting infrastructure, not proof of automatic reconstruction of the supplied flat flyer.

## Updated reference evidence

Source directory: `/Users/paulgiurin/Documents/Projects/dashboard/output/eastern-subaru-mailout-20261026/updated-map-artwork`.

Its verification.json records both 2480×3508 sides decoding at 2480/1600/1200 widths to a direct Google Maps directions URL. Its export.cjs overlays a separately rendered QR SVG over the generated map panel. Those original files are preserved. A direct Maps code scans, but has no registered XeroFlow QR identity; future production replacement must use the client’s managed platform record. No live record or destination was invented in this implementation.
