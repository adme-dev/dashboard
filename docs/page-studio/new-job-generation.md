# New website setup generation

New agency and portal setup requests select `generationVersion: 2` in the
server-owned job producer. The request body still accepts only the expected
proposal revision. Neither request data nor saved plan metadata selects the
generation version.

Foundation's v2 generator projects the accepted pages, modules and collections,
starts customer collections empty and creates only a draft business profile.
This remains a starter requiring content review; it does not publish the site.

Existing retained jobs keep their original generation, including historical jobs
without a generation marker. Retrying one does not rewrite its actor, setup,
resources or generation. The same rule applies when a competing older producer
commits first and the create acknowledgement is lost. Retained responses still
require the strict known schema and matching request, plan, setup, actor kind
and complete scope. A direct new-create acknowledgement must match v2; an
unsupported generation or silently downgraded success fails closed.

Compatibility was checked against Foundation reference `4c2b4b7d` and recovered
executor PR51: both accept the optional v2 job marker and implement its generator
branch. The Dashboard control authority schema already accepts it and returns
the exact retained job. This source change does not upgrade existing jobs,
change coordinator scheduling or claim a new live provisioning acceptance.
