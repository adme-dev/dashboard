# Banner Studio layer effects

Approved scope: an Effects inspector alongside Properties, Animation and Background, with a right-click entry on text and image layers.

## Editing workflow

Select an unlocked text or image layer and open Effects. Text looks include Clean, Neon, Embossed, Chrome and Flame colours. Filters support original, greyscale, vivid, brighter and soft focus. Apply effect updates the editable native layer; Restore original returns its exact prior style for the current editing session. Undo and project history remain available. Native effects are included in HTML export and stay separate from animation tracks.

For dimensional text, select the original text layer, enable **3D heading · keep my font**, adjust depth, direction, bevel, lighting and shadow, then choose **Apply effect**. The preview uses the original font and imported inline typography. The lettering remains editable on the same animated layer. Depth simulates extrusion; it is not a rotatable 3D mesh.

For AI texture, save the project first. Enter a material/lighting brief, optionally attach PNG/JPEG/WebP references or TXT/Markdown guides, and generate a preview. The configured model is Recraft V4.1 through the existing creative gateway. References contribute analysed descriptions and retained guide text to the prompt; they are not direct image conditioning. The model generates material without lettering. **Apply texture to text** clips the reviewed material through the original font, with transparency outside the glyphs. The layer's wording, case, spacing, geometry and motion are preserved. **Remove AI texture** restores the native fill while retaining depth and text. Shadows render behind the textured face rather than obscuring it.

Older raster effects remain available. Refining one defaults to the native texture workflow: the old image is hidden and the retained editable source receives the texture in one undo step. Both layers must be unlocked. Older clients can still use the legacy redraw API, whose result does not guarantee transparency or exact font matching. Flames extending outside the letters require separate transparent artwork; that decoration workflow is not implemented here.

Recipes can be saved for the project's client or the agency. Client ownership comes from the authorized saved project, never from browser-supplied ownership. Agency saves require agency-wide access. Reference manifests remain private and are resolved under their original project/client authority. Client references cannot be shared through an agency recipe.

## Reliability and validation

Selection, client, text, format and recipe changes invalidate late generation responses. Context changes abort pending reference/preset reads. Unsaved text, read-only users, foreign-client references, unsupported model IDs and unsafe CSS are rejected. Original imported typography and timeline data remain intact.

Migration `450_banner_effect_presets.sql` is additive and was applied to the configured database. Rollback can revert the source feature while retaining saved recipe rows.

Verification before release: 367 tests across 54 files covering banner runtime, TheBrief adapters, Effects concurrency, API authority and deployment guards. The full production build and 170 prerendered routes pass. New-file lint passes. Full repository lint and typecheck contain existing debt; introduced findings are checked separately and corrected. Existing QR Codes navigation and all eight live QR cards were verified in Safari before release. Deployment must use `pnpm deploy:check` and `pnpm deploy:production` with Node 24.18.0; capture the actual source, main and deployment IDs in the external release receipt.

## Brighton source animation audit

Project `952a6cac-b4f7-473a-8751-f9637ec26688` retains all 16 source layers: nine animated, seven static. The retained HTML declares a one-second loop despite effects extending to five seconds. The user-authorized six-second revision restores those delayed fades and finite pulse cycles; original and revised snapshots are retained. Regression `8494e8543` tests all nine tracks, both pulse cycles, backward seeking and looping. Safari confirms scheduled fades at 3.2s and the Shape22 bar fade at 5.2s. Static offer artwork remains visible as specified by the export.

Follow-up: add import diagnostics showing motion/static counts and effects beyond the source loop. A new export or source-editor comparison is necessary to establish whether the current TheBrief editor contains additional motion. Do not invent animation on source-static layers.

## Review failure recovery — 6 October

A generated Banner Studio asset must not be subjected to the separate approved-video-source requirement. The check now applies only when an actual video source was selected. Review reads current Pages primitive bindings rather than relying on build-time credentials, and uses Groq Qwen 3.8 27B (the documented successor to Qwen 3.6). Existing images remain held until an actual persisted review passes. Legacy text artwork additionally requires an explicit exact-text match; missing text evidence fails closed. Material textures retain the normal imagery review but do not ask a vision model to verify text that it did not generate. Retry verifies the asset’s persisted `font-texture` tag against the request mode; existing artwork cannot be relabelled as a texture to bypass wording review.

The preview distinguishes a visual rejection (with review observations) from an unavailable review service. An unavailable review offers Retry review, which inspects the existing asset and does not invoke image generation. Retry requires write access, an authorized saved project, matching saved text and a generated image belonging to the same client. Changes to selection, brief or ownership invalidate late results. Failures create content-free invocation evidence with the asset ID. Add artwork appears only for a successful review; the original text remains editable. A vision review may consume AI allowance.


## Artwork sizing and refinement — 6 October

The legacy redraw generator chooses landscape, portrait or square output from the saved text layer and asks for the original line layout on a flat background. The browser trims only a uniform border or transparency, retaining the full original image and storing a normalized crop. Textured backgrounds remain intact. Insertion uses the lettering’s natural aspect ratio at the selected layer’s width, centered over its former position and bounded by the canvas; it never squeezes a square into a shallow text slot. Properties can adjust placement afterward. This does not remove the artwork’s background or guarantee transparency. Canvas and both HTML builders use identical crop styling.

Adding artwork hides, but retains, the editable original text and inherits its motion. Adding/refitting and restoring text are single undo steps. Select an AI artwork layer in Effects to load its original recipe, revise the brief, save if needed, generate a reviewed preview, and Replace this artwork. Replacement updates the existing image rather than stacking another image and preserves its timeline. Fit artwork to text repairs placement of already-added effects without a new paid generation. Return to editable text hides the image and selects its retained source. Late image loads and changed source text cannot overwrite the new selection.


## Font and transparency regression evidence — 6 October

The focused suite passes 489 tests across 61 files, plus a real Chromium pixel test. Native-font texture clipping changes fewer than 1% of glyph-edge pixels compared with the original (background clipping antialiasing), with no rectangular fill; extrusion expands the visible glyph shape while exterior pixels stay fully transparent. Both export builders preserve typography, geometry and inline runs. Mounted-editor tests verify continued text editing and padded alignment. API tests cover client ownership, normal review, texture-tag review retries and rejection of mode relabelling. Concurrency tests cover locked sources and converting older raster artwork onto its retained text.

New-file lint passes. Full repository lint/typecheck still contain existing debt; changed-file diagnostics are checked separately. Release evidence belongs in the external receipt after the guarded deployment is verified.
