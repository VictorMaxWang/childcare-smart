# F90 Merge Fix Results

你现在执行 F90：合并并行修复结果。

## 必合并范围

- 读取所有存在的 `docs/bug-bash/fix-results/*.json`。
- 合并 F00、F10、F20、F30、F40、F50、F60、F70 的结果。
- 同步所有 assigned bugId 的 `fixed`、`open`、`confirmed`、`duplicate`、`wontfix`、`needs-info` 状态。

## 读取

- `docs/bug-bash/BUGS.md`
- `docs/bug-bash/BUGS.json`
- `docs/bug-bash/BUG_STATUS.md`
- `docs/bug-bash/BUG_FIX_PLAN.md`
- `docs/bug-bash/FIX_THREAD_MATRIX.md`
- `docs/bug-bash/fix-results/*.json`
- `docs/bug-bash/fix-results/*.md`

## 合并规则

- F90 是唯一允许直接修改 `BUGS.md` 和 `BUGS.json` 的修复合并线程。
- 不删除 duplicate 记录。
- 保持 duplicate 关系：
  - `BUG-B12-002 -> BUG-004`
  - `BUG-017 -> BUG-014/BUG-015`
  - `BUG-018 -> BUG-003`
  - `BUG-B22-004 -> BUG-B21-004`
  - `BUG-B26-001 -> BUG-001`
  - `BUG-B26-002 -> BUG-002`
  - `BUG-B26-003 -> BUG-003`
- Canonical bug fixed 后，duplicate 记录仍保持 `duplicate`，并在 notes 中说明 canonical fix 状态。
- 如果 fix-result 缺失、JSON 非法、bugId 不属于该线程，标记为 merge warning，不要猜测 fixed。
- 如果一个 bug 被多个结果文件声明，保留冲突并要求人工复核。

## 验证

- 解析 `BUGS.json`，确认 JSON 合法。
- 校验所有 bug 仍具备 canonical fields。
- 校验 counts 与 `BUG_STATUS.md` 一致。
- 运行必要的 JSON/Markdown sanity checks。

## 输出

- 更新 `docs/bug-bash/BUGS.md`。
- 更新 `docs/bug-bash/BUGS.json`。
- 更新 `docs/bug-bash/BUG_STATUS.md`。
- 写入 `docs/bug-bash/fix-results/F90-result.md`。
- 写入 `docs/bug-bash/fix-results/F90-result.json`。
- 无法合并的项目必须写明原因和下一步。
