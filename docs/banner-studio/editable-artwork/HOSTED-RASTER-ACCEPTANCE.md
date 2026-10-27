# Hosted raster export acceptance — 27 October 2026

Checkpoint 12:38 UTC: **PNG and JPG pass live acceptance; GIF remains under repair.** This is bounded synthetic acceptance, not completion of the editable-artwork PRD or provider/native-engine acceptance.

## Released source

- Pages: `09bc4d2e927161f3857effef57dbaeac4cd38715`, deployment `44decd8f-7e44-4513-b99b-cf3309d39ab0`, `agency-dashboard`, production/main. Canonical API readback confirms success. Current main at release: `eb294e8600cc4054d1c9dd98eb46ec61c1ea9958`.
- Pages artifact: 3,016 JavaScript modules, module-set SHA-256 `b60a914dd36ada99bec613c2b31cc5ff7589f48f180a75f98d34ea3d02898813`. Raw 25,394,024 / 25,468,928 bytes; gzip 7,442,047 / 9,750,000. Original size and exact-artifact startup/codec gates pass unchanged (six final-artifact tests).
- Private renderer: `86ebf6fd321c0140f9a6d6c3b40d0e42e3667857`, version `cb00095b-73af-4cfb-acef-9b54aa52de11`, deployment `52f3e3f6-a90c-4014-ad8b-4bbafcd81c89`. Readback confirms only BROWSER and three manifest/environment variables; workers.dev and preview URLs remain disabled. Pages retains its named private service binding.

## Faults repaired

1. Calling native Workers `fetch` as a dependency-object method produced `Illegal invocation`. Source `39bfe92b9` wraps a lexical global fetch. A real workerd regression was red before the correction and green afterward; 105 focused tests, lint, strict typecheck, bundled codec/RPC/resource proofs pass.
2. The same pinned-font HTML rendered through the local remote caller but failed through Pages. Removing the font request made Pages succeed. Adding `global_fetch_strictly_public` to the private renderer alone made the unchanged actual UI PNG export succeed with the pinned font. Both configs and the deployment guard require the setting; 23 focused configuration/policy tests pass. The independent reviewer passed 49 renderer tests and found no code/security blocker. Cloudflare documents [public routing versus same-zone origin bypass](https://developers.cloudflare.com/workers/configuration/compatibility-flags/#global-fetch-strictly-public); exact caller-zone inheritance is an inference, not established by this evidence.

Neither repair exposes the renderer publicly, weakens resource allowlists, follows redirects, forwards caller credentials, or accepts fallback-font output.

## Live synthetic acceptance

Project `ee7a3328-c081-4e20-abc8-e3b4ff55a1fc`, three synthetic layers, no client, saved revision `2026-10-27T10:52:30.456Z`. Heading: “Welcome tomorrow”, Source Sans 3 Bold with cyan neon styling. Tests used the real editor export buttons and independently decoded their downloaded Blob bytes with Sharp.

| Check | Result | Evidence |
| --- | --- | --- |
| PNG 1× | Pass: 640×360, 35,124 bytes | Export `45b8ecb0-74c5-4ccd-8f35-1046931db44d`; SHA-256 `25e801dee9da48cc0b96d84c7b4b9819d202fb291e0d79ca7096e183311f557c` |
| JPG 2× | Pass: 1280×720, 39,780 bytes | Export `c07fde58-e4f6-48af-8f44-d2a6769732a3`; SHA-256 `98b6c77721b3d47ae5aaa48de5e09f06c8163c204e7e269bc7fa50f9aba7919a` |
| Signed uploaded image through renderer | Pass: 2×2, exact decoded source pixels composited over browser white | Existing synthetic asset `4343b8a4-c30b-465a-b37c-6c316072e241`; export `9acfa0ac-0acf-4d9f-8911-f074b71df8fa`; 96-byte PNG SHA-256 `e791ad8b71c514057393011aada1c2dc87e310d98acd5a2f0f0d0abea0d022fe` |
| Authenticated saved PNG/JPG GET | Pass: HTTP 200, exact original hashes and sizes | Private no-store, attachment, correct MIME and nosniff |
| Authenticated PNG/JPG HEAD | Pass: HTTP 200, correct MIME and private no-store | Hosted response omits optional Content-Length; no claim of hosted length-header preservation |
| Unauthenticated PNG/JPG GET and HEAD | Pass: HTTP 401 | No file bytes delivered |
| Unsigned direct R2 S3 requests | Rejected: HTTP 400 InvalidArgument | This alone does not establish every bucket access configuration; earlier settings readback established no public r2.dev/custom domain |
| HTML5 | Pass: actual 5,102-byte animated HTML download | Exact wording, pinned font and neon declarations; SHA-256 `ac1f54e312d646954d87229b754dc3c11934f784e80f8259322d4be369d8e25e` |
| GIF | Fails: HTTP 502; fixed private synthetic RPC reports RENDER_FAILED | Exact HTML above, 640×360, 10 fps; no saved GIF accepted yet |

Customer baseline `38ef6f18-a6ad-45c9-85e7-84dfa0fe8cc1` was read only. Its revision remains `2026-10-26T03:49:11.160Z`; canvas SHA-256 remains `e7f7c22f77232601fd80b63c1df7c604b523924e3198eac5c39640bff55b168f`. Banner Studio and QR Codes navigation are present. Earlier live save/reopen, exact undo/redo, animation persistence and Creative Studio/QR page checks remain separately recorded in AUTONOMOUS-RUN.md.

Local receipts are under `/private/tmp/banner-live-*-evidence.json`, `banner-private-download-evidence.json`, `banner-rendered-owned-asset-evidence.json`, `banner-final-pages-artifact-receipt.json`, and `banner-renderer-worker-readback.json`. No request cookies, signed asset tokens, provider credentials or customer content are included here.

## Remaining boundaries

- GIF repair and required CI remain open. Current CI run `40500087799` targets Pages source `09bc4d2e9`; later renderer commits still need a final pushed CI run.
- Live AI lettering/provider acceptance was not executed: automatic approval review rejected the external provider transmission/spend. Raw production log capture was also rejected and was not executed; diagnosis used local runtime proof, safe aggregate analytics and fixed synthetic private RPC instead.
- Native engine registry push failed twice with EOF and no published artifact; no hosted native invocation occurred. Native jobs remain disabled. See CLOUD-CANARY-RELEASE-DECISION.md.
- Full four-side creative reconstruction, provider-quality evaluation, general vector/image editing, remaining engine adapters and print/duplex requirements remain outside this accepted slice. See COMPLETION-AUDIT.md, noting its historical status snapshot predates the deployment and R09 revision repair.

## GIF decoder release candidate — 12:49 UTC

The exact generated-HTML failure is reproduced and corrected locally in actual bundled workerd with real Chrome. Only the shared bounded PNG inflater changes production behavior: fixed 64 KiB native allocation headroom plus strict original decoded-byte bound. Candidate30 browser/inflate and4 interoperability tests, lint and renderer TypeScript pass; implementation reports78 focused tests and independent review reports58 additional boundary assertions. Full candidate Pages build passes3,016modules, raw25,394,186/25,468,928 and gzip7,442,059/9,750,000; all6 exact-artifact tests pass, now including640x360 full-pixel hashing, one-byte overflow and native inflate-bomb rejection. This candidate has not yet been deployed and does not upgrade hosted GIF acceptance. See GIF-GENERATED-HTML-REPAIR.md.
