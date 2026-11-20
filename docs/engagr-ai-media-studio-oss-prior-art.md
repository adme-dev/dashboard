# engagr AI Media Studio — Open-Source Prior Art (piggyback + edge cases)

**Status:** reference inventory; current rendering findings are in the [20 November source audit](research/video-platform-rendering-rd-20261120.md).
**Companion to:** the audio Architecture Brief, the Video Extension Brief, and the Competitive-Patterns doc. This one is **technical prior art** — OSS we can depend on, borrow patterns from, or read to skip edge cases others already hit.
**Lens:** license-first (we want to *use*/borrow code, so license gates everything) + **"edge cases solved"** (the point of the exercise — design around these *now*).
**Method:** GitHub + web review this session across audio-engine, render/mixdown, and timeline/video-render repos. Sources at the end.

The dated audit pins seven reviewed repositories, distinguishes source findings
from upstream claims, and maps follow-up work against the shipped renderer.
Other inventory rows below retain their earlier research status; their licenses,
maintenance status and adoption recommendations were not all refreshed by that
audit. The checklists are design prompts, not a current delivery ledger.

> **License key:** ✅ permissive (MIT/BSD/Apache — safe to depend on) · ⚠️ copyleft (GPL/AGPL/LGPL — reference-only or isolate) · ⛔ commercial-restricted / unclear (pattern-copy only, do not ship).

---

## 1. Audio engine — clock, scheduling, waveforms, ducking

The master-clock rule (`AudioContext.currentTime` is master; GSAP slaves) is a *solved problem* in OSS — adopt the proven implementation rather than inventing it.

| Repo | License | Mode | Biggest edge-case win |
|---|---|---|---|
| **Tone.js** `Tonejs/Tone.js` | ✅ MIT | depend or copy | Production **lookahead Transport/Clock** = the Tale-of-Two-Clocks pattern, sample-accurate `start(when)`, `Tone.start()` autoplay-unlock. *Our master-clock rule, already built.* Trap: large/opinionated — can use just the Transport. |
| **"A Tale of Two Clocks"** (Chris Wilson) | ✅ ref | read first | The canonical explainer of rAF-vs-audio-clock **drift** + the lookahead recipe (schedule ~100ms ahead on a ~25ms `setTimeout`/worker loop). This *is* our §4 clock rule. |
| **standardized-audio-context** `chrisguttandin/...` | ✅ MIT | **depend (day 1)** | Side-effect-free ponyfill for cross-browser `AudioContext` correctness — Safari's **4-running-context limit**, AudioParam consistency, Worklet fallbacks. Wrap our context in this. |
| **waveform-playlist** `naomiaro/...` | ✅ MIT | heavy reference | Closest analog: **multitrack + clip collision + configurable fade curves + tempo/automation-curve math + pluggable Native/Tone backend + WAV export**. Port the engine, not the React/WC views. |
| **wavesurfer.js** `katspaugh/...` | ✅ BSD-3 | depend (UI only) | Drop-in **waveform + Regions + Timeline + Envelope (fade) UI**, pre-decoded peaks for long files. Trap: it wants to own playback — use for UI/peaks/regions only; **keep our scheduler authoritative**. |
| **peaks.js + `audiowaveform` CLI** (BBC) | ⚠️ LGPL-3.0 | adopt the *pipeline* | Canonical **long-file peak precompute + per-zoom cache** (binary `.dat`, server-side gen). Adopt the `audiowaveform` server step + cache peaks in R2 **without bundling peaks.js** (sidesteps LGPL). |
| **web-audio-scheduler** `mohayonao/...` / **WAAClock** | ✅ MIT | copy if lighter than Tone | Tiny lookahead schedulers with **pluggable timer** (swap in a worker-timer to survive background-tab throttling). |

**Ducking reality (important):** the Web Audio `DynamicsCompressorNode` has **no sidechain input** ([open spec issue #246 since 2013](https://github.com/WebAudio/web-audio-api/issues/246)). So there's no drop-in node. **Our move:** we already know VO clip start/stop on the master timeline → schedule music-bus `gain.setTargetAtTime(duckLevel, voStart, tau)` / restore at `voEnd`. Sample-accurate against our clock, deterministic, no real-time follower. (The *render* tier still uses ffmpeg `sidechaincompress` — see §2.)

## 2. Render / mixdown — ffmpeg, loudness, CF Container orchestration

This maps almost 1:1 onto two CF-native references.

| Repo / ref | License | Mode | Biggest edge-case win |
|---|---|---|---|
| **Kent C. Dodds — ffmpeg on CF Containers** (PR #720 + writeup) | ✅ MIT | topology reference | Reference for Queue→Worker→Container→R2 with asynchronous dispatch and authenticated completion. A 202/callback design requires durable dispatch, retries and publication authority; it is not a mandatory Cloudflare rule or the lifecycle currently implemented here. |
| **cloudflare/containers SDK** | ✅ Apache/MIT | existing dependency; plan migration | Historical helper reference for port readiness, in-flight activity, instance routing and lifecycle hooks. Current [Cloudflare guidance](https://developers.cloudflare.com/containers/guides/migrate-to-durable-object-container-api/) marks the package deprecated and describes the native Durable Object Container API. Preserve the qualified behavior while planning migration; do not blindly add a heartbeat or replace instance identities. Queue admission/retry remains application work. |
| **slhck/ffmpeg-normalize** + **[loudnorm.html](https://k.ylo.ph/2016/04/04/loudnorm.html)** | ✅ open | copy the logic | **Two-pass loudnorm done right** (measure → JSON → normalize with `measured_*` + `linear=true`). Traps it documents: single-pass **drifts** (no offset); loudnorm **silently falls back to dynamic AGC** when headroom is tight (audible pumping under a music bed — detect & log); it **internally resamples to 192 kHz** (pin output `-ar`/`aformat` after). `--lower-only` matters for already-hot masters at social −14 vs radio −24. |
| **orchestkit `audio-mixing-patterns`** | ✅ ref/skill | copy params | The mixing cookbook: **`aformat=...:sample_rates=48000:channel_layouts=stereo` on EVERY input *before* `amix`** (the #1 silent amix failure); concrete `sidechaincompress` params (pumping = attack/release too fast); **`adelay=5000|5000` is per-channel** (or `all=1`); `amix` `duration=first` vs `longest` truncates/pads; add `alimiter` to avoid post-mix clipping. |
| **HyperFrames Cloudflare template** | ✅ Apache-2.0 | Render lifecycle reference | The container runs `hyperframes render --workers auto` on `standard-4`. It gives the renderer ten minutes, then sends SIGTERM with a five-second grace period before SIGKILL. After the MP4 finishes on temporary disk, the container streams the file with its content length. The Worker writes that response body to R2. [Container](https://github.com/heygen-com/hyperframes-cloudflare-template/blob/c6dae931fd6c247a870c2a8a0f37eee52da14092/container/server.mjs#L52-L119) · [Worker](https://github.com/heygen-com/hyperframes-cloudflare-template/blob/c6dae931fd6c247a870c2a8a0f37eee52da14092/src/routes/api/render.ts#L61-L85) · [Instance configuration](https://github.com/heygen-com/hyperframes-cloudflare-template/blob/c6dae931fd6c247a870c2a8a0f37eee52da14092/wrangler.jsonc#L24-L30) |
| **json-to-ffmpeg** / **editly** | ✅ MIT | reference only | Timeline-JSON → filtergraph codegen *structure* — but both are **video-biased**; keep our own (more capable) audio graph. |
| **fluent-ffmpeg** | ⛔ archived/EOL (May 2025) | do not depend | Syntax reference only; build the graph string ourselves (we already do). |

**Per-platform LUFS (bake into `profiles.ts`, treat social as tunable not gospel):** Spotify/YouTube −14 (TP ≤ −1); Apple Podcasts −16; broadcast/radio −23 EBU / −24 LKFS US (matches our radio −24); **TikTok/Instagram/Meta/X have *no official spec*** — common practice ~−14 to −10, so −14 is a defensible default, not a standard.

## 3. Timeline / video render + data model (Phase 2)

| Repo | License | Mode | Biggest edge-case win |
|---|---|---|---|
| **Remotion** `remotion-dev/remotion` | ⛔ company license (paid for orgs our size) | **pattern-copy only** | `delayRender()`/`continueRender()` — the canonical "**block frame capture until async data/fonts/images resolve**" mechanism. Reimplement the API shape; the difference between deterministic renders and capturing half-loaded frames. Also: fixed-timestep deterministic seeking. |
| **OpenTimelineIO (OTIO)** (ASWF) | ✅ Apache-2.0 | **borrow the schema** | **Rational-time/rate** representation (no float-frame drift), first-class transitions/gaps/media-refs, source-vs-timeline time ranges. Model our timeline/scenes→shots JSON on OTIO concepts for free frame-rate-correct time math. |
| **Revideo** `midrender/revideo` | ✅ MIT | depend (cautiously) | License-clean working **headless-Chrome-renders-canvas-animations** pipeline (audio + serverless). Trap: team pivoted to "Midrender"; OSS engine updates **no longer upstreamed** — semi-stalled. |
| **Motion Canvas** `motion-canvas/...` | ✅ MIT (GPL switch was *shelved* — re-verify) | reference | **Deterministic, frame-seekable animation-as-function-of-playhead** — the seekability model for our GSAP-slaved layer. |
| **Diffusion Studio core** `diffusionstudio/core` | ⚠️ MPL-2.0 (≤1.5) / ⛔ non-commercial (≥1.6) | pin or reference | Real **WebCodecs encode/decode in TS** for in-browser preview/export. Traps: license splits at 1.6; last release Oct 2024 (stalled). |
| **designcombo/react-video-editor** | ⛔ no license file (unanswered commercial-use issue) | UX reference only | CapCut-clone timeline UX (built on Remotion). Good UI reference; **do not depend** (license unknown + inherits Remotion). |

Freefield, a community Higgsfield-style implementation, is a reference for media generation, not access to Higgsfield's proprietary backend. Its runner validates inputs from a workflow manifest, asks the gateway to prepare GPU memory, submits a ComfyUI job and reads progress events. The CPU export path for an edited dealer reel is covered by the video brief’s FFmpeg and browser composition design. [Freefield runner](https://github.com/neuregex/freefield/blob/e29b7c913149efe7739d19d3b1c608e32e27e6d7/server/runner.ts) · [Video brief §4.4](engagr-ai-media-studio-video-brief.md#44-render--the-composite-pipeline)

## 4. Consolidated "edge cases solved" — the design checklist

The point of the exercise. Design around these from day one (each already cost someone else a day):

**Audio engine**
- [ ] **Two-clocks drift** → lookahead scheduler on the audio clock (Tone.js / Tale of Two Clocks); never drive audio off rAF.
- [ ] **Background-tab throttling** kills naive `setTimeout` schedulers → wide lookahead window or a Web Worker timer.
- [ ] **Autoplay policy** → `AudioContext` starts `suspended`; `resume()` on the play-button gesture (`Tone.start()`).
- [ ] **No native sidechain** → scheduled gain ramps at known VO times (preview); ffmpeg `sidechaincompress` (render).
- [ ] **Long-file waveforms** → never full-decode client-side; precompute peaks server-side (`audiowaveform`) + cache in R2.
- [ ] **Safari**: 4-AudioContext limit + AudioWorklet perf → `standardized-audio-context`; test Safari early.
- [ ] **Scrub clicks/pops** → ramp gains, don't hard-cut.

**Render / mixdown**
- [ ] **Single-pass loudnorm drifts** → two-pass (measure→normalize, `linear=true`); **log dynamic-AGC fallback** (pumping); **pin output sample rate** (192 kHz internal resample).
- [ ] **`amix` silent mismatch** → `aformat` every input to a common rate/layout *before* mixing; choose `duration=first` vs `longest` deliberately; `alimiter` to avoid clipping.
- [ ] **`adelay` is per-channel** (`5000|5000` or `all=1`).
- [ ] **Container lifecycle** → verify in-flight activity in the locked SDK and drain accepted work on signals; do not infer an idle-timeout defect from a long render alone.
- [ ] **Whole-job wall time** → keep awaited work inside the Queue consumer's full invocation budget, or design durable dispatch plus authenticated completion. A per-format timeout is not a whole-job budget. See the [current source audit](research/video-platform-rendering-rd-20261120.md#xeroflow-source-comparison).
- [ ] **VBR duration-header bug** (we already hit melotts-side): VBR MP3/AAC can write wrong/absent duration → favor CBR / pin duration / remux pass. **Add a regression test — no OSS covers this.**

**Video (Phase 2)**
- [ ] **Capture half-loaded frames** → `delayRender`-style block-until-ready before each frame.
- [ ] **Float-frame drift** → rational-time model (OTIO).
- [ ] Package Chromium and FFmpeg in the image. Measure peak temporary disk for captured frames and the encoded MP4 separately from memory used to deliver the output.

## 5. Adopt recommendations (mapped to phases)

- **Audio Phase 1b (timeline):** depend on **`standardized-audio-context`** (day 1) + **wavesurfer.js** (UI/peaks/regions); copy **Tone.js Transport** (or `web-audio-scheduler`) for the master clock; port **waveform-playlist**'s fade/automation engine; scheduled-gain-ramp ducking. Server-side **`audiowaveform`** → R2 peak cache.
- **Audio render (shipped, extend):** lift **ffmpeg-normalize**'s two-pass loudnorm logic + **orchestkit**'s `aformat`-before-`amix` + sidechain params into our (pure, tested) filtergraph builder. The queue consumer awaits the Container response and uploads the returned audio bytes to R2; audio variants and timeline masters currently use `arrayBuffer()`. The known-length streaming upload belongs to the composite-video path. Audio does not implement the reference’s 202/callback lifecycle. Verify activity against the locked SDK rather than assuming a heartbeat is missing.
- **Timeline data model:** shape the Neon JSON on **OTIO** concepts (rational time, transitions, media refs) so audio is the degenerate one-scene case and video scenes→shots extends cleanly.
- The bounded 20 November ReelMotion implementation decodes eligible managed footage in FFmpeg and captures editable graphics with Chromium. It preserves centered authored zoom and verifies source identity; unsupported artwork retains whole-artwork capture. Broader timeline compilation remains future work. Derive both from the same saved artwork revision and verify trim, crop, timing and layer order against the whole-artwork render. Measure capture time, peak disk and total elapsed time on the same container class. HyperFrames supplies a reference for bounding the renderer process. Remotion supplies a pattern for waiting until the assets for each frame are ready.

## 6. License traps (because "piggyback" = ship)

- ⛔ **Remotion** (company license, paid at our size; can't build a competitor) — pattern-copy only.
- ⚠️ **peaks.js** LGPL, **etro** GPL, **Cap** AGPL — reference-only or isolate; for peaks, adopt the `audiowaveform` pipeline instead.
- ⛔ **Diffusion Studio ≥1.6** non-commercial, **Shotstack Studio** PolyForm-Shield, **designcombo** no-license — don't depend.
- ⛔ **fluent-ffmpeg** archived/EOL — reference only.
- Earlier permissive-license inventory: Tone.js, standardized-audio-context, wavesurfer.js (BSD), waveform-playlist, web-audio-scheduler, WAAClock, OTIO (Apache), HyperFrames (Apache), Revideo/Motion Canvas (MIT — re-verify before depending), ffmpeg-normalize. Licensing does not establish current maintenance or suitability. `cloudflare/containers` is the existing permissively licensed dependency but now has a documented native-API migration path.

---

## Sources

**Audio engine:** [Tone.js](https://github.com/Tonejs/Tone.js) · [A Tale of Two Clocks](https://web.dev/audio-scheduling/) · [standardized-audio-context](https://github.com/chrisguttandin/standardized-audio-context) · [waveform-playlist](https://github.com/naomiaro/waveform-playlist) · [wavesurfer.js](https://github.com/katspaugh/wavesurfer.js) · [peaks.js](https://github.com/bbc/peaks.js) · [web-audio-scheduler](https://github.com/mohayonao/web-audio-scheduler) · [WAAClock](https://github.com/sebpiq/WAAClock) · [WebAudio sidechain issue #246](https://github.com/WebAudio/web-audio-api/issues/246)

**Render/mixdown:** [Kent C. Dodds — Offloading FFmpeg with Cloudflare](https://kentcdodds.com/blog/offloading-ffmpeg-with-cloudflare) ([PR #720](https://github.com/kentcdodds/kentcdodds.com/pull/720)) · [cloudflare/containers](https://github.com/cloudflare/containers) · [ffmpeg-normalize](https://github.com/slhck/ffmpeg-normalize) · [loudnorm reference](https://k.ylo.ph/2016/04/04/loudnorm.html) · [orchestkit](https://github.com/yonatangross/orchestkit) · [HyperFrames CF template](https://github.com/heygen-com/hyperframes-cloudflare-template) · [json-to-ffmpeg](https://github.com/pilotpirxie/json-to-ffmpeg) · [editly](https://github.com/mifi/editly)

**Timeline/video/data model:** [Remotion](https://github.com/remotion-dev/remotion) ([delayRender](https://www.remotion.dev/docs/delay-render)) · [OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO) · [Revideo](https://github.com/midrender/revideo) · [Motion Canvas](https://github.com/motion-canvas/motion-canvas) · [Diffusion Studio core](https://github.com/diffusionstudio/core)
