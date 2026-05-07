# Demo Media Manifest Spec

`public/demo-media/manifest.json` is the source of truth for D-SEED demo media fallback mapping.

Required fields:

- `schemaVersion`: currently `dseed-demo-media-v1`.
- `fallbacks`: local safe SVG fallback paths for default, meal, health material, growth and storybook media.
- `assets`: generated or placeholder media entries.

Each asset entry should include:

- `id`: stable unique id.
- `kind`: `meal`, `health-material`, `growth`, `storybook` or `other`.
- `path`: public path under `/demo-media/...`.
- `fallbackPath`: local fallback path that always exists.
- `allowedUse`: UI/data surfaces allowed to use the asset.
- `seedRefs`: optional child, record or storybook seed ids.
- `demoLabelRequired`: `true` for health material style assets.

Safety rules:

- Do not use downloaded network photos.
- Do not include identifiable real child faces.
- Do not include real names, phone numbers, addresses, medical record numbers, hospital names, private credentials, or keys.
- Health material assets must visibly include `DEMO` or `示例`.
