# M06 authoring integration — 2 November 2026

Completed locally across midnight on 3 November, Australia/Melbourne. Source base: `b9eb69390ff8a6e97ce3e1b11eb7491493f422da`, including corrected M06 `6c55231e6e812ff0be6a29dfa92223af7a55fcff`. The coordinator advanced HEAD to `e615f5baaf01bd5c9cf6dc26a19145029eed2b02` (native library integration) during this task; the final combined suite was rerun afterward. This receipt covers the working-file hashes below, not an authoring commit or release.

## Implemented behavior

- `BlockSettingsPanel.vue:411,574` retains the existing Button URL and Image link property owners and uses the small `EdmLinkTargetMenu.vue` control. It offers Normal URL, Unsubscribe URL, and View online. The last two emit exactly `{{unsubscribe_url}}` and `{{web_version_url}}`. Arbitrary authored URLs remain editable without normalization. Menu choices are drafts until **Use link**; Cancel or dismissal emits no property change. Each field/block has a separate component key. The existing Image/Avatar branch shares its link field.
- The new component uses Nuxt UI `UPopover`, `UButton`, `USelect`, `UInput`, existing/inner `UFormField`, a single-column container-aware layout and semantic colors. The required frontend-design skill was read at `/Users/paulgiurin/.claude/plugins/marketplaces/claude-plugins-official/plugins/frontend-design/skills/frontend-design/SKILL.md` before editing forms. Template help explicitly describes campaign review/configuration requirements.
- `mergeTagDefinitions.ts:5,28,33` reserves and advertises sender-owned `web_version_url`, rejects it as a custom definition, and supplies `https://example.invalid/email/view` for samples. Existing `useEdmMergeTags` automatically consumes these definitions/samples; no composable change was needed. No browser signing or production URL creation was added.
- `campaignSend.ts:173,224` adds a structured **View online** preflight check only when HTML, subject or preview text contains a supported reserved token. It requires `review_required === true`, `web_version_enabled === true`, sending configuration, and existing `emailLinkSecret()` readiness. Guidance names independent review, campaign opt-in, signing/email configuration, and replacing the token as alternatives. Existing sender readiness, exact-content approval and hard sending gates remain authoritative. The workflow flag is deliberately not a second gate on already-gated campaigns: M06 rollback recovery and previously issued links remain supported.
- `sendability.ts:133` probes bounded token slices through the existing merge resolver, so case, whitespace and supported fallback grammar match delivery. Similarly named keys, unrelated fallback text and unsupported token forms do not become this builtin. The generic resolver is unchanged. These sentinel probes do not merge recipient data or sign URLs.
- `campaignSend.ts:361` evaluates frozen conditional HTML first, then refuses a remaining unavailable token before `missing:empty` or a fallback can hide it. Subject and preview-text tokens are checked too. The supplied server URL must have an HTTP(S) `/email/view` shape with c/v/t, no credentials, and cannot be the preview sample host. URL signature authority remains with the existing server issuer/verifier. Actual recipient merge still runs once, with existing escaping, then tracking and final payload inspection.
- Coordinator-authorized scope extension: `campaignSender.ts:213–240` now resolves app URL and signing secret inside its existing pre-provider payload try/catch. Runtime configuration loss after claiming recipients releases the claims and retains the existing 422 `campaign_final_content_blocked` contract. Provider result/receipt behavior is unchanged.
- Template-delete mocks now recognize config, client-picker and template-list URLs separately, fail on unexpected requests, and assert DELETE/list requests specifically. No total-call-count increment masks the new config fetch.

## Counterexamples and boundaries

The unavailable-token counterexample was reproduced and reported before the fix: an ungated/not-enabled campaign containing `href="{{web_version_url}}"` lost that token during empty substitution and could reach final inspection with an empty link. The new helper and sender tests prevent that dispatch.

A second source counterexample was reported: app URL/signing-secret reads happened after recipient claim but before the release handler. Two red mocked tests reproduced the raw configuration exceptions; after the authorized bounded move, both release claims and dispatch zero provider requests.

Native operations were not widened. Shared-contract tests prove existing web/unsubscribe token baselines survive exact no-op operations and an unrelated Heading style edit. A native `set-props` URL operation using either token still fails `EDIT_FORBIDDEN`, including an identical token-URL patch; adding a token through native URL operations remains unsupported. Existing staff content-only policy permits replacing an already-editable URL with the token. One initial boundary test incorrectly styled the protected unsubscribe CTA itself; it was corrected to style a different Heading, retaining the legal-content guard. This is shared-contract evidence, not native WASM/UI acceptance or proof that every native edit emits only changed URL fields.

Preflight conservatively checks the stored content, including conditional branches. The final recipient guard checks after conditional evaluation; a false branch containing the only web-version link does not produce a spurious final failure. An opted-in draft has no frozen hosted URL yet, so a campaign test-send that cannot receive one fails before dispatch. This task does not manufacture a draft preview URL.

## Exact inventory audit

Baseline gate inventory source `46e74e04c`: 1,726 rows, SHA-256 `9f28f7a4004d448a7b9ef6e0f907862d501cb654c94493413beb9bd23767352d`. The unchanged classifier applied to current source yields 1,728 rows, SHA-256 `9f8c344829d51230c1147d080d246f5e054632a19461cea1988602fc7356487f`. There are exactly two added rows, no removed or reclassified rows:

```text
server/utils/email-marketing/review.ts [provider_infrastructure_availability]
* (including 'false'); then the per-request cached binding; then process.env. */
server/utils/email-marketing/review.ts [application_governance_bypass]
const value = fromRequest ?? getCachedBinding('FIGFLOW_EDM_WORKFLOW_ENABLED') ?? process.env.FIGFLOW_EDM_WORKFLOW_ENABLED
```

The first is a comment matched by the existing lexical pattern. These classes are inventory labels, not bypass registrations. Counts: identity/tenant 135, provider/config 224, application governance 1,636, ordinary behavior 301, unrelated configuration 431; historical seeded counts in the inventory test were retained.

The API inventory is 2,339 files / 1,278 mutations / 412 inline guarded mutations / 55 guarded files containing `transaction()`, compared with 2,336 / 1,277 / 412 / 55. Source diff `git diff --name-status 7bcc64db3^ 6c55231e6 -- server/api` identifies exactly three added routes:

- `server/api/email/review/[kind]/[id].get.ts`
- `server/api/email/review/[kind]/[id]/commands.post.ts`
- `server/api/email/review/operations/[operationId].get.ts`

The command POST is the single added mutation. Tests pin genuine session validation, fresh scope/reviewer authorization, workflow-state delegation and origin protection, and forbid bypass registration/adapters in those files. The signed public `server/routes/email/view.get.ts` is outside the API inventory and retains signature/version availability checks. No classifier exclusion, God mode registration or production gate change was made.

## Executed verification

All commands used Node **v24.18.0** with:

```sh
export PATH=/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:$PATH
```

Before production changes:

```sh
pnpm exec vitest run test/utils/emailWebVersionAuthoring.test.ts test/components/emailTemplatesPanelDelete.test.ts test/config/godModeIsolationInventory.test.ts test/config/godModeGateInventory.test.ts
# 4 files failed: 17 failures / 23 passes. Three delete-count failures,
# two inventory failures, and twelve new web-link behavior failures.
pnpm exec vitest run test/components/emailLinkTargets.test.ts
# 2 failures: the Link target control did not exist.
```

Before the sender cleanup move:

```sh
pnpm exec vitest run test/utils/emailWebVersionSending.test.ts
# 2 failures / 6 passes: secretReady and appUrlReady configuration-loss cases.
# After the move: 8/8 passed.
```

Final combined regression command:

```sh
pnpm exec vitest run test/utils/emailWebVersionAuthoring.test.ts test/utils/emailWebVersionSending.test.ts test/unit/emailWebVersionDesignerBoundary.test.ts test/components/emailLinkTargets.test.ts test/components/emailTemplatesPanelDelete.test.ts test/config/godModeIsolationInventory.test.ts test/config/godModeGateInventory.test.ts test/unit/emailMergeDefinitions.test.ts test/unit/emailMergeTags.test.ts test/components/edmMergeAuthoring.test.ts test/components/emailEdmBlockSettingsPanel.test.ts test/unit/emailReviewWorkflow.test.ts test/utils/emailCampaignSend.test.ts test/utils/emailCampaignFormat.test.ts test/utils/emailCampaignSenderPause.test.ts test/utils/emailCampaignSenderSuppression.test.ts test/utils/emailCampaignSenderRateLimit.test.ts test/utils/emailCampaignDispatchSnapshot.test.ts test/utils/emailCampaignSendingRuntimeConfig.test.ts test/utils/emailSendability.test.ts test/server/api/emailCampaignTestSendPreflight.test.ts
# 21 files passed, 196 tests passed, exit 0.
```

Coverage includes property choice/cancel and store serialization/reopen for Button and Image; safe samples and token reservation; normal legacy/unsubscribe behavior; non-gated/not-enabled/unconfigured preflight; supported fallback/case/whitespace forms; unavailable subject/preview tokens; false-branch omission; server-URL escaping; hard send-off behavior; missing frozen digest; final zero-dispatch plus claim release; enabled/gated frozen-link success; and the existing sender rate-limit/pause/suppression/runtime-config suites. The provider and DB are mocked throughout sender tests; no retry/resumption claim beyond these named tests is made.

After adding assertions that compiled Button/Image hrefs preserve the exact saved tokens and sample substitution uses `example.invalid`, the directly changed component test was rerun: `pnpm exec vitest run test/components/emailLinkTargets.test.ts` — **2/2 pass**, exit 0. The full 196-test command was rerun after these assertions and the coordinator’s HEAD advance; it passed again. Production edits owned by this task did not change afterward.

Final lint command:

```sh
pnpm exec eslint app/components/email/builder/BlockSettingsPanel.vue app/components/email/builder/EdmLinkTargetMenu.vue shared/emailRendering/mergeTagDefinitions.ts server/utils/email-marketing/sendability.ts server/utils/email-marketing/campaignSend.ts server/utils/email-marketing/campaignSender.ts test/components/emailLinkTargets.test.ts test/components/emailTemplatesPanelDelete.test.ts test/config/godModeIsolationInventory.test.ts test/config/godModeGateInventory.test.ts test/utils/emailWebVersionAuthoring.test.ts test/utils/emailWebVersionSending.test.ts test/unit/emailWebVersionDesignerBoundary.test.ts
# exit 0, no diagnostics.
```

The initial scoped lint found 38 style errors (including existing compact statements in the owned delete fixture); these were formatted within owned files. Final lint did not suppress rules. `git diff --check` on owned tracked files also passed.

Additional exact commands:

```sh
node /tmp/figflow-authoring-types.cjs > /tmp/figflow-authoring-types.json
node /tmp/figflow-authoring-sfc.cjs > /tmp/figflow-authoring-sfc.json
node /tmp/figflow-gate-audit.cjs > /tmp/figflow-gate-audit.json
```

The isolated TypeScript compiler script uses target/module ESNext, Bundler resolution, strict false, skipLibCheck/noEmit, checkout aliases and Node/Vitest types. It checks the eleven owned `.ts` files above with ambient `$fetch`, `createError` and a Vue module shim: **zero owned-file diagnostics**, exit 0. It also reports **26 transitive diagnostics** outside that scope under the isolated setup; this is not a full Nuxt typecheck result. The SFC script parses and compiles complete scripts/templates for both owned Vue files with `@vue/compiler-sfc`: **2/2 pass**, exit 0; it does not assert semantic Vue template types.

An optional `pnpm exec vue-tsc --noEmit --project /tmp/figflow-authoring-vue-tsconfig.json` attempt (two Vue roots extending generated Nuxt app config) was explicitly terminated with SIGTERM after the generated declarations expanded into the broader application. It produced no passing result and is not counted as verification. Temporary raw logs/scripts are under `/tmp/figflow-*`; this document retains the durable outcomes and source fingerprints.

## File fingerprints and remaining acceptance

SHA-256 of owned implementation/tests at reporting time:

| File | SHA-256 |
| --- | --- |
| `app/components/email/builder/BlockSettingsPanel.vue` | `58acb64ca1683ae4cebc586a3439401a03ae8d845dacadf228c08d5b669a08b2` |
| `app/components/email/builder/EdmLinkTargetMenu.vue` | `6148aac6f64041483aa61f65e124bc6120d602927f730d3fa5e37c1cfd414e82` |
| `shared/emailRendering/mergeTagDefinitions.ts` | `211c97c84bfb68cad107196255058a3590f3299668fca914f28b65c2f8a78022` |
| `server/utils/email-marketing/sendability.ts` | `a004bf783b6adc72a7ce213dc50687ee147dbcdf1fd545582b59eb84e68a15d7` |
| `server/utils/email-marketing/campaignSend.ts` | `6b317cd7fc07cbd4951dfb688710d01e69bf08014ec8bfb1cf7433c1da702151` |
| `server/utils/email-marketing/campaignSender.ts` | `44cee5956a98f4755485f616f92295a0454e3de1883c67b3b43a15f4570677e6` |
| `test/components/emailLinkTargets.test.ts` | `b84c3bf28e1dec8d6ad043eb567becc7ddc89fd854c5c6e0fa2b5078d36018b9` |
| `test/components/emailTemplatesPanelDelete.test.ts` | `1fd6ff8ea6d95ec43a235b45e15f059a1064fab1812e832938c304d89107df72` |
| `test/config/godModeIsolationInventory.test.ts` | `120d10fe21849463b2d1d1c11919f34f9fd2d40e9663cb3a85912dc831660c12` |
| `test/config/godModeGateInventory.test.ts` | `fcee3c64d8fba08e53ae8184a7e894c57d3a362fa7ec0a6eb0911b2818aa86cc` |
| `test/utils/emailWebVersionAuthoring.test.ts` | `2542e222dc44efed54e490c5d51c11a13641c252f903d79d6c4e107bf6aa87bd` |
| `test/utils/emailWebVersionSending.test.ts` | `50bc5f18dc262d1f57fee9240200794a0dc5b2017cd84b4d8e2170a1e1b954a0` |
| `test/unit/emailWebVersionDesignerBoundary.test.ts` | `06b51fda3f66b3a026be7560af6724fa8ef48f839b5c18fbd383994e926e2757` |

No Git/stage/commit/push, install, CI, build, deploy, configured-database/SQL, provider request, real email or browser action was performed. Existing unrelated dirty 08a/native/pin/config work was preserved. No screenshots were produced because browser work was excluded. No flags, shared URLs or hosted artifacts were activated.

Parent still owns marketing-page integration after feature acceptance, binding-budget resolution, configured migration/release evidence, full CI/Nuxt type checking, hosted/public-picker acceptance, and real native UI integration. This bounded authoring/sendability result does not close native library/image/campaign acceptance or general M06/release goals. The raw-provider configuration-loss cleanup counterexample identified here is fixed in the owned sender extension; no further blocker was observed in this executed subset.

## Parent independent-review follow-up — 3 November

Opus review `.verification/m06-authoring-independent-review-20261103.md` matched all thirteen source/test hashes and found no P0/P1. It confirmed one P2 in the shared test-send owner: an enabled gated draft has no frozen hosted URL, and `buildBatchEmail` threw outside that owner's final-content handler, producing an unclassified error before any provider call.

Parent added a route regression in `test/server/api/emailCampaignTestSendPreflight.test.ts`. It failed first with the actual `WEB_VERSION_UNAVAILABLE` error (five existing cases passed). Parent then moved batch construction/signing into the existing final-content try/catch in `server/utils/email-marketing/campaignTestSend.ts`; the same refusal now returns `422 campaign_final_content_blocked`. No draft URL, signing policy, provider call or campaign/recipient mutation was added.

The full twenty-one-file command above passed again: **197/197**, zero failures/skips, Node24.18, exit0. ESLint on both parent-modified files and the complete diff whitespace check passed. Parent read both files end-to-end and retained the existing dispatch-start callback after validation. Independent review establishes the original thirteen-file scope; this bounded two-file follow-up has parent red/green proof, not a second independent review or hosted send proof.
