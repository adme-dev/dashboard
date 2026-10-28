# Unified creative workspace MCP — implementation ledger

## Agreed design

Extend the existing XeroFlow MCP and AI registry, using the current OAuth identity and fresh client authority. Cover Flow browser editors, Banner Studio, video, audio, EDM templates and shared libraries. Preserve individual application targeting and source-qualified asset references. Do not create a second identity or asset store to make the first discovery tool work.

## Implemented first slice

`get_creative_workspace_capabilities` and `search_creative_workspace` are registered once for internal AI and external MCP. Five bounded metadata sources share fresh authorization and explicit source namespaces. Ordinary creative staff cannot inherit agency-wide access from a role label, marketing grant or caller-supplied client ID. Video retains creator/project ownership. No mutations, publication, provider spending or file transport are introduced.

Verification: 64 focused tool, staff policy, fresh-authority and catalog tests pass on a clean checkout based on origin/main b87589958e6e068f712a8f387693ea073436cf60. EXPLAIN validates all five actual database schemas without reading client rows. Public OAuth discovery returns200 for the existing connector. These establish local/source and schema proof, not a newly deployed tool or an authenticated external-client execution.

## Browser automation R&D

See the inventory and FigFlow report alongside this ledger. A reproducible inactive patch implements a bounded browser-local FigFlow request queue against the real document, explicit revision/instance fences and non-evicting mutation receipts. Seven native tests are included but unexecuted; Rust formatting, locked metadata and independent patch replay are the only current patch proofs. Do not add the patch to live source pins until the Rust/WASM/browser gates pass.

Remaining gates: authenticated relay tied to actor and explicit document/project; durable command outcome reconciliation; actual inspect/create/update proof in a GPU-capable browser; bounded engine preview/export; shared save/import ownership and provenance; external Claude/Codex OAuth list/call proof. Browser-local status never authorizes server-side project or client access.

## Keeping upstream current

The clean creative-tools mainline integration is PR728. It includes weekly Monday06:17UTC read-only release checks, optional candidate downloads, exact source/package/lockfile digests, branded source rebuilds for all six editors and retained previous versions. Until merged to the default branch the schedule is inactive. It detects new upstream versions; it does not silently update production or overwrite patches. Upgrade qualification must include the browser bridge once that bridge ships.

## Release integrity

Use the guarded agency-dashboard Pages commands for the main-app change. The separate creative Workers remain independently deployed. Fetch main before release and verify source ancestry again after the build. Preserve the existing native engine uncertainty hold/default-off executor and unrelated dirty rollout work.
