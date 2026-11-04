# Campaign native frame seam — 3 November 2026

The bounded native frame task passed **8 actual-WASM browser cases, 0 failures, 0 skips**: campaign-draft import/no-op and one visible approved edit in each mode, plus module and arbitrary-kind refusal in each fresh mode. Separately, the existing **21 Node relay protocol tests passed, 0 failures, 0 skips**, against a byte-identical copy of the packaged relay. Those mocked protocol tests are not additional browser cases. No product source was changed.

This is an isolated local frame stage. It does not close 08b, 08c, migration 499, same-template R1→R2, full campaign workflow, app/Worker cohost, hosted acceptance, tenant/session/RBAC, asset publication/readiness or sending acceptance. The independent DB review was not executed, retried, recreated or bypassed. Its recorded failed/incomplete status remains unchanged; runtime build approval pins remain null. The prepared full campaign fixture was neither imported nor invoked.

The complete evidence is under `.verification/native-campaign-frame-f13160e27/`. `verified-summary.json`, `verification.log`, `final-preservation.json` and `final-freeze.json` provide the case summary, offline capture verification, protected-byte check and full new-file hash manifest respectively. Only that new directory and this report were written.

| Pinned input | SHA-256 / identity |
| --- | --- |
| Workflow head / run | `f13160e2706969c6d8420f6e4820644be120f5c4` / `41505334636` |
| Actual CI checkout | `2f1114b73356d1120cd172a5fd9160ebb4e4e8d0` |
| CI tree | `478f8ab8ad58daf3520ebcc57c3cbee5bc150d86` |
| ZIP | `1b6a87e61253fc9efea2a024df4cf0b8faeb6800de73c58a4d97953e04be7d74` |
| WASM, 23,508,724 bytes | `58eabea2a64122848d7feadcd22a0994f7d05e5bc6c44a3a0be2b997b3ceac54` |
| JS glue | `01b9294e5f8eefc6cedbeed9be1210385080b2b102da2051abd2ce32009f501c` |
| Relay | `f433cee45f211b8fb21587626c11af07411689cfcf4878f3a958a5beec31ea7d` |
| Unmodified index | `eeb7d4d09b4fe624000f5ed50addc89a363884136022d37fb90272a43555257d` |
| Committed bridge patch | `ae19af3b9ddd8f625e52782c9a99c2394f968fa34edcf6a7290f6dc5d76b1754` |
| Native engine from parent source receipt | `dbc49902ad077a25ee45f368ad0c96e337a4f3e69e5bd98b62c056b93346c4a1` |
| Executed driver, both final runs | `d7bdf7d379d1699b720852452bcadab62fce90c308df1d91fba6acbde7c81c6b` |

The ZIP/package and provenance came from the parent's existing `ci-followup-f13160e27` handoff. Its recorded 40 engine / 9 bridge / 8 UI and 89 Rust results remain CI context, not locally rerun Rust results. This task ran no Cargo/native build.

The fixture generator extracts the original shared design and capability vectors from the exact pinned bridge patch; their raw hashes are `ca3f567515394192ecd4508757eff05ff7550bc8976a4e4431469e6eee0c009b` and `64b5d8f2a08d0904e9067b169f03e303cd400109feb4dce53b8d106d5cf6e741`. The read-only shared TS capability derivation must match that committed vector exactly before any browser run. Fresh synthetic fixtures declare campaign kind, client scope `31000000-0000-4000-8000-000000000001`, node/field lineage, grants and legal/style locks before import. The designer fixture retains the vector's linked module and immutable dependency pin. Content uses a smaller image-free subset. These are synthetic canonical fixtures, not persisted campaign rows or database revisions. `fixture-provenance.json` records the exact local shared validator hashes; no captured packet is repaired or normalized.

Playwright 1.60.0, Node v24.18.0 and cached Chromium 1234 ran the real package in headless Chromium with actual rendered canvas, pointer clicks and keyboard input. Host prefix `https://app.xeroflow.io/native-frame-only/` was fulfilled with a minimal local test host; frame prefix `https://creative.xeroflow.io/figflow/0.11.2-edm2/` was mapped to the unchanged local package directory. These URL strings are intercepted prefix mappings, not proof of either published host. The iframe uses the existing `allow-scripts allow-same-origin allow-downloads` sandbox and no-referrer policy. The viewport is 1440×1100 with a 36px test-host header.

All mutations enter through real host `connect` → packaged relay → native import, or through the visible native inspector. Direct bridge requests are restricted to read-only status/context/snapshot queries. The driver does not access a private Session, call designer apply/history, mutate JS native state, or substitute packets. `original-packet-journal.json` keeps full original packets and their JSON representations; `inputs.json` records the pointer/keyboard sequence; `read-only-native-envelopes.json` keeps exact direct query envelopes/replies.

| Case, each final directory | Observed result |
| --- | --- |
| Module-kind import control | Native refused; instance, document and revision unchanged |
| Arbitrary-kind import control | Native refused; instance, document and revision unchanged |
| Campaign-draft import/no-op | Content full canonical snapshot equals original; designer returns original operation identity and an empty log |
| Visible approved edit | Content changes only granted Button URL; designer returns exactly one approved text operation |

In `final-content`, a real click selects the Open button at canvas-relative `(515,552)`, then the visible Button URL field at `(1343,234)`. Actual Meta+A, text input `https://example.invalid/campaign-edited` and Enter commit the edit. Two animation frames follow each input, matching the existing native calibration helper. `content-edited-raw.json` passes `validateContentReturn` and exact whole-document equality after changing only `button-1.data.props.url`. Kind, scope, grants, locks, lineage, block IDs, source, dependencies and assets remain exact. The native document and instance are stable; revision advances 2→11. The inspector clips long URL display; the raw return contains its complete value.

In `final-designer`, a real click selects the visible text at `(550,426)`; real relay context confirms `selectedBlockIds: ["plain"]`. Clicking the visible text field at `(1330,296)`, Meta+A, text input and Enter changes it to `Hello {{firstName}} campaign frame`. The original merge token remains intact. `designer-edited-raw.json` contains the original operation UUID and exactly `{op:"set-props",blockId:"plain",props:{text:"Hello {{firstName}} campaign frame"}}`. The context repeats that same log, and the actual canvas visibly shows the new text beside the unchanged legal region and linked module. Document/instance remain stable; revision advances 2→10.

The designer protocol intentionally returns operations rather than a complete canonical document or private native state. The captured, unmodified operations pass `applyDesignerOperations` against the original campaign baseline; the derived full document differs only in that text. Kind, scope, policy, legal/style locks, block/lineage IDs, module instances and dependency pins are exactly preserved in this validated return derivation. This browser evidence does not pretend to expose the native private `current.kind`; internal kind preservation is separately covered by the pinned engine CI tests. No new public read command was added.

The final `content-ready.png`, `content-selected.png`, `content-typing.png`, `content-committed-inspector.png` and `content-edited.png`, and corresponding designer screenshots, are retained in the two final directories. I inspected both final committed-inspector screenshots: content shows the changed URL in the actual native control, and designer shows the changed canvas text with one canonical operation. Calibration ready/selected screenshots were also inspected to establish coordinates rather than mutate hidden state.

Each final page makes exactly five intercepted GET requests: the synthetic host plus four byte-identical package files (index, relay, JS, WASM). Chrome DevTools independently reads the actual loaded WASM response body: both runs observe the expected 23,508,724 bytes and hash. Every package response is hashed against its pre-run bytes. Service workers are blocked, page/context requests outside the allowlist are aborted, and every WebSocket is denied. A separate loopback proxy refuses all HTTP and CONNECT requests and never forwards upstream. Chromium generated 13 proxy-denied attempts in content and 12 in designer, including Google time/account/autofill/background connections and speculative connections to the mapped hosts; their exact URLs are retained in `network.json`. There were zero unexpected page requests/WebSockets, zero forwarded external requests and no live browser account/profile reuse.

Both final runs have zero page errors and zero console errors; no unknown-error exemptions are installed. The two retained warning messages are the native index's unsupported preload-integrity warning (Chromium issue 981419, index line 28) and eframe's unimplemented `SetTheme(SystemDefault)` web viewport command (JS line 2710). The informational logs identify BrowserWebGpu and installed event handlers. These warnings did not prevent the checked snapshots or visible edits.

Calibration is retained, including failures. `calibration-03-content-edit/failure.json` is a driver TypeError from the expected-value path incorrectly omitting `.data`; `calibration-04-content-edit/failure.json` records an unchanged returned URL when keyboard events were sent without egui animation-frame pacing. After correcting only the driver path and applying the already established two-frame input pacing, `calibration-05-content-ticks` passed the exact content edit. The source-only generator/driver and immutable product/package bytes were not changed to relax any native refusal or validator. The final fresh runs supersede calibration for the eight-case count; neither calibration failure is hidden or counted as a product pass.

Commands executed from the explicit task root, with the existing Node24 bin prepended to PATH:

```sh
RUN_LABEL=final-content node --import tsx .verification/native-campaign-frame-f13160e27/frame-driver.mjs content edit
RUN_LABEL=final-designer node --import tsx .verification/native-campaign-frame-f13160e27/frame-driver.mjs designer edit
node --test .verification/native-campaign-frame-f13160e27/relay-protocol/figflow-edm-relay.test.mjs
node --import tsx .verification/native-campaign-frame-f13160e27/verify-evidence.mts
node --check .verification/native-campaign-frame-f13160e27/frame-driver.mjs
```

All five commands exited 0. The relay test source is a byte-identical local copy of the existing 21-test suite; its adjacent relay is copied from the actual package. `final-content.log`, `final-designer.log`, `relay-protocol/results.tap` and `verification.log` retain completed outputs. The offline verifier additionally checks original packet representations, baseline and edit equality, source/mode/operation binding, refusal identities, protected hashes, served/observed hashes and cleanup. Its assertions are evidence checks, not extra native acceptance cases.

All 32 package files have identical before/after hashes in both final runs. Ten distinct protected files, including source pins, bridge patch, the two uninvoked prepared full-fixture files, parent handoff and all five receipt files, also match before/after. The final ZIP and WASM hashes were rechecked. Browser contexts, owned Chromium processes and the owned deny proxy were closed in both final runs; `cleanup.json` records completion. No database, SQL, API, private Worker, Pages artifact, provider, real send, install, Git operation, configuration, native source, pins, workflows, tracked tests/helpers or existing frozen evidence was modified. No acceptance/approval status was promoted.
