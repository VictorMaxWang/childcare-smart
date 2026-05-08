# M03 Local Ingest Result

- Status: done
- Source: `C:\Users\12804\Desktop\childcare-smart源代码\图片库`
- Scanned files: 215
- Extracted zip files: 0
- Candidate images: 186
- Accepted images: 119
- Rejected images: 21
- Duplicate images: 46
- Optimized images: 119
- Total optimized size: 12.93 MB
- Manifest updated: true
- Fallback preserved: true

| Category | Count |
| --- | ---: |
| meals | 49 |
| health-materials | 19 |
| growth | 14 |
| storybooks | 37 |

## Checks

| Check | Status |
| --- | --- |
| lint | pass |
| build | pass |
| productSmoke | pass |
| productApi | pass |
| productAi | pass |
| productVoice | pass |
| productJourney | pass |
| featureSmoke | pass |
| bugbashSmoke | pass |
| tsc | pass |
| demoMediaTest | pass |

## Notes

All requested local checks passed. Playwright web-server logs include expected local brain proxy fallback noise when the optional brain service is unavailable; app fallbacks remained stable. Optimized public assets are WebP files under /demo-media/gpt-image2 and source library files/zips are not included.
