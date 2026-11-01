# FigFlow final read-only pre-commit review

Reviewed release worktree at HEAD `ee3608c007678d2a3f48a7702682b7ba207f2385`. Inventory came from `git diff HEAD --name-only` plus untracked files, excluding `.verification`, generated ignored files, `workers/craft-editors`, and `.github/workflows/figflow-native-build.yml` (PR798). All 86 included files were read end to end. The `.figcraft` ZIP was opened and its 920-byte `document.json` inspected. No files, dependencies, database, commits, or deployments were changed.

## Verdict

**No code-level blocker found in the reviewed release source.** `git diff --check` also passed. Release must remain blocked on the operational prerequisites below; this is not a production-readiness or complete-FigFlow-feature claim.

### Release blockers / required sequencing

1. **Approved matching JWT secret is not yet provisioned/verified for the new service.** The private Worker requires the existing Pages `JWT_SECRET` before module initialization and rejects missing/empty/canonical-fallback values. Remote presence on Pages does not prove a matching service key. Obtain the approved source without logging or committing it, then verify service auth before the Pages cutover.
2. **Migrations 491 and 492 must be applied together to the intended target.** Both schema-1 writers require 492 columns, and the 492 projection trigger requires those writers. No production migration has occurred. Do not run new writers before 492 or leave an older projecting saver active during the trigger transition.
3. **The final Pages build is still running and has no size verdict.** Prior measurements are not evidence for current main `ee3608c00`. Preserve the immutable raw/gzip guards; do not release until this exact build passes.
4. **Hosted service and caller verification has not occurred.** Dry-run and 16 target guards pass, but there have been no production writes or deployments. Deploy/verify the private service and matching key first, then guarded Pages, then verify existing template update/delete and QR navigation. Keep the previous Pages artifact for rollback.

### Source checks that hold

- **Auth and scope:** Pages middleware still runs before transport. The private Worker repeats canonical session validation, fresh permission groups, read-only denial, assignment/active-client checks, and agency-versus-client scope. Browser scope is declaration only. Delegation headers are forwarded without a parallel authority owner; template PATCH/DELETE remain outside the delegation allowlist.
- **Immutable history and receipts:** migration 491 enforces identity/head/parent/owner invariants, direct-successor heads, immutable revisions/receipts, and protected deletion. Save/metadata operations use owner/document locks, expected-head CAS, payload-bound operation receipts, fresh authority before commit and after render, and rollback on failure. Legacy drift conflicts preserve both live content and history. Repeated initialization does not mint another baseline or reset a structured head.
- **491+492 pairing:** both revision writers store subject/preview. Metadata copies canonical `payload_text` verbatim and advances metadata/HTML/projection/receipt atomically. The trigger compares owner metadata to the exact new head. Existing historical rows are not silently backfilled.
- **Legacy extraction:** the moved template handlers retain the original body parsing, require-write, scope, renderer and content-free 409 behavior. Legacy CRUD bypasses the draft flag but requires the private binding. Ordinary unversioned edits/deletes remain available; versioned conflicts return 409.
- **Transport/admission:** the transport overwrites environment attestation from trusted Pages config, forwards original authority, adds no public fallback/retry, and forces no-store. The outer Worker validates environment and secret before dynamic Nitro import, bounds bodies before adapter buffering, and leaves origin/session/permission checks in canonical handlers. The legacy PATCH ceiling does not raise the renderer limit.
- **Deployment guards:** private names and resource identities are pinned, public entry/routes/preview URLs are disabled, draft flags are false, production requires exact fetched main and a clean source tree, and config rejects embedded secrets or unreviewed capabilities. The service and Pages configurations use matching renderer/Hyperdrive identities.
- **Honest acceptance:** documentation does not equate source builds, local Worker tests or native shape save/reopen with a complete EDM bridge, publication, staff UI or email-client compatibility. F01–F12 and native EDM/module workflows remain open. No flag should be enabled from this backend package alone.

## Evidence boundary

This was a source/document review only; no tests were rerun and no database was contacted. Parent-reported evidence accepted as context, not independently reproduced here: 430 tests across 24 files including actual Worker/renderer/local PostgreSQL; production Worker dry-run and 16 target guards; database now stopped. Local tests do not establish hosted Hyperdrive, native browser bridge, staff UI, or Apple Mail/Outlook/Gmail acceptance.

## Read manifest

| Path | Lines / binary format | SHA-256 |
|---|---|---|
| `docs/email-builder/figflow-action-contract.md` | 97 lines | `4b39696b8f23e0a2d4470da216e1019625f0c4bb6364d3c0d294f47af6e8e5ae` |
| `docs/email-builder/figflow-capability-matrix.md` | 122 lines | `a801a3073a2c2166af5518637b4ab525e63fa163ef0afbfac080eece61ae9291` |
| `docs/email-builder/figflow-edm.md` | 13 lines | `f547c2dd949dff66ad55640c23f06ac75d07d1f8acdafea134ef73eccfab3911` |
| `docs/email-builder/figflow-integration-inventory.md` | 230 lines | `1008dd7fb4997a87e5984b64ec53f0c2bec973a1a9d9d6455410b167588de3af` |
| `docs/email-builder/figflow-revision-persistence.md` | 310 lines | `6481bd7ae27f7dcc7b4c2024e774cb5e3b47cce967bcf2881de94b5714a43a43` |
| `docs/email-builder/reviews/2026-10-31-grok-initialization-review.md` | 109 lines | `5c1126296adea4271cbe358ed1577b1f65e83ebc1ed57e97c605e4ab958a0575` |
| `docs/email-builder/reviews/2026-10-31-grok-save-review.md` | 148 lines | `8715c4b30de72f97a4613d077ef27886d484072ea46ad3d340455a5596fd4308` |
| `docs/email-builder/reviews/2026-10-31-kimi-request-implementation.md` | 42 lines | `375717d6e79eca5e30d53154f66412fe72ea6a06b278b124a0082f34e1955975` |
| `docs/email-builder/reviews/2026-11-01-grok-bundle-review.md` | 93 lines | `3bed8ec531c3669a6484e08a87b88b6c5269b75b591ec0f642c3e618e50fc363` |
| `docs/email-builder/reviews/2026-11-01-grok-delegation-review.md` | 58 lines | `b0f826f70b1a1090bf134e3d291dcb9f46fd27ee9423b5457417beddcea3a551` |
| `docs/email-builder/reviews/2026-11-01-grok-extraction-review.md` | 43 lines | `7b2cb2edf775aa18aeba75e87a8c14a8ae209da8c6061ca14ac381646d608118` |
| `docs/email-builder/reviews/2026-11-01-grok-main-size-review.md` | 31 lines | `77bb060859f15ed5559f7917f80ed5c73ca760ce00a875452a15f8122c13c0d4` |
| `docs/email-builder/reviews/2026-11-01-grok-metadata-review.md` | 52 lines | `2e9682e40a1dcbed55c68ac5de0e3131b6d1eda06c37185027ae344024b43a09` |
| `docs/email-builder/reviews/2026-11-01-grok-native-review.md` | 101 lines | `30624166f1d54d03c48c5f9137016ced13ad3981c6845f63579694fe3ff59254` |
| `docs/email-builder/reviews/2026-11-01-grok-proxy-review.md` | 71 lines | `730af32f870a9cd78d9192f0882b89e032c4cbf7ffc04ed56dfcf34443099f75` |
| `docs/email-builder/reviews/2026-11-01-grok-runtime-review.md` | 40 lines | `673908214a342657f17df19e33b480c79aa1d0b7ce81c556c2c9d8cb95e3621f` |
| `docs/email-builder/reviews/2026-11-01-kimi-initialization-completion.md` | 38 lines | `1a5a32b6dd5bf9e3652c2b2aaafa2b70ba122b6fa2fae90220499f256928e89d` |
| `docs/email-builder/reviews/2026-11-01-kimi-native-build.md` | 63 lines | `7cb6e784fe23a557fa4c4ad1244d7b9c1db4da92efcc6979cdae204f624f3773` |
| `docs/email-builder/reviews/2026-11-01-kimi-source-release.md` | 66 lines | `16253ad014ed69bd9059effb977d8797cc98d6e50048693b95c1328d0d35eba6` |
| `docs/email-builder/reviews/2026-11-01-kimi-worker-admission.md` | 50 lines | `91a880dc79618ab86702f748fe0cb9bcc7ee853bd20cfa419337ccdd26d51478` |
| `docs/email-builder/reviews/2026-11-01-kimi-worker-legacy.md` | 43 lines | `fb935c077cbc7f23bcd7b47dafbb125ba8bd16a9ced80288fa8bef2629454c87` |
| `docs/email-builder/reviews/2026-11-01-kimi-worker-spike.md` | 62 lines | `2c26c19ee6a4df53257af109230c748b7315f8f490790f456e1b95ddab4afa25` |
| `docs/superpowers/plans/2026-10-30-figflow-edm.md` | 800 lines | `89a4b33c93de8dbf497ea0aa9cf0509a002ced9342b306c77b40bf322155ddce` |
| `docs/superpowers/specs/2026-10-30-figflow-edm-design.md` | 173 lines | `5c71a4262738662a48b409027a857289bce58721b7927828a38264c2060410df` |
| `nuxt.config.ts` | 564 lines | `f01cbd71fd4af6c37ea3c95648f017289efa507627377fab7f7f5f8c05ca43b6` |
| `server/api/email/design/[...path].ts` | 1 lines | `a3323669dbc2fa8aca6e187bb1975ee1291d009e960378fc1e9e097fb875895e` |
| `server/api/email/design/drafts/[id].get.ts` | 77 lines | `e477c5459ec15e64748f07208f1e6388cce0eeda499cb1010098bc1bcd476e66` |
| `server/api/email/design/drafts/[id].patch.ts` | 152 lines | `5a2d91e6a57a8081b75bb22118758dab5d1febc4a1511c20c3ce8607d5c7cd94` |
| `server/api/email/design/drafts/[id]/metadata.patch.ts` | 111 lines | `934788384a69339e8b927afef24f63271250320df86f20a68a7637b76e6cc79d` |
| `server/api/email/design/drafts/initialize.post.ts` | 92 lines | `c9a018b3c5b8e644a2f5c80e46e9fbd713820483199880c7db02de9270d0ef11` |
| `server/api/email/templates/[id].delete.ts` | 1 lines | `a3323669dbc2fa8aca6e187bb1975ee1291d009e960378fc1e9e097fb875895e` |
| `server/api/email/templates/[id].patch.ts` | 1 lines | `a3323669dbc2fa8aca6e187bb1975ee1291d009e960378fc1e9e097fb875895e` |
| `server/database/migrations/491_email_design_revisions.sql` | 161 lines | `202c0350d39140f85a30f2d04b6bcccaa0762cecae77c9a8cfe6676d4c40201e` |
| `server/database/migrations/492_email_design_revision_metadata.sql` | 25 lines | `a839de86d4145950116508e6e49fad4bef69a325d44b90776abbe7affb99c5ef` |
| `server/utils/email-marketing/designAccess.ts` | 70 lines | `335a633fdd449422bae5f3c256ec07f9f4accf6bc9ac506eaec4030a11f72b64` |
| `server/utils/email-marketing/designConflict.ts` | 30 lines | `8a65675b153adc9d8831771b840baa92c3731600ab50db1ce242d4ec509adce8` |
| `server/utils/email-marketing/designDependencies.ts` | 151 lines | `9507179f31752711aeb9979be55a78e0e2997b0e6a09ee4ec710127fcc7be6e5` |
| `server/utils/email-marketing/designInitialization.ts` | 84 lines | `b8935f3735b8ed24ec76f698d50737c50d22261d522f5a3adaf403a950b23071` |
| `server/utils/email-marketing/designMetadata.ts` | 196 lines | `6464ca56cda60c1c7bfa3669a6ae6e03e9180cddade821719eba273fc271259f` |
| `server/utils/email-marketing/designReads.ts` | 169 lines | `3cf9644207029f2ab18cf0b68b9815e0e8012d73a40a253963380d5a555f579f` |
| `server/utils/email-marketing/designRequest.ts` | 93 lines | `75eb6804b931ed83670f1c87561d82ebaca92e76cd1ac5fe9c87aee1bba855a1` |
| `server/utils/email-marketing/designRevisions.ts` | 452 lines | `7c0636a900b4903d945664b64afaaab8d0e2a8dbfcac7f4803449ccce608c633` |
| `server/utils/email-marketing/designTransport.ts` | 42 lines | `a64faf7493c2a50bc1fa06d2cdc8e64d2c24afb45addd078f2eec5d5a544228d` |
| `server/utils/email-marketing/templateDeleteHandler.ts` | 20 lines | `fc092c3b8bb302b0c9983188ae32f319b4f4b4b26d3a38f8d1a9f22e09626bb1` |
| `server/utils/email-marketing/templateUpdateHandler.ts` | 38 lines | `b04c4d3edc9fb1af8db3c88853750e49b96ec4a2ea8a3c1d2d6164533e26e5df` |
| `shared/emailRendering/designActions.ts` | 528 lines | `a894dd80d9f2269b05c01930052b1841ee49ebfe6719acb81fa4b5236a7ff628` |
| `shared/emailRendering/designAdapter.ts` | 35 lines | `150abe16c20f8238a21ac07976a750e06cc1d39cc83bc566759f47fc2543c827` |
| `shared/emailRendering/designCapabilities.ts` | 103 lines | `bd2d7b722e5790844f6effcee42afc1f2f25a230c753634baeedd85bb8ef5c87` |
| `shared/emailRendering/designContract.ts` | 395 lines | `00e2a5dc0cc27d08865385f8b3f830c375557c61143896f0d7233db728e78dd6` |
| `test/fixtures/email-design/figflow-synthetic.figcraft` | ZIP; document.json, 920 bytes | `d190019b18bc3571c4ff4e60fd605af1863088424c9845d2dd4282e2f866477b` |
| `test/fixtures/email-design/structured.ts` | 81 lines | `b3c9ea82a4fd9ebf6fc68791c6b8524b56f748445bc13a22bcb585f75bd08ed4` |
| `test/integration/emailDesignRevisions.database.test.ts` | 1903 lines | `eb27a5d8b3ebf4b2fabfa811e091d18cfd8d834753a976972c1014388c4f2d7d` |
| `test/integration/emailDesignWorker.database.test.ts` | 242 lines | `e7dab701a341193077c49ddd4cdc1f9d47d4f4b4e0540869a96eda261e9882b5` |
| `test/server/api/emailClientScope.test.ts` | 474 lines | `56a3823cc00315d7d7557734a6465fc22fc7ab16a5d261915765d674cb038f9f` |
| `test/server/utils/godModeInternalExecutionDelegation.test.ts` | 401 lines | `76ea765b46631f75f33fe09d9e069541bd37a5474129702a3111f40ab725cf20` |
| `test/unit/emailDesignAccess.test.ts` | 93 lines | `463b3a4c8c5d5fd1e82b983d0cc85006b3d164231beb6dc44ab36bdf79605be7` |
| `test/unit/emailDesignActions.test.ts` | 507 lines | `f50e1a99d649918593c493c2ad3322250c70b62d8c2f341ceb454474c00716c7` |
| `test/unit/emailDesignAdapter.test.ts` | 72 lines | `e854c213cb0af6a92f8478925406f9385de3cc52a6f379eec8c0a7a83dd49f95` |
| `test/unit/emailDesignCapabilities.test.ts` | 65 lines | `895d3a9ddef79ca9fac283e81a394d00fd7710a9cad4c1ffed8b64ef89d83cb8` |
| `test/unit/emailDesignConflict.test.ts` | 25 lines | `0ccdc0f40233f929aca6d91e38736d5653f931b30ba75dc869a1f725eab130ab` |
| `test/unit/emailDesignContract.test.ts` | 307 lines | `4756e1342a27e8b736007ad9b326caa5478b9895547edd74b9f8fc96954dd6fd` |
| `test/unit/emailDesignDependencies.test.ts` | 182 lines | `0cd40fe06dcaee018f3686814d03a013dd1e49bbfb95eaa2f0eb4668d62e9a3f` |
| `test/unit/emailDesignDraftReadRoute.test.ts` | 104 lines | `ca18cf7363de7fe9569c3c59be2af96219c0882fcc467fdd5b7d79dfef082d0a` |
| `test/unit/emailDesignDraftRoute.test.ts` | 164 lines | `18f64ef41a275706c5396c3aa38645eb79f323c85c8e3d6e74212569e444e03a` |
| `test/unit/emailDesignInitialization.test.ts` | 297 lines | `ccb2c3bc842bea45eee606a3bdab9d80bacd3050291d725692e76c5cf443417e` |
| `test/unit/emailDesignInitializationRoute.test.ts` | 167 lines | `45ad8db7f256f5dd5051429a22b2c837976b97c79dc857d118875bcfbc980c1d` |
| `test/unit/emailDesignLegacyRoutes.test.ts` | 58 lines | `64e8a0c24afc7b885dee6eb1d9df0769134c1884907739884ba3a57449bad618` |
| `test/unit/emailDesignMetadataRoute.test.ts` | 141 lines | `4bcb27c89452b595684b85021b9a67679ad609bfb7da5e963b8168e0408a5b2f` |
| `test/unit/emailDesignProxy.test.ts` | 82 lines | `7e301d48f99368f592a172bf4f46376c20d0c3dbebdc5170bff7200b3dff0d2f` |
| `test/unit/emailDesignReads.test.ts` | 275 lines | `ea73a36b50d992391ad1d2b743497ae1d40300ddcf63eb19705aec7093939b0e` |
| `test/unit/emailDesignRequest.test.ts` | 198 lines | `14efdd3eae392779710dbb7f574d5c145387b9a01f1c63120a6793cef3d76e31` |
| `test/unit/emailDesignReview.test.ts` | 113 lines | `fe351b7cc7b4372ce70e3573b0cf3649932e08002622626c0d587ed8d77a3bb3` |
| `test/unit/emailDesignStaffEdit.test.ts` | 92 lines | `c95d8b880f1d94c3dfd33011721f42f5bf68a7ef62ff3b8d3996a1f7500f9d06` |
| `test/unit/emailTemplateClients.test.ts` | 76 lines | `485a4419aadfd801952cc77b352a88a29e5ba66028f2aaf24391ef656595e2a1` |
| `test/workers/emailDesignDeploy.test.ts` | 47 lines | `962087b22f0398fa9aecfc03786d1e19223896b98cba6ba33e7bef4be127b5dd` |
| `workers/email-design/.gitignore` | 2 lines | `59adf047a621a443903addc5897a0b196cd8d379ca60a83315e64e582cdb1c16` |
| `workers/email-design/README.md` | 103 lines | `3856c58e6dac7dd0bf6125a984820ee0c2323d0ec90768d2faa9dbee09a0466e` |
| `workers/email-design/admission.mjs` | 82 lines | `33f4f4d042a8ca025337e068b69ed038b4523a7931d858c2de500fa3781cfaa3` |
| `workers/email-design/build.mjs` | 22 lines | `3bdd7bd37286bf70e969c20f25080af4fb2d3b58dc0883e857cf4939a574fb3d` |
| `workers/email-design/deploy.mjs` | 67 lines | `48af59969171fded8cf096514b3a9351505b48a87f63972c1a89d96ca5498f42` |
| `workers/email-design/nitro.config.ts` | 93 lines | `3c6ac9c69ba3edd719385f8ce9b29020f52eaade9ac0036d1b2f5af370f83db5` |
| `workers/email-design/package.json` | 16 lines | `5d33a6449247f414df77e8e86897df77cb5d96978609efea00e373780853f504` |
| `workers/email-design/test-admission.mjs` | 226 lines | `1e43d02e4a49574b4e2bce82e9f56657996e811a99b7d9fec09cbc3a0ff4a020` |
| `workers/email-design/wrangler.production.jsonc` | 51 lines | `f34dd5f924e775e7a694ffae47b4f84a19e876f49de4c12b88ecc6845aaf8819` |
| `workers/email-design/wrangler.staging.jsonc` | 46 lines | `45dd831d62d12b68ec997998395045196c4ad31c5ab715024661b5878789acb1` |
| `wrangler.toml` | 544 lines | `8a31078362908d496520bd26d5996062da2ad0b3a81f69deca6e6412e519ed47` |

Total: **86 files**.
