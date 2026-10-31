# MotorStack OEM brand kits

Banner Studio → Brand Kits → Import from MotorStack lists the brands available through the existing Creative Suite connection. Import all creates shared OEM kits, one brand at a time. It does not assign dealerships, change client defaults or apply anything to existing designs.

The importer stores available font files, exact declared font weights, logo variants and colours in managed Banner Studio assets. Heading/body roles remain heading/body; MotorStack's medium role becomes an extra font role. The source role, filename and weight remain in the kit's source notes. Main logos precede dark variants and favicons. The kit contains source metadata, not an inferred OEM style guide.

Missing source font files remain explicit warnings. A supplied file that cannot be downloaded or validated fails that brand before a kit is saved; use Retry after resolving the error. Stop after current waits for the current response. Reloading or retrying recognizes an existing shared kit by its exact MotorStack source identifier and retains user edits. An uncertain transaction result never triggers deletion of possibly committed assets.

## Connection and boundaries

- Production Pages binding: `MOTORSTACK_BRAND_ASSETS` → `xeroflow-creative-tools`, named entrypoint `MotorstackBrandAssets`. Preview has no production binding.
- Provider credentials stay on the Creative Suite Worker. No key is copied into Pages, the browser, source notes or asset URLs.
- Pages GET/POST `/api/agency/banner-studio/brand-kits/motorstack` require CREATIVE permission and shared-kit write access.
- The deployed Worker RPC exposes only `listBrands`, `getBrandKit`, `getBrandAsset`, `listMedia`, and `getMediaAsset`; the candidate below adds the bounded read-only `listCreativeCatalog` for variants and offers. Each binary request resolves an opaque asset ID within that brand's current authorized catalogue. No caller URL or arbitrary provider tool is accepted.
- Fonts: 5 MiB per file, validated WOFF2/WOFF/TTF/OTF containers. Logos: 2 MiB per file, static SVG/raster or validated ICO. Each brand is bounded to 40 MiB and native kit limits (8 font roles, 12 logos, 24 colours).
- Each brand uses a transaction advisory lock and a second source check. Font reuse requires shared scope plus matching family, declared weight and checksum. Source identity is `https://oem-variants.pages.dev/api/mcp#brand=<id>`; it is API provenance, not a public brand homepage.

Release the narrow current-source Creative Worker first, following [its guarded release procedure](../../workers/creative-motorstack-brand-release/README.md). Then release current main to `agency-dashboard` using `pnpm deploy:check` and `pnpm deploy:production`. Verify the authenticated catalog, imports, persisted font faces, logo variants and QR navigation. Record both source and deployment identifiers.

## Source inventory — 31 October 2026

All 32 authorized brands returned metadata. There are 114 logo-role mappings and 88 font-role entries; 84 font-role entries have downloadable file mappings, with repeated roles sometimes sharing one file. These metadata counts are not binary-download or saved-kit evidence.

Source gaps: Honda and MG have no font metadata. Foton heading/body fonts, LDV body and Leapmotor body have no downloadable file. No substitute face is assigned. All 32 brands have colours and logos in the source catalog.

Local browser verification exercised 32 fixture rows, stop/resume, a failed-brand retry, an existing-kit response and a skipped-brand response. Fixture outcomes are not production import counts.

## Live release verification — 31 October 2026

- Pages source/current main: `da1a597f517b0bd80b59a4c0c29f748bdd5551e8`; production `agency-dashboard/main` deployment `44cb6cb8-b579-47ca-9a24-02379bcdbe42`. Guarded build passed; raw Worker size 25,416,630 / 25,468,928 bytes.
- Creative Worker version `5ed78b26-e678-48c2-9617-bef4304dd199`, deployment `3219f175-ee7d-41f8-b3e9-520c2ec0b3d2` at 100%. Uploaded from `7712494e04ae7506bf214ed38713f694b1527122`, released from current main `da1a597f517b0bd80b59a4c0c29f748bdd5551e8`; candidate module hashes were unchanged between those commits.
- All 35 public Creative Suite checks matched the baseline. Authenticated PhotoFlow and VectorFlow rendered; EffectFlow rendered after reloading a browser GPU-device-loss message. These checks do not establish complete editor functionality.
- Website extraction now reads the GWM homepage and opens a review draft with detected fonts, colours and logo. Font files were not downloaded and the draft was not saved. Detected website colours still require review; they are not an authoritative OEM palette.
- The deployed Pages service binding was verified through the authenticated Wrangler CLI: `xeroflow-creative-tools` / `MotorstackBrandAssets`. Wrangler 4.110's generated TOML omits the entrypoint; its underlying project response retains it.
- Initial production catalog request failed with `motorstack_unavailable`. No OEM kits were created in that attempt. Provider-side tail observed no `/api/mcp` request for the failed private RPC, while reloading the existing authenticated HTTP catalog produced two successful provider requests. Diagnose the private call before claiming import completion.
- Private diagnostics identified an immediate HTTP 522 from outbound provider fetches. Configuration-only Worker version `02026280-47fc-4dbc-93c3-3f2b546e47ce`, source `4794ae06d07d25ac68e840d2f5339cd109e95104`, enabled `global_fetch_strictly_public` with identical Worker modules, assets and bindings. Live RPC then returned HTTP 200 and the authenticated importer displayed all 32 brands. The all-brand batch was started; catalog success alone is not saved-kit evidence.
- The actual Alfa Romeo on-dark logo is an SVG with a static pattern referencing an embedded PNG. The logo validator now accepts bounded, signature-validated base64 raster images on SVG image elements and static pattern geometry. External references, active elements, embedded SVG/HTML, malformed data and data on use/CSS remain rejected. The original Alfa Romeo and GWM source logos passed validation.

## Media library and source file compatibility

Banner Studio → Assets → MotorStack media browses the same existing server-side connection by brand and model. Images are retained on explicit Add to library; PDF brochures are download-only. Saved images use managed signed delivery and are reused for the same importing user, source asset and content hash. No client is inferred and adding to the library does not change the canvas. CREATIVE access gates reads; writes also require write access. Files are rebound to current source membership and byte-validated; no caller URL or API key reaches the browser.

The first live OEM batch saved 14 kits and held 18 on source file validation. GWM's two actual Helvetica font files, logo variants, colours and source notes were verified in the saved kit. Compatibility fixes retain static SVG class paints, embedded raster logos and local clips while stripping only recognized nonrendering editor metadata; external references and active content remain rejected. Font filename/container mismatches are normalized only after structural validation, preserving family, declared weight and original source notes. Nine Honda/Hyundai/GMSV/MG SVG fixtures retain their rendered geometry/paints.

TheBrief XPENG reference `/team/6422/brand-kit/2200601/overview` was inspected directly on 31 October. It includes typography roles, assets, visual style, buttons, voice/tone and components. These richer structures and the screenshot's brand folders are reference requirements, not claims of completed XeroFlow feature parity. TheBrief campaign fonts remain separate from MotorStack OEM defaults.

### Live media release and final source cases

PR 770 merged as `fbfec1f02d872d4a2869b8bff20fa04d496ce662`. Creative Worker version `0bc6f95e-8a0c-49a1-8f6c-ebc3dd7b3e3e`, deployment `82181c14-6dd6-4454-8714-b0352f486ba1`, retains all assets/runtime/bindings; all 35 public regressions match. Existing PhotoFlow/VectorFlow and their 32-brand picker load. Pages production `a65f650b-8a8b-4519-94bc-dd24c1f68a39` on `agency-dashboard/main` passed source/target/size guards (39,317 raw worker bytes remaining).

Live Banner Studio GWM/H7 shows 18 images plus its brochure. An actual 2048×2048 PNG was imported, delivered through a managed signed asset URL, and retained after reload. Its PDF brochure downloaded successfully through the authenticated Pages route; QR Codes navigation and existing records loaded. This test added media to the library, not to the campaign canvas.

The second kit batch imported 12 more and retained 14 existing kits: 26 of 32 saved. Remaining source failures were Leapmotor/Nissan static mask mode, Mazda Unicode local gradient references, RAM/Toyota accessible title labels and Volkswagen integer RGB paint. All downloaded source logo fixtures now validate after narrowly supporting those constructs; active CSS, remote references and arbitrary functions remain rejected. Fixed public import reason codes now identify supported error categories without disclosing provider/DB error text. The final production retry is recorded below.

### Final production validation — 31 October 2026

Pages source `c656dc1df4f9584c0f539afeffa0631b9da346a7` was current `origin/main` at release. Guarded production deployment `d013cc58-6b18-40a5-b6d1-e4d01738312d` targets `agency-dashboard/main`. CLI deployment readback confirms source `c656dc1`. Raw Worker size is 25,432,953 / 25,468,928 bytes (35,975 remaining). The Creative Worker remains on the verified media version recorded above. The final SVG/import-error changes passed 164 focused tests plus lint and diff review before merging.

The H7 image was also re-imported from the all-model search: it reused the same managed asset URL and left one library item. Reload retained that item. Its brochure was verified as an actual PDF 1.5 file. Existing GWM campaign playback progressed on its 10-second timeline and paused normally; no campaign canvas edit was made. QR Codes loaded again after the final release. These are scoped production checks, not a claim that every animation or audio track in all TheBrief imports has been compared.

A direct unauthenticated HTTP probe was rejected by Cloudflare with 403/1010 before reaching the application. That result is transport evidence, not independent proof of application authorization. Route permission guards were reviewed and authenticated browser reads/imports/downloads were tested.

Local evidence: `/private/tmp/motorstack-final-pages-deployments.json`, `/private/tmp/motorstack-media-persistence.json`, `/private/tmp/motorstack-media-production-import.png`, `/private/tmp/gwm-media-library-saved.png`. The original recents-import worktree remains because it supplies the shared node_modules dependency; unrelated dirty work and other active worktrees are preserved.

The final authenticated batch completed **32/32 processed: 6 imported, 26 already saved, 0 skipped, 0 failed**. All 32 MotorStack OEM kits are persisted; the library shows 34 kits including the two pre-existing DriveAgent kits. The six new kits contain 14 font files and 29 logo-role entries in total, with 3 colours each. All six library logo previews report loaded images with nonzero natural dimensions. Source font gaps remain explicit for Honda, MG, Foton, LDV and Leapmotor; no replacement was inferred. Evidence: `/private/tmp/motorstack-final-live-batch.txt`, `/private/tmp/motorstack-all-32-imported.png`, `/private/tmp/motorstack-saved-library.png`.

## Editor variants and offers candidate — 31 October 2026

The Brand Kit sidebar adds Variants and Offers controls for kits with the exact imported MotorStack source identifier. The Pages read route requires CREATIVE permission and access to the saved kit, then calls the fixed brand and catalogue kind through the private Worker binding. Variants show published model/grade, source price and colours. Offers show published national copy, end date and full disclaimer. They are read-only references; artwork is not updated when the source changes, and the separate media library remains the path for adding vehicle imagery. Never describe these national offers as dealer-specific pricing.

The Worker change adds `get_offers` to its fixed provider tool allowlist and a `listCreativeCatalog({ brandId, kind })` method. It checks current brand membership and returns bounded text/numbers/colour metadata without source URLs, key or binary media. Pages verifies the brand matches the selected kit before returning data. The Worker and Pages changes must be released together, Worker first. Live Wrangler readback on 31 October showed version `03af3c3f-c768-485e-8e70-641bca8b30dc` active at 100% in deployment `0f8ba53b-1ff1-4579-aa18-e3bedc1c54d3`, with five existing RPC methods, the expected runtime/asset settings and inherited binding types. `source/creative-catalog-candidate.json` pins the reviewed candidate hashes against that observed parent; recheck active/latest immediately before upload. No upload, activation or production Pages deployment is recorded for this candidate yet.
