# Graphify Architecture Artifacts

Graphify is the local code-graph source used for architecture review, Model Ops
repo context, and Workflows readiness checks.

## Prerequisites

- Graphify Python runtime:
  `/Users/paulgiurin/.local/pipx/venvs/graphifyy/bin/python`
- Optional override:
  `GRAPHIFY_PYTHON=/path/to/python-that-imports-graphify`
- Obsidian installed locally when reviewing the generated vault.

The default Python runtime is currently installed on this machine and imports
`graphify`, `networkx`, and the Graphify extract/build/report/export modules.

## Rebuild

```bash
pnpm run graphify:rebuild
```

This writes fresh artifacts to `graphify-out/`:

- `graph.json`
- `GRAPH_REPORT.md`
- `index.md`
- `log.md`
- `wiki/`
- `obsidian/`

The rebuild script excludes generated/runtime directories such as `.nuxt`,
`.output`, `.vercel`, `.wrangler`, `.claude`, `.cursor`, `dist`,
`node_modules`, and prior `graphify-out` artifacts so stale generated chunks do
not pollute the architecture graph.

## Review Locally

Open `graphify-out/obsidian` as an Obsidian vault for local architecture review.
Use `graphify-out/index.md` first for high-level counts, top communities, and
the latest generation timestamp.

Current clean dashboard rebuild, generated on 2026-07-04:

- Files indexed: 3,458
- Graph nodes: 8,490
- Graph edges: 7,917

Graphify's extractor does not directly parse `.vue` single-file components in
this setup. The dashboard graph currently covers supported JS/TS/Python/etc.
source files, including server routes, workers, scripts, tests, and public JS.

## Upload To R2

```bash
pnpm run graphify:upload -- graphify/dashboard
```

That command uploads the primary architecture artifacts from `graphify-out/` to
the `agency-files` R2 bucket. Use `graphify/dashboard` as the
`project_repos.graphify_path` value when the dashboard repository is connected
to Model Ops/project repo metadata.

Primary architecture consumers should depend on:

- `graphify/dashboard/graph.json`
- `graphify/dashboard/GRAPH_REPORT.md`
- `graphify/dashboard/index.md`

The full `wiki/` and `obsidian/` folders are useful for human review but contain
thousands of small files. Upload them only when another machine or reviewer
needs the generated vault:

```bash
pnpm run graphify:upload -- graphify/dashboard --full
```

## Readiness

```bash
pnpm run readiness:agency-workflows
```

The readiness gate blocks Workflows cutover when Graphify artifacts are missing,
stale, or invalid. Authenticated production smoke is a separate gate and still
requires `AGENCY_WORKFLOWS_SMOKE_AUTH_TOKEN` or an equivalent auth cookie.
