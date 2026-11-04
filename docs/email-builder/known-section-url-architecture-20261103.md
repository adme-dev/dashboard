# Carried-URL fidelity: root cause, options and recommended fix (3 November, investigation only)

Status: **read-only investigation and plan.** No production or test file was edited. The R3 freeze `772b6735…`, all earlier freezes and every reviewer artifact are untouched. New material is only this document and `.verification/opus-known-section-url-architecture-20261103/` (two pure diagnostics, their config, logs and JSON). Nothing was installed, built, deployed or sent, and no SQL was run. No provider path was invoked.

Inputs:
- R3 review `.verification/opus-known-section-r3-independent-review-20261103.md` (`8eeebb40…`).
- Its evidence freeze `0e699f5a…`.
- Final disposition: 0 P0 / 1 P1 / 0 P2. Async is source-closed; the remaining P1 is the delivery-consumer mismatch.

## 1. The chain, traced

| Step | Owner | What happens to the URL string |
|---|---|---|
| Saved section | `oemSplit` Html block | The generator HTML-escapes the attribute (`&` → `&amp;`), so the original Html parses to the **literal** URL in every parser. |
| Conversion | `designKnownSections.ts` → `designDesigner.ts` adopt | The parsed literal URL is stored as canonical `Image.props.url` / `Button.props.url`. |
| HTML serialization | `workers/email-rendering/src/render/blocks/button.ts:53,68,115,168`; `image.ts:45,47,115,123,125`; `avatar.ts:52,65,99` | The URL is interpolated **raw** into `href="…"` / `src="…"`. |
| Same block, other paths | `image.ts:101,104,106` (dark mode), `outlook-button.ts:29` (VML), and cta-banner, footer, header, hero, menu, social, testimonial | The URL is escaped with `escapeHtml`/`escapeUrl`, i.e. treated as **literal**. |
| Production rendering | `server/utils/email-marketing/render/client.ts:34` | Only the private `EMAIL_RENDERER` Worker binding renders; there is no local fallback. |
| Delivery inspection / plaintext | `shared/emailRendering/deliveryContent.ts:20,72–74` (parse5) | Links and plaintext use the parse5-decoded attribute value. |
| Click tracking | `server/utils/email-marketing/trackingLinks.ts:123–150` (parse5 `parseFragment`) | The logical URL is the parse5-decoded href. The replacement is re-serialized with every `&` → `&amp;`. Its own comment: "merge values and compiled native buttons encode ampersands". |
| Send assembly | `campaignSend.ts:399–409` (read only) | tracking rewrite → `inspectDeliveryContent` → `deliveryPlainText`. |

Every other owner treats the canonical string as a **literal URL**:
- designer `safeLink` (`new URL`);
- native `valid_url` (`edm.rs:166`, scheme validation, no HTML decoding);
- `contentDiagnostics.ts:92` (`new URL`);
- asset identification (`designAssets.ts:29`);
- the E04 importer, which takes `url`/`linkHref` from parse5-**decoded** attributes (`importedDesignConversion.ts:461`).

## 2. Root cause

**The canonical URL string has two contracts.** Validators, native, diagnostics, assets, importers, the tracking serializer, and most block renderers treat it as a literal URL. The raw Button, light/desktop Image and Avatar paths treat it as **HTML attribute text**. With raw emission, the destination a recipient gets is whatever each HTML parser decodes from that text, and parsers disagree on quirk spellings.

**Diagnostic** (`url-consumer-matrix.json`): the real renderer → `inspectDeliveryContent` / `deliveryPlainText` / `rewriteTrackableHrefs` / happy-dom, over 40 URLs.
- All 33 realistic `&key=value` URLs, including keys starting with legacy names (`&copy=`, `&notify=`, `&regionId=`, `&times=`), are exact everywhere.
- The prefix spellings `&notin` and `&copysr` **diverge**: parse5 (delivery and tracking) reads `¬in`/`©sr`, while the browser parser keeps them literal. So today a click-tracked destination can differ from the direct link.
- `&notin-`, `&ubrcy_` and the entity spellings decode consistently, but not literally.
- Image links show the same pattern in tracking and happy-dom. The delivery inspector only lists links with visible text, so linked images do not appear there (inspector scope, not a decoding result).
- **Escaped emission is exact in every consumer for all 40.**

This is a **pre-existing renderer defect** for any composer-authored or imported URL containing such spellings. The known-section conversion exposed it because it creates structured Buttons/Images from previously escaped Html. A name table in the conversion guard can only ever approximate one parser. That is why R3 still found admitted values (`&notin`, `&copysr`, `&ubrcy_`) that the parse5 consumers change.

**Same block, two meanings today:** a canonical Image URL containing `&amp;` decodes to `&` in the light `<img>` but stays `&amp;` in the dark-mode `<img>` of the same email. Likewise, a Button's plain path decodes it while its Outlook VML path keeps it literal.

## 3. Why legacy `&amp;`-authored URLs constrain a global change

A saved canonical URL may contain a complete character reference typed or pasted as HTML text, e.g. `?a=1&amp;b=2` copied from HTML source. Today's raw paths decode it to `&`, which is accidentally what the author meant. A **global full escape** (`escapeHtml` everywhere) would turn that into a literal `&amp;b=2` destination: the query key changes, and the link silently breaks on the next render of that draft or template.

Rewriting saved URLs is not allowed, and their prevalence cannot be measured in this stage: that would need SQL, which is not allowed. Frozen campaign HTML is not re-rendered at send, so existing campaigns are unaffected by any renderer change. Drafts and templates would change on their next save or preview.

## 4. Options compared

| | A. Conversion refusal validated by consumers | B. Global full escape | **C. Unambiguous serialization + reference-only guard (recommended)** |
|---|---|---|---|
| Change | Guard requires raw-emission parse with parse5 **and** the standard rule (and happy-dom) to equal the literal | `escapeHtml` for every URL attribute in Button/Image/Avatar | One shared serializer: keep complete references (`&name;`, `&#n`, `&#xh`) verbatim and escape every other `&` (plus `"<>`), used by every Button/Image/Avatar URL attribute. The known-section guard becomes "refuse any complete reference"; the 106-name table is removed |
| Parser independence | **No.** It only covers the parsers we test; Gmail/Outlook parsers are unknown. The structured output stays raw | Yes | **Yes.** Every remaining `&` is either `&amp;` or a complete reference, which every parser reads the same way |
| Legacy `&amp;`/`&#38;` URLs | Unchanged | **Changed** (breaks key names) | **Unchanged** (complete references kept, `proto=raw: True`) |
| Quirk spellings (`&notin`, `&copysr`, `&copy-x=`, `&lt`) in existing URLs | Unchanged (still parser-divergent) | Literal | Literal and consistent: the browser reading for `&notin`/`&copysr`; for `&notin-`/`&ubrcy_`/`&copy-x=`/`&lt` the meaning changes from decoded to literal, matching what validators and native already assume |
| Known-section admissions | Narrow and parser-specific; keeps growing | Every safe URL | Every URL without a complete reference, including `&utm_medium=`, `&notin`, `&copy-x=1` |
| Tracking/plaintext vs browser | Can still diverge for non-converted content | Agree | Agree |
| Bundle/runtime | parse5 already in client (`edmCanvasHtml.ts`) and server; the guard runs a parser per URL (client hint and server) | No size change; Worker redeploy | Tiny shared function; Worker redeploy (`EMAIL_RENDERER`) plus the Pages app for the shared guard |
| Native representation | None | None | None. Native stores and edits the literal string; no native/WASM change |
| Stacking risk | High: this is the cycle R3 warned about | None, but compatibility risk | Low: one rule shared by serializer and guard, defined by HTML syntax, not by a parser's tables |

Diagnostic proof for C (`serialization-options-matrix.json`, 20 URLs in 7 classes through delivery, plaintext, tracking and happy-dom):
- The prototype is parser-consistent for every class.
- Every URL the reference-only guard admits reads back exactly literal.
- Every URL with a complete reference keeps today's reading.
- Full escape is literal everywhere but changes classes 5 and 6.
- The test asserts these claims and passes (1/1).

## 5. Recommendation: C, in the existing owners

1. **Shared rule, one owner:** a new pure module `shared/emailRendering/urlAttribute.ts`.
   - `serializeUrlAttribute(url)`: keep `&[A-Za-z][A-Za-z0-9]*;`, `&#[0-9]+;?` and `&#[xX][0-9A-Fa-f]+;?` verbatim; escape every other `&`, plus `"`, `<` and `>`.
   - `urlHasCharacterReference(url)`.
   - No new renderer or store. The Worker already imports shared/app helpers.
2. **Serializer adoption:** every Button/Image/Avatar URL attribute uses `serializeUrlAttribute`. That covers the raw HTML/MJML paths and the dark-image/VML paths, which unifies today's split meanings. `escapeUrl`'s protocol blocking is unchanged where it is used.
3. **Known-section guard:** replace `literalUrlSafe` and its legacy table with `!urlHasCharacterReference(image) && !urlHasCharacterReference(path)`. Keep `safeLink`, byte-identical regeneration, the literal-text rule, locks and the async closure unchanged.
4. **Rollout:**
   - The `email-rendering` Worker deploy and the Pages app ship together, through the existing guarded paths, as a later release stage.
   - Existing projections change only on their next render. Frozen campaign HTML is unaffected.
   - Before release, an operator-approved read-only count of canonical Button/Image/Avatar URLs containing quirk spellings (classes 3–4). These are the only URLs whose meaning C changes, and the change is toward literal.
5. **Later option:** if that audit also shows no saved URLs with complete references (classes 5–6), B can replace C by changing one function. Not proposed now.

**Tradeoffs accepted:**
- C changes rendered meaning for classes 3–4 in existing content, toward the literal string that validators, native and diagnostics already assume.
- It keeps the legacy "complete reference decodes" behaviour for classes 5–6, which is why the conversion must still refuse literal URLs containing complete references. Those sections stay Html, unchanged.
- It is a shared renderer change and needs render-parity review. A repository grep for test assertions with a raw `&name` in an `href`/`src` found only an unrelated banner fixture (`urlScraperBrand`), so churn should mostly be new assertions. The implementation's broad run is the real check.

**Cross-impact (separate approval):** the approved E04 importer produces literal URLs from decoded attributes. Today a literal containing a complete reference would be decoded again by the raw paths, and C does not change that. E04 should adopt the same `urlHasCharacterReference` refusal or disclosure in its own review. This is not part of A's repair.

**Fallback if a renderer change is not wanted now:** refuse every carried `&` except one followed by a non-`[A-Za-z0-9#]` character or by `[A-Za-z0-9]+=`. That is the HTML `=` exception, which every consumer tested honours for all 33 keys. It would refuse common keys such as `utm_medium`, the existing defect stays for all other content, and it still depends on consumers. It is not recommended.

## 6. Compatibility matrix

`lit` = every consumer reads the exact canonical string; `cons` = consumers agree, but decode; `DIVERGE` = consumers disagree. Consumers are parse5 delivery, plaintext, parse5 tracking and happy-dom.

| Class (example) | Original Html (escaped) | Current structured (raw) | Current guard | C structured | C guard | C effect on existing content |
|---|---|---|---|---|---|---|
| 1 separators `a=1&b=2`, `utm_source=…&utm_medium=…` | lit | lit | admit | lit | admit | none |
| 2 legacy-name keys `&copy=1`, `&notify=2`, `&amp=2` | lit | lit | admit | lit | admit | none |
| 3 prefix without `=` `&notin`, `&copysr` | lit | **DIVERGE** | admit (**R3 P1**) | lit | admit | becomes literal (= browser) |
| 3 `&notin-`, `&ubrcy_` | lit | cons (decoded) | admit (**R3 P1**) | lit | admit | becomes literal |
| 4 legacy before punctuation `&copy-x=1`, `&lt` | lit | cons (decoded) | refuse | lit | admit | becomes literal |
| 5 complete named `&copy;`, `&amp;b=2`, `&foo;` | lit | cons (decoded; `&foo;` lit) | refuse | cons (decoded, = today) | refuse | none |
| 6 numeric `&#35;tail`, `&#35tail`, `&#x26;b=2` | lit | cons (decoded) | refuse | cons (decoded, = today) | refuse | none |
| 7 merge/no `&` | lit | lit | admit | lit | admit | none |

"Preview" and "committed" are the same renderer output; Apply re-renders deterministically. Native stores the canonical string in all cases.

## 7. Implementation tests (red first, then green)

**Renderer and serializer unit tests** (`test/unit/emailUrlAttribute.test.ts`, new):
- The class 1–7 table through `serializeUrlAttribute`, then parse5 `parseFragment`, `inspectDeliveryContent`, and the happy-dom attribute. Every consumer must agree and match the expected column above. Red today on the raw Button: class 3 diverges.
- Every Button/Image/Avatar URL attribute path (light, dark, mobile swap, linked image, VML, MJML) emits only complete references or `&amp;`, checked as a source/regex inventory plus rendered output.

**Through the real proposal/Apply owner** (persistence harness, image and button separately):
- **Green after C:** `&notin`, `&copysr`, `&ubrcy_`, `&notin-`, `&copy-x=1`, `&utm_medium=`. Real propose → Apply gives one revision. Preview and committed HTML parsed by happy-dom, `inspectDeliveryContent`, `deliveryPlainText` and the `rewriteTrackableHrefs` logical-href callback (no provider) each equal the original Html's parse. **Red today** for the first four.
- **Refusal:** `&copy;`, `&amp;b=2`, `&#35;tail`, `&#35tail`, `&#x26;`, `&foo;`. Full post-open state, saved Html bytes and recognition are unchanged.
- **Regression:** the existing lock, literal-text, CAS/idempotency, nested, deterministic-id and async suites unchanged.

**Consumer boundary** (no provider):
- `buildTrackedBatchEmail` is not invoked. Instead `rewriteTrackableHrefs` + `assertFinalCampaignEmail`-equivalent inspection runs on rendered structured content: the tracked logical destinations equal the canonical URLs.

**Compatibility:**
- A legacy canonical Button URL `?a=1&amp;b=2` keeps its current decoded destination under C in all paths. The dark/VML paths change from literal to decoded to match the light path; this is asserted.

**Neighbours:**
- The reviewer's nine-suite set, the focused known-section/gap/E04 suites, and the broad email regression.

## 8. Dependency provenance (recorded, not changed)

- `figflow-edm-release-20261101/node_modules` is a symlink to `xeroflow-email-builder-20261030/node_modules`. That is itself a symlink to `banner-editable-artwork/node_modules`.
- The release root has **no install of its own**.
- Lockfile hashes: release `9cf400a4…`, old tree `dd11e3ca…` (they differ).
- Resolved packages: parse5 8.0.1 with entities 8.0.0, matching the release lockfile entry `parse5@8.0.1 → entities: 8.0.0`. happy-dom 20.10.6 resolves its own entities ^7.0.1.
- Shell Node is 24.22.1; the reviewer used 24.18.0.
- The Linux CI bytes have not been verified. Under C, fidelity no longer depends on these parser bytes, but CI must still run the new consumer tests.

## 9. Evidence

`.verification/opus-known-section-url-architecture-20261103/`:
- `url-consumer-diagnostic.test.ts` with `url-consumer-matrix.json` and `url-consumer-summary.json` (1/1 passed).
- `serializer-prototype.test.ts` with `serialization-options-matrix.json` (1/1 passed; the prototype lives only in that file).
- `diagnostic.config.ts`, logs, and `SHA256SUMS`.

No old artifact was rerun in place.
