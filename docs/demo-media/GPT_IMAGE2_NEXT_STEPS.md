# GPT Image 2 Next Steps

## What M02 Produced

M02 produced a prompt and naming package only. It does not include real generated images, downloaded images or source-code changes.

## Output Counts

- Meals: 30 prompts.
- Health materials: 20 prompts.
- Growth activities: 24 prompts.
- Storybook covers: 36 prompts.
- Storybook pages: 72 prompts.
- Extra optional fallbacks: 8 prompts.
- File naming manifest: 190 assets, all `required: false`.

## How To Generate Images

1. Open one batch file from `docs/demo-media/gpt-image2-batches/`.
2. Copy a small group of prompt entries into GPT Image 2.
3. Generate each image as synthetic / demo / fictional media only.
4. Reject unsafe outputs: identifiable child faces, real people, real health documents, real hospital names, phone numbers, ID numbers, QR codes, barcodes, brands or copyrighted characters.
5. Save each approved image exactly as its `targetFilename`.

## Where To Put Generated Images

Place approved generated images under:

- `public/demo-media/gpt-image2/meals/`
- `public/demo-media/gpt-image2/health-materials/`
- `public/demo-media/gpt-image2/growth/`
- `public/demo-media/gpt-image2/storybooks/`

Example:

`meals/demo-meal-breakfast-01.png` becomes `public/demo-media/gpt-image2/meals/demo-meal-breakfast-01.png`.

## Then Run M03

After images are generated and placed in the target folders, execute M03. M03 should run `node scripts/update-demo-media-manifest.mjs`, inspect `public/demo-media/manifest.json`, and preserve fallback behavior for missing assets.
