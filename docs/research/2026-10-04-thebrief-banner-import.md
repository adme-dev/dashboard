# The Brief → XeroFlow Banner Studio import research

Date: 4 October 2026. Status: research proposal, not an implemented importer.

Scope: official public documentation and read-only inspection of XeroFlow at commit `43138a165`, with concurrent zoom/social work present. No customer export was available, no authenticated The Brief account was accessed, and no product code was changed by this research.

## Recommendation

Build **Import HTML5 ZIP** into the existing custom-template workflow first. Preserve the supplied animation, dimensions and assets; then let an operator expose selected text, images, colours and destination URLs as reusable fields. Keep native Banner Studio layer conversion as a separate, explicitly limited feature.

This is a feasible implementation direction, not a verified compatibility claim for the user's actual exports. A published HTML5 ad is executable output, not necessarily the editable project that generated it. MP4, GIF and raster images cannot supply the original layer hierarchy or animation timeline. Arbitrary HTML/CSS/JavaScript likewise cannot be assumed to map losslessly into native layers.

| Workflow | Result | Editing/reuse boundary |
| --- | --- | --- |
| Import original HTML5 ZIP | Preserve browser animation and interactions where dependencies are supported | Duplicate, organise, export and edit approved fields; native layers are not automatic |
| Convert supported HTML elements | New XeroFlow native project | Selected text/images/shapes and supported keyframes; conversion report and visual review required |
| Import PNG/JPG/WebP/GIF | Image-backed banner | Existing upload route makes a background layer; original elements remain flattened |
| Import MP4 | Video asset | Rendered animation retained; original text, objects and timing are not editable |
| The Brief API connector | Change named source elements and request fresh exports | Source design remains in The Brief; requires account access and entitlement |

## Verified official-source facts

- The requested [HTML5 banner creator page](https://www.thebrief.ai/create/html5-ads/) describes animated HTML5 export, multiformat creation, brand kits, and resizing inside The Brief. It does not document a portable editable project format.
- [How to work with exports](https://help.thebrief.ai/hc/en-us/articles/22631349056284-How-to-work-with-exports) lists HTML5, AMP, MP4, animated/static GIF, JPG, PNG, WebP and PDF. Users can export selected sizes from a design set.
- [How to work with HTML5](https://help.thebrief.ai/hc/en-us/articles/22637353394588-How-to-work-with-HTML5) documents network-specific export packages, image-quality/retina settings, optional fallback images and custom-font conversion to SVG. The SVG option can change text effects; converted text should be treated as artwork when assessing editability.
- [The Google Ads export guide](https://help.thebrief.ai/hc/en-us/articles/22630118883228-How-to-Upload-your-HTML5-Export-to-Google-Ads) confirms an HTML5 ZIP and, for a display set, an outer ZIP containing individual ZIPs per size. Import must distinguish a set archive from a single creative.
- [Click-tag guidance](https://help.thebrief.ai/hc/en-us/articles/22629842027036-How-to-enable-click-tags-for-ad-performance-tracking) explains enabling a click tag and selecting its navigation target. The HTML5 guide also says the click tag overrides URLs assigned to individual elements. Import must record the chosen network and click behaviour.
- [PSD guidance](https://help.thebrief.ai/hc/en-us/articles/22637444051740-How-to-work-with-PSD-files) explicitly says PSD can be imported into The Brief but cannot be exported back out. PSD therefore is not an available export bridge for this proposal.
- The [public API overview](https://docs.thebrief.ai/) describes export automation and an embeddable editor. [Template Elements](https://docs.thebrief.ai/public-api/rest-api/templates-designs/elements) returns names, layer types, change types, values, slide numbers and URLs. Its documented response is not a full geometry/timeline interchange schema.
- [Exports API](https://docs.thebrief.ai/public-api/rest-api/exports) supports exporting an existing design or creating a new design with named-element changes. Options include HTML settings, selected sizes and a completion webhook. Supported changes include text, image source, visibility, font and colour properties. Responses provide export status and output URLs. Some examples still contain legacy Creatopy domains; use current The Brief endpoints and verify them during a connector spike.
- [Zapier/API setup](https://help.thebrief.ai/hc/en-us/articles/22614787056412-How-to-set-up-Zapier-The-Brief-integration) currently says public API keys require an active Enterprise subscription. Verify the user's entitlement before estimating connector work. [Iframe embedding](https://docs.thebrief.ai/app-integration/iframe-embedding) is another documented option; embedded The Brief editing would remain vendor-hosted editing, not native XeroFlow conversion.

**Not established by this research:** the exact exported DOM, runtime library, GSAP version or use of GSAP at all; whether every dependency is local; availability of an undocumented/full editable-project export; fidelity of a concrete imported creative; the user's subscription. No assertion that The Brief universally exports GSAP is justified.

## Existing XeroFlow implementation

Paths below are relative to the repository root. These are code observations, not assertions that each flow has been exercised in this research.

| Existing files/routes | Observed behaviour | Consequence for the importer |
| --- | --- | --- |
| `app/pages/agency/banner-studio/custom-templates.vue`; `app/components/banner/CustomTemplateUploadModal.vue`; `server/api/agency/banner-studio/custom-templates/index.post.ts` | Custom library accepts pasted HTML/CSS/JS, dimensions, external scripts/styles and `{{VARIABLE}}` definitions | Best starting UI; currently no archive upload or asset manifest |
| `server/database/migrations/044-custom-html-templates.sql` | Separate custom templates and instances; instances have a client ID, overrides and variable values | Reuse existing template/instance concepts; add package/version/provenance and explicit client-library scope rather than pretending the ZIP is `canvas_data` |
| `app/pages/agency/banner-studio/custom/[id].client.vue`; `app/composables/useCustomBannerEditor.ts` | Code editor, variable values, preview; GSAP injection defaults on | Imported packages must retain their own dependency graph; disable automatic duplicate GSAP injection |
| `app/utils/custom-banner-builder.ts`; `server/utils/customTemplateUtils.ts` | Assemble documents from fragments and substitute placeholders | Whole documents need a package-aware path; nesting complete HTML inside a generated body or moving scripts can alter execution |
| `server/api/agency/banner-studio/custom-instances/[id]/save-as-template.post.ts` | Promotes instance overrides and values to reusable template defaults | Extend to retain immutable asset/version references and permitted field bindings |
| `server/api/agency/banner-studio/custom-instances/[id]/export.post.ts`; `server/utils/adPlatformExporter.ts` | Builds platform HTML and a ZIP containing only `index.html`; external script/style arrays are filtered for some networks, and platform click handlers are injected | Does not preserve a multi-file import. Missing assets or duplicate click handlers can break output. Existing checks are not complete platform certification |
| `server/api/agency/banner-studio/custom-instances/[id]/publish.post.ts` | Assembles one HTML document and uploads it to R2 | Package publication needs the complete asset tree, separate origin and explicit release action |
| `app/pages/agency/banner-studio/upload.vue`; `server/api/agency/banner-studio/projects/upload-banners.post.ts` | PNG/JPEG/GIF/WebP upload; one background image layer per format | Immediate route for flattened image reuse; not an HTML5 or layer importer |
| `server/api/agency/banner-studio/dissect/upload.post.ts`; `server/utils/bannerDissectorPipeline.ts`; `server/api/agency/banner-studio/dissect/[jobId]/import.post.ts` | JPEG/PNG/WebP analysis and reconstruction into layers; imported layers use no animation and a default five-second presence | Optional approximate static reconstruction, not recovery of the source timeline |
| `app/types/banner-studio.ts`; `app/composables/useBannerStudio.ts`; `app/utils/banner-brand-kit.ts` | Native text/image/video/button/rect/audio/background layers, selected transform/opacity keyframes, proportional sizing and role-based brand-kit application | Native target model exists, but arbitrary CSS, SVG, effects, runtime state and interactions exceed it |
| `server/api/agency/banner-studio/templates/from-project.post.ts` | Saves native project canvas data as a reusable template | Use after supported conversion, alongside custom templates |
| `server/utils/bannerStorage.ts`; `server/api/agency/banner-studio/assets/upload.post.ts` | Existing R2 asset and delivery primitives | Reuse suitable ownership/storage primitives; HTML/JS package delivery needs a separate security boundary |
| `app/utils/banner-render-runtime.ts`; `workers/audio-jobs/container/bannerCapture.mjs` | Frame capture seeks XeroFlow/GSAP runtime and encodes screenshots | Imported CSS/Web Animations/other runtimes need a tested adapter; existing video capture does not prove arbitrary imports render correctly |

### Security boundary that must precede ZIP execution

The custom editor currently uses `srcdoc` with `sandbox="allow-scripts allow-same-origin"`; its gallery preview uses `allow-scripts`. The editor's message handler filters on message type but does not verify `event.source`. These observations are integration blockers for executing arbitrary imported code in that editor, not a claim that an exploit was tested. [MDN's iframe documentation](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe) warns against combining scripts and same-origin permission for same-origin embedded content.

Use an isolated preview origin with no application cookies/credentials, sandboxed scripting, constrained resource loading and no top navigation/popups by default. Bind messages to the actual preview window and a per-session token, with a validated payload. A sandbox alone does not block outbound network traffic; enforce CSP and renderer network restrictions separately. Inspecting an uploaded package must not run its scripts.

The current capture code launches Chromium with `--no-sandbox` and loads supplied HTML. Before feeding third-party packages into capture, review the container isolation, egress, private-network access, resource ceilings and lifecycle. Do not infer that browser sandboxing is already present from the container name.

## Proposed implementation phases

All new paths below are proposals, not existing APIs.

### Phase 0 — one real export and a compatibility fixture

Obtain one representative animated HTML5 ZIP from the user's actual The Brief workflow, ideally a set containing a square and a portrait/display size. Include headline, CTA, logo, image, custom font, entry/exit animation and destination URL where used. Record the export network/settings, intended loop/duration and a screenshot or reference MP4. Keep a sanitised fixture with permission to use its assets; no account credentials are needed for this phase.

Inventory without executing: entry documents, dimensions, local/external resources, script order, font files/SVG text, URLs, click handlers, loops and runtime. A multi-size archive also answers the nested-ZIP question for the actual workflow. If only a single-size sample is available, use synthetic set fixtures but keep the real-set compatibility claim pending.

Gate: a written supported-feature profile and a reproducible reference render. This sample is necessary before promising fidelity or a precise implementation estimate; it is not needed to finish this research.

### Phase 1 — faithful package import and reuse

Add an Import HTML5 ZIP action to the custom-template library. Proposed routes: `custom-templates/import.post.ts` to stage and inspect, an import-status route, and a confirmation mutation to create selected templates/instances. Proposed utility: `server/utils/bannerHtmlPackage.ts`. Use a job for large packages if measured Worker limits require it.

Store original ZIP checksum and bytes privately, a versioned manifest, per-size entry paths, dimensions, dependencies, declared network, click policy and validation results. Associate user/client ownership server-side. Save one creative per size and an import-set relationship rather than conflating equal dimensions with identical designs.

Validate compressed/uncompressed totals, file count, recursion depth and compression ratio. Reject encrypted archives, traversal/absolute paths, symlinks, duplicate/ambiguous entries and invalid MIME/content combinations. Allow documented set nesting only within explicit bounds. Budget CPU and memory before extraction; archive metadata alone is not authoritative.

Preserve relative directories, CSS `url()`/imports, `srcset`, fonts, scripts and initialisation order. Retain immutable local assets. Report unresolved remote requests; fetching external assets requires allowlisted protocols, private-address/redirect checks, timeouts and size limits. Do not silently fetch arbitrary URLs or strip dependencies and call the result successful. Track licensed fonts/assets and source provenance; embedding rights cannot be inferred from a URL.

Preview with the isolated boundary above. Export the complete package; keep an original download option and a distinct transformed export. Treat network conversion as an explicit adapter with validation. Preserve or replace a click mechanism once—never append an extra full-document handler blindly. Disable tracking and real navigation in preview; test clicks using captured destination events.

Gate: reference animation and typography match at several timestamps; all required assets load from the package or explicitly approved dependencies; download/reimport works; hostile fixtures cannot access the app or internal network. Package imports stay labelled as HTML creatives.

### Phase 2 — reusable fields and client brands

Extend the existing variable UI with operator-approved DOM/asset bindings for headline, offer, CTA, image, logo, colours and destination URL. Prefer stable element IDs or known exporter data when the sample provides them. Use parser-based mappings and context-aware values, not global string replacement across JavaScript, HTML and CSS. Existing client preview substitution is raw, while server assembly applies different escaping; unify behaviour and test special characters before exposing fields broadly.

Add field constraints (text length/layout, image aspect ratio, allowed colours and URL schemes), snapshots and rollback. Preserve original package versions and record changed bindings. Map explicitly chosen fields to XeroFlow brand roles and client-owned assets. A brand change must be opt-in and reviewable; replacing every matching colour or image is not reliable brand adaptation.

Import already-designed sizes as a set. Changing the iframe width or scaling a whole creative does not produce a redesigned portrait composition. New aspect ratios require a prepared alternate size, an authored responsive template, or conversion/rebuild with layout review. Brand kits cannot automatically recover semantic roles from rendered output.

Gate: staff can duplicate a template for a client, change approved fields, apply mapped brand assets, preview every imported size and export without changing the source template or another client's creative.

### Phase 3 — selective native conversion, or source-connected regeneration

Choose based on whether independent XeroFlow editing or source fidelity matters more:

1. **Native conversion:** add an opt-in converter to `Layer`/`ArtboardState`. Start with positioned text, images, simple rectangles and supported transforms. Report each converted, rasterised and unsupported item. Map only animation properties whose timing/easing can be verified. Retain original HTML alongside the new project and use `templates/from-project` after review. Do not silently flatten complex effects while claiming complete editing.
2. **The Brief connector:** after entitlement verification, keep the source template hash and named-element mappings, request `export-with-changes`, then ingest completed output through the same package pipeline. Store credentials server-side and handle asynchronous completion, idempotency, expiring download links and errors. This preserves source editing in The Brief. The documented Elements response does not justify a complete native layer importer.

Embedded The Brief editing is a third product choice if vendor dependency is acceptable; confirm commercial access and authentication requirements first. It is not required for manual ZIP import.

### Phase 4 — social rendering integration

Once supported animation runtimes have deterministic start/seek/readiness behaviour, produce a verified MP4 or still image and send that media through the existing/social work's draft flow. Imported HTML is not itself social video. Reuse the current render jobs only after adapter and isolation tests. Direct MP4 export from The Brief remains a practical alternative where faithful HTML capture is unsupported. This research does not modify the concurrent zoom/export-to-social implementation.

## Test matrix and acceptance evidence

| Area | Minimum cases | Evidence |
| --- | --- | --- |
| Archives | Single creative; actual nested set; mixed network folders; same-size variants; missing/ambiguous entry | Correct selection, dimensions, manifest and no silent omission |
| Asset paths | Nested CSS/images/fonts; spaces/non-ASCII names; case sensitivity; `srcset`; query strings; missing resource | No broken references; actionable missing-resource report |
| Dependencies | Local runtime; approved remote runtime; blocked/offline CDN; duplicate GSAP; CSS-only animation | Correct playback or explicit unsupported status |
| Fidelity | Start, entry, mid-scene, transition, end and loop boundary; local font versus SVG text | Screenshots against original isolated render plus human review of text/effects |
| Timing/media | Finite/infinite animation; delayed images/fonts; video/audio; responsive scaling | Bounded duration, no missing first frame, accurate capture for supported modes |
| Clicks | Existing clickTag/clickTAG; per-element URLs; network exit library; unsafe URL; no URL | Exactly one intended destination; no real navigation/tracking during preview |
| Reuse | Duplicate, field edits, special characters, long copy, asset replacement, save-as-template, rollback | Source preserved; preview/export agree; layout errors surfaced |
| Brands/sizes | Two clients; dark/light logos; font substitution; square→portrait; imported alternate sizes | No cross-client access; explicit mappings; review for new layouts |
| Hostile packages | Traversal, symlink, zip bomb, excessive nesting/files; script parent access, forged messages, network exfiltration, private-network requests | Rejection or containment before storage/execution; bounded resource use |
| Ownership/lifecycle | Unauthorised IDs, expiry/revocation, deletion with shared asset references, failed import/retry | No orphan publication, stable references, private originals |
| Output | Download/reimport; original versus transformed ZIP; target-network checks; MP4 when supported | Complete assets, working animation, correct dimensions and destination |

Unit tests should cover archive validation, manifests, bindings and package export. Integration tests should cover authenticated storage/ownership and failure cleanup. Browser tests must execute representative real exports in the isolated origin, inspect network/errors, and compare time-based visual output; parser tests cannot establish animation fidelity. Run repository-required lint and relevant regression tests with implementation. No source changed here, so this report did not run product tests or claim runtime validation.

## Next concrete input

One original The Brief HTML5 export ZIP, with export settings and reference appearance, is the only customer artifact needed for the next compatibility spike. Keep manual ZIP import independent of API subscriptions. Start with faithful reuse and clearly identified editable fields; offer deeper native conversion only where the evidence supports it.
