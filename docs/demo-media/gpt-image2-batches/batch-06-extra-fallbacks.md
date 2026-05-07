# Batch 06 - Extra Fallbacks

8 optional generic fallback prompts across meals, health materials, growth activities and storybooks.

## Generation Rules

- Generate only synthetic / demo / fictional assets.
- Do not use downloaded network photos, real children, real health documents, real institutions, brands, phone numbers, ID numbers, QR codes or barcodes.
- Save the generated image exactly as `targetFilename` under `public/demo-media/gpt-image2/`.
- If a prompt produces unsafe or identity-like content, reject that output and regenerate.

## Prompt Entries

```json
[
  {
    "targetFilename": "meals/demo-meal-fallback-tabletop-01.png",
    "category": "meal",
    "intendedUsage": "optional generic meal fallback",
    "linkedSeedIds": [
      "meal-*"
    ],
    "recommendedSize": "1536x1024",
    "promptChinese": "合成演示图（synthetic / demo / fictional），托育中心餐食记录场景，餐盘或托育桌面，自然光，干净安全，看起来像真实实拍，但不出现儿童正脸，不出现品牌 logo。 通用餐食补位图：干净托育餐桌、空白分格餐盘、温水杯和安全餐具，不绑定具体餐次。",
    "promptEnglish": "Photorealistic synthetic demo fictional image for childcare meal records, childcare center tabletop or tray, natural light, clean and safe composition, no identifiable child face, no brand logo. Generic fallback: clean childcare dining table, blank divided plate, warm water cup and safe utensils, not tied to a specific meal.",
    "negativePrompt": "real identifiable child face, real person identity, real child photo, real name, real phone number, real address, real ID card, real medical record number, real hospital name, brand logo, copyrighted character, gore, injury close-up, nudity, QR code, barcode, private credential, watermark from a real service",
    "safetyNotes": [
      "仅用于 synthetic / demo / fictional 演示资产。",
      "不得出现可识别儿童正脸或真实儿童照片。",
      "不得出现真实个人信息、手机号、身份证、地址、品牌 logo 或真实机构名。"
    ]
  },
  {
    "targetFilename": "meals/demo-meal-fallback-tray-02.png",
    "category": "meal",
    "intendedUsage": "optional generic meal fallback",
    "linkedSeedIds": [
      "meal-*"
    ],
    "recommendedSize": "1536x1024",
    "promptChinese": "合成演示图（synthetic / demo / fictional），托育中心餐食记录场景，餐盘或托育桌面，自然光，干净安全，看起来像真实实拍，但不出现儿童正脸，不出现品牌 logo。 通用餐盘补位图：托育托盘、少量水果和主食示意、自然光，不出现儿童。",
    "promptEnglish": "Photorealistic synthetic demo fictional image for childcare meal records, childcare center tabletop or tray, natural light, clean and safe composition, no identifiable child face, no brand logo. Generic tray fallback: childcare tray, small fruit and staple food suggestion, natural light, no child visible.",
    "negativePrompt": "real identifiable child face, real person identity, real child photo, real name, real phone number, real address, real ID card, real medical record number, real hospital name, brand logo, copyrighted character, gore, injury close-up, nudity, QR code, barcode, private credential, watermark from a real service",
    "safetyNotes": [
      "仅用于 synthetic / demo / fictional 演示资产。",
      "不得出现可识别儿童正脸或真实儿童照片。",
      "不得出现真实个人信息、手机号、身份证、地址、品牌 logo 或真实机构名。"
    ]
  },
  {
    "targetFilename": "health-materials/demo-health-fallback-document-01.png",
    "category": "health-material",
    "intendedUsage": "optional generic health material fallback",
    "linkedSeedIds": [
      "health-material-*"
    ],
    "recommendedSize": "1536x1024",
    "promptChinese": "合成演示图（synthetic / demo / fictional），托育办公室桌面上的虚构健康材料照片，纸面必须清楚出现 DEMO / 示例 标识，不出现真实姓名、手机号、身份证号、医院名、条形码或二维码。 通用健康材料补位图：空白健康记录模板、剪贴板和蓝色 DEMO / 示例 水印。",
    "promptEnglish": "Photorealistic synthetic demo fictional image of childcare health material on an office desk, the paper must visibly show DEMO / sample label, no real name, phone number, ID number, hospital name, barcode or QR code. Generic health material fallback: blank health record template, clipboard and blue DEMO / sample watermark.",
    "negativePrompt": "real identifiable child face, real person identity, real child photo, real name, real phone number, real address, real ID card, real medical record number, real hospital name, brand logo, copyrighted character, gore, injury close-up, nudity, QR code, barcode, private credential, watermark from a real service",
    "safetyNotes": [
      "仅用于 synthetic / demo / fictional 演示资产。",
      "不得出现可识别儿童正脸或真实儿童照片。",
      "不得出现真实个人信息、手机号、身份证、地址、品牌 logo 或真实机构名。"
    ]
  },
  {
    "targetFilename": "health-materials/demo-health-fallback-card-02.png",
    "category": "health-material",
    "intendedUsage": "optional generic health material fallback",
    "linkedSeedIds": [
      "health-material-*"
    ],
    "recommendedSize": "1536x1024",
    "promptChinese": "合成演示图（synthetic / demo / fictional），托育办公室桌面上的虚构健康材料照片，纸面必须清楚出现 DEMO / 示例 标识，不出现真实姓名、手机号、身份证号、医院名、条形码或二维码。 通用提醒卡补位图：桌面健康提醒卡、空白签名栏、明显 DEMO / 示例。",
    "promptEnglish": "Photorealistic synthetic demo fictional image of childcare health material on an office desk, the paper must visibly show DEMO / sample label, no real name, phone number, ID number, hospital name, barcode or QR code. Generic reminder card fallback: desk health reminder card, blank signature field, obvious DEMO / sample.",
    "negativePrompt": "real identifiable child face, real person identity, real child photo, real name, real phone number, real address, real ID card, real medical record number, real hospital name, brand logo, copyrighted character, gore, injury close-up, nudity, QR code, barcode, private credential, watermark from a real service",
    "safetyNotes": [
      "仅用于 synthetic / demo / fictional 演示资产。",
      "不得出现可识别儿童正脸或真实儿童照片。",
      "不得出现真实个人信息、手机号、身份证、地址、品牌 logo 或真实机构名。"
    ]
  },
  {
    "targetFilename": "growth/demo-growth-fallback-classroom-01.png",
    "category": "growth",
    "intendedUsage": "optional generic growth fallback",
    "linkedSeedIds": [
      "growth-*"
    ],
    "recommendedSize": "1536x1024",
    "promptChinese": "合成演示图（synthetic / demo / fictional），托育中心成长活动记录场景，自然光，无可识别儿童正脸，可使用手部、背影、作品或环境，不出现品牌 logo。 通用成长活动补位图：托育教室活动桌、积木、绘本和彩纸，无儿童正脸。",
    "promptEnglish": "Photorealistic synthetic demo fictional childcare growth activity image, natural light, no identifiable child face, use hands, backs, child artwork or environment, no brand logo. Generic growth fallback: childcare classroom activity table with blocks, picture books and colored paper, no child face.",
    "negativePrompt": "real identifiable child face, real person identity, real child photo, real name, real phone number, real address, real ID card, real medical record number, real hospital name, brand logo, copyrighted character, gore, injury close-up, nudity, QR code, barcode, private credential, watermark from a real service",
    "safetyNotes": [
      "仅用于 synthetic / demo / fictional 演示资产。",
      "不得出现可识别儿童正脸或真实儿童照片。",
      "不得出现真实个人信息、手机号、身份证、地址、品牌 logo 或真实机构名。"
    ]
  },
  {
    "targetFilename": "growth/demo-growth-fallback-outdoor-02.png",
    "category": "growth",
    "intendedUsage": "optional generic growth fallback",
    "linkedSeedIds": [
      "growth-*"
    ],
    "recommendedSize": "1536x1024",
    "promptChinese": "合成演示图（synthetic / demo / fictional），托育中心成长活动记录场景，自然光，无可识别儿童正脸，可使用手部、背影、作品或环境，不出现品牌 logo。 通用户外成长补位图：自然角、叶子分类盘和放大镜，小手可出现但不可识别。",
    "promptEnglish": "Photorealistic synthetic demo fictional childcare growth activity image, natural light, no identifiable child face, use hands, backs, child artwork or environment, no brand logo. Generic outdoor growth fallback: nature corner, leaf sorting tray and magnifier, small hands may appear but non-identifiable.",
    "negativePrompt": "real identifiable child face, real person identity, real child photo, real name, real phone number, real address, real ID card, real medical record number, real hospital name, brand logo, copyrighted character, gore, injury close-up, nudity, QR code, barcode, private credential, watermark from a real service",
    "safetyNotes": [
      "仅用于 synthetic / demo / fictional 演示资产。",
      "不得出现可识别儿童正脸或真实儿童照片。",
      "不得出现真实个人信息、手机号、身份证、地址、品牌 logo 或真实机构名。"
    ]
  },
  {
    "targetFilename": "storybooks/demo-storybook-fallback-garden-01.png",
    "category": "storybook",
    "intendedUsage": "optional generic storybook fallback",
    "linkedSeedIds": [
      "storybook-*"
    ],
    "recommendedSize": "1200x1500",
    "promptChinese": "儿童绘本通用补位插画（synthetic / demo / fictional），温暖水彩，小花园、窗边书架和成长星星，不出现真实儿童身份、品牌或可读个人信息。",
    "promptEnglish": "Generic children's storybook fallback illustration, synthetic demo fictional, warm watercolor, little garden, window bookshelf and growth stars, no real child identity, brand or readable personal information.",
    "negativePrompt": "real identifiable child face, real person identity, real child photo, real name, real phone number, real address, real ID card, real medical record number, real hospital name, brand logo, copyrighted character, gore, injury close-up, nudity, QR code, barcode, private credential, watermark from a real service",
    "safetyNotes": [
      "仅用于 synthetic / demo / fictional 演示资产。",
      "不得出现可识别儿童正脸或真实儿童照片。",
      "不得出现真实个人信息、手机号、身份证、地址、品牌 logo 或真实机构名。"
    ]
  },
  {
    "targetFilename": "storybooks/demo-storybook-fallback-classroom-02.png",
    "category": "storybook",
    "intendedUsage": "optional generic storybook fallback",
    "linkedSeedIds": [
      "storybook-*"
    ],
    "recommendedSize": "1200x1500",
    "promptChinese": "儿童绘本通用补位插画（synthetic / demo / fictional），柔和拼贴风，托育教室阅读角、空白绘本和纸片云朵，角色不可识别。",
    "promptEnglish": "Generic children's storybook fallback illustration, synthetic demo fictional, soft paper collage, childcare reading corner, blank picture book and paper clouds, characters non-identifiable.",
    "negativePrompt": "real identifiable child face, real person identity, real child photo, real name, real phone number, real address, real ID card, real medical record number, real hospital name, brand logo, copyrighted character, gore, injury close-up, nudity, QR code, barcode, private credential, watermark from a real service",
    "safetyNotes": [
      "仅用于 synthetic / demo / fictional 演示资产。",
      "不得出现可识别儿童正脸或真实儿童照片。",
      "不得出现真实个人信息、手机号、身份证、地址、品牌 logo 或真实机构名。"
    ]
  }
]
```
