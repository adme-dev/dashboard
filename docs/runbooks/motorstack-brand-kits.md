# MotorStack OEM brand kits

Banner Studio → Brand Kits → Import from MotorStack lists the brands available through the existing Creative Suite connection. Import all creates shared OEM kits, one brand at a time. It does not assign dealerships, change client defaults or apply anything to existing designs.

The importer stores available font files, exact declared font weights, logo variants and colours in managed Banner Studio assets. Heading/body roles remain heading/body; MotorStack's medium role becomes an extra font role. The source role, filename and weight remain in the kit's source notes. Main logos precede dark variants and favicons. The kit contains source metadata, not an inferred OEM style guide.

Missing source font files remain explicit warnings. A supplied file that cannot be downloaded or validated fails that brand before a kit is saved; use Retry after resolving the error. Stop after current waits for the current response. Reloading or retrying recognizes an existing shared kit by its exact MotorStack source identifier and retains user edits. An uncertain transaction result never triggers deletion of possibly committed assets.

## Connection and boundaries

- Production Pages binding: `MOTORSTACK_BRAND_ASSETS` → `xeroflow-creative-tools`, named entrypoint `MotorstackBrandAssets`. Preview has no production binding.
- Provider credentials stay on the Creative Suite Worker. No key is copied into Pages, the browser, source notes or asset URLs.
- Pages GET/POST `/api/agency/banner-studio/brand-kits/motorstack` require CREATIVE permission and shared-kit write access.
- Worker RPC exposes only `listBrands`, `getBrandKit`, `getBrandAsset`. Each binary request resolves an opaque asset ID within that brand's current authorized catalogue. No caller URL or arbitrary provider tool is accepted.
- Fonts: 5 MiB per file, validated WOFF2/WOFF/TTF/OTF containers. Logos: 2 MiB per file, static SVG/raster or validated ICO. Each brand is bounded to 40 MiB and native kit limits (8 font roles, 12 logos, 24 colours).
- Each brand uses a transaction advisory lock and a second source check. Font reuse requires shared scope plus matching family, declared weight and checksum. Source identity is `https://oem-variants.pages.dev/api/mcp#brand=<id>`; it is API provenance, not a public brand homepage.

Release the narrow current-source Creative Worker first, following [its guarded release procedure](../../workers/creative-motorstack-brand-release/README.md). Then release current main to `agency-dashboard` using `pnpm deploy:check` and `pnpm deploy:production`. Verify the authenticated catalog, imports, persisted font faces, logo variants and QR navigation. Record both source and deployment identifiers.

## Source inventory — 31 October 2026

All 32 authorized brands returned metadata. There are 114 logo-role mappings and 88 font-role entries; 84 font-role entries have downloadable file mappings, with repeated roles sometimes sharing one file. These metadata counts are not binary-download or saved-kit evidence.

Source gaps: Honda and MG have no font metadata. Foton heading/body fonts, LDV body and Leapmotor body have no downloadable file. No substitute face is assigned. All 32 brands have colours and logos in the source catalog.

Local browser verification exercised 32 fixture rows, stop/resume, a failed-brand retry, an existing-kit response and a skipped-brand response. Fixture outcomes are not production import counts.
