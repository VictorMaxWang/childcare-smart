# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: .tmp-smoke\teacher-lane-smoke.spec.js >> teacher high-risk consultation respects query child and can finish a smoke run
- Location: .tmp-smoke\teacher-lane-smoke.spec.js:117:1

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('4. 最终会诊结论')
Expected: visible
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 30000ms
  - waiting for getByText('4. 最终会诊结论')

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - alert [ref=e2]
  - navigation [ref=e3]:
    - generic [ref=e4]:
      - link "普惠托育智慧平台 Smart Childcare Operations Suite" [ref=e5] [cursor=pointer]:
        - /url: /
        - img [ref=e7]
        - generic [ref=e10]:
          - generic [ref=e11]: 普惠托育智慧平台
          - generic [ref=e12]: Smart Childcare Operations Suite
      - generic [ref=e13]:
        - link "数据总览" [ref=e14] [cursor=pointer]:
          - /url: /
          - img [ref=e15]
          - text: 数据总览
        - link "教师工作台" [ref=e18] [cursor=pointer]:
          - /url: /teacher
          - img [ref=e19]
          - text: 教师工作台
        - link "幼儿档案" [ref=e22] [cursor=pointer]:
          - /url: /children
          - img [ref=e23]
          - text: 幼儿档案
        - link "晨检与健康" [ref=e28] [cursor=pointer]:
          - /url: /health
          - img [ref=e29]
          - text: 晨检与健康
        - link "成长行为" [ref=e32] [cursor=pointer]:
          - /url: /growth
          - img [ref=e33]
          - text: 成长行为
        - link "饮食记录" [ref=e36] [cursor=pointer]:
          - /url: /diet
          - img [ref=e37]
          - text: 饮食记录
        - link "家长端" [ref=e42] [cursor=pointer]:
          - /url: /parent
          - img [ref=e43]
          - text: 家长端
      - generic [ref=e46]:
        - generic [ref=e47]:
          - paragraph [ref=e48]: 当前身份
          - paragraph [ref=e49]: 👩‍🏫 李老师 · 教师
        - button "退出登录" [ref=e50]
  - main [ref=e51]:
    - generic [ref=e52]:
      - generic [ref=e53]:
        - generic [ref=e55]:
          - generic [ref=e56]:
            - generic [ref=e57]: 高风险儿童会诊 · 向阳班
            - heading "高风险儿童一键会诊" [level=1] [ref=e58]
            - paragraph [ref=e59]: 按长期画像、最近会诊、当前建议分阶段流式展示，适合移动端录屏。
          - generic [ref=e60]:
            - link "返回教师工作台" [ref=e61] [cursor=pointer]:
              - /url: /teacher
              - text: 返回教师工作台
              - img [ref=e62]
            - link "进入教师 AI 助手" [ref=e64] [cursor=pointer]:
              - /url: /teacher/agent
              - text: 进入教师 AI 助手
              - img [ref=e65]
        - generic [ref=e68]:
          - generic [ref=e69]:
            - generic [ref=e70]:
              - generic [ref=e71]:
                - generic [ref=e72]:
                  - heading "1. 锁定会诊对象" [level=3] [ref=e73]
                  - paragraph [ref=e74]: 先选需要升级关注的儿童，再启动会诊流。
                - generic [ref=e75]: 待同步
              - generic [ref=e77]:
                - generic [ref=e78]:
                  - generic [ref=e79]:
                    - paragraph [ref=e80]: 选择儿童
                    - combobox [ref=e81]:
                      - generic: 张浩然 · 向阳班
                      - img [ref=e82]
                  - generic [ref=e84]:
                    - generic [ref=e85]:
                      - generic [ref=e86]: 高风险主路径
                      - generic [ref=e87]: 向阳班
                    - paragraph [ref=e88]: 张浩然
                    - paragraph [ref=e89]: 3岁11个月 · 出生于 2022/05/09
                    - generic [ref=e91]: 最近家长反馈为“已知晓”
                - generic [ref=e92]:
                  - paragraph [ref=e93]: 本次自动带入
                  - list [ref=e94]:
                    - listitem [ref=e95]: 晨检异常：0 条
                    - listitem [ref=e96]: 待复查：0 条
                    - listitem [ref=e97]: 成长观察：2 条
                    - listitem [ref=e98]: 家长反馈：1 条
                    - listitem [ref=e99]: 班级信号：4 条
            - generic [ref=e100]:
              - generic [ref=e102]:
                - heading "2. 录入教师补充" [level=3] [ref=e103]
                - paragraph [ref=e104]: 会诊流会直接把这些内容与权威 memory context 合并。
              - generic [ref=e106]:
                - textbox "例如：午睡前反复抓耳，离园前情绪仍不稳定，希望生成园内动作、今夜家庭任务和 48 小时复查点。" [ref=e107]
                - generic [ref=e108]:
                  - generic [ref=e109]:
                    - generic [ref=e110]:
                      - img [ref=e111]
                      - paragraph [ref=e114]: 图片占位
                    - generic [ref=e115]:
                      - textbox "附件名，例如 morning-check-photo.jpg" [ref=e116]: morning-check-photo.jpg
                      - textbox "先写一段图片中的关键信息。" [ref=e117]
                  - generic [ref=e118]:
                    - generic [ref=e119]:
                      - img [ref=e120]
                      - paragraph [ref=e123]: 语音速记占位
                    - generic [ref=e124]:
                      - textbox "附件名，例如 teacher-voice-note.m4a" [ref=e125]: teacher-voice-note.m4a
                      - textbox "先写一段语音速记内容。" [ref=e126]
                - generic [ref=e127]:
                  - generic [ref=e128]: 点击后会按“长期画像 → 最近会诊 → 当前建议”流式展示，并在结束后保留最终会诊卡。
                  - button "一键生成会诊" [active] [ref=e129]:
                    - img [ref=e130]
                    - text: 一键生成会诊
            - generic [ref=e133]:
              - generic [ref=e134]:
                - generic [ref=e135]:
                  - heading "3. 流式会诊展示" [level=3] [ref=e136]
                  - paragraph [ref=e137]: 这里是比赛录屏最关键的一段。
                - generic [ref=e138]: 待启动
              - generic [ref=e141]:
                - generic [ref=e144]:
                  - generic [ref=e145]:
                    - generic [ref=e146]:
                      - generic [ref=e147]: 演示态
                      - generic [ref=e148]: 请求失败
                    - generic [ref=e149]:
                      - heading "高风险会诊 Trace" [level=3] [ref=e150]:
                        - img [ref=e151]
                        - text: 高风险会诊 Trace
                      - paragraph [ref=e163]: done.result 缺少关键字段：consultationId、childId、summary、source、generatedAt、parentMessageDraft、reviewIn48h、triggerReasons、keyFindings、nextCheckpoints、todayInSchoolActions、tonightAtHomeActions、followUp48h、explainability、evidenceItems、shouldEscalateToAdmin、coordinatorSummary、directorDecisionCard、interventionCard、providerTrace、memoryMeta、traceMeta
                    - generic [ref=e164]:
                      - generic [ref=e165]: unknown
                      - generic [ref=e166]: next-stream-fallback
                      - generic [ref=e167]: Fallback 链路
                  - generic [ref=e169]:
                    - link "演示态" [ref=e170] [cursor=pointer]:
                      - /url: /teacher/high-risk-consultation
                    - link "调试态" [ref=e171] [cursor=pointer]:
                      - /url: /teacher/high-risk-consultation?trace=debug
                - generic [ref=e173]:
                  - generic [ref=e174]:
                    - paragraph [ref=e175]: 会诊流请求失败
                    - paragraph [ref=e176]: fallback request failed with status 405
                  - generic [ref=e177]:
                    - paragraph [ref=e178]: 最终结果未通过前端校验
                    - paragraph [ref=e179]: done.result 缺少关键字段：consultationId、childId、summary、source、generatedAt、parentMessageDraft、reviewIn48h、triggerReasons、keyFindings、nextCheckpoints、todayInSchoolActions、tonightAtHomeActions、followUp48h、explainability、evidenceItems、shouldEscalateToAdmin、coordinatorSummary、directorDecisionCard、interventionCard、providerTrace、memoryMeta、traceMeta
                  - generic [ref=e180]:
                    - paragraph [ref=e181]: 当前展示的是 fallback 结果
                    - paragraph [ref=e182]: 页面仍可演示，但 staging 联调时需要继续确认真实 provider 链路。
                - generic [ref=e183]:
                  - generic [ref=e185]:
                    - generic [ref=e186]:
                      - paragraph [ref=e187]: Trace timeline
                      - heading "三阶段会诊时间线" [level=3] [ref=e188]
                    - generic [ref=e189]: 请求失败
                  - generic [ref=e193]:
                    - generic [ref=e194]:
                      - generic [ref=e195]:
                        - generic [ref=e196]: "1"
                        - img [ref=e197]
                      - paragraph [ref=e206]: 长期画像
                      - paragraph [ref=e207]: 系统先读取长期画像和记忆上下文，判断这次会诊要基于什么底色。
                    - generic [ref=e208]:
                      - generic [ref=e209]:
                        - generic [ref=e210]: "2"
                        - img [ref=e211]
                      - paragraph [ref=e220]: 最近会诊 / 最近快照
                      - paragraph [ref=e221]: 系统回看最近会诊、快照和连续性信号，确认问题不是孤立事件。
                    - generic [ref=e222]:
                      - generic [ref=e223]:
                        - generic [ref=e224]: "3"
                        - img [ref=e225]
                      - paragraph [ref=e234]: 当前建议
                      - paragraph [ref=e235]: 系统生成当前建议，把园内动作、家庭任务和 48 小时复查串成闭环。
                - generic [ref=e236]:
                  - generic [ref=e239]:
                    - generic [ref=e240]:
                      - generic [ref=e241]:
                        - generic [ref=e242]: 长期画像
                        - generic [ref=e243]: 待开始
                      - generic [ref=e244]:
                        - heading "长期画像" [level=3] [ref=e245]
                        - paragraph [ref=e246]: 系统先读取长期画像和记忆上下文，判断这次会诊要基于什么底色。
                    - button "展开" [ref=e247]:
                      - img [ref=e248]
                      - text: 展开
                  - generic [ref=e252]:
                    - generic [ref=e253]:
                      - generic [ref=e254]:
                        - generic [ref=e255]: 最近快照
                        - generic [ref=e256]: 待开始
                      - generic [ref=e257]:
                        - heading "最近会诊 / 最近快照" [level=3] [ref=e258]
                        - paragraph [ref=e259]: 系统回看最近会诊、快照和连续性信号，确认问题不是孤立事件。
                    - button "展开" [ref=e260]:
                      - img [ref=e261]
                      - text: 展开
                  - generic [ref=e264]:
                    - generic [ref=e265]:
                      - generic [ref=e266]:
                        - generic [ref=e267]:
                          - generic [ref=e268]: 当前建议
                          - generic [ref=e269]: 待开始
                          - generic [ref=e270]: unknown
                        - generic [ref=e271]:
                          - heading "当前建议" [level=3] [ref=e272]
                          - paragraph [ref=e273]: 系统生成当前建议，把园内动作、家庭任务和 48 小时复查串成闭环。
                      - button "展开" [ref=e274]:
                        - img [ref=e275]
                        - text: 展开
                    - generic [ref=e277]:
                      - generic [ref=e278]: unknown
                      - generic [ref=e279]: next-stream-fallback
                      - generic [ref=e280]: Fallback 链路
          - generic [ref=e281]:
            - generic [ref=e282]:
              - generic [ref=e284]:
                - heading "会诊说明" [level=3] [ref=e285]
                - paragraph [ref=e286]: 适合移动端竖屏录屏的三步演示。
              - list [ref=e288]:
                - listitem [ref=e289]:
                  - img [ref=e290]
                  - text: 先锁定需要升级关注的儿童
                - listitem [ref=e292]:
                  - img [ref=e293]
                  - text: 再让系统按阶段推送会诊流
                - listitem [ref=e305]:
                  - img [ref=e306]
                  - text: 最后落到园内、家庭和 48 小时复查卡
            - generic [ref=e309]:
              - generic [ref=e311]:
                - heading "本页预埋能力" [level=3] [ref=e312]
                - paragraph [ref=e313]: 演示态优先，线上可继续接真实能力。
              - generic [ref=e315]:
                - generic [ref=e316]: LLM Provider：由后端根据环境变量切换 real / mock。
                - generic [ref=e317]: memory：会诊流会展示 backend、usedSources、matchedSnapshotIds 和 matchedTraceIds。
                - generic [ref=e318]: SSE：前端消费 status、text、ui、error、done 五类事件。
            - generic [ref=e319]:
              - generic [ref=e321]:
                - heading "展示模式" [level=3] [ref=e322]
                - paragraph [ref=e323]: 模式切换已经前移到 trace 区头部，这里只说明两种视角的边界。
              - generic [ref=e325]:
                - generic [ref=e326]: 演示态默认收敛为三阶段故事线、同步去向和必要异常提示，适合评委录屏与教师讲解。
                - generic [ref=e327]: 调试态会额外展开 providerTrace、memoryTrace、trace meta 和本地 traceCase 演练入口，适合 staging 联调。
      - generic:
        - generic [ref=e328]:
          - generic [ref=e329]:
            - generic [ref=e330]:
              - img [ref=e331]
              - text: AI 语音
            - paragraph [ref=e334]: 长按说话
          - paragraph [ref=e335]: 像手机 AI 助手一样长按录音，松开结束并生成上传入口。
        - button "长按说话，像手机 AI 助手一样长按录音，松开结束并生成上传入口。" [ref=e336] [cursor=pointer]:
          - generic [ref=e338]:
            - img [ref=e339]
            - generic [ref=e342]: 按住说
        - generic: 长按说话，像手机 AI 助手一样长按录音，松开结束并生成上传入口。
  - region "Notifications alt+T"
```

# Test source

```ts
  32  | async function getChildOptions(page) {
  33  |   const combobox = await getCombobox(page);
  34  |   await combobox.click();
  35  |   const options = page.locator('[role="option"]');
  36  |   await expect(options.first()).toBeVisible();
  37  |   const count = await options.count();
  38  |   const results = [];
  39  |   for (let i = 0; i < count; i += 1) {
  40  |     const option = options.nth(i);
  41  |     const text = (await option.textContent())?.trim() || '';
  42  |     const name = text.split('·')[0].trim();
  43  |     results.push({ text, name });
  44  |   }
  45  |   await page.keyboard.press('Escape');
  46  |   return results;
  47  | }
  48  | 
  49  | async function readCurrentServiceChild(page) {
  50  |   const text = await page.locator('xpath=//p[normalize-space(.)="当前服务对象"]/following-sibling::p[1]').textContent();
  51  |   return (text || '').trim();
  52  | }
  53  | 
  54  | test('teacher home shows workbench-first IA order', async ({ page }) => {
  55  |   await loginAsDemoTeacher(page);
  56  |   await page.goto(`${baseUrl}/teacher`, { waitUntil: 'networkidle' });
  57  |   await expect(page.getByRole('heading', { name: '教师工作台' })).toBeVisible();
  58  | 
  59  |   const labels = ['今日异常儿童', '未完成晨检', '待复查名单', '今日待沟通家长', '快捷录入入口'];
  60  |   const positions = [];
  61  |   for (const label of labels) {
  62  |     const box = await page.getByText(label, { exact: true }).boundingBox();
  63  |     expect(box).not.toBeNull();
  64  |     positions.push(box.y);
  65  |   }
  66  | 
  67  |   for (let index = 0; index < positions.length - 1; index += 1) {
  68  |     expect(positions[index]).toBeLessThan(positions[index + 1]);
  69  |   }
  70  | });
  71  | 
  72  | test('teacher agent keeps active child consistent across query, manual switch, and workflows', async ({ page }) => {
  73  |   await loginAsDemoTeacher(page);
  74  |   await page.goto(`${baseUrl}/teacher/agent`, { waitUntil: 'networkidle' });
  75  |   await expect(page.getByRole('heading', { name: '当前服务对象', exact: true })).toBeVisible();
  76  | 
  77  |   const options = await getChildOptions(page);
  78  |   expect(options.length).toBeGreaterThan(0);
  79  |   const firstChild = smokeChildren.first;
  80  |   const secondChild = smokeChildren.second;
  81  |   expect(options.some((option) => option.name === firstChild.name)).toBeTruthy();
  82  |   expect(options.some((option) => option.name === secondChild.name)).toBeTruthy();
  83  | 
  84  |   await page.goto(`${baseUrl}/teacher/agent?childId=${firstChild.value}`, { waitUntil: 'networkidle' });
  85  |   await expect(page.getByRole('heading', { name: '当前服务对象', exact: true })).toBeVisible();
  86  |   expect(await readCurrentServiceChild(page)).toContain(firstChild.name);
  87  | 
  88  |   await page.goto(`${baseUrl}/teacher/agent?action=communication&childId=${firstChild.value}`, { waitUntil: 'networkidle' });
  89  |   await expect(page.getByText(new RegExp(`对象：\\s*${escapeRegExp(firstChild.name)}`))).toBeVisible({ timeout: 20000 });
  90  | 
  91  |   await page.goto(`${baseUrl}/teacher/agent?action=follow-up&childId=${firstChild.value}`, { waitUntil: 'networkidle' });
  92  |   await expect(page.getByText(new RegExp(`对象：\\s*${escapeRegExp(firstChild.name)}`))).toBeVisible({ timeout: 20000 });
  93  | 
  94  |   await page.goto(`${baseUrl}/teacher/agent?action=weekly-summary`, { waitUntil: 'networkidle' });
  95  |   await expect(page.getByText(/^对象：/)).toBeVisible({ timeout: 20000 });
  96  |   await expect(page.getByText('班级模式')).toBeVisible();
  97  | 
  98  |   await page.goto(`${baseUrl}/teacher/agent?intent=record_observation&childId=${firstChild.value}`, { waitUntil: 'networkidle' });
  99  |   await expect(page.getByText(new RegExp(`对象：\\s*${escapeRegExp(firstChild.name)}`))).toBeVisible({ timeout: 20000 });
  100 | 
  101 |   if (options.length > 1) {
  102 |     await page.goto(`${baseUrl}/teacher/agent?action=communication&childId=${firstChild.value}`, { waitUntil: 'networkidle' });
  103 |     await expect(page.getByText(new RegExp(`对象：\\s*${escapeRegExp(firstChild.name)}`))).toBeVisible({ timeout: 20000 });
  104 | 
  105 |     const combobox = await getCombobox(page);
  106 |     await combobox.click();
  107 |     await page.getByRole('option', { name: new RegExp(escapeRegExp(secondChild.name)) }).click();
  108 | 
  109 |     await expect(page.getByText('点击上方任一快捷操作，教师 Agent 会基于当前班级或儿童上下文生成结构化结果。')).toBeVisible();
  110 |     expect(await readCurrentServiceChild(page)).toContain(secondChild.name);
  111 | 
  112 |     await page.getByRole('button', { name: '生成家长沟通建议' }).click();
  113 |     await expect(page.getByText(new RegExp(`对象：\\s*${escapeRegExp(secondChild.name)}`))).toBeVisible({ timeout: 20000 });
  114 |   }
  115 | });
  116 | 
  117 | test('teacher high-risk consultation respects query child and can finish a smoke run', async ({ page }) => {
  118 |   await loginAsDemoTeacher(page);
  119 |   await page.goto(`${baseUrl}/teacher/high-risk-consultation`, { waitUntil: 'networkidle' });
  120 |   await expect(page.getByText('选择儿童', { exact: true })).toBeVisible();
  121 | 
  122 |   const options = await getChildOptions(page);
  123 |   expect(options.length).toBeGreaterThan(0);
  124 |   const targetChild = smokeChildren.second;
  125 |   expect(options.some((option) => option.name === targetChild.name)).toBeTruthy();
  126 | 
  127 |   await page.goto(`${baseUrl}/teacher/high-risk-consultation?childId=${targetChild.value}`, { waitUntil: 'networkidle' });
  128 |   await expect(page.getByText('本次自动带入')).toBeVisible();
  129 |   await expect(await getCombobox(page)).toContainText(targetChild.name);
  130 | 
  131 |   await page.getByRole('button', { name: '一键生成会诊' }).click();
> 132 |   await expect(page.getByText('4. 最终会诊结论')).toBeVisible({ timeout: 30000 });
      |                                             ^ Error: expect(locator).toBeVisible() failed
  133 |   await expect(await getCombobox(page)).toContainText(targetChild.name);
  134 | });
  135 | 
```