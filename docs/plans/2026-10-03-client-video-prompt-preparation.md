# Client video prompt preparation

Add a bounded step to the existing Produce inspector: campaign brief → reviewed guide rules → editable prompt → save to this project and apply to the existing generation composer.

Use the existing client preset and shared guide. Preparation is deterministic and free; it never queues generation, changes budgets or publishes a post. Store the brief, selected rules and reviewed prompt in the versioned timeline JSON with its client ID. Hide stale guidance after client reassignment. Keep the whole prompt under 2,000 characters without truncating instructions.

1. Add failing prompt and persistence contract tests.
2. Add the compact Nuxt UI modal, timeline metadata and existing save handoff. Enforce project/client access when saving.
3. Verify save failures, reloads, client switches and composer prefill with focused tests and a live working example.
4. Review every changed file, sync the Video Studio feature description, run release guards and deploy the committed current source.

The original shared guides, generation settings and Facebook drafts remain separate from campaign-specific working text. No new paid render or social publication is required for verification.
