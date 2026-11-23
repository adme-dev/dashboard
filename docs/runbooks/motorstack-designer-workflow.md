# MotorStack images and offers for designers

Banner Studio detects an unambiguous OEM kit from the saved source, explicit kit tag, client default, campaign/client name or unique managed font identity. A manual kit choice remains available when branding is ambiguous. Only that brand’s MotorStack media/offers load on demand. Use an imported MotorStack brand kit in Banner Studio. The kit links the designer to that OEM's current source images and published national offers. [Connection, import history and release procedure](motorstack-brand-kits.md) remain in the main runbook.

## Create an offer set with AI

1. Open a saved Banner Studio project with the intended canvas sizes. The detected or selected OEM kit appears in **Create with AI → MotorStack offer set**; there is no all-brand media load. If detection is ambiguous, choose the correct kit once in Brand.
2. Open **Create with AI**. Only that kit's published, unexpired offers are requested. One clear model match, or a single available offer, is preselected. Otherwise choose **Current offer**. An offer with no end date remains explicitly marked for review.
3. Review the source artwork and expanded terms. Add any audience, tone or layout direction in Brief and context, then choose **Create offer set with AI**. **Brand → Offers → Create set with AI** opens this same panel with the offer selected.
4. The server resolves the saved project's client and kit access, re-fetches the selected offer and verifies its identity and end date. It retains that offer's actual artwork through the existing managed importer. This library save can remain if a later model request fails or the preview is discarded; no campaign canvas changes yet.
5. The native design assistant creates an editable preview for every active size using the chosen kit's fonts/logo and source headline, supporting copy, price, end date and full terms. AI arranges these layers and their animation. Server checks retain exact source copy, artwork and font identities, and reject added claims or missing source layers. Existing locked layers remain protected.
6. Inspect every preview format. Follow-up prompts refine composition while the server checks the same current offer again. This mode preserves source wording; use the ordinary manual editor for deliberate copy changes.
7. **Apply to canvas** checks that the offer is still current and unchanged, then applies the set as one undoable edit. If the source has changed, use **Refresh offers** and generate again. Save and reload to verify persistence. The saved source kit/offer identity helps detect the correct brand on reopening, including generically named projects.
8. Review cropping, typography, legal text fit and dates across all output sizes before export. Full source terms are retained; small formats and long conditions still need a designer's fit review. Creating or applying a set does not publish it.

## Dealer templates and canvas zoom

For a Full HD brief, use **Sets → Add Size → Custom sizes → Full HD landscape (1920×1080)** in the existing project, then remove formats the brief no longer requires. Match the vehicle's entrance to the direction its front faces; do not mirror OEM photography. Keep offer text, CTA and terms visible through the full reading hold and test a second playback cycle, including the end frame.

Use the normal three-size set unless the brief specifies otherwise: **MRec 300×250, square 1080×1080 and story 1080×1920**. In the multi-canvas workspace, hold **Option/Alt and scroll** to zoom toward the pointer. Trackpad pinch / Ctrl or Command + scroll also zoom; ordinary scrolling pans. The toolbar's Zoom in, Zoom out, 100% and Fit controls remain available. Zoom changes the view, not artwork dimensions or saved layers.

In **Templates**, enter an optional **Dealer name**, choose the OEM kit, then **Hero + CTA** or **Two CTAs**. Native templates use separate logo/dealer, headline, vehicle, supporting copy and CTA regions, with a restrained vehicle slide-in and CTA reveal. Automatic image selection excludes promotional sale/deal graphics and prefers the campaign's matching model. Review the selected grade and paint before reuse; source metadata alone does not establish dealer-specific stock or offer eligibility.

Save a finished set through **Actions → Save as template**, naming it **OEM / Actual dealer — Purpose**; for example, `Ford / Courtney & Patterson Ford — Sales`. It appears in the [Banner Studio template gallery](https://app.xeroflow.io/agency/banner-studio/templates), under Saved templates. A QA project does not automatically become a saved template. Check every size and settled/entrance animation frame before saving the master. Refresh offers through the source-checked AI flow rather than reusing a previous month's price or conditions unchanged.

This extends the existing [native AI design workflow](../guides/banner-studio-ai-workflow.md), rather than generating flattened raster banners or executable HTML. Generation uses the existing configured model assignment and its fallback.

Explicit availability periods in supplied terms are checked against the structured end date. A contradiction remains visible in Brand → Offers with a source-review warning, and is excluded from AI generation. The server checks again before preparing artwork or calling AI. This is a deterministic check of supplied data, not an automated OEM website comparison; a designer must still verify the official offer.

### OEM source check — 23 November 2026

MotorStack's Forester accessory and crossbar offers supplied `2027-01-01` as the end date while their terms stated `2026-12-31`. The [official Forester offer](https://www.subaru.com.au/special-offers/forester-accessory-special-offer) also ends on 31 December. AI generation is blocked for these contradictory entries rather than silently changing the source date.

The [official Outback accessory offer](https://www.subaru.com.au/special-offers/outback-accessory-special-offer) matches MotorStack: $850 including GST and standard fitting, MY2026 Outback eligibility, participating retailers, and a 31 December 2026 end date. Use this offer and its supplied artwork for the pending live AI acceptance check. The website check was read-only; no enquiry was submitted.

## Proposed automatic brand templates — recurring-work evidence

The user requested brand templates based on the monthly work in monday.com. Read-only review on 23 November covered all 134 Creative Request items and a sample of the 500 most recently created items on Approved To Be Billed (May–November 2026). Of that sample, 127 titles matched banner/display/PMax/OEM-creative/template keywords; this is a discovery sample, not an exhaustive count of monthly banner jobs.

TheBrief's live template library offers reusable multi-size design sets and a Customized category. XeroFlow already has native saved sets (`Actions → Save as template`) and `buildBrandTemplateLayers`; reuse those foundations. The following automation is proposed and is **not implemented or scheduled by this release**:

1. Generate a draft master set from each MotorStack brand kit, with named hero, headline, price, CTA and legal roles. Keep fonts, logo variants, safe areas and animation rules in the brand template; review it once before marking it approved.
2. Store dealer/destination profiles separately: desktop/mobile dimensions, landing-page links, dealer identity and approval requirements. A brand alone cannot determine website dimensions. Multi-franchise group artwork needs an explicit group template rather than guessing one OEM.
3. Populate approved templates from verified current MotorStack and official OEM offer evidence. Preserve exact commercial facts and asset identity; let AI arrange content within template constraints. Missing eligibility, conflicting dates, missing mobile profiles or unverified links require review.
4. On a monthly run or source change, create one draft package per dealer, offer revision, template revision and destination profile. Use that identity to avoid duplicates on retries. Preserve the last approved version and designer changes; changed facts create a new review revision.
5. Produce a review package showing source links, checked time, offer changes, expiry, every output size and destination. Record a named owner and client/OEM sign-off. Publishing and website replacement remain explicit delivery steps; expiry should flag or retire only assets owned by that automation.

Evidence behind the proposed families:

| Reusable family | Observed work |
| --- | --- |
| Monthly OEM offers, desktop/mobile + group variants | [Big Garage monthly resize](https://adme2.monday.com/boards/3199166934/pulses/11055898325) explicitly requires monthly dealer and group website banners. Its January brief specifies Subaru 1600×625 / 562×742; Nissan 1500×612 / 566×1127; Suzuki 1600×1122 / 566×610; Volkswagen 1600×780 / 2200×1072; LDV 1600×600 / 600×450; group 2000×1334 / 480×469. These are historical site profiles to confirm before reuse, not universal OEM sizes. |
| Offer variants within one campaign | [Courtney & Patterson Ford monthly offers](https://adme2.monday.com/boards/3199166934/pulses/11802891251) requested six offer sets, official Ford assets, 1440×870 desktop / 566×884 mobile and separate links. [Knox GWM seven offers](https://adme2.monday.com/boards/3199166934/pulses/11907986655) includes a later finance-expiry correction, supporting revision-based checks. |
| Website banner + social tile | [Big Garage LDV loyalty offer](https://adme2.monday.com/boards/3199166934/pulses/13541366538) contains separate questions about the mobile variant, expiry, link and which asset to deliver. The package should carry these fields together. |
| Dealer update and customer review designs | [Blood Hyundai templates](https://adme2.monday.com/boards/3199166934/pulses/13331455318) and [Frankston Forthing templates](https://adme2.monday.com/boards/3199166934/pulses/13500734056) explicitly request separate update/review masters. These use approved supplied content rather than inventing testimonials or treating everything as an OEM offer. |

The [Web Banner brief](https://adme2.monday.com/boards/1655369777/pulses/4881392251) already identifies headings, CTA, OEM approval/style, destination dimensions, campaign dates and button URL. The [PMax brief](https://adme2.monday.com/boards/1655369777/pulses/8950371011) adds channel-specific size/count requirements. Map these stable inputs into template population instead of inferring them from job titles. No monday.com item, website or delivery recipient was changed during this discovery.

## Pick the right vehicle image

1. Open a design, then **Insert → Vehicle images**, or **Brand → Variants**. Check the selected brand kit.
2. Choose a **Model** to load its available vehicle images. All models initially shows model heroes and other brand artwork; it is not the complete colour gallery.
3. Choose **Variant / grade**, then **Paint colour**. Grades come from the labels attached to source images, so this is an image selector rather than a complete specification or pricing catalogue. A shared paint colour does not imply that different grades have the same appearance. If a grade has no labelled image, it cannot appear in this selector.
4. Search further by model, grade, colour or image name. Use **All grades** and **All colours** to widen the results. **Other images** contains media without a paint label.
5. Use **Open large image browser** for larger previews. The selected model, grade and paint colour carry across. Changing grade resets the paint selection and shows only colours available for that grade.
6. Click the chosen image to add it to every canvas size. This action places linked image layers on the corresponding slide across layouts, including when Single edit is selected. One Undo restores the previous design. Review the image on every size before saving or exporting.

Dragging an image onto a canvas follows the editor's Single edit / All layouts scope and places it at the drop point. This differs from the explicitly labelled click action that adds it to all layouts.

Previews load in batches. Use **Show more images** or **Show more media** for remaining loaded results. A source warning can indicate incomplete coverage; a filter cannot recover an image absent from the source.

## Save an image to the library without placing it

In the editor, **Insert → MotorStack media** and **Assets → Browse MotorStack** open the detected brand inline in Brand → Variants. Choose the model, grade and paint colour there; the larger browser is optional. Other asset-selection contexts can still use the library-only picker, which preloads a known brand without requesting all brands. In the library-only picker, **Add to library** saves a managed image and refreshes the Assets panel. It does not place a layer. Select or drag that saved image separately when ready.

Re-importing the same source image with unchanged bytes under the same account reuses the saved item. Changed source bytes create a fresh asset. The importer does not assign an image to a dealership. PDFs appear under Documents or All media and have **Download PDF** rather than an image import action. Documents remain visible in All media when image grade/paint filters are selected.

If an import fails, use its visible retry action. A missing preview does not necessarily mean the image cannot import. The larger browser also offers **Retry preview**. Closing and reopening reloads the current selection; switching brands clears the old search.

## Find and insert an offer

1. Open **Insert → Offer artwork**, or **Brand → Offers** for the selected MotorStack kit.
2. Choose **Offer model** and optionally **Search offers**. Search includes the title, model, variant, offer text and displayed price. Results retain the matching offer's own artwork and full supplied terms.
3. Review the headline, model/variant, end date, price and expanded **Terms and conditions**. These are national source offers; confirm suitability for the dealership and campaign.
4. Choose **Add offer and artwork to all layouts**, or **Add offer text to all layouts** when there is no source artwork. This creates editable headline, supporting copy, separate price when applicable, supplied terms and artwork layers across sizes in one undoable action.
5. If artwork import fails, an inline error remains. Retry the full action, or explicitly choose **Add offer text without artwork**. A failed artwork import never silently adds a partial offer. Text-only insertion retains supplied terms and the end date.
6. Check all layouts for text overflow, legal text fit, artwork choice and dates; save, reload, then verify before export. Source updates do not automatically rewrite placed layers.

## Repeatable acceptance checks

Use an approved QA project with two or more sizes, preserving existing client artwork. Record the source revision and deployment under test. Test success and failure separately.

| Workflow | Expected result |
| --- | --- |
| AI source selection | Only the detected OEM is requested; no all-brand media fetch |
| AI offer generation | Retains the correct source asset, returns editable layouts for every active size, preserves exact source facts |
| Source changes before Apply | No canvas edit; refresh offers and generate again |
| Reload a generic AI-created campaign | Saved source kit restores the correct OEM |
| Browse images and offers | No import request or canvas edit just from browsing/filtering |
| Two grades with the same paint | Grade selection excludes the other grade's images |
| Open the large browser | Same model, grade and colour; matching image remains visible |
| Image insertion in Single edit | Click action adds linked layers across all sizes; one Undo removes the insertion |
| Library-only import | Saved asset appears after reload; campaign layers remain intact |
| Import the same source twice | One saved item for the same owner/source/content |
| Brochure download | Actual PDF; no image-layer or image-library import |
| Offer model/search | Correct offer, artwork, price, end date and full terms stay together |
| Offer artwork failure | No partial canvas edit; visible error, full retry and explicit text-only recovery |
| Change kit during a pending request | Old catalogue/import cannot place assets into the newly selected kit |
| Save/reload/export | Imported images and editable offer layers persist; review every output size |

Local automated checks:

```sh
pnpm exec vitest run test/banner/motorStackColours.test.ts test/components/bannerMotorStackMediaPicker.test.ts test/components/bannerBrandVariantImages.test.ts test/components/bannerBrandOfferArtwork.test.ts test/banner/motorStackAllLayouts.test.ts test/banner/motorStackOfferAllLayouts.test.ts test/server/utils/bannerMotorstackMedia.test.ts test/server/api/bannerMotorstackCreativeCatalog.test.ts test/components/bannerDesignAssistant.test.ts test/server/api/bannerDesignAssist.test.ts test/server/api/bannerMotorstackOfferPrepare.test.ts test/server/utils/bannerMotorstackDesign.test.ts test/banner/brandDetection.test.ts
```

## Review evidence — 23 November 2026

Candidate started from freshly fetched `origin/main` at `c45ea908a` in `fix/motorstack-designer-imports`, then rebased cleanly onto freshly fetched `c5ad05416` before review. Previous dated release receipts in the main runbook are historical evidence; they do not establish that this candidate is deployed.

Live read-only inspection used the existing Leapmotor C10 Hybrid EV MRec. Insert → Vehicle images loaded 14 all-model images. Selecting C10 loaded three images, including the source-labelled `C10 · Leapmotor C10 Design LR · Light White`; the paint selector offered Light White and Other images. The larger browser retained the C10/Light White selection. Seven Leapmotor offer cards loaded with hero artwork and dates, and the first full terms accordion expanded. No client canvas asset was inserted or saved as part of this read-only check. Creating a separate live QA project was rejected by automatic approval review because durable project creation was not explicitly authorized. The user subsequently authorized a separate QA project; current-production import/save/reload evidence is recorded below. The candidate AI route still requires release before live acceptance.

The candidate adds detected-brand inline browsing, grade selection, grade/paint handoff, offer filtering, explicit artwork-error recovery, and current-offer native AI sets. Local component and transaction tests exercise these paths with fixtures; fixture checks are not new production import evidence.


Verification limits: the final focused local run passed **162 tests across 15 files**, including keyboard shortcuts, source freshness, brand restoration, source artwork ownership, terms preservation and dark-brand contrast. Fixture-backed browser checks exercised the actual Nuxt UI grade/paint controls, selection handoff, local image insertion and explicit offer-text recovery. A later AI-panel browser pass could not start because browser focus timed out and native computer-use permission was unavailable. A real provider smoke check stopped before dispatch because the local environment has no Groq credential configured. No provider success, deployed candidate or full build is claimed. The later current-production image import is recorded below. ESLint reports no diagnostics on added or changed lines; 177 findings remain on untouched lines in the inspected files. A scoped server type-check attempt reported existing shared/dependency diagnostics and no diagnostics in the changed server paths; it is not a clean repository type-check. The local checks used the installed dependency directory; a frozen-lockfile CI/build remains required before release.


## Authorized live QA draft — 23 November 2026

The user explicitly approved creating a separate **MotorStack QA** draft with MRec, square and story sizes. [Open the saved QA draft](https://app.xeroflow.io/agency/banner-studio/a7e13a8b-095f-45fb-a227-6d5a64070412).

- Unassigned project, named `MotorStack QA`; no client campaign was changed and no Publish action was used.
- Sizes: MRec **300×250** (`mrec`), Square Feed **1080×1080** (`fb_sq`), Story / Reel **1080×1920** (`ig_story`). Size creation used ordinary resize rather than an AI resize request.
- Selected the Subaru kit for this import check. Forester loaded **143 images**; Crystal White Pearl narrowed the catalogue to **23 images** across grades. This is current-production behaviour, before the candidate's separate grade control is deployed.
- Imported `Forester · Subaru Forester AWD Hybrid · Crystal White Pearl · photos 2` using **Add to all layouts**. The actual image loaded in all three canvases at **3360×1680** natural dimensions.
- Removed the starter template's demo CTA, headline, supporting copy, dealer and accent-bar layers from each QA layout. Retained the imported image and background.
- Saved the project, fully reloaded the editor, and verified all three image elements still loaded at **3360×1680**, with all three requested sizes present and `Saved` visible.
- Screenshot: local workspace `output/motorstack-review/motorstack-qa-live.jpg`. The draft is retained and its editor tab is a deliverable.

This closes live image import and save/reload coverage in the existing production app. It does **not** establish deployment of PR #979, new grade selection, source-metadata brand restoration, current-offer AI generation, offer-copy preservation through a real provider, or export/render parity. Those candidate checks remain pending release and authenticated acceptance on this QA draft. The project is ready for that continuation.

## PR #979 production release and live continuation

PR #979 was squash-merged as `94108102f72f183d7a45cdd4dd74e8b6c88e9189` and deployed through `pnpm deploy:check` then `pnpm deploy:production` to **agency-dashboard**, production/main. Deployment: `b0a18115-e35b-402f-9b66-fbbea41bc8bc` ([immutable deployment](https://b0a18115.agency-dashboard-6cm.pages.dev)). The source tree matched tested candidate `489baf61e7887c961656d6d90afb31d2c83e60d6` exactly. [Required CI run](https://github.com/adme-dev/dashboard/actions/runs/45111594142) passed the production build, 24,377 full-suite tests plus 70 isolated tests, 930 social regressions, real media rendering and deployment guards. A fresh frozen-lock local install passed 193 focused tests across 17 files.

Supplemental full-application typecheck still fails: 1,194 diagnostics versus 1,186 in the prior recorded main run. None is on a changed line. The eight additional diagnostics affect four files that are identical to current main; the eight diagnostics within modified component paths are unchanged existing handlers. This is not a clean repository typecheck, and no approval or authorization guard was bypassed.

The live QA draft was temporarily named `MotorStack QA — Subaru Outback`. After a full reload, Brand selected **Subaru Australia** automatically. Create with AI loaded Subaru offers and showed the source-review warning; the contradictory Forester offer was excluded. The real configured `groq/openai/gpt-oss-120b` model returned an editable three-size Outback accessory set using the actual **750×500** offer artwork, managed Subaru logo/fonts, exact $850 title and full terms ending **2026-12-31**. The original canvas remained unchanged until Apply. Initial output needed legal-text/spacing refinement; a focused MRec follow-up succeeded after a larger refinement request failed without changing the existing preview or canvas. Automatic generation is a draft, not proof of final typography or legal-text fit.

Live checks found two follow-up repairs: the crossbar availability wording includes a participating dealer before `between`, which the first date parser missed; and a one-cycle proposal preview became blank when playback ended. The bounded parser now recognises that explicit availability clause without crossing sentence boundaries. The isolated review iframe loops while proposed/saved/exported playback metadata remains unchanged. Both have regression coverage and require deployment and final live recheck. The QA project remains unpublished.

## Ford continuation and three-size correction

The separate [Ford QA draft](https://app.xeroflow.io/agency/banner-studio/8ac57e29-709d-449d-b72d-c85416a253c0) initially exercised the eight-layout Full Campaign preset. The user then explicitly requested the normal **three** sizes; the extra five were removed and the draft saved with `mrec`, `fb_sq` and `ig_story`. It remains unassigned and unpublished. Ford Australia was detected automatically from its project name. The actual dealer chosen for the sample template is Courtney & Patterson Ford; its [official site](https://courtneyandpattersonford.com.au/) confirms the Ford dealership in Alphington.

The live Ford AI catalogue returned 502. The source includes a 16,809-character fuel-card disclaimer, beyond the previous 12,000-character catalogue boundary. The bounded limit is now 24,000; regression tests preserve the entire source, retain other shorter offers and reject oversized responses. Native terms fields retain their 9,000-character per-layer limit through separate complete chunks. This is source retention, not proof that long legal copy fits every banner.

PR #980 merged as `aac707708ef8d9abaaa0cf34aa574a7307f12d13`, with required CI passing 24,380 full-suite tests and 930 social regressions. Guarded Pages deployment `b45d8e89-d1ad-429d-ba0c-10a7d0d02d51` targets `agency-dashboard/main`. Live retry still returned 502: the private Creative Worker independently retains its earlier 12,000-character boundary. The new `creative-offer-terms-release` candidate aligns that boundary and preserves the promoted six-editor gateway and all five bindings; it still requires reviewed release and live acceptance.

Ford's full model photo response is explicitly truncated by MotorStack at 200,000 characters. The smaller same-model response with photos disabled is complete and includes grade/paint heroes. The Worker candidate recovers that smaller response when the full gallery fails, with a visible extra-gallery warning. No missing gallery image is fabricated.

The first Ford brand-template base selected a Black Friday promotional graphic and placed copy/CTA over its image region. The user supplied a screenshot identifying this failure. The template selector now excludes promotional graphics, prefers matching vehicle models, and the generator separates image/text/CTA regions with overlap regression coverage. The live corrected MRec uses the actual Wolftrak vehicle photograph and a locked `Courtney & Patterson Ford` dealer label; square and story refinements and saved-template acceptance remain in progress. These are unpriced sales masters, separate from current-offer catalogue acceptance.

The selected test offer is Ranger Wolftrak $73K driveaway, checked against [Ford's current offers](https://www.ford.com.au/latest-offers/) and MotorStack. Both identify MY26.5 and participating dealers, with stock/customer restrictions. No fixed end date is supplied, so none should be invented. Other feed entries contain model or model-year mismatches and were not selected. Real eight-format AI generation, visual fit and persistence remain pending the follow-up release.
