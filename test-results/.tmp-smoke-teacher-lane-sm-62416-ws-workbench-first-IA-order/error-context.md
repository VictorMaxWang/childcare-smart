# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: .tmp-smoke\teacher-lane-smoke.spec.js >> teacher home shows workbench-first IA order
- Location: .tmp-smoke\teacher-lane-smoke.spec.js:54:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: '教师工作台' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('heading', { name: '教师工作台' })

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
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
    - generic [ref=e53]:
      - generic [ref=e55]:
        - generic [ref=e56]:
          - generic [ref=e57]: 教师工作台 · 向阳班 · 4月12日星期日
          - heading "今天先处理最紧急的儿童，再把家长沟通和录入路径走顺" [level=1] [ref=e58]
          - paragraph [ref=e59]: 教师工作台只保留高频任务：异常儿童、未晨检、待复查、待沟通家长和快捷录入入口。移动端优先看任务，PC 端补充摘要。
        - generic [ref=e60]:
          - link "发起高风险会诊" [ref=e61] [cursor=pointer]:
            - /url: /teacher/high-risk-consultation
            - text: 发起高风险会诊
            - img [ref=e62]
          - link "进入教师 AI 助手" [ref=e64] [cursor=pointer]:
            - /url: /teacher/agent
            - text: 进入教师 AI 助手
            - img [ref=e65]
          - link "外部健康文件桥接" [ref=e67] [cursor=pointer]:
            - /url: /teacher/health-file-bridge
            - text: 外部健康文件桥接
            - img [ref=e68]
          - link "一键生成家长沟通建议" [ref=e70] [cursor=pointer]:
            - /url: /teacher/agent?action=communication
            - text: 一键生成家长沟通建议
            - img [ref=e71]
      - generic [ref=e74]:
        - generic [ref=e75]:
          - generic [ref=e77]:
            - generic [ref=e79]:
              - paragraph [ref=e80]: 今日异常儿童
              - paragraph [ref=e81]: "1"
            - generic [ref=e83]:
              - paragraph [ref=e84]: 未完成晨检
              - paragraph [ref=e85]: "0"
            - generic [ref=e87]:
              - paragraph [ref=e88]: 待复查名单
              - paragraph [ref=e89]: "5"
            - generic [ref=e91]:
              - paragraph [ref=e92]: 待沟通家长
              - paragraph [ref=e93]: "5"
          - generic [ref=e94]:
            - generic [ref=e96]:
              - heading "今日异常儿童" [level=3] [ref=e97]
              - paragraph [ref=e98]: 优先处理晨检异常，避免高频事项被淹没。
            - generic [ref=e101]:
              - generic [ref=e102]:
                - paragraph [ref=e103]: 江沐晴
                - generic [ref=e104]: 需优先处理
              - paragraph [ref=e105]: 体温 37.5°C · 烦躁 · 异常
          - generic [ref=e106]:
            - generic [ref=e107]:
              - generic [ref=e109]:
                - heading "未完成晨检" [level=3] [ref=e110]
                - paragraph [ref=e111]: 先补基础记录，后续 AI 建议才可靠。
              - paragraph [ref=e114]: 今日出勤儿童都已完成晨检。
            - generic [ref=e115]:
              - generic [ref=e117]:
                - heading "待复查名单" [level=3] [ref=e118]
                - paragraph [ref=e119]: 把需要继续观察的儿童压缩到一个列表。
              - generic [ref=e121]:
                - generic [ref=e122]:
                  - generic [ref=e123]:
                    - paragraph [ref=e124]: 林小雨
                    - generic [ref=e125]: 睡眠情况
                  - paragraph [ref=e126]: 提前半小时进入洗漱和绘本流程
                - generic [ref=e127]:
                  - generic [ref=e128]:
                    - paragraph [ref=e129]: 江沐晴
                    - generic [ref=e130]: 情绪表现
                  - paragraph [ref=e131]: 今天继续减少高强度活动并二次测温
                - generic [ref=e132]:
                  - generic [ref=e133]:
                    - paragraph [ref=e134]: 顾宇航
                    - generic [ref=e135]: 睡眠情况
                  - paragraph [ref=e136]: 继续跟踪咽喉状态并提醒主动饮水
                - generic [ref=e137]:
                  - generic [ref=e138]:
                    - paragraph [ref=e139]: 许嘉佑
                    - generic [ref=e140]: 情绪表现
                  - paragraph [ref=e141]: 记录情绪恢复时长，周内复盘安抚流程效果
                - generic [ref=e142]:
                  - generic [ref=e143]:
                    - paragraph [ref=e144]: 沈语彤
                    - generic [ref=e145]: 睡眠情况
                  - paragraph [ref=e146]: 午睡前提前进入安静过渡流程
          - generic [ref=e147]:
            - generic [ref=e149]:
              - heading "今日待沟通家长" [level=3] [ref=e150]
              - paragraph [ref=e151]: 把真正需要今天同步的家长挑出来。
            - generic [ref=e153]:
              - generic [ref=e154]:
                - generic [ref=e155]:
                  - paragraph [ref=e156]: 张浩然
                  - generic [ref=e157]: 建议沟通
                - paragraph [ref=e158]: 今日尚未收到家长反馈，可提醒晚间补充情况
              - generic [ref=e159]:
                - generic [ref=e160]:
                  - paragraph [ref=e161]: 王小明
                  - generic [ref=e162]: 建议沟通
                - paragraph [ref=e163]: 今日尚未收到家长反馈，可提醒晚间补充情况
              - generic [ref=e164]:
                - generic [ref=e165]:
                  - paragraph [ref=e166]: 刘子轩
                  - generic [ref=e167]: 建议沟通
                - paragraph [ref=e168]: 今日尚未收到家长反馈，可提醒晚间补充情况
              - generic [ref=e169]:
                - generic [ref=e170]:
                  - paragraph [ref=e171]: 杨梓涵
                  - generic [ref=e172]: 建议沟通
                - paragraph [ref=e173]: 今日尚未收到家长反馈，可提醒晚间补充情况
              - generic [ref=e174]:
                - generic [ref=e175]:
                  - paragraph [ref=e176]: 徐铭泽
                  - generic [ref=e177]: 建议沟通
                - paragraph [ref=e178]: 今日尚未收到家长反馈，可提醒晚间补充情况
          - generic [ref=e179]:
            - generic [ref=e181]:
              - heading "快捷录入入口" [level=3] [ref=e182]
              - paragraph [ref=e183]: 保持业务主路径直达，不让老师来回找页面。
            - generic [ref=e185]:
              - link "发起高风险会诊" [ref=e186] [cursor=pointer]:
                - /url: /teacher/high-risk-consultation
                - img [ref=e187]
                - text: 发起高风险会诊
              - link "去晨检录入" [ref=e189] [cursor=pointer]:
                - /url: /health
                - img [ref=e190]
                - text: 去晨检录入
              - link "去成长观察" [ref=e193] [cursor=pointer]:
                - /url: /growth
                - img [ref=e194]
                - text: 去成长观察
              - link "去饮食录入" [ref=e197] [cursor=pointer]:
                - /url: /diet
                - img [ref=e198]
                - text: 去饮食录入
              - link "外部健康文件桥接" [ref=e201] [cursor=pointer]:
                - /url: /teacher/health-file-bridge
                - img [ref=e202]
                - text: 外部健康文件桥接
        - generic [ref=e205]:
          - generic [ref=e206]:
            - generic [ref=e207]:
              - generic [ref=e208]:
                - heading "一句话让老师助手帮你找对入口" [level=3] [ref=e209]
                - paragraph [ref=e210]: 一句话命中会诊、观察、周报或家长沟通入口。
              - generic [ref=e211]:
                - img [ref=e212]
                - text: 统一入口
            - generic [ref=e216]:
              - generic [ref=e217]:
                - textbox "例如：帮我看看今天最需要优先处理的孩子，或生成本周周报" [ref=e218]
                - generic [ref=e219]:
                  - generic [ref=e220]:
                    - button "帮我看看今天最需要优先处理的孩子" [ref=e221]
                    - button "生成本周周报" [ref=e222]
                    - button "开始一次会诊" [ref=e223]
                  - button "问一句" [disabled]:
                    - img
                    - text: 问一句
              - generic [ref=e224]:
                - paragraph [ref=e225]: 问一句，系统会给出一个最匹配的入口。
                - paragraph [ref=e226]: 返回结果会包含推荐卡片、目标 workflow、目标页面和可点击 deeplink。
          - generic [ref=e227]:
            - generic [ref=e228]:
              - generic [ref=e229]:
                - heading "高风险儿童一键会诊" [level=3] [ref=e230]
                - paragraph [ref=e231]: 适合比赛 demo 的主路径：自动带入晨检异常、待复查、近 7 天观察和家长反馈，直接输出园内动作、家庭任务和园长决策卡。
              - link "发起高风险会诊" [ref=e232] [cursor=pointer]:
                - /url: /teacher/high-risk-consultation
            - list [ref=e234]:
              - listitem [ref=e235]: 适用场景：晨检异常、反复待复查、家长反馈提示持续风险
              - listitem [ref=e236]: 输入方式：结构化上下文 + 图片占位 + 语音速记 + 教师补充
              - listitem [ref=e237]: 输出闭环：教师动作、家长今晚任务、园长优先级决策
          - generic [ref=e238]:
            - generic [ref=e239]:
              - generic [ref=e240]:
                - heading "进入教师 AI 助手" [level=3] [ref=e241]
                - paragraph [ref=e242]: 老师进入后直接看到班级上下文、异常摘要和可一键生成的沟通建议。
              - link "进入教师 AI 助手" [ref=e243] [cursor=pointer]:
                - /url: /teacher/agent
            - list [ref=e245]:
              - listitem [ref=e246]: 当前班级：向阳班
              - listitem [ref=e247]: 当前任务：异常处理、复查、家长沟通
              - listitem [ref=e248]: 推荐入口：家长沟通建议 / 今日跟进行动
          - generic [ref=e249]:
            - generic [ref=e251]:
              - heading "沟通建议预览" [level=3] [ref=e252]
              - paragraph [ref=e253]: 首页直接露出一条可演示的沟通方向。
            - generic [ref=e255]:
              - generic [ref=e256]:
                - img [ref=e257]
                - paragraph [ref=e259]: 家长沟通建议
              - paragraph [ref=e260]: 优先沟通 江沐晴 的晨检情况，并同步园内观察与今晚家庭观察重点。
          - generic [ref=e261]:
            - generic [ref=e263]:
              - heading "老师今日顺序" [level=3] [ref=e264]
              - paragraph [ref=e265]: 移动端一进来先处理这三件事。
            - list [ref=e267]:
              - listitem [ref=e268]:
                - img [ref=e269]
                - text: 先看异常儿童
              - listitem [ref=e271]:
                - img [ref=e272]
                - text: 补齐未完成晨检
              - listitem [ref=e275]:
                - img [ref=e276]
                - text: 再生成家长沟通建议
  - region "Notifications alt+T"
```

# Test source

```ts
  1   | ﻿const { test, expect } = require('playwright/test');
  2   | 
  3   | const baseUrl = 'http://127.0.0.1:3000';
  4   | const smokeChildren = {
  5   |   first: { name: '林小雨', value: 'c-1' },
  6   |   second: { name: '张浩然', value: 'c-2' },
  7   | };
  8   | 
  9   | function escapeRegExp(value) {
  10  |   return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  11  | }
  12  | 
  13  | async function loginAsDemoTeacher(page) {
  14  |   await page.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
  15  |   const result = await page.evaluate(async () => {
  16  |     const response = await fetch('/api/auth/demo-login', {
  17  |       method: 'POST',
  18  |       headers: { 'Content-Type': 'application/json' },
  19  |       body: JSON.stringify({ accountId: 'u-teacher' }),
  20  |       credentials: 'same-origin',
  21  |     });
  22  |     return { status: response.status, body: await response.json() };
  23  |   });
  24  |   expect(result.status).toBe(200);
  25  |   expect(result.body?.ok).toBeTruthy();
  26  | }
  27  | 
  28  | async function getCombobox(page) {
  29  |   return page.locator('button[role="combobox"]').first();
  30  | }
  31  | 
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
> 57  |   await expect(page.getByRole('heading', { name: '教师工作台' })).toBeVisible();
      |                                                              ^ Error: expect(locator).toBeVisible() failed
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
  132 |   await expect(page.getByText('4. 最终会诊结论')).toBeVisible({ timeout: 30000 });
  133 |   await expect(await getCombobox(page)).toContainText(targetChild.name);
  134 | });
  135 | 
```