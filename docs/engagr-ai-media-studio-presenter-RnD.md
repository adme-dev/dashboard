# engagr AI Media Studio — AI Presenter R&D (self-hostable avatar models, license-first)

**Status:** R&D synthesis for review · 2026-06-03
**Companion to:** the audio Architecture Brief, the Video Extension Brief (the AI Presenter belongs there as a presenter clip type), the Competitive-Patterns doc (HeyGen = output benchmark), and the OSS Prior-Art doc (same license-first lens).
**Why this exists:** the operator call is **own it — model-pluggable, self-hostable, swappable, trainable later** (vendor rejected on cost + lock-in; HeyGen stays the *quality bar*, not the engine). This doc answers the only question that decides whether "own it" is buildable today: **which self-hostable avatar/lip-sync models can we legally ship in paid dealer ads, and fine-tune later?**
**Method:** live GitHub + LICENSE-file + HuggingFace-card + paper review this session (3 parallel research passes). Licenses verified against source, not memory — sources inline. Non-durable: re-verify before any model enters the picker (standing rule).

> **License key:** ✅ ship-able (permissive code **and** commercial-OK weights **and** no non-commercial deps) · ⚠️ conditional (ship-able only after removing a non-commercial dependency and/or retraining on clean data) · ⛔ non-commercial / closed (research-only weights, NC license, or no open weights).

> **The one-line finding:** **No HeyGen-grade, cleanly-licensed, self-hostable avatar model exists off-the-shelf today.** Every "open" option is NC-licensed, closed/API-only, or permissive-code-but-contaminated (a non-commercial **InsightFace** detector and/or research-only training data). "Own it" is real, but it means: pick a permissive *base*, **rip out InsightFace**, and **retrain on a clean dataset** — while shipping interim output through a commercial API fronted by AI Gateway.

---

## 1. Lip-sync models (audio → mouth on an existing face/video)

| Model | Org | Code | Weights | Commercial | Trainable | Notes |
|---|---|---|---|---|---|---|
| **MuseTalk** | Tencent Music | MIT | "any purpose, even commercially" | ✅ **ship-able** | ✅ training code (04/2025) | **No InsightFace** (uses DWPose=Apache, S3FD). Real-time **30fps+ on V100**, runs in 4GB fp16. Mouth-region inpaint (256px) → seams on extreme pose. Minor caveat: HF tag says `creativeml-openrail-m` (OpenRAIL behavioral terms via SD-VAE) vs prose "commercial OK" — reconcile in legal review. **Best cleanly-shippable lip-sync.** |
| **LatentSync** | ByteDance | Apache-2.0 | OpenRAIL++ (commercial-OK, behavioral) | ⚠️ **after de-InsightFace** | ✅ full training + SyncNet | **Highest fidelity** (SD-based, **512px**). 🚨 **Requires InsightFace** (NC) for alignment → swap detector or license InsightFace. 8GB (1.5)/18GB (1.6) VRAM, diffusion = minutes/clip, not real-time. Best quality + trainable once de-InsightFace'd. |
| **Wav2Lip** (+GFPGAN/HD) | IIIT-H | README disclaimer (no OSI file) | **LRS2 → non-commercial** | ⛔ | ✅ training code | *"trained on LRS2… any commercial use is strictly prohibited."* GFPGAN super-res (Apache) **does not launder** the NC core weights. Dated (96px). Authors pivoted to paid Sync Labs. |
| **VideoReTalking** | OpenTalker | Apache-2.0 | unstated, built on NC parts | ⚠️→⛔ | ⛔ inference-only | Apache *code* but checkpoint bundle pulls Wav2Lip/LRS2 + GPEN (NC). Needs a driving video. Dated, inactive. |
| **Sonic** | Tencent + ZJU | **CC-BY-NC-SA 4.0** | NC (same) | ⛔ | ⛔ | Flatly non-commercial (steers to Tencent Cloud). **Image-driven** (one photo → expressive talking head, SOTA head-motion). Notable: uses **YOLOFace v5m, not InsightFace** — so its *only* blocker is the NC license. |

**Bottom line:** **MuseTalk is the one cleanly ship-able lip-sync model today** (MIT + commercial weights + no InsightFace + real-time + trainable). **LatentSync** is higher quality and fully trainable but needs the InsightFace swap. The rest are non-commercial via training-data lineage.

## 2. Talking-head / portrait-animation (a photo → a talking/gesturing presenter)

| Model | Org | Code | Commercial | Trainable | Notes |
|---|---|---|---|---|---|
| **EchoMimicV2** | Ant Group | Apache-2.0 | ⚠️ (research-disclaimer) | ⛔ inference-only | **Audio-driven half-body + synchronized hand/gesture** — the **only one that fits "presenter," not just talking head.** No InsightFace. README "academic research" disclaimer vs Apache code = get written clarity; verify V2 pose-extractor (DWPose can be NC). Active (V3 ~Aug 2025). 16–24GB. |
| **SadTalker** | OpenTalker | Apache-2.0 | ✅ (NC explicitly removed) | ⛔ inference-only | Clean deps, **no InsightFace**. Light (consumer GPU). But **dated/uncanny** quality, stale (~2023). The safe-but-mediocre option. |
| **LivePortrait** | Kuaishou | MIT | ⚠️ **after de-InsightFace** | ⛔ inference-only | Bundles InsightFace `buffalo_l`; **its own LICENSE tells you to swap the detector for commercial.** **No native audio** — it's video/expression retargeting (pair with an audio2motion driver). Very fast, high-quality expression, active. Avoid Animals mode (X-Pose = NC). |
| **Hallo / Hallo2** | Fudan | MIT | ⚠️ **after de-InsightFace** | ✅ **training code** | InsightFace dep (swap). Hallo2 4K path = S-Lab 1.0 (NC) — avoid/relicense. High quality, heavy (A100). **Most trainable** family. |
| **Hallo3** | Fudan | **CogVideoX-5B license** | ⛔/⚠️ gated | ✅ training code | Highest quality (CVPR'25) but inherits **CogVideoX** license: commercial use needs registration + capped 1M visits/mo. Not freely ship-able. H100-class. |
| **AniPortrait** | Tencent Games/ZJU | Apache-2.0 | ✅/⚠️ (verify crop path) | ✅ training code | **MediaPipe, not InsightFace** (lower trap risk — verify your face-crop util). Image+audio *or* image+driving-video. Mid/high quality, **stale (~04/2024)**. Trainable. |

**Bottom line:** **EchoMimicV2** is the best *presenter-shaped* base (Apache, no InsightFace, audio→half-body+gestures) but is inference-only + carries a research disclaimer. **AniPortrait** and **SadTalker** are the cleanest Apache+no-InsightFace bases, AniPortrait also **trainable** — but both lag current SOTA. **LivePortrait/Hallo/Hallo2** are high quality but **need the InsightFace swap**; the Hallo family is the **most trainable**.

## 3. Frontier / closed references (quality bar + what's *not* buildable)

| Model | Status | Commercial | Note |
|---|---|---|---|
| **MEMO** | open (Apache code+weights tag) | ⚠️ risky | But README = *"preview model for research"* + NC training data (HDTF/CelebV-HQ/MEAD). Has a **finetune script**. Use the **architecture**, retrain on clean data — don't ship the released preview weights. |
| **Ditto** | open (Apache) | ⚠️ **after de-InsightFace** | Ant Group; **real-time** controllable; Apache code+weights **but bundles an InsightFace `.engine`**. Most promising real-time Apache base if you swap the detector. |
| **JoyVASA** | open (MIT code) | ⛔ as-shipped | InsightFace + LivePortrait lineage + NC data. Trainable, but contaminated as-shipped. |
| **FLOAT** | open (inference only) | ⛔ | **CC-BY-NC-ND** + *"training code will not be released."* Research reference only. |
| **OmniHuman-1 / 1.5** | **closed** | API-only | ByteDance; no open weights. Available via **Replicate API** → **frontable through AI Gateway as an interim engine** (see §5). Quality reference. |
| **EMO / EMO2** | **closed** | — | Alibaba; project page only, no weights. Served via Tongyi app. Quality reference. |
| **Hedra Character-3** | **closed SaaS** | API-only | Commercial output rights on paid plans; can't self-host/train. Competitor + possible interim API. |
| **HeyGen** | **closed SaaS** | API-only | The **output quality bar.** Not self-hostable; interim engine option only. |

## 4. Systemic license traps (apply to the whole class — design around these)

1. **InsightFace = the dominant landmine.** Code is MIT, **but the pretrained models (`buffalo_l`, `det_10g`, `2d106det`, `scrfd_*`) are non-commercial research-only** ([insightface README](https://github.com/deepinsight/insightface) / [#2469](https://github.com/deepinsight/insightface/issues/2469); inswapper needs a separate commercial licence). Almost every portrait pipeline bundles it for face detect/align — so a repo's MIT/Apache badge is routinely **overridden** by an NC `.onnx` it ships at runtime (confirmed in LivePortrait → JoyVASA, Ditto, Hallo family, LatentSync).
   - **Swap it out — it's a detachable preprocessing stage.** ✅ **MediaPipe / BlazeFace** (Google, Apache — detect + 468 landmarks) or a **clean Apache/MIT YOLO-face** (Sonic ships YOLOFace v5m, proving the swap works in this exact pipeline class). ⚠️ **Not SCRFD** — SCRFD *is* an InsightFace model, same restriction.
2. **"Permissive code, research-only weights"** is pervasive (MEMO, JoyVASA, InstantID…). A code license tells you almost nothing about the weights — clear **(a) the checkpoint's own license, (b) every bundled third-party weight, (c) the training-data license** separately.
3. **Training-data provenance poisons both shipping *and* retraining.** The standard corpora — **CelebV-HQ, VoxCeleb, HDTF, VFHQ, MEAD** — are academic/non-commercial and full of unresolved likeness rights (scraped YouTube faces). Shipping weights trained on them inherits the taint; **retraining your own model on the same datasets reproduces it.** A clean commercial model needs a **clean dataset**: licensed stock footage, **paid actors with signed AI-training + likeness releases**, or the dealership's own talent footage.
4. **CC-BY-NC + ethics/behavioral disclaimers.** FLOAT (NC-ND), Sonic (NC-SA) are hard noes. Near-universal anti-deepfake/impersonation clauses sit *on top of* the license — directly relevant to presenter **consent governance** (§10.4 of the video brief): explicit likeness consent for any real person, disclosure norms for synthetic presenters.

## 5. Cloudflare AI Gateway fit — the front door that makes "own it" coherent

**AI Gateway resolves the build-vs-own tension.** It supports **Replicate, Fal, and Workers AI** (23+ providers, OpenAI-compatible) and provides per-request **cost tracking + custom metadata tagging, caching, rate-limiting, fallback, and Unified Billing** — but it **routes/observes only; it does not host or train models** ([AI Gateway providers](https://developers.cloudflare.com/ai-gateway/providers/)). So:

- **AI Gateway is the constant front door / pluggable-provider abstraction** (the platform already uses it for Proxied models + per-tenant tagging — audio brief §0, video brief §7). The avatar model *behind* it is swappable without touching the app.
- **The model runs on a GPU host AI Gateway fronts:** **Replicate or Fal** (managed GPU — no infra build) today; your **own GPU endpoint** when you self-deploy a trained model later. Same gateway throughout.
- **The per-tenant cost cap** (HeyGen's missing piece, competitive-patterns §3) = **AI-Gateway metadata tagging per dealer + a spend-check-before-enqueue** gate. Caching + fallback come for free.
- ⚠️ **AI Gateway does not launder a license.** Routing a non-commercial model through it doesn't make it ship-able — §1–§4 still decide *which* model goes behind the gateway.

This gives the **clean three-stage path** below: same front door, swap the engine.

## 6. Recommendation (own-it path, for review — not yet decided)

**Stage 0 — interim, ship now (weeks):** front a **commercial avatar API through AI Gateway** — HeyGen, Hedra, or **OmniHuman-1 via Replicate** — to produce presenter output *today* while owning nothing but the wrapper (brand kit, consent, compliance gate, per-tenant cap, social-publish loop). Don't fine-tune these (you can't); they're a bridge.

**Stage 1 — own the easy win (lip-sync):** stand up **MuseTalk** on Replicate/Fal behind AI Gateway — it's the **only cleanly ship-able, real-time, trainable** option (MIT + commercial weights + no InsightFace). Covers "presenter speaks, lip-synced to the Audio Studio VO" with no license surgery. Clear the minor SD-VAE OpenRAIL terms in legal review.

**Stage 2 — own the presenter (talking-head/gesture):** build on a **permissive base, de-InsightFace'd**:
- **EchoMimicV2** (Apache, no InsightFace, audio→half-body+gestures) — best presenter shape; resolve its research disclaimer.
- or **Ditto / LivePortrait** (real-time, high quality) **after swapping InsightFace → MediaPipe/YOLO-face**.
- For the **trainable** track, **Hallo2** or **AniPortrait** (training code released) on a **clean dataset**.

**Stage 3 — train your own (the moat):** fine-tune a permissive base on a **clean, owned dataset** (licensed footage / consented paid actors / dealer talent) → per-dealer presenter as a Brand-Kit-scoped model. Deploy to a GPU endpoint, still fronted by AI Gateway. This is what a vendor can never give you, and what closes the quality gap vs HeyGen.

**Non-negotiables before any model ships:** verify the **weights** license (not just code); **strip every InsightFace `.onnx/.engine`**; confirm **training-data provenance** is commercial-clean; enforce **likeness consent** for real presenters (§10.4). No model enters the picker until verified against its live endpoint.

---

## Sources

**Lip-sync:** [MuseTalk](https://github.com/TMElyralab/MuseTalk) ([HF card](https://huggingface.co/TMElyralab/MuseTalk)) · [LatentSync](https://github.com/bytedance/LatentSync) ([HF](https://huggingface.co/ByteDance/LatentSync-1.6)) · [Wav2Lip](https://github.com/Rudrabha/Wav2Lip) ([#623](https://github.com/Rudrabha/Wav2Lip/issues/623)) · [VideoReTalking](https://github.com/OpenTalker/video-retalking) · [Sonic](https://github.com/jixiaozhong/Sonic)

**Talking-head / portrait:** [SadTalker](https://github.com/OpenTalker/SadTalker) · [LivePortrait](https://github.com/KwaiVGI/LivePortrait) ([HF](https://huggingface.co/KwaiVGI/LivePortrait)) · [Hallo](https://github.com/fudan-generative-vision/hallo) / [Hallo2](https://github.com/fudan-generative-vision/hallo2) / [Hallo3](https://github.com/fudan-generative-vision/hallo3) · [AniPortrait](https://github.com/Zejun-Yang/AniPortrait) · [EchoMimic](https://github.com/antgroup/echomimic) / [EchoMimicV2](https://github.com/antgroup/echomimic_v2)

**Frontier / closed:** [MEMO](https://github.com/memoavatar/memo) ([HF](https://huggingface.co/memoavatar/memo)) · [JoyVASA](https://github.com/jdh-algo/JoyVASA) · [FLOAT](https://github.com/deepbrainai-research/float) · [Ditto](https://github.com/antgroup/ditto-talkinghead) · [OmniHuman-1](https://huggingface.co/papers/2502.01061) · [EMO](https://github.com/HumanAIGC/EMO) · [Hedra](https://www.hedra.com/)

**License traps / deps:** [InsightFace](https://github.com/deepinsight/insightface) ([commercial licensing](https://www.insightface.ai/services/models-commercial-licensing)) · [CelebV-HQ (NC)](https://celebv-hq.github.io/) · [VoxCeleb](https://www.robots.ox.ac.uk/~vgg/data/voxceleb/vox2.html) · [CogVideoX-5B license](https://huggingface.co/THUDM/CogVideoX-5b-I2V/blob/main/LICENSE) · [DWPose](https://github.com/IDEA-Research/DWPose) · [GFPGAN](https://github.com/TencentARC/GFPGAN)

**Cloudflare:** [AI Gateway providers](https://developers.cloudflare.com/ai-gateway/providers/) (Replicate, Fal, Workers AI; routes/observes, does not host/train)
