# Managed transfer execution integration — 16 October 2026

This increment connects native retained transfer authority to the private source
runtime upgrade. It is not final graph acceptance, customer activation, or a
production deployment.

The native control plane retains the exact source, freeze, Forms receipt,
predecessor, reviewed upgrade policy and deterministic successor before remote
mutation. Original owner/operator sessions, plan and source heads are rechecked
around each remote call. Status does not create a request or retry an upload;
start and resume remain explicit. Provider identity stays private and ready
progress does not grant publishing authority.

Migration 460 was applied additively to the configured database. Its immutable
request table is empty; site rows, release pointers and resource bindings compare
unchanged before/after. The receipt is retained privately at
`.verification/managed-transfer/execution-migration-receipt.json`.

## Verification

- 30 real PostgreSQL execution tests pass, including competing reservations,
  original-session revocation, changed source heads, malformed physical identity,
  corrupted retained hashes and detached RPC request handling.
- The preceding combined transfer and HTTP regression run passed 168 tests;
  the three subsequent review cases also passed in the 30-test execution run.
- Both private HTTP handlers require machine authentication, production bindings
  and no-store responses. All 10 HTTP tests also passed in the full suite.
- Independent native review found no blocking findings. Review suggestions for
  corrupted hashes and concurrency now have direct tests.
- Server typecheck has the same 155 normalized diagnostic identities as the
  previous baseline; there are no added or removed identities. It is not globally
  clean.
- Changed-file lint passes. The full local suite passed 16,336 tests with 2,575
  conditional skips and one five-second gate-inventory timeout while the build
  competed for resources. That unchanged inventory suite then passed all eight
  tests in 1.51 seconds on its own; no deadline was raised.
- The local production build was stopped when free disk fell below the existing
  8 GiB safety floor. No artifact was uploaded. Exact-commit CI build, full-suite
  and unchanged Worker size checks are required before release.

The paired Studio executor is under review with a permanent write-once upload
admission. An uncertain upload must never be retried blindly. Explicit resume
can inspect an existing exact successor; a claimed but absent upload stays
uncertain until supported reconciliation is available.

## Remaining integration

Complete private source fencing, accepted object/page graph copy, destination
Forms history, and independently verified native graph acceptance. The final
transaction must compare all captured source heads and clocks and retain original
live-release authority. Then connect customer progress/recovery controls and run
hosted two-account editor/forms/email acceptance. Production activation and DNS
switches remain separate from code verification.

## Exact-commit CI and live portal check

Dashboard `40a503722ece8b7e3b02eca86608902fc9fb3f6c` passed the dedicated
PostgreSQL authority stages in run `38868832199`, but its production build failed
the unchanged raw Worker limit: **25,472,995 / 25,468,928 bytes**, 4,067 over.
Gzip was 7,164,175 / 9,750,000 bytes. This commit is not deployable. Private
management Worker extraction is being implemented to restore measured headroom;
no size limit is being raised.

Studio source `5995d66d0f943f871ae8768660af9069f773671a` completed its normal
whole-repository pre-commit check and was pushed. Its secret scan and branch
policy passed; paired Linux/Windows CI `38870308869` is still running.

The authenticated live Chrome portal at `/studio/sites` lists Fantasea Limo
Cruises, Yarra Valley Limo Tours, Mornington Peninsula Limo Tours and Fantasy
Limo under the Fantasy Limo account. Fantasea's management overview reports five
saved pages, 15 media assets and a ready staging snapshot dated 14 October 2026,
4:24 pm. Its Domains & Launch panel explicitly says custom-domain capacity is
not included in current access, with no connected domains. Viewing those panels
did not alter account access, publication, DNS or credentials. These observations
are not acceptance of the new, undeployed transfer implementation.

## Native source Forms fence integration

Migration 461 was applied to the configured database on 16 October. The source
request table is empty and its immutable trigger exists. Before/after hashes of
sites, release pointers and resource bindings match; no customer was transferred.
Private receipt: `.verification/managed-transfer/source-drafts-migration-receipt.json`.

The private source request now retains the independently inspected ready
execution identity together with the original staging target and native intent.
Only `freeze` and `read` callbacks are permitted. Every callback rechecks original
owner/operator sessions, plan, source heads, resource binding and exact execution
request. Cancellation and retention remain unavailable until a separately
serialized native terminal decision exists.

The coordinator supports read-only status and explicit start/resume. It sends a
detached request, validates the exact returned fence identity and both hashes, and
rechecks original native authority after RPC. Lost acknowledgements preserve the
same request for recovery. Neither a request nor a frozen result is final graph
acceptance, destination authoring selection, release activation or DNS cutover.

Initial 11 authority cases and 12 coordinator cases reproduced missing-function
failures before implementation. Authority review cases then brought the first
group to 13 passing tests; all 25 authority/coordinator cases passed together.
Independent review found no blocking issue and added two further hostile-RPC/null
status tests, which now pass in the complete PostgreSQL/endpoint group: 193 passing tests.
The five new endpoint checks pass. Server typecheck before the final coordinator has exactly the same 295
baseline diagnostics / 155 normalized identities, without additions or removals.
Actual Studio router/tenant D1 enforcement and worker extraction remain under
implementation and separate verification.


### Actual RPC transport correction

The paired Studio workerd test reproduced a Cloudflare RPC-specific failure:
reading `.bind()` from a remote method attempts a remote method named `bind`.
The native resource, execution and source-fence adapters now capture the method
before awaits and invoke it with local `Reflect.apply(method, service, args)`.
This preserves ordinary JavaScript receivers and avoids reading `bind`/`call`
properties from a remote stub. A runtime probe verifies method capture even if
the source method slot changes after capture. The coherent extracted module graph passes the combined native proxy, transfer
PostgreSQL and endpoint suite: 195 tests. No deadline or authorization check was
relaxed. Changed native-source lint and diff checks also pass.

Studio's new source integration has independently reported six passing real
workerd RPC tests, including 1,000 draft rows totalling 8,300,000 payload bytes.
This is local runtime evidence with a trusted dispatch adapter, not hosted
Workers-for-Platforms budget acceptance. Independent review is in progress.
