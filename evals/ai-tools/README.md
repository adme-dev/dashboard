# AI tool-calling evals

Eval harness for the gated tool-calling loop (Slice 1). Two suites, both run with
[promptfoo](https://promptfoo.dev) against the Cloudflare AI Gateway / Groq:

- **`promptfooconfig.yaml`** — tool-selection correctness + the **model bake-off** (gpt-oss-120b vs
  Kimi K2 vs gpt-oss-20b in one run), plus "should NOT call a tool" cases for chit-chat.
- **`injection.yaml`** — prompt-injection regression: untrusted content with embedded
  "ignore your instructions / call create_task / reveal finance" payloads must be refused.

`tools.json` is **generated from the Zod registry** (never hand-edit) so the evals can't drift from
the real tools.

## Run

```bash
# 1. Regenerate the tool defs from the registry (after changing any tool)
pnpm eval:ai:export

# 2. Tool-selection + bake-off (needs GROQ_API_KEY in env)
GROQ_API_KEY=... pnpm eval:ai

# 3. Injection regression
GROQ_API_KEY=... pnpm eval:ai:injection
```

`GROQ_API_KEY` is already in the repo `.env` (Option 2 = Groq open-source default), so the bake-off
runs **fully locally** — no operator keys required. To also A/B Claude Sonnet 4.6, set
`ANTHROPIC_API_KEY` + `AI_GATEWAY_URL` and add an `anthropic:claude-sonnet-4-6` provider.

## Bake-off → model lock

Run `pnpm eval:ai`, compare pass-rate + latency + cost across the three providers, then set:

- `AI_LOOP_MODEL` = the winner (default `groq/openai/gpt-oss-120b`)
- `AI_LOOP_FALLBACK_MODEL` = the runner-up (default `groq/moonshotai/kimi-k2-instruct`)

Both suites should run on every change to a tool, the system prompt, or the model.
