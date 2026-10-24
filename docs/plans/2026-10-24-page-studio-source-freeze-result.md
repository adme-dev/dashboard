# Paired source freeze result verification

The private Dashboard verifier accepts a completed `source-freeze-effect` only
for an initial `recovery-source-freeze` claim request. Callback acknowledgments
for dispatch, inspect and settle remain separate. The verifier first checks all
existing source/bootstrap/association linkage, then independently reconstructs
the expected dispatch claim, physical fence and receipt, result digest and
completed settlement digest. Unknown fields or any differing identity reject.
It never treats those equations as live authorization, claim acquisition or
independent evidence of physical mutation. Those remain executor responsibilities.

Two independent Studio fixtures are retained with their limitations:

- Planned output from committed Studio planner0b0600b and the prior local readiness
  fixture: SHA256420ade88d31c0e6c91be54ce3b646579e5dff056aa3ddac0ea123dbcdb41b1fd.
  No freeze mutation or claim acquisition was performed for this fixture.
- Actual local tenant D1 freeze receipt with a synthetic acquisition broker and
  separately constructed completion wrapper:
  SHAb05b8693be8c51ccfb8a8beb4e10d8701323244b4c2bdd871fbe49aaad7d6db4.
  This proves paired physical receipt interpretation, not the central coordinator's
  acquisition/settlement or hosted customer permissions.

28 tests cover both paired outputs, changed identities/digests, callback-purpose
confusion, malformed structures and a fully rehashed foreign fence. Initial RED
was the absent verifier; GREEN includes strict source/test typechecking and
scoped lint. Integration into the Dashboard execution coordinator, actual central
claim/settlement, native routing, exact-source release and hosted acceptance remain
subsequent tasks. No production handler, policy or customer setting changes here.
