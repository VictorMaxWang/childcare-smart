# Mock 与 Visual-only 审计

## 高风险信号

- 文件或标识：`mock`、`demoSeed`、`fixture`、`preset`、`pixel-replica`、`visual-parity`、`placeholder`。
- 注释或日志：`TODO`、`FIXME`、`console.log only`、`fake success`、`setTimeout` 模拟成功。
- 行为：按钮点击只改本地状态或只弹 toast；表单没有真实 submit；上传组件没有 multipart/request。
- 数据：页面每次进入都是固定数组，和登录账号、childId、classId 无关。

## 扫描输出要求

C20-C23 必须记录：

- `sourceFiles`：具体文件路径。
- `codeSignals`：命中的代码信号，例如 `setTimeout(...toast.success)`、`const MOCK_*`。
- `apiEndpoints`：相关接口或缺失接口。
- `recommendedImplementation`：最小实现缺口，不写完整方案。

