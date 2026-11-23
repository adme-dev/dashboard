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

This extends the existing [native AI design workflow](../guides/banner-studio-ai-workflow.md), rather than generating flattened raster banners or executable HTML. Generation uses the existing configured model assignment and its fallback.

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
