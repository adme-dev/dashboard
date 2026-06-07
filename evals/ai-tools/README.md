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

Run `pnpm eval:ai`, compare pass-rate + latency + cost across the providers, then set
`AI_LOOP_MODEL` (winner) + `AI_LOOP_FALLBACK_MODEL` (runner-up).

**Locked 2026-06-07 (first bake-off run):**
- `AI_LOOP_MODEL=groq/openai/gpt-oss-120b` — verified it correctly emits tool calls against our real Zod tool schemas (`finishReason: tool_calls`).
- `AI_LOOP_FALLBACK_MODEL=groq/openai/gpt-oss-20b` — **Kimi K2 was the planned fallback but Groq returns 404 for `moonshotai/kimi-k2-instruct` (not on this account)**; gpt-oss-20b is the valid sibling. Available Groq tool models: gpt-oss-120b, gpt-oss-20b, qwen/qwen3-32b, llama-3.3-70b-versatile, meta-llama/llama-4-scout.

## ⚠️ Known harness limitation (follow-up)

promptfoo **0.121.15** returns `output: null` for a tool call with the Groq/OpenAI-compat providers + these gpt-oss models (the call is real — `finishReason: tool_calls` — but the tool_calls payload isn't surfaced to `output`). Consequences:
- **Tool-selection** `contains: <tool>` assertions can't see the call → they fail even when the model picks the right tool. The **no-tool / chit-chat** cases (which return text) DO work.
- **Injection** `not-contains: create_task` can **false-pass** if the model complies (output is null either way).

**The architectural injection defense (spotlighting) IS unit-tested** in `test/ai/spotlight.test.ts`. To make these end-to-end evals reliable, add a custom promptfoo provider/`transform` that reads `tool_calls` from the raw Groq response (or upgrade promptfoo). Tracked as a follow-up.

Run both suites on every change to a tool, the system prompt, or the model.
