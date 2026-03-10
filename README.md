SmartChildcare

AI-powered childcare management platform for childcare institutions and parents.

面向托育机构与家长的 AI 智能托育管理平台，用于实现：

机构记录 → 系统分析 → 家长反馈 → 托育行动闭环

该项目通过结构化记录幼儿健康、饮食和成长行为数据，并结合 AI 分析，为托育机构和家长提供更科学的育儿建议。

项目背景

随着我国 普惠性托育服务体系建设 的推进，托育机构在日常管理中面临以下问题：

幼儿健康、饮食和行为记录分散

家长与机构沟通效率低

数据难以形成长期观察与分析

缺乏辅助决策工具

SmartChildcare 通过构建 数字化托育管理系统，实现托育数据结构化、可视化，并通过 AI 提供辅助建议。

核心功能
1 数据总览看板

系统首页提供机构运营与托育情况概览：

今日出勤统计

饮食记录

健康提醒

最近一周趋势

业务时间线

支持：

晨检异常告警

未完成晨检提醒

快捷模块跳转

2 幼儿档案管理

支持托育机构管理幼儿信息：

幼儿档案创建与管理

按姓名 / 监护人 / 班级 / 年龄段搜索

自动计算年龄段

出勤状态联动

3 晨检与健康管理

每日晨检记录模块：

体温记录

情绪状态

手口眼检查

健康备注

支持：

待晨检筛选

异常警告

发热阈值配置

4 饮食记录管理

饮食记录模块支持：

批量录入餐食

食物分类

摄入量记录

饮水量

过敏反应记录

系统可生成：

每周饮食趋势

营养评分

5 成长观察记录

教师可以记录幼儿成长与行为观察：

行为观察记录

年龄段匹配观察指标

重点关注标记

复查日期

行动建议

系统自动生成 成长时间线。

6 家长端互动

家长端支持：

查看孩子当日饮食

查看成长观察记录

查看本周趋势

查看系统建议

支持反馈：

已知晓

在家配合

当日反馈

形成 家园共育闭环。

AI 托育建议

系统接入 大模型 AI 分析能力，通过分析：

最近 7 天健康记录

饮食趋势

成长观察

家长反馈

生成结构化托育建议：

风险提示

行为观察重点

家园协同建议

托育行动建议

AI 输出采用 结构化 JSON 建议格式，确保系统稳定性。

技术架构

Frontend

React

Next.js

TypeScript

Tailwind CSS

Backend

Next.js API Routes

AI

阿里云百炼 DashScope

Qwen 模型

Deployment

Vercel

阿里云

系统架构图
机构记录
   ↓
数据结构化存储
   ↓
规则分析 + AI分析
   ↓
系统建议
   ↓
家长反馈
   ↓
托育行动闭环
项目结构
childcare-smart
│
├─ app
│  ├─ api
│  ├─ children
│  ├─ diet
│  ├─ growth
│  ├─ health
│  ├─ parent
│
├─ components
│
├─ lib
│  ├─ ai
│  ├─ store
│
├─ scripts
│
├─ supabase
│
└─ public
在线演示

演示地址：

https://smartchildcare.cn

GitHub 仓库：

https://github.com/VictorMaxWang/childcare-smart

快速运行
git clone https://github.com/VictorMaxWang/childcare-smart

cd childcare-smart

npm install

npm run dev
项目规划

未来版本计划：

SmartChildcare v2.1

AI托育建议优化

数据可视化增强

家长小程序接口

多机构支持

SmartChildcare v3.0

个性化托育分析

长期成长数据分析

托育风险预测

License

MIT License

⭐ Star History

如果这个项目对你有帮助，请给一个 Star ⭐
