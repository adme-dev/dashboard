# engagr AI Media Studio — Open-Source Prior Art (piggyback + edge cases)

**Status:** R&D synthesis for review
**Companion to:** the audio Architecture Brief, the Video Extension Brief, and the Competitive-Patterns doc. This one is **technical prior art** — OSS we can depend on, borrow patterns from, or read to skip edge cases others already hit.
**Lens:** license-first (we want to *use*/borrow code, so license gates everything) + **"edge cases solved"** (the point of the exercise — design around these *now*).
**Method:** GitHub + web review this session across audio-engine, render/mixdown, and timeline/video-render repos. Sources at the end.

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
| **Kent C. Dodds — ffmpeg on CF Containers** (PR #720 + writeup) | ✅ MIT | **copy the topology** | Our exact Queue→Worker→Container→R2→status flow, with the lifecycle traps solved: **return 202 immediately** (don't block the queue consumer), **heartbeat-renew the container activity timeout** so `sleepAfter` can't kill a long render, **retry-in-place / no local fallback** ("fallback paradox"), **HMAC-signed** container→app status callback. |
| **cloudflare/containers SDK** | ✅ Apache/MIT | depend (already do) | `startAndWaitForPorts()` (don't race ffmpeg before its server is up), `renewActivityTimeout()` (the heartbeat primitive), `getByName/getRandom` to fan renders across instances, lifecycle hooks. Gap: no autoscale/retry — Queue + DLQ covers retry (we have `music-gen-dlq`). |
| **slhck/ffmpeg-normalize** + **[loudnorm.html](https://k.ylo.ph/2016/04/04/loudnorm.html)** | ✅ open | copy the logic | **Two-pass loudnorm done right** (measure → JSON → normalize with `measured_*` + `linear=true`). Traps it documents: single-pass **drifts** (no offset); loudnorm **silently falls back to dynamic AGC** when headroom is tight (audible pumping under a music bed — detect & log); it **internally resamples to 192 kHz** (pin output `-ar`/`aformat` after). `--lower-only` matters for already-hot masters at social −14 vs radio −24. |
| **orchestkit `audio-mixing-patterns`** | ✅ ref/skill | copy params | The mixing cookbook: **`aformat=...:sample_rates=48000:channel_layouts=stereo` on EVERY input *before* `amix`** (the #1 silent amix failure); concrete `sidechaincompress` params (pumping = attack/release too fast); **`adelay=5000|5000` is per-channel** (or `all=1`); `amix` `duration=first` vs `longest` truncates/pads; add `alimiter` to avoid post-mix clipping. |
| **HyperFrames CF template** `heygen-com/...` | ✅ Apache-2.0 | copy (video tier) | Working **headless-Chromium → ffmpeg → stream-to-R2** container for the Phase-2 video tier: **bake Chromium+ffmpeg into the image** (cold-start fix), **stream ffmpeg stdout through the Worker to R2** (no `/tmp` blowup), `--workers auto` for parallel capture. |
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
- [ ] **Container `sleepAfter` kills long renders** → heartbeat `renewActivityTimeout()`; signal-stop on drain.
- [ ] **Don't block the queue consumer** → 202 + async + signed callback. **Retry-in-place; no local fallback.**
- [ ] **VBR duration-header bug** (we already hit melotts-side): VBR MP3/AAC can write wrong/absent duration → favor CBR / pin duration / remux pass. **Add a regression test — no OSS covers this.**

**Video (Phase 2)**
- [ ] **Capture half-loaded frames** → `delayRender`-style block-until-ready before each frame.
- [ ] **Float-frame drift** → rational-time model (OTIO).
- [ ] **Headless cold-start** → bake Chromium+ffmpeg into the image; **stream ffmpeg→R2**, no `/tmp` output file.

## 5. Adopt recommendations (mapped to phases)

- **Audio Phase 1b (timeline):** depend on **`standardized-audio-context`** (day 1) + **wavesurfer.js** (UI/peaks/regions); copy **Tone.js Transport** (or `web-audio-scheduler`) for the master clock; port **waveform-playlist**'s fade/automation engine; scheduled-gain-ramp ducking. Server-side **`audiowaveform`** → R2 peak cache.
- **Audio render (shipped, extend):** lift **ffmpeg-normalize**'s two-pass loudnorm logic + **orchestkit**'s `aformat`-before-`amix` + sidechain params into our (pure, tested) filtergraph builder; keep the **Kent C. Dodds** lifecycle (202 + heartbeat + signed callback + retry-in-place) — we already match it.
- **Timeline data model:** shape the Neon JSON on **OTIO** concepts (rational time, transitions, media refs) so audio is the degenerate one-scene case and video scenes→shots extends cleanly.
- **Video Phase 2:** fork **HyperFrames** for the headless container; reimplement **Remotion `delayRender`** semantics; evaluate **Revideo** (MIT) vs self-built, knowing it's semi-stalled.

## 6. License traps (because "piggyback" = ship)

- ⛔ **Remotion** (company license, paid at our size; can't build a competitor) — pattern-copy only.
- ⚠️ **peaks.js** LGPL, **etro** GPL, **Cap** AGPL — reference-only or isolate; for peaks, adopt the `audiowaveform` pipeline instead.
- ⛔ **Diffusion Studio ≥1.6** non-commercial, **Shotstack Studio** PolyForm-Shield, **designcombo** no-license — don't depend.
- ⛔ **fluent-ffmpeg** archived/EOL — reference only.
- ✅ Safe to depend: Tone.js, standardized-audio-context, wavesurfer.js (BSD), waveform-playlist, web-audio-scheduler, WAAClock, OTIO (Apache), cloudflare/containers, HyperFrames (Apache), Revideo/Motion Canvas (MIT — re-verify before depending), ffmpeg-normalize.

---

## Sources

**Audio engine:** [Tone.js](https://github.com/Tonejs/Tone.js) · [A Tale of Two Clocks](https://web.dev/audio-scheduling/) · [standardized-audio-context](https://github.com/chrisguttandin/standardized-audio-context) · [waveform-playlist](https://github.com/naomiaro/waveform-playlist) · [wavesurfer.js](https://github.com/katspaugh/wavesurfer.js) · [peaks.js](https://github.com/bbc/peaks.js) · [web-audio-scheduler](https://github.com/mohayonao/web-audio-scheduler) · [WAAClock](https://github.com/sebpiq/WAAClock) · [WebAudio sidechain issue #246](https://github.com/WebAudio/web-audio-api/issues/246)

**Render/mixdown:** [Kent C. Dodds — Offloading FFmpeg with Cloudflare](https://kentcdodds.com/blog/offloading-ffmpeg-with-cloudflare) ([PR #720](https://github.com/kentcdodds/kentcdodds.com/pull/720)) · [cloudflare/containers](https://github.com/cloudflare/containers) · [ffmpeg-normalize](https://github.com/slhck/ffmpeg-normalize) · [loudnorm reference](https://k.ylo.ph/2016/04/04/loudnorm.html) · [orchestkit](https://github.com/yonatangross/orchestkit) · [HyperFrames CF template](https://github.com/heygen-com/hyperframes-cloudflare-template) · [json-to-ffmpeg](https://github.com/pilotpirxie/json-to-ffmpeg) · [editly](https://github.com/mifi/editly)

**Timeline/video/data model:** [Remotion](https://github.com/remotion-dev/remotion) ([delayRender](https://www.remotion.dev/docs/delay-render)) · [OpenTimelineIO](https://github.com/AcademySoftwareFoundation/OpenTimelineIO) · [Revideo](https://github.com/midrender/revideo) · [Motion Canvas](https://github.com/motion-canvas/motion-canvas) · [Diffusion Studio core](https://github.com/diffusionstudio/core)
