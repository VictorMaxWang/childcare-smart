# SmartChildcare 智慧托育管理平台

一个面向托育机构的数字化业务闭环平台。

## 核心功能

- 数据总览看板
- 幼儿档案管理
- 晨检健康管理
- 饮食记录系统
- 成长观察记录
- 家园共育反馈

## 技术栈

Next.js 16  
React 19  
TypeScript  
TailwindCSS  
Radix UI  
Vercel Deploy  

## 在线访问

https://smartchildcare.cn

## 项目结构

app/page.tsx            数据看板  
app/children/page.tsx   幼儿管理  
app/health/page.tsx     晨检管理  
app/diet/page.tsx       饮食记录  
app/growth/page.tsx     成长记录  
app/parent/page.tsx     家长端  

## 系统架构

统一状态管理：

lib/store.tsx

核心 Hook：

useApp()
