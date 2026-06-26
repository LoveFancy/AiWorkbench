# Talents CLI 检测流程优化

> 日期：2026-06-26
> 状态：待优化

## 优化项

### 1. packageName 硬编码

**位置**：[default-connector-initializer.ts](file:///d:/code/workmate/dev/AiWorkbench/apps/electron/src/main/lib/default-connector-initializer.ts#L446)

**现状**：`packageName: '@ht/talents'` 写死在 `writeCliConnectorRuntime` 调用中，没有从 `cli.json` 读取。

**应改为**：从 `cli.json` 的 `init` 安装命令中提取包名，或在 `cli.json` 中新增 `packageName` 字段，由 `readCliConnectorDefinition` 解析后使用。

### 2. readTalentsVersion 缺少 EINVAL 保护

**位置**：[default-connector-initializer.ts](file:///d:/code/workmate/dev/AiWorkbench/apps/electron/src/main/lib/default-connector-initializer.ts#L444-L448)

**现状**：`existsSync` 通过后直接 `spawn(resolvedPath, ['-V'])` 读版本号，`talents.cmd` 如果损坏会抛 `spawn EINVAL`，导致整个初始化失败。此异常发生在 `check-package` 已显示成功后，用户视角会感到困惑。

**应改为**：
- `readTalentsVersion` 内部 try-catch，读取失败返回 `undefined` 而非抛异常
- 或者 `readTalentsVersion` 失败后仍写入 `runtime.json`（version 留空），后续自检步骤会兜底暴露问题

### 3. 安装后的路径解析重复且不对称

**位置**：[default-connector-initializer.ts](file:///d:/code/workmate/dev/AiWorkbench/apps/electron/src/main/lib/default-connector-initializer.ts#L381-L430)

**现状**：
- 安装前用 `resolveCommandPath`（只依赖 PATH）
- 安装后用 `resolveTalentsCommandPath`（PATH + npm bin -g 兜底）
- 已安装但 PATH 找不到时，又额外调用一次 `resolveTalentsCommandPath`

两套逻辑有重叠，且 `resolveTalentsCommandPath` 内部会先调 `resolveCommandPath`，存在重复调用。

**应改为**：统一使用 `resolveTalentsCommandPath`，去掉 `resolveCommandPath` 的单独调用。
