# GPT Image 2 Ingest Checklist

## Before Generation

- Confirm the source prompt file matches the intended batch.
- Generate only synthetic / demo / fictional assets.
- Reject any output containing an identifiable child face, real person identity, real medical document, real institution name, brand logo, phone number, ID number, QR code or barcode.
- For health materials, verify every accepted image visibly contains `DEMO / 示例`.

## File Naming

- Save every generated file using the exact `targetFilename` in the batch prompt.
- Place files under `public/demo-media/gpt-image2/` so the full paths become:
  - `public/demo-media/gpt-image2/meals/...`
  - `public/demo-media/gpt-image2/health-materials/...`
  - `public/demo-media/gpt-image2/growth/...`
  - `public/demo-media/gpt-image2/storybooks/...`
- Do not rename files after M03 starts unless the manifest is updated at the same time.

## Local Intake

- After images are generated, compare the folder contents against `gpt-image2-file-naming-manifest.json`.
- Missing files are allowed because all entries are `required: false`.
- Do not manually edit `public/demo-media/manifest.json` before M03.

## M03 Handoff

- Put approved images into `public/demo-media/gpt-image2/`.
- Run `node scripts/update-demo-media-manifest.mjs`.
- Review `public/demo-media/manifest.json` and add seed refs only if M03 requires precise binding.
- Keep the existing SVG fallback behavior for any missing image.
