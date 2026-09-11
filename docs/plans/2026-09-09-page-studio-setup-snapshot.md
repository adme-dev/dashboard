# Accepted setup snapshot handoff — 9 September 2026

The portal provisioning endpoint now carries the accepted business name, proposal
revision, source and brief into the private coordinator job. It derives these
fields from the fresh authorized proposal row and validates the returned snapshot.
A chat proposal without its retained brief fails before dispatch. Browser bodies
still contain only expectedRevision; membership, entitlements and scope remain
server-owned. The existing proposal table already stores these fields, so no SQL
migration is required.

The companion Foundation contract persists an optional strict snapshot and rejects
changed/removed context under an existing request key. Historical jobs remain
readable; adding context to them requires a separately reviewed revision or trusted
migration, never overwriting the old job. The site-kit adapter can generate an
industry starter draft from the retained job, with requested and generated plans
kept separately and reviewRequired true. It does not execute arbitrary chat brief
instructions or persist/publish the generated site.

Validation: 36 tests pass across eight proposal/provisioning/binding files; scoped
ESLint and the immutable agency-dashboard deployment guard pass. Full build and
suite are required by the guarded preview CI workflow before deployment.

Release order: deploy the additive Foundation coordinator first, exercise the real
Dashboard adapter through its private staging binding, then publish this producer
through the guarded agency-dashboard preview workflow. Production and live
customer setup remain separate release work. Roll back the Dashboard producer
first if needed; retain the additive coordinator schema so newly stored jobs remain
readable. Existing marketing claims are unchanged by this internal handoff fix.

ONB-04 remains open for live executor authority, owned Worker routing, durable
site/content seeding, checkpointing and authenticated end-to-end setup. Generated
starter routes do not yet fulfil every accepted semantic page/module request.

## Preview gate repair

Preview run 34323273292 built successfully, then stopped on one unrelated test
(13,170 passed, 27 skipped). The measurement reconciliation mapping fixture used
2 September evidence with the wall clock; it crossed the seven-day stale threshold
on 9 September. The failure reproduces locally. The test now supplies the same
fixed evaluation time as its adjacent test, preserving the mapping assertion and
production stale-evidence policy. Focused measurement regression coverage is run
before restarting the full preview gates. The failed run did not deploy.
