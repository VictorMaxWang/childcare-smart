# Demo Media Usage Guide

Current D-SEED ships only safe local SVG placeholders under `public/demo-media/`.

When GPT Image 2 synthetic assets are ready:

1. Put files under:
   - `public/demo-media/gpt-image2/meals/`
   - `public/demo-media/gpt-image2/health-materials/`
   - `public/demo-media/gpt-image2/growth/`
   - `public/demo-media/gpt-image2/storybooks/`
2. Run:
   ```bash
   node scripts/update-demo-media-manifest.mjs
   ```
3. Review `public/demo-media/manifest.json`.
4. Map `seedRefs` manually if a specific asset must attach to a specific `childId`, `recordId` or `storybookId`.

If a referenced generated image is missing, pages must keep using `fallbackPath`; missing media must not crash demo routes.
