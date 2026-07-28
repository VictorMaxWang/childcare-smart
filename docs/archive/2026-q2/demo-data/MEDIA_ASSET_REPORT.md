# D-SEED Media Asset Report

## Current Assets

Committed local placeholders:

- `public/demo-media/placeholders/demo-placeholder.svg`
- `public/demo-media/meals/demo-meal-placeholder.svg`
- `public/demo-media/health-materials/demo-health-material-placeholder.svg`
- `public/demo-media/growth/demo-growth-placeholder.svg`
- `public/demo-media/storybooks/demo-storybook-placeholder.svg`
- `public/demo-media/manifest.json`

## Safety

- No downloaded network images.
- No real child face photos.
- No real health reports.
- No real names, phone numbers, addresses, IDs or medical record numbers.
- Health material placeholder is visibly marked `DEMO / 示例`.

## Future GPT Image 2 Intake

Place GPT Image 2 synthetic images under:

- `public/demo-media/gpt-image2/meals/`
- `public/demo-media/gpt-image2/health-materials/`
- `public/demo-media/gpt-image2/growth/`
- `public/demo-media/gpt-image2/storybooks/`

Then run:

```bash
node scripts/update-demo-media-manifest.mjs
```

Review generated entries in `public/demo-media/manifest.json` and add `seedRefs` where a specific asset should map to a specific child, record or storybook.
