# FigFlow browser MCP bridge R&D — 28 October 2026

## Outcome

A browser bridge is feasible with a small Rust/WASM wrapper around the already shared engine/control implementation. **There is no existing exported browser automation bridge** in the inspected pinned FigFlow source, and the hosted WASM cannot gain one by injecting JavaScript alone. A source patch + rebuilt FigFlow browser package is required. Native MCP is useful as an implementation reference, not a directly deployable remote/browser service.

Inspected source: `/private/tmp/flow-source-build-20261028/figcraft`, upstream commit `d4a303d4708602a9df1738960852d18b185a616b`, version0.11.2, with current XeroFlow patches. No source or production changes performed for this R&D.

## Exact source evidence

- `apps/figcraft-web/src/main.rs:8`: web shell explicitly has no TCP control server. Lines9–12 say saving is a browser download and no automatic or in-place save exists. Live-session joining is a separate collaboration function; it is not an MCP command transport.
- `apps/figcraft-web/src/web.rs:78–89`: private `WebShell { fig: FigApp }`; `eframe::App::ui` calls `self.fig.ui(ui)`. This is the natural single-threaded safe point for a bridge command queue. The web shell currently uses wasm_bindgen only for DOM/file services, not an exported command API.
- `crates/ui-egui/src/lib.rs:18,804,822`: public `control` module, public `FigApp.session`, public `FigApp.control_queue`.
- `crates/ui-egui/src/control.rs:236`: public `handle(app,ctx,method,params)`. `engine.execute` delegates to the same `Session::execute` engine path as native tools, strips dialog requests; document.inspect/node.get/ui.inspect already work on the real live app. Broad `engine.execute` also reaches filesystem, networking, plugins, windows and UI commands and must NOT be exposed wholesale.
- `crates/ui-egui/src/control.rs:681`: `ui.render` constructs PNG export and invokes `file.export`, supports in-memory output when no path is provided.
- `crates/engine/src/lib.rs:345–365`: per-document `DocState` exposes `uid`, `revision`, page and selection; mutations/undo paths advance revision. `inspect::document` currently returns document name/path/dirty/etc but does not project uid/revision, so the bridge must add a scoped document/revision envelope explicitly and strip path.
- `crates/mcp/src/backend.rs`: native `Backend` trait maps tool calls to control methods; `Attached` uses `std::net::TcpStream` and a native loopback port. `crates/mcp/Cargo.toml` ties that to native headless/render dependencies. Do not add this entire crate to the web app.
- `crates/mcp/src/tools.rs:522–580`: create_node maps to `node.create`; set_properties maps to `node.set`; these provide useful parameter normalization examples. `batch` uses atomic `command.batch`, but browser entry must recursively validate every inner command before executing.
- `crates/engine/src/cmd/file.rs:859`: patched `save_in_memory` encodes a `.figcraft` snapshot without marking saved. Marking saved requires confirmed delivery of that exact snapshot.
- `crates/engine/src/cmd/file.rs:1067–1100`: `file.export` with no `path` returns base64 data; with `path` writes to filesystem. Browser bridge must categorically disallow path/dir fields at every level.
- `ui.screenshot` is special asynchronous viewport capture in `control::drain`, not a synchronous `control::handle` method. Its browser support has not been established. Initial preview should use document-render PNG, explicitly named preview, rather than promise an app-window screenshot.

## Smallest safe implementation

1. Add `apps/figcraft-web/src/bridge.rs`, gated for wasm. A wasm_bindgen exported function accepts a bounded JSON string and returns a Promise. It parses an exact schema, rejects unknown methods, inserts a command in a thread-local bounded VecDeque, calls captured `egui::Context.request_repaint`, and resolves/rejects when the next WebShell frame drains it. No blocking `mpsc.recv`, no eval/function/script, no arbitrary JS callback from remote payload.
2. In `web.rs`, register the egui context during FigApp startup; drain at most a small fixed number of commands per frame immediately before `self.fig.ui(ui)`. Process each against the actual `self.fig`, not a second headless Session. Queue remains local Rust state, so the JavaScript bridge does not retain an unsafe raw pointer into the app.
3. Add narrowly typed actions: status/inspect_document, get_node, create_node, set_properties, delete_nodes (later), undo/redo (later), render_preview PNG, export_document PNG/SVG/PDF and snapshot native `.figcraft`. Start with inspect/create/set/preview/export only. Enforce enum shape types, explicit node IDs for writes, property allowlists, finite coordinate/size ranges, bounded strings/depth/count, and no path, dir, URL, plugin/online/file-open, clipboard, UI key or arbitrary command passthrough.
4. Keep browser wrapper independent of MCP framing. Existing remote XeroFlow MCP tool handlers call a secure relay; relay addresses a registered browser instance and the wrapper accepts a validated action envelope. Native MCP method names and resources should not be made network authority.
5. Return `instanceId`, opaque document handle, document revision before/after, and bounded typed result. Native tab uid/revision are useful internal fence values but are not tenant/project IDs. Maintain a random browser instance generation; a tab reload invalidates prior handles. A document tab switch must never retarget an accepted command silently.

## Relay and security boundaries

- Existing XeroFlow OAuth MCP remains the authority. Bind relay sessions to freshly validated user, organisation/client/project and a specific app instance. Cookie main-session recognition alone does not establish a browser-created untitled document's client/project ownership.
- For an untitled local document, register it as a private user-owned ephemeral session; require explicit project attachment before it can appear in a shared client project catalogue or save assets there.
- Use same-origin authenticated polling or WebSocket relay on creative.xeroflow.io. Server assigns target and request id; do not trust browser supplied email/client headers. WebSocket upgrade and incoming command dispatch need fresh access checks/revocation behavior, exact Origin and bounded auth grant lifetime. Never expose OAuth bearer tokens into JS/module URLs.
- At the execution boundary compare expected instance generation, document handle and revision to real `fig.session.ds()`. Reject stale writes with a structured conflict, including current revision only. Recheck after any asynchronous preparation and before engine execute.
- Deduplicate mutating command IDs with payload hash in the browser session; store in-flight/completed result. If browser closes or transport response is lost, classify result as unknown. Never automatically replay a mutation merely because a timeout occurred. Server must durably retain claim/uncertainty and require inspect/reconcile before another operation can use that lineage.
- User switching tabs or editing concurrently while an AI request is queued is expected: frame-bound revision check rejects stale edits. Do not let model convenience default writes to whichever selection is now active.
- Restrict export pixel count, scale, nodes, output bytes and JSON/base64 overhead before allocation. Existing512MiB general browser export cap is too high for an MCP preview. Prefer a much lower preview/export limit (e.g. bounded4MP preview and8MiB reply) and private R2 artifact delivery for larger explicitly supported exports.
- Return sanctioned artifact IDs and short-lived authorised retrieval paths, not arbitrary external URLs or internal storage credentials. Saved state changes only after durable upload and exact snapshot receipt; download dispatch alone is not proof of a project save.
- Canvas DOM screenshots may be blank due GPU swapchain retention; use engine document export for verifiable preview. SVG/PDF returned as attachments remain sandboxed, never injected as same-origin active markup.
- Auth-session blocking overlay is usability enforcement, not a substitute for server and Rust dispatch boundaries. Dock BroadcastChannel presence is not a trustworthy automation transport and must stay app/tab-only.

## Files/build path

A new checksum-pinned `workers/craft-editors/patches/figflow-browser-bridge.patch` can modify web `Cargo.toml`, `src/main.rs`, `src/web.rs` and add `src/bridge.rs` plus pure schema/fence tests compiled natively via `cfg(any(wasm32,test))`. Add only already-lock-pinned `serde_json` workspace dependency and any already-enabled web-sys features; keep Cargo.lock hash unchanged. The current JS glue can expose wasm_bindgen exports through the Trunk-generated module; verify exact emitted binding names instead of assuming they become window globals.

Update FigFlow `additional_patches` path+sha in `workers/craft-editors/source-pins.json`. Existing `ci-setup.py:95–100` verifies patch digests and applies in order; `build-browser.sh` uses pinned Rust1.95, Trunk0.21.14 and wasm-opt123. Add bridge test filters to `ci-build-browser.sh:63–67`. Trigger `.github/workflows/creative-tools-build.yml` manually selecting figcraft. Verify source/Cargo.lock/package receipts, use a new hosted flow-version suffix, retain previous version, prepare through existing prepare.py. A standalone static-shell deploy cannot alter the currently deployed engine behavior.

## Acceptance sequence

1. Pure native schema/allowlist/fence tests: unknown commands/fields; forged instance/document; stale revision; tabswitch; bounded queue/output; duplicate request same/different body; disconnect after engine write does not replay.
2. Actual WASM in GPU-capable Chrome: inspect existing user-created shape, create frame/text, set explicit node fill, compare revision/tree/PNG, mutate in UI between queued requests and prove conflict, no second headless document.
3. Native snapshot download/upload→reopen and rendering roundtrip. Do not mark saved before durable upload receipt. Verify existing export/save UX and font/branding regressions.
4. Signed-in live browser relay: userA cannot list/dispatch/read userB instance; client reassignment/revocation stops new commands; anonymous raw relay URLs deny; closed/reloaded instance yields unavailable, not silent creation or replay.
5. Claude/Codex MCP call through existing OAuth connector against exact live browser instance; show successful inspect/create/edit/preview/export, record source commit and Worker/WASM versions separately. Existing source implementations and mock queue tests alone do not establish hosted acceptance.
