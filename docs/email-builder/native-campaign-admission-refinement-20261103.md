# Native campaign test precision — 3 November 2026

**SOURCE ONLY — UNCOMPILED.** Task `task_6009c955ef83`, dispatch `ctx_fea8e0baa103`. Read the receiving-code-review skill and full independent review, then traced each refusal before editing. New candidate: `.verification/native-campaign-admission-refined-20261103/edm.rs`. No Cargo, Rust parse/type/borrow check, native build, test execution, Git, pins/workflow, DB, provider, email, deployment or UI/shared/server/app edit occurred.

| Input/output | SHA-256 |
|---|---|
| Original isolated candidate (unchanged) | `9954fc0dd7bb85d246ba049e2b2e977f5be10bb691d4d5a9f964aed025a59615` |
| Accepted native engine (unchanged) | `530a33cf1d2b5e7a7c102ec9fa257a720ef18592f54ebe5bd62728c64f2f2d47` |
| Refined isolated candidate | `dbc49902ad077a25ee45f368ad0c96e337a4f3e69e5bd98b62c056b93346c4a1` |
| Candidate → refinement diff (`refinement.diff`) | `8fddfcbcc1b1620427e3034d4e63c4ee429829af589f63fc0667cd407ef9adc4` |

Only campaign tests 5–8 changed; the four full-equality success/history tests already establish stronger preservation assertions and remain untouched. The refusal cases now match **`crate::EngineError::BadParams` plus exact command and message**, preventing an unrelated error or panic wrapper from satisfying them. Failed imports assert unchanged document count; failed content snapshots preserve the already-made native edits and unchanged canonical baseline; failed designer operations preserve baseline/current/native, empty operation log and empty redo state. Linked pins/locks remain covered by full canonical equality.

Error provenance below uses the **refined candidate path**; production lines precede all inserted tests and are unchanged from the reviewed candidate:

| Refusal | Exact command / message | Actual source path:line |
|---|---|---|
| Invalid/missing kind; nonempty content manifests | `edm_import` / `unsupported canonical handoff` | `.verification/native-campaign-admission-refined-20261103/edm.rs:311` (guard begins 297; import calls validation before document creation) |
| Invalid/missing designer kind | `edm_designer` / `unsupported canonical designer handoff` | `.verification/native-campaign-admission-refined-20261103/edm.rs:1529` (import validation at 1634 precedes capabilities) |
| Ungranted content edit | `edm_snapshot` / `content is not editable` | `.verification/native-campaign-admission-refined-20261103/edm.rs:1103` (`set_content`, reached for Text at 1180 after structure check 1170) |
| Content-mode `fontSize` edit | `edm_snapshot` / `unsupported native content change` | `.verification/native-campaign-admission-refined-20261103/edm.rs:1077` (mapped content comparator; text is fixed-size at 481, mapped as content at 735; structural normalization at 1008 removes characters/character override, **not font style**) |
| Explicit block lock; linked module text edit/removal | `edm_designer` / `block is locked` | `.verification/native-campaign-admission-refined-20261103/edm.rs:1466` (capability linked overlap at 1448–1450; property mutation calls guard at 2021; removal calls it at 2127 **before** ancestry checks) |
| Locked color | `edm_designer` / `style field is locked` | `.verification/native-campaign-admission-refined-20261103/edm.rs:1938` (`assert_style_lock`, called at 2039) |
| Removed merge token | `edm_designer` / `merge tokens must be preserved` | `.verification/native-campaign-admission-refined-20261103/edm.rs:1958` (`validate_content_change`, called at 2041) |
| New image URL without server selection | `edm_designer` / `new image assets require server-owned selection` | `.verification/native-campaign-admission-refined-20261103/edm.rs:1975` (valid HTTPS and grants pass first; baseline contains no matching URL) |
| Forged editable capability | `edm_designer` / `capability block mismatch` | `.verification/native-campaign-admission-refined-20261103/edm.rs:1586` (advertised count matches; editable boolean differs from canonical derivation) |

`designer_bad` fixes the command to `edm_designer` at refined `edm.rs:1299`; the concrete `BadParams {cmd,msg}` variant is declared at accepted `.verification/figflow-native-source-20261102/work/crates/engine/src/lib.rs:92`. `Session::execute` restores the pre-command native document on error at accepted `lib.rs:1011`; designer apply clones state before validation and commits it only after the batch succeeds at refined `edm.rs:2260` / `2276`.

These are fixture-specific source traces, not runtime observations. In particular, the font assertion pins this fixed-size mapped Text fixture; it does not claim every font mutation takes that branch. No unresolved error-string choice was guessed. Native normalization behavior, Rust compilation and execution remain unverified; if Linux reports a different path, investigate it before changing the expectation. Content mode's pre-existing designer-lock limitation and server-owned campaign authority remain unchanged.

Independent static checks (`check_refinement.py`, not the original author's checker) passed:

- Exactly **40 named test sources**, unchanged names/order: original **32** bodies/order byte-identical to accepted engine, plus the same eight campaign tests.
- Only four of those eight bodies differ; removing the eight spans makes original/refined sources byte-identical. Production, helpers, fixtures, constants and all original tests are preserved, including reviewed production guards at **300 / 1517**.
- No broad `is_err()` remains in any of the eight campaign tests.
- All **8 present files** in the original candidate folder and **1,042 files** in the entire accepted work tree match before/after hashes; no protected input was written.
- The lexical span checker masks strings/raw strings/comments and records each test-body hash. This is not a Rust parser, compiler or execution substitute.

Reproduce from the explicit root:

```sh
cd /Users/paulgiurin/orca/workspaces/dashboard/figflow-edm-release-20261101
python3 .verification/native-campaign-admission-refined-20261103/check_refinement.py
```

Evidence is confined to the new folder: `protected-before.json`, `source-checks.json`, `static-check.log`, `refinement.diff`, `check_refinement.py`, `hashes.json` and the refined `edm.rs`. **40 is a static count, not 40 passing tests.** Parent owns candidate selection/integration, exact CI gate 32→40, patch/pins, Linux **40 engine / 9 bridge / 8 UI** execution, matching package provenance and actual campaign handoff/WASM acceptance. No feature or acceptance status changes from this refinement.
