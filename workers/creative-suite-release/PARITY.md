# Existing Creative Suite parity review — 10 November 2026

The release updates the existing `creative.xeroflow.io` gateway. Prepared connected candidate009 adds new immutable editor assets behind that gateway; it does not create a replacement public launcher or a new login system. This source/artifact review is distinct from hosted acceptance.

## Retained customization

| Area | Retained source/artifact evidence | Limits |
| --- | --- | --- |
| Compiled Flow names and Help links | Combined six standalone patches port the old branding changes onto the new source layouts. Photo/Vector use XF monograms, Effect's header paints XF, Fig's home/menu/About retain XF plus XeroFlow wordmark. Film/Sound keep their previous Flow branding. | Original Craft identifiers remain intentionally in file formats, APIs, truthful credits and storage namespaces. Native updater behavior is not qualified for distribution. |
| Loading marks | Candidate008 retains the predecessor007 correction restoring old `brand_package.py` behavior: hide the loader's upstream image and paint the local XeroFlow logo through a pseudo-element, including Photo whose progress text is replaced. | No WASM rebuild. All six actual HTML files are checked. |
| Shared dock and keyboard/tab behavior | Exact pinned old `editor-dock.js`/CSS reused per version, retaining same-origin stable app links, named-tab focusing without reloading an existing document, focus/Escape handling and transient BroadcastChannel presence. | A pre-existing old editor tab is intentionally focused rather than silently replaced with a new version. Stable destination routing still needs promotion. |
| Session and sign-in | Same `auth-session.js`; generated gateway retains canonical fresh `/api/auth/me` authorization and existing secret bindings. New service dispatch follows that authorization and strips credential headers. | Existing four-account policy is unchanged. Browser sign-in/provider acceptance is separate. |
| Installation metadata | Same stable IDs/start URLs/scopes. Candidate008 retains the predecessor007 correction restoring old #1b1b1e theme metadata and all three icons, including the maskable512 entry. All root installation resources remain on the original ASSETS binding. | Installed Safari/OS application behavior needs its own acceptance. |
| MotorStack | Same pinned library UI/Shadow DOM CSS, with only its stylesheet URL moved into its immutable shell. All six canvas IDs match the existing targeting contract. Current gateway's private MotorStack HTTP adapter and named brand RPC module are retained. | Old implementation used synthetic drop events; actual native Rust import was explicitly unqualified in the old README. Real asset import still requires acceptance. Sound remains download-only; SVG/PDF/fonts remain download-only. |
| Launcher and prior UI upgrades | Original gateway launcher HTML, seven cards, Banner Studio artwork, root starfield/card effects, credits and original ASSETS inventory are untouched. Gateway keeps `ASSETS`, `CREATIVE_AUTH_KEY`, `MOTORSTACK_API_KEY`, `FIGFLOW_EDM_ASSETS`, plus only the new private service binding. | This additive candidate alone leaves stable app routes at old versions. |
| Storage and formats | Branding ports retain Craft compatibility identifiers and origin. Old immutable routes remain. New Effect service-worker retirement deletes no caches, IndexedDB or OPFS data. | Cross-version document and font fidelity needs existing-document acceptance; no automatic document migration or shared XeroFlow saving is introduced. |
| Fonts and licenses | Exact new upstream font revisions/archive hashes, original Cargo.lock and original license/attribution files retained. Photo repaired ZIP adds only one missing snippet; all54 original payloads remain identical, including fonts/licenses/WASM parts. | Vector's 30 absent optional font-picker faces match upstream release behavior; startup fallback fonts are included. Font fidelity is not established for every historical document. |

## FigFlow custom integrations

Current production's specialised 0.11.2-edm5 remains independently pinned under `workers/craft-editors/source-pins.json`, with browser-save, XF-mark, bounded-export, `figflow-browser-bridge.patch` and `figflow-edm-polish.patch`, plus the pinned Noto Emoji font and relay. The generated gateway retains all EDM1/3/4/5 service routes and the specialised Email Library entry. None of these assets or modules is overwritten.

New standalone FigFlow0.17 retains XF/wordmark branding. Upstream now implements native browser save/download completion and bounded ZIP exports (256MiB retained payload,1000files), superseding the old standalone save and `maxBytes` patch mechanisms. It does **not** contain XeroFlow's custom `window.__xfFigBridge.request` engine bridge, EDM import/update metadata, EDM-safe generic-save behavior, relay or custom monochrome emoji/polish patch. Those integrations remain in the existing EDM5 editor. Do not describe standalone0.17 as an upgrade of the specialised EDM engine.

The existing `workers/figflow-edm-assets/library-shell.mjs` remains unchanged for old explicit routes. Candidate008 copies that exact navigation HTML into the new private service, changing only the general canvas iframe to `/figflow/0.17.0-flow1/?canvas=1`. The new version root/index opens that library shell; explicit `canvas=1` opens the native canvas. Specialised email-template authors still use the existing application URL and EDM5 authority. The separate canonical stable-route promotion selects this new library entry, preserving the established experience.

## Remaining promotion gaps

1. The additive candidate intentionally changes no stable routes. Its separately frozen promotion module selects all six new canonical destinations after hosted acceptance; old-origin/document paths are retained. Uploading only the additive module does not complete the online update.
2. Candidate008 preserves FigFlow's Email Library and specialised EDM bridge while selecting the new standalone canvas. Porting the specialised EDM engine to0.17 remains additional work, not established by standalone compilation.
3. Film flow2 contains the browser thread-pool correction and has rebuilt successfully; real browser MP4 export acceptance is owned by root and is not inferred from compilation.
4. Real MotorStack native-canvas import, wrapped browser/session/dock and installed-app acceptance remain distinct from bare-editor tests. Latest live gateway state must be reconciled again before upload.

No deployment or production configuration was changed by this parity review.


Candidate009 additionally retains the exact old restrictive HTTP CSP on the new private library HTML response, including default/style/frame/base/form restrictions. The ordinary canvas/WASM policy remains unchanged. Runtime fixtures compare the actual old service response header to the new library response and confirm the canvas does not inherit the library-only restrictions. This wrapper-only correction leaves all264 public payloads and additive/promotion gateway modules byte-identical to candidate008.
