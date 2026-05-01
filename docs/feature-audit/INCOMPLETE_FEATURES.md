# 不完整功能汇总

本文件由 C99 汇总线程维护。C10-C23 线程不要直接编辑本文件，除非 C99 明确接管。

## 汇总规则

- 只汇总 `featureStatus` 非 `complete` 的 finding。
- 同一根因跨线程重复出现时，保留证据最完整的一条作为主 finding，其余用 `notes` 或 markdown 报告交叉引用。
- F0/F1 优先进入实现路线图，F2/F3 按用户路径和依赖关系排序，F4 只在收尾阶段处理。
- `backendNeeded`、`frontendNeeded`、`productDecisionNeeded` 必须影响路线图分组。

## 当前状态

C00 只建立审计体系，尚未产生正式 findings。

