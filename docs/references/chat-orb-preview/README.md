# Approved chatbot orb reference

Saved from http://127.0.0.1:8770 on 8 October 2026. This is the original dark/light dashboard comparison, with working Activity Hub and Portal Assistant launcher demonstrations. It is a design reference, not a deployed application route.

## Open the saved preview

From the dashboard project root, run:

```sh
python3 -m http.server 8770 --bind 127.0.0.1 --directory docs/references/chat-orb-preview/build
```

Then visit http://127.0.0.1:8770. No application server, login, network assets or build is needed. If that port is already in use, stop the existing preview or select another port. Use Ctrl+C to stop the server.

## Edit or rebuild

The source snapshot is in `source/`; it uses the dashboard project's installed Vue, Vite, Nuxt UI and Tailwind dependencies:

```sh
pnpm exec vite --config docs/references/chat-orb-preview/source/vite.config.mjs
pnpm exec vite build --config docs/references/chat-orb-preview/source/vite.config.mjs
```

The config uses relative paths, so it no longer depends on temporary directories. The original compiled preview is retained in `build/` for stable reference even if future dependencies change. These files do not modify live dashboard components.

## Artwork provenance

- Original component snapshot: dashboard commit `a67e4cff9`, `app/components/ai/ReferenceOrb.vue` and `OrbLauncher.vue`.
- Original GIF: 400 × 300 pixels; crop to the central 224-pixel square, feather the outer edge from 92% to 100%.
- No hue filter, added outline or timing change. The black source background is retained inside the crop.
- SHA-256: `32d63b7b7f8011a008a017f2d6a9d59afeee3a97997a364954cede04cb65b67b`.
- Reduced-motion users see a canvas frame of the same artwork.
