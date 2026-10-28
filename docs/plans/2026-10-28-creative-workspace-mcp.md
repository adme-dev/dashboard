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

## Hosted acceptance checkpoint

Production deployment `86380c01-aa87-4b12-8de2-f5316b1432a4` succeeded from `d0bd6af7b4577694df98c91c18696b04b63fe684`, including current main `3eea2c96ff187d84054862213cc2aca6f58c029a`. Initial build stopped safely on disk exhaustion; only this rollout’s isolated Rust dependency caches were removed, then the unchanged guarded source build passed. Raw Worker size25338647/25468928 and gzip7292078/9750000 passed immutable guards.

Live session-authenticated connector preview lists both new tools. In a task-owned verification conversation XeroFlow AI invoked both tools, including a no-match EDM query; content-free immutable audit independently records `succeeded/read_completed` for both. QR Codes, Banner Studio and the creative feature page returned200. Production canonical Pages ID was read back independently. Configuration retains103secret variables and42plain variables; marketing grants remain present as a secret. This rollout did not rotate secrets, mutate grants or deploy an MCP Worker. Marketing coordinator was notified through reply `msg_c681e1ca921f` into `run_4b0a4b04db4a`; both incoming rollout messages were handled and acknowledged.

Kimi’s independent source review found no scope defect in the new metadata slice and documented boundaries for future content/editing tools. External Claude/Codex OAuth list/call has not been tested by this rollout. Browser bridge, file access, cross-app saving and EDM edits/sends remain inactive/pending. PR729 carries the main-app source integration. PR728 carries the separately deployed six-editor suite and weekly updater; its default-branch merge and current-head CI remain pending. All six latest stable upstream versions were checked current on28October03:10UTC; an earlier all-six exact-source workflow40619602331 completed successfully, while current mainline-head validation is separate.
