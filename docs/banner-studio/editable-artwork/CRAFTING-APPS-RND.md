# Installed Craft apps: measured integration findings

27 October 2026. Four bounded local proofs now establish editable text, transparency and selected interchange behavior. **PhotoCraft is the strongest tested candidate for a layered-document companion; VectorCraft for editable vector interchange; EffectCraft for an animation subset; FilmCraft for rendered video delivery.** No Banner Studio adapter was implemented in this research increment, and none of these tests establishes automatic reconstruction of a flattened flyer.

## Results and limits

| Application | Execution actually tested | Result | Material limit |
|---|---|---|---|
| [PhotoCraft 0.16.0](PHOTOCRAFT-INSTALLED-RND.md) | Installed desktop, isolated authenticated control interface, CPU | Native and PSD reopen retained editable type, separate pixel/vector masks, exact wording, font edit and undo. Four roundtrip/undo renders had zero changed pixels. Fifteen acceptance predicates passed. | PSD was reopened in PhotoCraft, not Adobe Photoshop. Synthetic two-layer fixture, not campaign reconstruction. |
| [VectorCraft 0.17.0](VECTORCRAFT-INSTALLED-RND.md) | Installed desktop plus checksum-verified matching CLI/MCP | Thirteen structural checks passed; native and SVG reopen matched all 230,400 RGBA pixels. Text, affine transforms, clips and opacity masks survived. Preserve Editing SVG retained exact native layers. | Plain SVG changed native structure. Requested Inter Bold rendered as Inter SemiBold. Outlining deliberately loses editable text. |
| [EffectCraft 0.17.0](EFFECTCRAFT-INSTALLED-RND.md) | Checksum-verified matching headless CLI/MCP | Thirteen native text/easing/opacity/lifecycle checks passed. Lottie export/import retained editable text and matched a sampled PNG byte-for-byte. Twelve RGBA sequence frames decoded successfully. | Desktop GUI and independent browser Lottie player not tested. Fonts remain external. One red-channel quantization level observed. |
| [FilmCraft 0.13.0](FILMCRAFT-INSTALLED-RND.md) | Checksum-verified matching standalone CLI | Native save/reopen and text edit/undo passed; rendered title moved 60 px. PNG alpha was 0/128/255; ProRes 4444 decoded to 0/129/255. | OTIO reimport converted native title into offline media. Desktop GUI and destination playback not tested. |

These are separate application proofs, not additional Banner Studio regression tests. Installed bundle identities and signatures, pinned official source revisions, helper provenance, runtime transcripts, fixture files and pixel measurements are retained in the linked reports. All application processes used owned synthetic fixtures and isolated configuration. No customer project or artwork was uploaded.

## Integration decisions

1. Keep Banner Studio's existing native text, image/vector layers, copy inspector, AI catalogue, selected-layer preview and single-step undo as the product model. A transparent text PNG remains an image; these applications do not change that distinction.
2. Evaluate a bounded PhotoCraft document bridge first: native type plus RGBA images and independent masks. Preserve Banner project/layer identity and protected copy/map/managed-QR metadata in our own contract. Require an explicit supported-feature map, missing-font report, revision-bound return preview and undoable apply.
3. Use VectorCraft SVG only with an explicit editability contract. Text-preserving and outlined exports are different choices. Exact font matching is a gate, and pixel equivalence in one renderer does not prove browser equivalence.
4. Evaluate EffectCraft/Lottie for native text, image, 2D transform and opacity animation. Sample timing/easing and compare an independent browser renderer before claiming parity. Surface unsupported effects and do not silently outline lettering.
5. Treat FilmCraft primarily as a render/delivery candidate. Native project exchange requires an explicit mapper; OTIO is unsuitable for the tested editable-title requirement.

The native executables cannot run inside Cloudflare Pages. A local companion or separate conversion worker requires its own operational design; a browser/WASM option needs a separate measured bridge. Asset packaging, font availability, resource limits and loss reporting remain necessary. No application integration, hosted execution, provider inference, print approval or deployment is claimed.

## REA and source use

The user-suggested [morluto/rea](https://github.com/morluto/rea) was already installed as version 6.4.0. Bounded `inspect-artifact` runs supplied static bundle inventories. Official version-pinned source and actual engine commands supplied the behavioral evidence. No decompiler, binary patch, global helper installation or MCP registration was needed. Helpers were downloaded only into ignored evidence directories after explicit coordinator authorization and verified against official release digests.

Source repositories include licensing and attribution requirements; each report records what was inspected. No upstream implementation or bundled fonts were copied into Banner Studio.

## Evidence and coordinator review

Local root: `output/editable-artwork-animation/crafting-apps/`. It is retained working evidence, not a committed distribution. Useful starting artifacts:

- [Editable PhotoCraft PSD](../../../output/editable-artwork-animation/crafting-apps/photocraft/fixture.psd), [native document](../../../output/editable-artwork-animation/crafting-apps/photocraft/fixture.pcraft), [acceptance record](../../../output/editable-artwork-animation/crafting-apps/photocraft/acceptance.json).
- VectorCraft `verification.json` and `pixel-verification.json`; coordinator reran both artifact-verification scripts successfully after worker completion.
- EffectCraft `proof-evidence.json`, `verification.json` and `sequence-verification.json`.
- FilmCraft `proof-evidence.json` and `prores-ffprobe.json`.

Coordinator read all four reports, checked the acceptance records, and corrected a transcribed workspace SHA in the VectorCraft report. Earlier application implementation and unrelated dirty files were preserved. This increment changed research documentation and ignored local proof material only. It did not refresh application refs or establish release freshness; fetch/reconcile current `origin/main` before subsequent code work.

Run `run_666e5ba6039d`: VectorCraft task `task_6e69cb7d481a` / dispatch `ctx_cbfbebe52609`; EffectCraft task `task_fbf2f0d47751` / dispatch `ctx_b5943796fd31`; FilmCraft task `task_1a8425ed20aa` / dispatch `ctx_d13acc226e00`. All three reported success, were accepted and released with archived transcripts. Root owned PhotoCraft and stopped its process. Final worker accounting returned no reclaimable workers. No merge, deployment, client publication or subscription purchase occurred.
