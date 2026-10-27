# Scoped retail invitation review

27 October 2026 (Australia/Melbourne), finalized after 16:00 UTC on 26 October. **Accept the bounded local native-letter increment: no remaining blocking source finding, and the actual Nuxt browser fixture passes.** Reviewer verification passed **156 tests across 11 files**, followed by **25 component tests** after the final DevTools marker change. This is acceptance of local uncommitted source and a curated native-letter fixture, not deployment, provider or customer acceptance.

The coordinator acknowledged six initial blockers, took remediation ownership, and explicitly signaled settled source at 15:47:59 UTC. Reviewer follow-ups closed clean-plate stacking/presence visibility at 15:49:50 UTC and format-bound text-fit validation at 15:51:26 UTC. All original deterministic negative probes now reject. The fixes and their regression tests were reread before this decision.

## Scope and source identity

Reviewer owns only this file. No product/test edits, Git mutations, large builds/typechecks, helpers, live database/provider/scan/deployment operations were performed. Governing constraints are `RETAIL-IMPLEMENTATION.md`, `RETAIL-EDIT-SCENARIO.md`, and `GOVERNING-REVIEW.md`. HEAD is `3d28afca8cb768e02b1cca68953b0ea92c4e0b6c`; observed local `origin/main` is `3a837b45149b25f561558be65e1a89ca31bf4315`. These identify the committed base, not this patch.

Reviewed source SHA-256 values after the final component rerun:

```text
860feb198d1a1b29fd83d67626083ca00189c46dfe71f9afbfae338f81686785  shared/bannerDesignScope.ts
cf7b300a09da2257f1cad58add5d4087ad9d40a4889efc2d7c4fae47445f41ba  app/components/banner/DesignAssistant.client.vue
738d2ae026e9aff49af995d582823593a89af2a86b5b025af7b5b8055898d288  app/utils/banner-scoped-preview.ts
7ddf38bbdbba156fd5065feb29de3fcaeda671977c5a480c899af81debcdf388  server/api/agency/banner-studio/ai/design-assist.post.ts
5547cc3d8a24751f44d6d176c2b8f19b698d9fe4bb57cf6b319140beed5e0ce3  server/utils/banner/designAssistant.ts
90cc2ee4375ab63dcf81bbded75fa152c598b279a63acc7ea972f987ab856f83  app/components/banner/Artboard.client.vue
f629f2a11db29357f5f8ff8eae37f79c1a096b5e60b9ccf625b3482a5789dd15  app/utils/banner-html-builder.ts
6581951f601444595e84d54a15258067bdf3b0316a0c4844e7328f1c47dceb68  server/utils/banner/htmlBuilder.ts
```

## Repaired findings and current evidence

All findings below blocked acceptance during review. They are local deterministic observations, not production incidents. Current lines refer to the hashed source above.

| Finding and reproduction | Repair and verification |
| --- | --- |
| **Incomplete saved-source binding:** request changed selected text and added a format while keeping the revision. Initial check skipped selected content, additions and other formats. | `shared/bannerDesignScope.ts:92–100` compares the entire normalized canvas, including board metadata, order and all layer attributes; normalization is limited to existing editor timing defaults. Endpoint lines 85–93 checks before the model; lines 136–145 reloads canvas/client/revision after the model. Inline tampering probe now rejects; focused source/API tests pass. |
| **Clipping hides exact stored words:** set selected text box height to 1, or add an opaque rectangle over selected text at higher z-index. | Shared lines 127–154 require static bounded native layers, nonempty text, minimum line geometry and no upper-layer occlusion. `banner-scoped-preview.ts:4–21` waits for fonts, checks exact text and computed visibility, and measures glyph rectangles/scroll overflow. Client apply requires successful fit. Original probes reject; component fit-failure regression passes. Actual browser glyph evidence remains a distinct gate. |
| **Incoming mask dependency:** leave an unselected mask targeting ID 1, then move selected text outside the mask. | Shared line 67 rejects incoming masks before proposal; lines 42–47 reject selected/new masks, effects, motion, rotation, hidden state and presence clipping. Original probe rejects. |
| **Empty replacement bypassed approved wording:** set selected heading text to an empty string with no approved copy. | Shared lines 131–133 reject empty text and conversion of existing text to another type; changed wording must match an approved entry. Original probe and regression reject. |
| **Flat background bypass:** reviewed full-page plate first, then a second unreviewed full-page image; or overlap an arbitrary `bg` raster. | Shared lines 58–61 detect every non-plate full-frame image/bg using known or custom dimensions; line 141 exempts only the actual plate or source-free solid bg from protected-geometry collision. Both inline probes now reject. |
| **Review revoked during apply:** start fresh-project GET, uncheck human review, then return the expected revision. | `DesignAssistant.client.vue:327–346` prevents concurrent applies and rechecks mounted/open state, request generation, review, fit, scoped format, proposal identity, canvas, scope, project/client and saved revision after GET. Deferred-GET review-revocation regression passes. |
| **Text below the clean plate:** lower selected heading z-index beneath opaque reviewed plate. DOM fit alone does not detect occlusion. | Shared lines 148–154 now include the clean plate in upper-layer occlusion. Added failing-then-passing regression covers lower-z text; presence clipping is rejected, and DOM measurement also requires visible display/opacity. |
| **Wrong format satisfies text fit:** scope A clips text, existing B reuses its ID/text in a larger box; switch preview to B and apply A. | Component line 99 restricts scoped formats; line 296 selects the scoped key; line 310 rejects wrong-format measurement; lines 329/337 recheck format before and after GET. The regression retaining a second reused-ID variant confirms it cannot be selected for scoped proof. |

Original inline reproduction fixture: a static text layer `id:1`, `text:'Welcome home'`, x/y 10/10, w/h 200/30, z-index 1, opacity 1, `clipToBounds:true`; board `custom_600x800`; scope selecting ID 1 over the full board; empty approved copy. Reviewer imported the actual shared functions using `pnpm exec tsx -e`. The initial five cases returned `ACCEPTED`; after remediation the same probes return:

```text
opaque addition hides selected original text: REJECTED Proposed artwork obscures native wording
selected text clipped to one pixel: REJECTED Native wording must remain visible
selected text cleared without approved wording: REJECTED Native wording must remain visible
request changes selected original and adds format: REJECTED Canvas must match the complete saved source
incoming mask hides moved text: REJECTED Selected layer has an incoming mask
second unreviewed full-frame raster: REJECTED Flattened artwork needs reviewed extraction and clean-background repair
arbitrary bg raster covered by selected text: REJECTED Proposed layer overlaps protected artwork
```

For occlusion, clone the heading as a new white rect at z-index 20. For clipping set `h=1`; for deletion set `text=''`. For source tampering change selected text and add `{fb_sq:{layers:[]}}`. For the mask case add an unchanged rect mask with `maskTargetIds:[1]` at the original text bounds and move text to `y=100`. Raster probes add a reviewed full-page plate followed by another full-page image, or an unselected 300×200 bg image. These checks invoke no provider or browser.

## Preserved contract

- Persisted reconstruction roles `letterLocation`, `letterShowroom`, `letterLaunch`, `letterOffer` permit only x/y/w/h, font size, line height, static exit normalization and clipping changes. Exact text, text runs, color, other styling and identity remain unchanged (`shared/bannerDesignScope.ts:26–35,134–139`). This exception does not allow shortening body wording, even if the replacement is entered as approved copy.
- QR/map/OEM/voucher/legal/greeting/sign-off selection is rejected. Every unselected layer, board metadata, other format and existing layer order is compared unchanged. Managed QR transition validation remains in both proposal application and the editor canvas mutation path.
- Selection, region, approved copy, saved revision and local canvas/project/client context invalidate stale proposals. A human review checkbox and matching rendered text fit are required immediately before one canvas mutation. `useBannerStudio.applyAssistantCanvas` uses one `assistantCanvas` undo snapshot; `artworkUndo` passes.
- Both HTML builders and the editor honor `clipToBounds`; client/server export parity and preservation of legacy unclipped layers pass. Clipping is a geometric guard, not evidence that words fit: fit is separately checked before UI apply.

## Final focused verification

Reviewer run after the format-binding fix:

```sh
pnpm exec vitest run \
  test/banner/scopedDesignProposal.test.ts \
  test/banner/scopedRetailGuards.test.ts \
  test/server/api/bannerDesignAssist.test.ts \
  test/components/bannerDesignAssistant.test.ts \
  test/banner/scopedExport.test.ts \
  test/banner/serverHtmlBuilderParity.test.ts \
  test/banner/paddingExport.test.ts \
  test/banner/artworkUndo.test.ts \
  test/banner/designAssistant.test.ts \
  test/banner/platformQrAiProtection.test.ts \
  test/banner/managedQrProtection.test.ts \
  --maxWorkers=1
```

**156 passed, 11 files passed, 3.48 seconds.** After the final DevTools marker-only change, reviewer reran `pnpm exec vitest run test/components/bannerDesignAssistant.test.ts --maxWorkers=1`: **25 passed, 893 ms**, including marker and scriptless sandbox assertions. Component tests stub DOM fit; they prove gating and race handling, not browser font metrics. API tests use mocked auth/database/providers. The coordinator separately ran the broader settled-source regression before that marker change; reviewer read `/tmp/banner-retail-regression-final.log`: **803 passed, 5 skipped; 96 passing and 4 skipped files; 26.48 seconds**. The coordinator also reported changed-source lint and whitespace checks passing. Those checks are attributed to the coordinator, not rerun by this reviewer.

## Browser and acceptance limits

The final run of `scripts/banner-studio/prove-retail-invitation.mjs` started at `2026-10-26T15:59:17.531Z` and reports **passed / complete**. Reviewer reread the final artifacts under `output/editable-artwork-v2/retail-invitation`: all five workflow assertions are true, with **3 deterministic design fixture calls, 6 fixture saves, zero live provider calls, zero scans and zero console/page/fixture errors**. The coordinator authorized finalization at 16:00:21 UTC; reviewer rechecked every source hash above afterward.

An earlier full workflow run failed only on two sandbox script warnings. Browser owner traced them to Vue DevTools iframe hook injection, after ruling out fixture injection and verifying saved static HTML contains no scripts. The coordinator added `data-vue-devtools-ignore` to both preview frames; reviewer inspected this change and confirmed scoped frames remain `sandbox="allow-same-origin"` without script permission. The final clean run resolves that diagnostic without suppressing errors or enabling scripts.

Reviewer inspected both composition images and verified the final two text-fit files and unchanged inventory: **10/10 affected text blocks fit** in preview and editor, **120/120 protected layer hashes match**, and **31/31 original text strings remain exact**. The result has 131 layers from the 125-layer fixture baseline: five selected original layers rearranged, six native invitation layers added. The visible invitation is above unchanged Luke sign-off/map; original letter paragraphs remain readable, and QR/voucher/legal content remain visible. Passed workflow assertions cover no mutation before review, before/after inventory, stale scope/revision rejection, one undo/redo/save/reload and original-word preservation.

Final artifact SHA-256 values:

```text
ad7e089a8828823035afb940dcff1564c8b5e59cfc0cb61b1320531fe20d130c  ui-evidence.json
27936e074a0717c930cd012a0950a1f578c4cfd326a09f4d1f8d04cfbcb39d83  preview-text-fit.json
65ae4b61ebf5da98237c644992b84b81c2a78d810bfe6ee22eeef899be8e24df  editor-text-fit.json
ae3fe9c4042b9e1156d6cb167d46b6652c4c0253a64fb700b78358875f2784f5  unchanged-inventory.json
```

Reviewer visually inspected `asset-1.png`: leafy suburban header with a blank body, not the original flattened letter. The browser script checks its bytes against saved reconstruction background SHA-256 `7a525834251e567ff259b9c150d6d4ed03411baa73d840fcfdfb53c7dc68e5b0`; `asset-provenance.json` identifies pilot project hash `7164c021e04a1a002b446146c42fe5b0c5b06300ede151644d184e5ba1ff5618`. This supports the curated fixture only. Saved reconstruction metadata is user-reviewed provenance, not independent pixel analysis of arbitrary uploads.

Authentication, model output and persistence in the browser harness are synthetic/local fixtures. The curated native letter starts from prior reconstruction; this increment does not automatically extract or repair an arbitrary flat flyer. There is no live provider result, client-record acceptance, public QR scan, deployment, final PDF/print approval or invented showroom evidence. Font/rendering fit is browser-side; the server's geometry guard is not a browser glyph measurement. Human visual review and authorized production evidence remain required for those separate claims.
