# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: .tmp-smoke\teacher-lane-smoke.spec.js >> teacher agent keeps active child consistent across query, manual switch, and workflows
- Location: .tmp-smoke\teacher-lane-smoke.spec.js:72:1

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText(/对象：\s*林小雨/)
Expected: visible
Error: strict mode violation: getByText(/对象：\s*林小雨/) resolved to 2 elements:
    1) <div class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-(--ring) focus:ring-offset-2 border-transparent bg-(--secondary) text-(--secondary-foreground)">对象：林小雨</div> aka getByText('对象：林小雨').first()
    2) <div class="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-(--ring) focus:ring-offset-2 border-transparent bg-(--secondary) text-(--secondary-foreground)">对象：林小雨</div> aka getByText('对象：林小雨').nth(1)

Call log:
  - Expect "toBeVisible" with timeout 20000ms
  - waiting for getByText(/对象：\s*林小雨/)

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
    - generic [ref=e52]:
      - generic [ref=e53]:
        - generic [ref=e55]:
          - generic [ref=e56]:
            - generic [ref=e57]: 教师 AI 助手 · 向阳班
            - heading "把班级数据转成可执行的教师工作流，而不是静态演示回复" [level=1] [ref=e58]
            - paragraph [ref=e59]: 这一轮教师 Agent 直接围绕班级上下文、单个儿童上下文和三个核心工作流展开：家长沟通建议、今日跟进行动、本周观察总结。
          - generic [ref=e60]:
            - link "返回教师工作台" [ref=e61] [cursor=pointer]:
              - /url: /teacher
              - text: 返回教师工作台
              - img [ref=e62]
            - link "刷新教师 AI 助手" [ref=e64] [cursor=pointer]:
              - /url: /teacher/agent
              - text: 刷新教师 AI 助手
              - img [ref=e65]
        - generic [ref=e68]:
          - generic [ref=e69]:
            - generic [ref=e70]:
              - generic [ref=e72]:
                - heading "当前服务对象 / 班级上下文" [level=3] [ref=e73]
                - paragraph [ref=e74]: 先确定这次工作流服务的是整个班级，还是单个儿童。
              - generic [ref=e76]:
                - generic [ref=e77]:
                  - button "单个儿童模式" [ref=e78]
                  - button "班级模式" [ref=e79]
                - generic [ref=e80]:
                  - generic [ref=e81]:
                    - paragraph [ref=e82]: 当前班级
                    - paragraph [ref=e83]: 向阳班
                  - generic [ref=e84]:
                    - paragraph [ref=e85]: 当前服务对象
                    - paragraph [ref=e86]: 林小雨
                - generic [ref=e87]:
                  - paragraph [ref=e88]: 选择目标儿童
                  - combobox [ref=e89]:
                    - generic: 林小雨 · 向阳班
                    - img [ref=e90]
            - generic [ref=e92]:
              - generic [ref=e94]:
                - heading "今日异常摘要" [level=3] [ref=e95]
                - paragraph [ref=e96]: 展示真实业务数据，不再只显示固定壳。
              - generic [ref=e98]:
                - generic [ref=e99]: 林小雨 今日暂无晨检异常，适合继续围绕待复查记录和家长反馈生成建议。
                - generic [ref=e100]: 待复查 · 情绪表现 · 午睡后固定安抚流程，播放轻音乐过渡
                - generic [ref=e101]: 待复查 · 睡眠情况 · 提前半小时进入洗漱和绘本流程
            - generic [ref=e102]:
              - generic [ref=e104]:
                - heading "移动端协同入口" [level=3] [ref=e105]
                - paragraph [ref=e106]: 教师可先用语音速记或 OCR 形成本地草稿，工作流完成后再同步。
              - generic [ref=e108]:
                - generic [ref=e109]:
                  - button "语音速记" [ref=e110]:
                    - img [ref=e111]
                    - text: 语音速记
                  - button "OCR 草稿" [ref=e114]:
                    - img [ref=e115]
                    - text: OCR 草稿
                - generic [ref=e123]: 当前还没有教师端本地草稿。
            - generic [ref=e124]:
              - generic [ref=e126]:
                - heading "草稿确认流" [level=3] [ref=e127]
                - paragraph [ref=e128]: 先把 understanding 产出的 draft_items 变成逐条确认卡片，再通过 persist adapter 回写到同一个 mobile draft。
              - generic [ref=e130]:
                - generic [ref=e131]:
                  - generic [ref=e133]: Mock Understanding
                  - paragraph [ref=e134]: 当前还没有可确认的 teacher understanding 草稿。可以先用下面的 demo transcript 生成一个本地 source draft，用来演示确认、编辑、丢弃和 persist 抽象。
                - generic [ref=e135]:
                  - button "健康观察 HEALTH + DIET 林小雨 今天午睡前体温 37.6 度，精神一般，喝水偏少，老师先记成重点观察，离园前再复查一次。" [ref=e136]:
                    - generic [ref=e137]:
                      - img [ref=e138]
                      - generic [ref=e141]: 健康观察
                      - generic [ref=e142]: HEALTH + DIET
                    - paragraph [ref=e143]: 林小雨 今天午睡前体温 37.6 度，精神一般，喝水偏少，老师先记成重点观察，离园前再复查一次。
                  - button "情绪安抚 EMOTION + SLEEP 林小雨 今天入园后一直哭闹，老师安抚后好一些，但午睡前还需要陪伴，先整理成情绪观察草稿。" [ref=e144]:
                    - generic [ref=e145]:
                      - img [ref=e146]
                      - generic [ref=e149]: 情绪安抚
                      - generic [ref=e150]: EMOTION + SLEEP
                    - paragraph [ref=e151]: 林小雨 今天入园后一直哭闹，老师安抚后好一些，但午睡前还需要陪伴，先整理成情绪观察草稿。
                  - button "离园请假 LEAVE + HEALTH 林小雨 下午因为咳嗽提前离园，家长表示今晚会在家观察，明早再反馈是否返园。" [ref=e152]:
                    - generic [ref=e153]:
                      - img [ref=e154]
                      - generic [ref=e157]: 离园请假
                      - generic [ref=e158]: LEAVE + HEALTH
                    - paragraph [ref=e159]: 林小雨 下午因为咳嗽提前离园，家长表示今晚会在家观察，明早再反馈是否返园。
            - generic [ref=e160]:
              - generic [ref=e161]:
                - generic [ref=e162]:
                  - heading "快捷操作" [level=3] [ref=e163]
                  - paragraph [ref=e164]: 快捷操作现在会真实驱动工作流，返回稳定的结构化结果。
                - generic [ref=e165]:
                  - img [ref=e166]
                  - text: Agent 入口
              - generic [ref=e169]:
                - generic [ref=e170]:
                  - button "生成家长沟通建议" [ref=e171]
                  - button "生成今日跟进行动" [ref=e172]
                  - button "总结本周观察" [ref=e173]
                - generic [ref=e175]:
                  - generic [ref=e176]:
                    - generic [ref=e177]: 单儿童模式
                    - generic [ref=e178]: 会诊模式
                    - generic [ref=e179]: 对象：林小雨
                    - generic [ref=e180]: 来源：ai
                    - generic [ref=e181]: qwen-turbo
                  - generic [ref=e182]:
                    - paragraph [ref=e183]: 标题
                    - heading "林小雨 家长沟通建议" [level=3] [ref=e184]
                    - paragraph [ref=e185]: 摘要
                    - paragraph [ref=e186]: 24-36月阶段当前优先围绕同伴互动、语言扩展组织沟通。根据林小雨近期情绪波动和午睡后恢复情况，建议今晚先固定睡前故事时光，观察入睡是否更平稳。同时注意孩子情绪表达是否清晰，明天重点观察其入园时的情绪状态。
                  - generic [ref=e187]:
                    - paragraph [ref=e188]: 高风险多 Agent 会诊
                    - paragraph [ref=e189]: 林小雨 当前已进入高风险会诊闭环，建议把园内复核、今晚家庭动作和 48 小时复查压缩到同一条执行路径。 家长反馈显示尚未开始执行。孩子反馈为“孩子反应一般”。补充说明：今天计划继续保持固定睡前故事时光，明早反馈晨起状态。
                    - paragraph [ref=e190]: 林小雨 当前已进入高风险会诊闭环，建议把园内复核、今晚家庭动作和 48 小时复查压缩到同一条执行路径。 家长反馈显示尚未开始执行。孩子反馈为“孩子反应一般”。补充说明：今天计划继续保持固定睡前故事时光，明早反馈晨起状态。 当前优先动作是“今日园内先完成 1 个最关键复查动作，并在离园前补齐记录”，并要求家长今晚完成“给家长的沟通话术要先定义今晚只做 1 个核心动作，再约定明早回传 2 到 3 个观察点。”。
                    - generic [ref=e191]:
                      - generic [ref=e192]: HealthObservationAgent
                      - generic [ref=e193]: DietBehaviorAgent
                      - generic [ref=e194]: ParentCommunicationAgent
                      - generic [ref=e195]: InSchoolActionAgent
                      - generic [ref=e196]: CoordinatorAgent
                    - generic [ref=e197]:
                      - paragraph [ref=e198]: 触发原因
                      - list [ref=e199]:
                        - listitem [ref=e200]: "- 同时命中健康、饮食或待复查等多个风险维度"
                        - listitem [ref=e201]: "- 连续多天异常或关注信号未消退"
                        - listitem [ref=e202]: "- 家长反馈显示尚未开始执行。孩子反馈为“孩子反应一般”。补充说明：今天计划继续保持固定睡前故事时光，明早反馈晨起状态。"
                        - listitem [ref=e203]: "- 该家庭动作还没有真正开始执行，需要确认今晚是否能落地。"
                    - generic [ref=e204]:
                      - generic [ref=e205]:
                        - paragraph [ref=e206]: 健康观察 Agent
                        - paragraph [ref=e207]: 林小雨 当前健康维度已出现需要连续追踪的信号，优先核对晨检异常是否仍在延续。
                        - list [ref=e208]:
                          - listitem [ref=e209]: "- 平均体温 36.6℃"
                          - listitem [ref=e210]: "- 晨检状态稳定，能主动问好。"
                      - generic [ref=e211]:
                        - paragraph [ref=e212]: 饮食行为 Agent
                        - paragraph [ref=e213]: 林小雨 的饮水与饮食结构已开始影响风险判断，今晚家庭动作应优先补水与降低进食对抗。
                        - list [ref=e214]:
                          - listitem [ref=e215]: "- 近 7 天补水状态 补水偏少"
                      - generic [ref=e216]:
                        - paragraph [ref=e217]: 家园沟通 Agent
                        - paragraph [ref=e218]: 上一轮家园协同动作已经暴露出执行断点，沟通重点应从“再提醒一次”升级为“明确阻碍、缩小动作、约定明早怎么回传”。
                        - list [ref=e219]:
                          - listitem [ref=e220]: "- 最近反馈：今晚反馈"
                          - listitem [ref=e221]: "- 执行状态：not_started"
                          - listitem [ref=e222]: "- 效果判断：unknown"
                      - generic [ref=e223]:
                        - paragraph [ref=e224]: 园内执行 Agent
                        - paragraph [ref=e225]: 园内执行链路已到需要压缩动作、明确负责人与次日复查点的阶段。
                        - list [ref=e226]:
                          - listitem [ref=e227]: "- 待复查 3 项"
                    - generic [ref=e228]:
                      - paragraph [ref=e229]: 园长决策卡
                      - paragraph [ref=e230]: 林小雨 当前需要优先处理，原因是同时命中健康、饮食或待复查等多个风险维度。 家长反馈显示尚未开始执行。孩子反馈为“孩子反应一般”。补充说明：今天计划继续保持固定睡前故事时光，明早反馈晨起状态。 建议先落地：今日园内先完成 1 个最关键复查动作，并在离园前补齐记录
                      - generic [ref=e231]:
                        - generic [ref=e232]: 负责人：园长
                        - generic [ref=e233]: 处理时间：今天放学前
                        - generic [ref=e234]: 状态：待分派
                  - generic [ref=e235]:
                    - paragraph [ref=e236]: 关键点
                    - list [ref=e237]:
                      - listitem [ref=e238]: "- 阶段重点：是否主动靠近同伴、轮流和回应冲突"
                      - listitem [ref=e239]: "- 今晚固定睡前故事时光，观察入睡是否更平稳。"
                      - listitem [ref=e240]: "- 留意孩子情绪表达是否清晰，是否有需要命名的情绪。"
                  - generic [ref=e242]:
                    - button "家长沟通话术卡" [ref=e243]:
                      - generic [ref=e244]:
                        - img [ref=e245]
                        - paragraph [ref=e249]: 家长沟通话术卡
                      - img [ref=e251]
                    - generic [ref=e253]:
                      - generic [ref=e254]:
                        - paragraph [ref=e255]: 开场
                        - paragraph [ref=e256]: 林小雨 今天有一个需要同步的观察点。
                      - generic [ref=e257]:
                        - paragraph [ref=e258]: 现状
                        - paragraph [ref=e259]: 阶段重点：是否主动靠近同伴、轮流和回应冲突
                      - generic [ref=e260]:
                        - paragraph [ref=e261]: 请家长配合
                        - paragraph [ref=e262]: 给家长的沟通话术要先定义今晚只做 1 个核心动作，再约定明早回传 2 到 3 个观察点。
                      - generic [ref=e263]:
                        - paragraph [ref=e264]: 收口
                        - paragraph [ref=e265]: 明早入园时观察情绪状态和配合度，反馈给老师。
                      - generic [ref=e266]:
                        - paragraph [ref=e267]: 话术要点
                        - list [ref=e268]:
                          - listitem [ref=e269]: "- 今晚：今晚执行固定睡前故事时光，记录入睡时间和情绪变化。"
                          - listitem [ref=e270]: "- 今晚：今晚观察孩子是否有情绪表达需求，如呼唤妈妈等。"
                  - generic [ref=e271]:
                    - paragraph [ref=e272]: 行动列表
                    - generic [ref=e273]:
                      - generic [ref=e274]:
                        - generic [ref=e275]:
                          - generic [ref=e276]:
                            - img [ref=e277]
                            - paragraph [ref=e281]: 家长
                          - generic [ref=e282]: 今晚
                        - paragraph [ref=e283]: 原因：当前阶段更适合围绕同伴互动、语言扩展做连续家园观察
                        - paragraph [ref=e284]: 建议动作：今晚执行固定睡前故事时光，记录入睡时间和情绪变化。
                      - generic [ref=e285]:
                        - generic [ref=e286]:
                          - generic [ref=e287]:
                            - img [ref=e288]
                            - paragraph [ref=e292]: 家长
                          - generic [ref=e293]: 今晚
                        - paragraph [ref=e294]: 原因：当前阶段更适合围绕同伴互动、语言扩展做连续家园观察
                        - paragraph [ref=e295]: 建议动作：今晚观察孩子是否有情绪表达需求，如呼唤妈妈等。
                      - generic [ref=e296]:
                        - generic [ref=e297]:
                          - generic [ref=e298]:
                            - img [ref=e299]
                            - paragraph [ref=e303]: 老师
                          - generic [ref=e304]: 明日晨间
                        - paragraph [ref=e305]: 原因：为明日复盘留出连续观察点
                        - paragraph [ref=e306]: 建议动作：明早入园时观察情绪状态和配合度，反馈给老师。
                  - generic [ref=e307]:
                    - generic [ref=e308]:
                      - img [ref=e309]
                      - paragraph [ref=e311]: 家长沟通建议稿
                    - paragraph [ref=e312]: 林妈妈您好，今天孩子在园整体状态老师已持续关注。另外，情绪表现 方面仍在持续复查，园内会继续跟进。 这个阶段更适合以明确规则、稳定边界和情绪命名为主，关注连续练习，不把单次冲突写成定性结论。。 请今晚重点配合：今晚执行固定睡前故事时光，记录入睡时间和情绪变化。；请今晚重点配合：今晚观察孩子是否有情绪表达需求，如呼唤妈妈等。。 明天老师也会继续关注孩子在园表现，辛苦您今晚观察后和我们同步。
                  - generic [ref=e313]:
                    - generic [ref=e314]:
                      - generic [ref=e315]:
                        - generic [ref=e316]: 高关注
                        - generic [ref=e317]: 会诊模式
                        - generic [ref=e318]: 对象：c-1
                        - generic [ref=e319]: ai
                        - generic [ref=e320]: qwen-turbo
                      - generic [ref=e321]:
                        - paragraph [ref=e322]: 共享 AI 干预卡
                        - heading "林小雨 家园协同干预卡" [level=3] [ref=e323]
                        - paragraph [ref=e324]: 同时命中健康、饮食或待复查等多个风险维度
                    - generic [ref=e325]:
                      - generic [ref=e326]:
                        - generic [ref=e327]:
                          - img [ref=e328]
                          - text: 触发原因
                        - paragraph [ref=e340]: 待复查 3 项
                        - generic [ref=e341]:
                          - paragraph [ref=e342]: 会诊摘要
                          - paragraph [ref=e343]: 林小雨 当前已进入高风险会诊闭环，建议把园内复核、今晚家庭动作和 48 小时复查压缩到同一条执行路径。 家长反馈显示尚未开始执行。孩子反馈为“孩子反应一般”。补充说明：今天计划继续保持固定睡前故事时光，明早反馈晨起状态。 当前优先动作是“今日园内先完成 1 个最关键复查动作，并在离园前补齐记录”，并要求家长今晚完成“给家长的沟通话术要先定义今晚只做 1 个核心动作，再约定明早回传 2 到 3 个观察点。”。
                          - generic [ref=e344]:
                            - generic [ref=e345]: HealthObservationAgent
                            - generic [ref=e346]: DietBehaviorAgent
                            - generic [ref=e347]: ParentCommunicationAgent
                            - generic [ref=e348]: InSchoolActionAgent
                            - generic [ref=e349]: CoordinatorAgent
                      - generic [ref=e350]:
                        - generic [ref=e351]:
                          - generic [ref=e352]:
                            - img [ref=e353]
                            - text: 今日园内动作
                          - paragraph [ref=e358]: 今日园内先完成 1 个最关键复查动作，并在离园前补齐记录
                        - generic [ref=e359]:
                          - generic [ref=e360]:
                            - img [ref=e361]
                            - text: 今晚家庭动作
                          - paragraph [ref=e364]: 给家长的沟通话术要先定义今晚只做 1 个核心动作，再约定明早回传 2 到 3 个观察点。
                      - generic [ref=e365]:
                        - generic [ref=e366]:
                          - generic [ref=e367]:
                            - img [ref=e368]
                            - text: 家庭步骤
                          - list [ref=e372]:
                            - listitem [ref=e373]: 1. 今晚执行固定睡前故事时光，记录入睡时间和情绪变化。
                            - listitem [ref=e374]: 2. 今晚观察孩子是否有情绪表达需求，如呼唤妈妈等。
                            - listitem [ref=e375]: 3. 先按“用短句帮助命名情绪和下一步动作”只做一件小动作。
                            - listitem [ref=e376]: 4. 记录是否主动靠近同伴、轮流和回应冲突和短句表达、复述和情境沟通是否更稳定。
                        - generic [ref=e377]:
                          - generic [ref=e378]:
                            - img [ref=e379]
                            - text: 观察与复查
                          - list [ref=e382]:
                            - listitem [ref=e383]: "- 体温是否继续上升或反复波动"
                            - listitem [ref=e384]: "- 情绪是否伴随食欲、午睡状态一起变化"
                            - listitem [ref=e385]: "- 晨检状态稳定，能主动问好。"
                            - listitem [ref=e386]: "- 今晚补水是否比平时更主动"
                          - paragraph [ref=e387]: 明日观察点：明早入园时观察情绪状态和配合度，反馈给老师。
                          - paragraph [ref=e388]: 48 小时复查：把明日第一观察点写成可核对结果的句子，而不是宽泛提醒
                      - generic [ref=e390]:
                        - paragraph [ref=e391]: 教师后续跟进草稿
                        - paragraph [ref=e392]: 明天继续观察 林小雨：明早入园时观察情绪状态和配合度，反馈给老师。。48 小时内重点复盘：今晚执行固定睡前故事时光，记录入睡时间和情绪变化。
                  - generic [ref=e393]:
                    - paragraph [ref=e394]: 下一步建议
                    - paragraph [ref=e395]: 明早入园时观察情绪状态和配合度，反馈给老师。
                  - generic [ref=e396]:
                    - img [ref=e397]
                    - generic [ref=e400]: 生成时间：2026/4/12 17:17:27
            - generic [ref=e401]:
              - generic [ref=e402]:
                - generic [ref=e403]:
                  - heading "本周班级周报预览" [level=3] [ref=e404]
                  - paragraph [ref=e405]: 先看本周异常、补录项和下周重点观察，再决定是否继续进入教师周报工作流。
                - generic [ref=e406]:
                  - button "播报摘要" [ref=e407]:
                    - img [ref=e408]
                    - text: 播报摘要
                  - paragraph [ref=e412]: Browser-only playback. This is not backend-generated voice.
              - generic [ref=e414]:
                - generic [ref=e415]:
                  - generic [ref=e416]: 教师周报
                  - generic [ref=e417]: 近 7 天
                  - generic [ref=e418]: AI 生成
                  - generic [ref=e419]: qwen-turbo
                - paragraph [ref=e421]: 向阳班近7天运营情况显示，出勤率为78%，存在2条晨检异常记录，待复查项达22项，家长反馈共20条。
                - generic [ref=e422]:
                  - generic [ref=e423]:
                    - paragraph [ref=e424]: 本周异常
                    - paragraph [ref=e425]: 晨检异常
                    - list [ref=e426]:
                      - listitem [ref=e427]:
                        - generic [ref=e428]: "异常项1:"
                        - text: 晨检异常
                      - listitem [ref=e429]:
                        - generic [ref=e430]: "异常项2:"
                        - text: 手口眼异常
                  - generic [ref=e431]:
                    - paragraph [ref=e432]: 补录项
                    - paragraph [ref=e433]: 优先补齐 22 项待复查记录，避免周初继续积压。
                    - list [ref=e434]:
                      - listitem [ref=e435]:
                        - generic [ref=e436]: "补录项1:"
                        - text: 优先补齐 22 项待复查记录，避免周初继续积压。
                      - listitem [ref=e437]:
                        - generic [ref=e438]: "补录项2:"
                        - text: 核对本周 20 条家园反馈是否已回填到班级记录。
                  - generic [ref=e439]:
                    - paragraph [ref=e440]: 下周重点观察
                    - paragraph [ref=e441]: 针对晨检异常儿童进行重点观察和跟进
                    - list [ref=e442]:
                      - listitem [ref=e443]:
                        - generic [ref=e444]: "观察点1:"
                        - text: 针对晨检异常儿童进行重点观察和跟进
                      - listitem [ref=e445]:
                        - generic [ref=e446]: "观察点2:"
                        - text: 安排教师对22项待复查内容逐一核实并更新状态
                - generic [ref=e448]:
                  - generic [ref=e449]:
                    - generic [ref=e450]: 下周班级第一动作
                    - paragraph [ref=e451]: 针对晨检异常儿童进行重点观察和跟进
                    - paragraph [ref=e452]: "Owner: 教师周报 · Window: 下周优先处理"
                  - link "生成完整本周总结" [ref=e453] [cursor=pointer]:
                    - /url: /teacher/agent?action=weekly-summary
                - generic [ref=e454]: 以上分析不构成医疗诊断，仅用于托育机构运营参考。
            - generic [ref=e455]:
              - generic [ref=e457]:
                - heading "历史记录" [level=3] [ref=e458]
                - paragraph [ref=e459]: 保留当前会话内已生成的工作流结果摘要。
              - generic [ref=e462]:
                - generic [ref=e463]:
                  - img [ref=e464]
                  - paragraph [ref=e467]: 动作类型：生成家长沟通建议
                  - generic [ref=e468]: 单个儿童
                  - generic [ref=e469]: 对象：林小雨
                  - generic [ref=e470]: ai
                - paragraph [ref=e471]: 时间：2026/4/12 17:17:27
                - paragraph [ref=e472]: 结果摘要：24-36月阶段当前优先围绕同伴互动、语言扩展组织沟通。根据林小雨近期情绪波动和午睡后恢复情况，建议今晚先固定睡前故事时光，观察入睡是否更平稳。同时注意孩子情绪表达是否清晰，明天重点观察其入园时的情绪状态。
          - generic [ref=e473]:
            - generic [ref=e474]:
              - generic [ref=e476]:
                - heading "当前服务对象" [level=3] [ref=e477]
                - paragraph [ref=e478]: 帮助老师确认这次工作流聚焦的对象与上下文。
              - list [ref=e480]:
                - listitem [ref=e481]: 当前班级：向阳班
                - listitem [ref=e482]: 班级可见幼儿：18 名
                - listitem [ref=e483]: 今日异常晨检：1 名
                - listitem [ref=e484]: 待复查记录：22 项
            - generic [ref=e485]:
              - generic [ref=e487]:
                - heading "班级高优先级摘要" [level=3] [ref=e488]
                - paragraph [ref=e489]: 用于老师快速扫一眼今天最值得先处理的内容。
              - generic [ref=e491]:
                - generic [ref=e492]:
                  - paragraph [ref=e493]: 江沐晴
                  - paragraph [ref=e494]: 今日晨检异常、近 7 天存在晨检异常、存在待复查记录、近 7 天成长观察需关注
                - generic [ref=e495]:
                  - paragraph [ref=e496]: 林小雨
                  - paragraph [ref=e497]: 存在待复查记录、近 7 天成长观察需关注
                - generic [ref=e498]:
                  - paragraph [ref=e499]: 王小明
                  - paragraph [ref=e500]: 存在待复查记录、近 7 天成长观察需关注
                - generic [ref=e501]:
                  - paragraph [ref=e502]: 许嘉佑
                  - paragraph [ref=e503]: 存在待复查记录、近 7 天成长观察需关注
                - generic [ref=e504]:
                  - paragraph [ref=e505]: 沈语彤
                  - paragraph [ref=e506]: 存在待复查记录、近 7 天成长观察需关注
            - generic [ref=e507]:
              - generic [ref=e509]:
                - heading "推荐演示顺序" [level=3] [ref=e510]
                - paragraph [ref=e511]: 比赛 demo 可以直接沿这条顺序演示。
              - list [ref=e513]:
                - listitem [ref=e514]:
                  - img [ref=e515]
                  - text: 先选一个异常或待复查儿童，生成家长沟通建议
                - listitem [ref=e518]:
                  - img [ref=e519]
                  - text: 再切到今日跟进行动，展示结构化行动列表
                - listitem [ref=e522]:
                  - img [ref=e523]
                  - text: 最后切到班级模式，总结本周观察
            - generic [ref=e526]:
              - generic [ref=e528]:
                - heading "当前结果摘要" [level=3] [ref=e529]
                - paragraph [ref=e530]: 方便演示时在侧边快速回看。
              - generic [ref=e532]: 24-36月阶段当前优先围绕同伴互动、语言扩展组织沟通。根据林小雨近期情绪波动和午睡后恢复情况，建议今晚...
            - generic [ref=e533]:
              - generic [ref=e535]:
                - heading "提醒中心" [level=3] [ref=e536]
                - paragraph [ref=e537]: 展示今晚任务、48 小时复查和升级关注提醒。
              - generic [ref=e540]:
                - generic [ref=e541]:
                  - generic [ref=e542]:
                    - img [ref=e543]
                    - paragraph [ref=e548]: 林小雨 48h Review
                  - generic [ref=e549]: 待提醒
                - paragraph [ref=e550]: 把明日第一观察点写成可核对结果的句子，而不是宽泛提醒
      - generic:
        - generic [ref=e551]:
          - generic [ref=e552]:
            - generic [ref=e553]:
              - img [ref=e554]
              - text: AI 语音
            - paragraph [ref=e557]: 长按说话
          - paragraph [ref=e558]: 像手机 AI 助手一样长按录音，松开结束并生成上传入口。
        - button "长按说话，像手机 AI 助手一样长按录音，松开结束并生成上传入口。" [ref=e559] [cursor=pointer]:
          - generic [ref=e561]:
            - img [ref=e562]
            - generic [ref=e565]: 按住说
        - generic: 长按说话，像手机 AI 助手一样长按录音，松开结束并生成上传入口。
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
> 89  |   await expect(page.getByText(new RegExp(`对象：\\s*${escapeRegExp(firstChild.name)}`))).toBeVisible({ timeout: 20000 });
      |                                                                                       ^ Error: expect(locator).toBeVisible() failed
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