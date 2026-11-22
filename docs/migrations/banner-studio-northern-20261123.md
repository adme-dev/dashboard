# Northern campaign migration acceptance — 23 November 2026

Scope: four Black Friday NOV2026 campaigns, all sizes, editable text and exact font files, equivalent motion/audio, and client proofs with still posters. User accepts native effect equivalents when appearance and designer editability are retained. Do not flatten text or mark an unsupported effect accepted without comparison.

## Current campaign state

| Campaign / source | Destination | Verified | Open |
| --- | --- | --- | --- |
| Leapmotor `0zlwn2m` | Draft `1d4c1e55-b4ab-4e7b-80a9-603bc3fe70e9`, Northern Motor Group, Leapmotor folder | Three sizes saved; a real text edit survived reload and was restored; all 32 native text layers have managed font references, four exact faces returned by public proof API; six-second soundtrack plays beyond three seconds, pauses without drift and loops. View-only proof created. | Final comparison after corrected font binding; all current-revision client videos; actual Safari/iPhone; source creation-date backfill. |
| GAC `51gqykk` | Draft `89b0e5e3-0428-4a0a-85a2-70d906c7707c`, Northern Motor Group, GAC folder | Three sizes saved; a real text edit survived reload and was restored; all 35 native text layers have managed font references, five exact faces returned by public proof API; six-second soundtrack transport checked. View-only proof and live JPEG generated. | Final comparison after corrected font binding; all current-revision client videos; actual Safari/iPhone; source creation-date verification/backfill. |
| RAM `zm1ne30` | Not imported | Original all-size HTML5 ZIP retained with fonts; unsupported motion detected before import. | Animated masks and per-word/custom motion need native adapters and comparison. The vertical 22,458,658-byte clip exceeds the current 21 MiB video allowance; review a bounded supported path rather than bypass archive validation. No proof created. |
| Nissan `51gqe7q` | Not imported | Original all-size HTML5 ZIP retained with fonts; unsupported reveal detected before import. | The 0.4-second TV-collapse reveal uses animated mask dimensions, brightness/saturation and glow. Implement/verify an editable equivalent before import. No proof created. |

The two saved drafts were refreshed through **Back up and update draft**, preserving identity and a mandatory prior version. They retain `import:needs-review`. Source creation was not inferred from download time. TheBrief's Leapmotor Info panel reports 12 November 2026, 7:53 PM; verify timezone before backfill. Public capability tokens and original campaign assets are private evidence, not committed documentation. No client messages have been sent.

## Corrections and checks

- Font alias normalization repairs real font binding instead of displaying a fallback family under an export alias.
- Authored audio metadata retains the full six-second clip instead of the stale two-second generic element interval. The source preview was observed playing audio beyond four seconds.
- Bordered rounded shapes remain native editable geometry.
- Client poster candidate selects only an existing saved size. Revocation/expiry, private image caching, fixed renderer asset policy and rate limits remain enforced.
- Repeated 18 corrected-font comparison captures: three sizes per saved campaign at 0.35, 1.5 and 5.9 seconds. The exported CSS reference and native renderer now agree visually on text, badge geometry, layer entrance/hold/end and video framing. The reference removes original JavaScript and synchronizes media time; this is bounded renderer evidence, not producer approval or actual Safari acceptance.
- With exact frozen-lockfile dependencies: 1,121 tests passed, one skipped across Banner Studio, TheBrief preparation, client preview/capability, QR and deployment guards. An earlier run against shared stale dependencies failed QR resolution/gradient parsing; the clean locked install resolved those failures. Changed code lint passes. Skipped checks are not claimed as verified.

## Acceptance still required

1. Review the corrected-font comparison captures with a producer, including video crop/time, legal copy, font metrics and border geometry. Earlier screenshots predate the font correction and are superseded by the 18 corrected captures.
2. Check the editor timeline and saved viewer at pause, seek and loop boundaries; confirm editing, undo and saving preserve the exact face and native motion.
3. Generate every current-revision client video; inspect video/audio streams, decode and byte-range seeking, then verify posters and mobile layouts on the deployed release.
4. Complete actual Safari/iPhone playback and a designer/producer trial before team cutover.
5. Resolve RAM/Nissan without flattening editable copy. Four-file migration and TheBrief retirement remain incomplete until these gates pass.

## Release record

Candidate starts from freshly fetched main `52f84ef95ecf06d650c70851ee0d1e9599a203b7` in an isolated checkout. Production target must remain `agency-dashboard/main`; use the guarded deploy commands and record source commit, current main, deployment ID and live verification here after release. No deployment is asserted by this candidate record.
