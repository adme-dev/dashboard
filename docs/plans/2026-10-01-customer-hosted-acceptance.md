# Native customer staging acceptance — 1 October 2026

In progress. Production unchanged. Customer flags remain off; hosted acceptance not complete.

Sources: Dashboard ab1dab31536d49e8b8ec97475edb3530ebaf5c09 (current main a98b83a53c65fbb80da48e8a2348610d2c9d24bb), Studio 1a50516610adb66d9c714be8a6a8ee4a25bb65a6 (current main 50d372e1cb0bc92a661379866062dbe75a4539d0).
Both full CI runs passed: Dashboard36794511635; Studio36791752648.

- Neon project square-tooth-23821574, branch br-long-mountain-a4f73v10 (staging/page-studio), neondb: migrations442–447 applied successfully through per-migration transactions. Existing prerequisite tables verified first. No production migration.
- Two synthetic native accounts: A 8c3e8bff-be34-44f9-ae0e-14fa7e8ac4d6, B ac7bc7a0-7bfc-41ce-bbb3-0f6787384811. No email sent. Private fixture tokens/DB URI outside Git in mode0600 files. Must expire tokens, revoke sessions and suspend fixtures when acceptance finishes.
- Image built from clean git archive of Studio1a505166, root Dockerfile.sandbox, linux/amd64. Pushed registry.cloudflare.com/a5b299b3ad15c1b5b895dc66f9357b17/xeroflow-customer-studio@sha256:c8383987f497cf87eb75036029ef3c8d6d02c08aaa9eadf7228fb82797b16b21. Config/test pin reviewed, 3 config tests passed, full-image dry run passed. Independent review: no blockers. Image-pin commit c5cb836; its hook was still running during the first staging deployment. Worker code was unchanged from 1a505166 and the reviewed pin is the exact deployed digest. The completed hook checked 1,497 files without changes.
- Control staging new version64092345-9272-4161-81f2-a9472fa44dbd; prior638f0c12-516e-4a5c-b329-2440d39b4f25.
- Sandbox staging new versionc9efc6f8-bdfd-44c6-aee4-1093935c7461, applicationa0329e66-ac29-49de-b757-943ac7d3299c; prior04b7e18f-14b5-4f0c-b5dc-2f4d1419f172. Container versions readback: version 37 at 100% with the new image; version 36 at 0%.
- Executor staging new versione6e9dcbb-dbd5-4740-a592-1de3a5b6fadf; prior87fbdb46-e9ee-4955-a3b8-a738b4500cbb.
- Provisioner staging new version5af10df9-b7dd-47c6-8fb5-2e10cd40d428; prior4fa95823-02ee-40c8-94c3-ab80576ec0ec.
- Dashboard preview deployed through pnpm deploy:preview: 4eeccc66-5bcd-44e2-8a01-1de9ffd21426, source ab1dab315; pnpm deploy:check passed. Prior preview87cb9bae-3f85-4322-8c2e-b11e3b027fdc, sourcef5aead3257a9972c644cc35abbbeff6cc3849f07 verified ancestor.

Rollback: leave customer flags off; if regressions, roll back exact staging Worker versions and Sandbox image to prior7ffc9d01d0661d4e39238fac2c8d3c85ad901b21733924f57f48d2ce8a976e38, restore prior Pages preview artifact. Preserve additive schemas and immutable fixture receipts. No production target mutation.

Remaining: bounded fixture activation and private CMS setup; two exact native scopes/routes; separate resources/readbacks; real browser launch/save/reload/reconnect/both modes/return/revocation/isolation; agency and QR navigation smoke; source/receipt documentation and PRs. Do not mark RND22 complete.

## Subsequent verification

Dashboard deployed to preview4eeccc66-5bcd-44e2-8a01-1de9ffd21426 from ab1dab315. Raw25444939/25468928 bytes; gzip6945635/9750000. Customer config returns enabled:false; QR route returns HTTP200 (authenticated navigation still pending). Container versions API proves version37/new digest100%, prior36/old digest0%; application root configuration still reports36 and is not sufficient rollout evidence. Studio image pin committed c5cb836; 1497-file formatter passed with no fixes and branch pushed.

Both native fixture identities/workspaces/sites and immutable provisioning intents were created through actual Dashboard services on staging. No agency/client identity was fabricated. Hosted jobs failed before allocation: native authorization leaked internal workspaceId into the strict shared Worker response. A real PostgreSQL test reproduces the extra field, then the adapter projects only job,userId. Temporary staging activation configuration is prepared but not yet deployed. It opens preview signup/sign-in/onboarding generally during acceptance; resource provisioning remains limited to two expiring approvals. Disable flags explicitly after test; expiry alone does not close signup.

## Hosted defect and regression

The strict provisioning authority response must contain only `job` and `userId`. Native ownership validation additionally returns `workspaceId` internally; forwarding it made the Worker reject an otherwise authorized native job. The shared adapter now projects the existing wire contract. The new real PostgreSQL test failed with the unexpected field before the fix; all 96 focused provisioning/API/deployment-guard tests passed afterward. Native revocation and recovery checks remain unchanged.

Generating environment types for the temporary staging settings exposed a TypeScript literal-origin comparison error. CustomerWorkspaceEnv now replaces those generated literal properties with its existing optional string settings before validating runtime origins. Sandbox type checking and 107 native boundary tests pass.
