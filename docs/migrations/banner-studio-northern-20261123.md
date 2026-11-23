# Northern campaign migration acceptance — 23 November 2026

Scope: four Black Friday NOV2026 campaigns, all sizes, editable text and exact font files, equivalent motion/audio, and client proofs with still posters. User accepts native effect equivalents when appearance and designer editability are retained. Do not flatten text or mark an unsupported effect accepted without comparison.

## Current campaign state

| Campaign / source | Destination | Verified | Open |
| --- | --- | --- | --- |
| Leapmotor `0zlwn2m` | Draft `1d4c1e55-b4ab-4e7b-80a9-603bc3fe70e9`, Northern Motor Group, Leapmotor folder | Three sizes saved; a real text edit survived reload and was restored; all 32 native text layers have managed font references, four exact faces returned by public proof API; six-second soundtrack plays beyond three seconds, pauses without drift and loops. Current-revision client videos and posters pass the release checks below. | Producer review of corrected-font comparisons; actual Safari/iPhone; source creation-date backfill. |
| GAC `51gqykk` | Draft `89b0e5e3-0428-4a0a-85a2-70d906c7707c`, Northern Motor Group, GAC folder | Three sizes saved; a real text edit survived reload and was restored; all 35 native text layers have managed font references, five exact faces returned by public proof API; six-second soundtrack transport checked. Current-revision client videos and posters pass the release checks below. Native FREE text, managed Montserrat Bold selector and six-second timeline were rechecked after deployment. | Producer review of corrected-font comparisons; actual Safari/iPhone; source creation-date verification/backfill. |
| RAM `zm1ne30` | Draft `d7a23c5c-545d-409e-bec0-42a1fdd03534`, Northern Motor Group, Ram folder | All three sizes saved with verified viewer; 32/32 native text layers bound to two byte-exact original fonts. Real FREE text edit survived reload and was restored. Word/letter effects, soft wipes and top video fade expose native controls. Original 22,458,658-byte video uploaded intact after multipart repair. All-size chosen poster at 5.9 seconds returns valid JPEGs. | Producer comparison approval; actual Safari/iPhone; source creation-date backfill. |
| Nissan `51gqe7q` | Draft `208ab1c9-d43a-4465-b34a-f2fb7e506232`, Northern Motor Group, Nissan folder | All three sizes saved with verified viewer; 21/21 native text layers bound to three byte-exact original fonts. Real offer-text edit survived reload and was restored. Native 0.4-second TV-reveal timing edited and restored. Chosen 1.5-second poster retains readable title, offer and legal copy. | Producer comparison approval; actual Safari/iPhone; source creation-date backfill. The original 3D Black Friday title is inside source video; native offer/legal copy remains editable. |

The Leapmotor and GAC drafts were refreshed through **Back up and update draft**, preserving identity and a mandatory prior version. They retain `import:needs-review`. Source creation was not inferred from download time. TheBrief's Leapmotor Info panel reports 12 November 2026, 7:53 PM; verify timezone before backfill. Public capability tokens and original campaign assets are private evidence, not committed documentation. No client messages have been sent.

## Corrections and checks

- Font alias normalization repairs real font binding instead of displaying a fallback family under an export alias.
- Authored audio metadata retains the full six-second clip instead of the stale two-second generic element interval. The source preview was observed playing audio beyond four seconds.
- Bordered rounded shapes remain native editable geometry.
- Client posters select only an existing saved size. Revocation/expiry, private image caching, fixed renderer asset policy and rate limits remain enforced.
- Repeated 18 corrected-font comparison captures: three sizes per saved campaign at 0.35, 1.5 and 5.9 seconds. The exported CSS reference and native renderer now agree visually on text, badge geometry, layer entrance/hold/end and video framing. The reference removes original JavaScript and synchronizes media time; this is bounded renderer evidence, not producer approval or actual Safari acceptance.
- With exact frozen-lockfile dependencies: 1,121 tests passed, one skipped across Banner Studio, TheBrief preparation, client preview/capability, QR and deployment guards. An earlier run against shared stale dependencies failed QR resolution/gradient parsing; the clean locked install resolved those failures. Changed code lint passes. Skipped checks are not claimed as verified.

## Acceptance still required

1. Review the corrected-font comparison captures with a producer, including video crop/time, legal copy, font metrics and border geometry. Earlier screenshots predate the font correction and are superseded by the 18 corrected captures.
2. Complete a designer/producer trial on their own account. Admin checks confirmed saved edit/reload/restore, native timeline controls, pause and looping; these do not replace the staff trial.
3. Preserve the delivered-file verification below when subsequent edits create new canvas/font revisions; regenerate and recheck affected sizes.
4. Complete actual Safari/iPhone playback and a designer/producer trial before team cutover.
5. All four campaigns are saved as editable drafts. TheBrief retirement still requires the producer/device gates above; import completion alone is not full team cutover approval.

## Release record

Released in [PR #962](https://github.com/adme-dev/dashboard/pull/962). Source and current main at deployment: `ba26c040546e46918b31455648a49cd882f46761`, based on freshly fetched main `52f84ef95ecf06d650c70851ee0d1e9599a203b7`. Guarded `pnpm deploy:check` and `pnpm deploy:production` passed using Node 24.18.0 and locked dependencies. Production target: `agency-dashboard/main`. Deployment: `237f294f-2587-4208-b2ae-fa3298ea8474` ([artifact](https://237f294f.agency-dashboard-6cm.pages.dev)). Worker size: 15,327,273 bytes raw, 5,316,215 bytes gzip, within unchanged limits.

Live acceptance on `app.xeroflow.io`:

- All six current-revision videos are ready; each fully decodes as H.264/yuv420p with AAC and a six-second duration. Audio peaks are -5.2 dB for GAC and -4.9 dB for Leapmotor. Initial and suffix byte ranges return 206/1,024 bytes; out-of-bounds ranges return 416. Requests used no agency login.
- All six selected-size posters return valid JPEGs with `private, no-store` caching: portrait 675 × 1200, square 1200 × 1200 and wide 1200 × 675. Live players expose matching poster URLs, remain paused before Play, and retain native controls.
- Live GAC 390 × 844 Chrome viewport: no horizontal page overflow; portrait poster, legal copy, Replay and full-screen controls are visible/reachable in social placement. This is responsive Chrome evidence, not actual Safari/iPhone certification.
- QR Codes and agency navigation reload successfully after deployment, with the existing 23-code library retained.
- The shared source checkout's uncommitted analytics files and the separate `fix/banner-viewer-rest-frame` worktree were read only and left untouched. The deployed diff contains only the 13 files reviewed in PR #962; previously merged colleague work is retained through current main.

The PR media-render CI job passed its packaged production-container, FFmpeg and Chromium checks. The broader CI job was still running at the live verification checkpoint; the full repository suite is not claimed green. Source files, raw captures and client capabilities remain in the private migration evidence directory. This documentation-only closeout does not change runtime release bytes.

## RAM and Nissan release candidate

Both all-size packages now prepare without unsupported-animation holds. RAM has two exact packaged font faces; Nissan has three. Reviewed native word/character motion, soft wipe, TV reveal and static video fade preserve editable copy and geometry. RAM's 22,458,658-byte clip passes the bounded 24 MiB video allowance. Rounded clip metadata reconciles only where the full six-second visible interval fits inside the probed file.

Six offline comparison pairs were inspected at early, reveal, motion, settled and end timestamps. Source JavaScript was removed; source CSS and original fonts/media were retained. DOM geometry/masks and settled screenshots agree closely; captured compositor lag makes raw screenshot differences unsuitable as a pixel-equivalence certification. These preparation checks supersede the earlier unsupported-effect blockers but do not yet establish live import, proof delivery, producer approval or actual Safari/iPhone acceptance. Live results will be appended after deployment.

RAM's first live batch stopped on an asset-upload 503 after ten stored assets and two fonts. The durable browser marker correctly stopped blind retries; Nissan was processed independently and saved as draft `208ab1c9-d43a-4465-b34a-f2fb7e506232` with its saved viewer verified. A follow-up bounds large-video upload concurrency, removes two avoidable full-buffer copies, and adds an owner-only read-only receipt check before resuming the original upload keys. The original 503 cause is not established by the available trace; final retry results will be recorded separately.

The current session is an admin, so the initial owner-only receipt control cannot recover this staff upload. Follow-up recovery verifies same-user/client private R2 bytes against package hashes after a 15-minute hold and reuses those receipts without changing roles. Nissan's midpoint poster falls on a blurred source-video transition; a saved poster-time control is included so a clear settled frame can be chosen per layout. These issues are not marked accepted until the live retry and poster checks pass.

The first staff-recovery check verified ten of thirteen RAM asset hashes, then the original large clip still received a 503. Source inspection identified the h3 multipart parser's payload-sized number array and subsequent array slice. An isolated 22 MiB body reproduced heap exhaustion at 128 MiB with the old parser; the byte-view replacement completed with 12,181,288 bytes of JavaScript heap. The file bytes stayed shared and exact. This establishes a concrete parser defect; live transfer acceptance remains separate until the corrected route is deployed and RAM is saved.

## RAM and Nissan live delivery

The multipart repair in [PR #970](https://github.com/adme-dev/dashboard/pull/970)
was released from `64087a4900e159725efdb101d94dacf2d1504616` as production
`72a8b1b9-da21-40e5-a2a4-13b59f3f693e`. Staff recovery verified ten stored
RAM files against their original hashes, reused them, and uploaded the remaining
three without altering the original video. The saved draft and viewer completed.
The earlier pending/held RAM entries above are historical checkpoints.

The chosen-frame renderer fix in [PR #971](https://github.com/adme-dev/dashboard/pull/971)
was released from current main `c3c78ac824e7b6bf42b163bf82e427543470f27c`:
Pages `87f55753-1f67-4a03-bbbb-d6f16454fb22`, target `agency-dashboard/main`,
and internal poster worker version `e0030695-fef2-4e68-a1fd-4ed6bb3bb3f1`.
The retained automatic-midpoint cap rejected frames after three seconds; the
worker now accepts the supported 300-second timeline. Seventeen focused tests
passed, including 5.9 and 299.9 seconds through the complete renderer path;
changed worker/tests pass lint. Six live JPEGs passed size/type/cache checks,
including RAM at 5.9 seconds. Nissan was subsequently set to 1.5 seconds after
reviewing candidate frames; the earlier 5.9-second frame catches source-video
zoom blur. All three final Nissan JPEGs passed again.

Client proof links were created with seven-day expiry (30 November 2026).
Capabilities remain in private evidence and are not embedded in the repository.
No client messages were sent. Both drafts retain `import:needs-review` and
unverified original dates. The admin session's successful checks do not substitute
for an affected designer's own login/device acceptance.

### Final RAM/Nissan release verification

The screenshot check found a second poster issue: a paused HTML render had already
moved GSAP to the selected time with media callbacks suppressed. Seeking that
same time again left embedded video at frame zero. [PR #972](https://github.com/adme-dev/dashboard/pull/972)
seeks away before applying the saved time and invalidates previous poster caches.
A regression executes the real capture script with GSAP and verifies video time
before declaring capture ready. Eighteen focused tests pass; changed code/tests
pass lint. This supersedes the earlier valid-JPEG-only acceptance checkpoint.

Final runtime source/current main at deployment:
`ad62038a55092254f38746edd4735b760da053a8`; guarded production Pages deployment
`50eb1517-5397-4854-9d88-13dd8156994f`, `agency-dashboard/main`.
Internal poster worker version: `7e866067-4775-406b-80d6-0f1cb48b2c69`.
Both final deployments passed their configured build, target and bundle guards.
Existing duplicated imports/circular dependency build warnings were retained;
full repository lint/typecheck/CI are not claimed clean.

- All six final-revision videos fully decode as H.264/yuv420p plus AAC, exactly
  six seconds. RAM audio peak is -4.8 dB; Nissan is -4.0 dB. Initial/suffix ranges
  return 206 with 1,024 bytes and invalid ranges return 416 without agency login.
- All six regenerated stills return JPEG/private/no-store: 675×1200 portrait,
  1200×1200 square, 1200×675 landscape. Visual review confirms the selected
  background video frame now agrees with the chosen timeline frame, including
  Nissan's readable Black Friday title at 1.5 seconds.
- All five delivered font files hash to the original package bytes. All six
  stored canvases match prepared text, geometry, native effects and timing;
  per-size font aliases normalize to the same managed family. The large RAM
  portrait video also hashes to its original 22,458,658 bytes, without trim or
  transcode. Temporary QA text was restored and is absent from saved canvases.
- Fresh source-CSS captures and delivered MP4 frames were compared at 0.35 and
  5.9 seconds across all sizes. Fonts/layout, masks, vehicle framing and movement
  agree closely. Screenshot color profiles, rasterization and capture timing make
  this bounded visual evidence rather than a pixel-perfect certification.
- Native RAM soft-wipe duration/easing and video top-fade controls are present;
  Nissan's TV reveal remained 0.4 seconds after its edit/restore check. Both client
  players start paused, expose native controls, play and pause, and loop six-second
  files. Responsive 390×844 Chrome proofs have no horizontal page overflow and
  keep Story artwork/legal copy and transport controls visible.
- QR Codes/navigation retain the existing 23-code library. All four campaign
  cards are present. Colleague analytics modifications/untracked files and the
  separate `fix/banner-viewer-rest-frame` worktree at `1b41c0cb7` were left intact.

Private evidence includes final video/poster/font/canvas checks, source comparisons
and UI screenshots. All four drafts now have view-only client proofs expiring
30 November 2026. Producer sign-off, a designer's own-account trial, actual
Safari/iPhone playback and verified source creation-date backfill remain open.
This documentation-only completion note does not change deployed runtime bytes.
