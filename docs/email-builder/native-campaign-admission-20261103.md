# Native campaign kind admission — isolated source, 3 November 2026

Task `task_c55ca1720ded`, dispatch `ctx_16cbfdcdf576`. The deliverable is an isolated, **uncompiled** source candidate at `.verification/native-campaign-admission-20261103/edm.rs`. No Cargo command, Rust compilation, native build, Rust test, package, runtime or browser check was run. The 40 tests below are test **source**, not 40 passing tests.

The accepted original `.verification/figflow-native-source-20261102/work/crates/engine/src/cmd/edm.rs` remains SHA-256 `530a33cf1d2b5e7a7c102ec9fa257a720ef18592f54ebe5bd62728c64f2f2d47`. The isolated candidate is SHA-256 `9954fc0dd7bb85d246ba049e2b2e977f5be10bb691d4d5a9f964aed025a59615`.

## Change

Only two production predicates change, in `validate_design` and `validate_designer_design`:

```diff
-        || design.get("kind").and_then(Value::as_str) != Some("template")
+        || !matches!(design.get("kind").and_then(Value::as_str), Some("template" | "campaign-draft"))
```

The allowlist is exact and case-sensitive. Module, arbitrary, missing and non-string kinds retain the existing unsupported-handoff refusal. There is no normalization, new command, capability schema, storage or production assignment to `kind`.

All other production bytes are unchanged. Content import retains `design.clone()` as the canonical baseline and snapshot clones that baseline before applying granted fields. Designer import retains exact baseline/current values, and apply/history replay retain the baseline kind. Designer snapshot still returns its original `{operationId, operations}` envelope; no canonical kind field is added to that packet. The new test source inspects saved canonical state and the unchanged operation envelope separately.

The existing policy, native-artifact, graph, size, image-byte, content-mode asset/dependency/module restrictions, designer capability derivation, registered image reuse, merge-token rules, lock and module-pin behavior remain in place. Client scope is preserved verbatim; server ownership/authorization remains the existing handoff caller's responsibility. This bounded native change does not claim to implement server campaign authority or trusted campaign availability.

## New Rust test source

The original 32 `#[test]` function names, ordering and bodies remain byte-identical. Eight new tests use fresh `Session::new()` values, giving 40 test functions in the candidate:

| Exact new name | Intended behavior when the parent compiles/runs it |
|---|---|
| `edm_campaign_content_noop_preserves_exact_kind_and_baseline` | Campaign content import and repeated no-op snapshots preserve the complete canonical document. |
| `edm_campaign_content_edit_preserves_kind_metadata_and_locks` | Granted text and button-link edits change exactly those fields; kind, scope, brand, lineage, policy/locks and remaining metadata stay exact. |
| `edm_campaign_designer_noop_preserves_exact_kind_and_baseline` | Designer admission preserves campaign baseline/current and unchanged empty-operation snapshot. |
| `edm_campaign_designer_edits_and_history_preserve_kind_metadata_and_locks` | Content/style operations, undo to baseline and redo preserve kind, metadata/locks and exact operation history. |
| `edm_campaign_modes_reject_module_arbitrary_and_missing_kinds` | Both imports reject ten invalid/missing kind variants at the existing unsupported-kind check, with no inserted document. |
| `edm_campaign_content_retains_manifest_policy_and_native_change_refusals` | Content mode still refuses nonempty assets/dependencies/module instances, ungranted edits and unsupported native style edits. |
| `edm_campaign_designer_retains_lock_token_asset_and_capability_refusals` | Block/style locks, merge tokens, new image URLs and forged capability grants still refuse without changing canonical/native state or operation history. |
| `edm_campaign_designer_retains_linked_module_pins_and_locks` | The existing shared linked-module vector admits as campaign and refuses linked text/removal mutations while retaining exact dependency/instance pins. |

Two test-only fixture helpers derive from existing fixtures, set the campaign kind and a synthetic client UUID, and add sentinel lineage/locks. No old fixture or cross-runtime vector was edited. Runtime assertions use complete expected documents where possible so unexpected metadata changes fail, rather than merely checking a kind string.

## Static verification

Run from the actual repository root:

```sh
python3 .verification/native-campaign-admission-20261103/check_source.py final
```

This Python audit is a textual/name/hash check, not a Rust parser, compiler or behavior test. Its source is retained beside the candidate. It verifies the accepted hash, original 32 names/order and unchanged old test-module tail, eight new unique campaign test names (40 total), fresh-session source in every new test, exactly two production predicate replacements, no production kind assignment, and unchanged frozen backend source/evidence hashes. All 18 static assertions pass.

The tests were written before changing the predicates. The before-admission static check exited 1 only for the two missing campaign-admission predicate assertions; this is **not** a Rust runtime red test. After the two predicate replacements the same static check exits 0. Runtime red/green and compilation remain unverified by explicit task restriction.

Evidence in `.verification/native-campaign-admission-20261103/`:

- `before-admission-static.json`: expected textual admission failures before the two predicate changes.
- `source-checks.json` and `final-static.log`: final audit results, source hashes, original/new test names and 40-function count.
- `admission-only.diff`: minimal unified diff containing only the two production lines.
- `edm.rs.diff`: full unified diff against accepted `530a33cf…`, including test additions.
- `hashes.json`: final artifact/report SHA-256 values.

Reviewed the two changed validators, all added test/helper source, the complete unified diff and static-check script. The accepted work file and frozen backend files/evidence were read-only; the audit checks their hashes against their accepted manifests. No tracked Rust patch, pins, generation scripts, old freeze manifests, 956/9f runtime/artifact/evidence, application/handoff source, config, database, CI or release state was modified.

## Parent integration still required

The parent owns independent review, moving this candidate into current generation inputs, tracked patch/pin updates, exact Linux engine/bridge/UI compilation and test execution, package provenance and matching runtime campaign proof after UI/handoff integration. Existing bridge/UI test counts have not been rerun or claimed here. Campaign trusted availability, UI/handoff/conflict recovery and first-Open wiring remain separate slice 5 work. This isolated source deliverable enables no feature or campaign access by itself.
